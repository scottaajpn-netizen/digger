import test from "node:test";
import assert from "node:assert/strict";

import { analyzeBranchDiagnostics } from "../src/lib/discovery/branch-diagnostics";
import type { Candidate } from "../src/lib/discovery/ranking";

const candidate = (
  origin: Candidate["origin"],
  artist: string,
  title: string,
  path: Candidate["discoveryPath"],
): Candidate => ({
  id: `${origin}:${artist}:${title}`,
  artist,
  title,
  scene: "",
  label: "",
  tags: [],
  obscurity: 80,
  year: 0,
  colors: ["a", "b"],
  reason: "fixture",
  relevance: 50,
  origin,
  discoveryPath: path,
});

const path = (
  source: "lastfm" | "discogs",
  evidence: "catalogue" | "listening",
  kinds: Array<"track" | "artist" | "label">,
) => ({
  source,
  evidence,
  distance: Math.max(0, kinds.length - 1),
  nodes: kinds.map((kind, index) => ({
    kind,
    name: `${kind}-${index}`,
    source,
  })),
});

test("branch diagnostics measure track and artist redundancy independently", () => {
  const generated = [
    candidate("lastfm-crate", "Artist A", "One", path("lastfm", "catalogue", ["track", "artist", "track"])),
    candidate("lastfm-crate", "Artist B", "Two", path("lastfm", "catalogue", ["track", "artist", "track"])),
    candidate("lastfm-artist-hop", "Artist A", "One", path("lastfm", "listening", ["track", "artist", "artist", "track"])),
    candidate("lastfm-artist-hop", "Artist A", "Three", path("lastfm", "listening", ["track", "artist", "artist", "track"])),
  ];

  const result = analyzeBranchDiagnostics(generated, generated.slice(0, 2));
  const overlap = result.overlaps.find(row =>
    row.left === "lastfm-artist-hop" && row.right === "lastfm-crate"
  );

  assert.ok(overlap);
  assert.equal(overlap.trackJaccard, 1 / 3);
  assert.equal(overlap.artistJaccard, 1 / 2);
  assert.equal(result.diversity.providerCount, 1);
  assert.equal(result.diversity.topologyCount, 2);
});

test("branch survival follows candidate identity after the strict gate", () => {
  const crate = candidate("lastfm-crate", "Artist A", "One", path("lastfm", "catalogue", ["track", "artist", "track"]));
  const hop = candidate("lastfm-artist-hop", "Artist B", "Two", path("lastfm", "listening", ["track", "artist", "artist", "track"]));
  const tag = candidate("lastfm-tag-crate", "Artist C", "Three", {
    source: "lastfm",
    evidence: "tag",
    distance: 3,
    nodes: [
      { kind: "track", name: "seed", source: "lastfm" },
      { kind: "artist", name: "context", source: "lastfm" },
      { kind: "track", name: "candidate", source: "lastfm" },
    ],
  });

  const result = analyzeBranchDiagnostics([crate, hop, tag], [crate, hop]);
  const survival = Object.fromEntries(
    result.survival.map(row => [row.origin, row]),
  );

  assert.equal(survival["lastfm-crate"].survivalRate, 1);
  assert.equal(survival["lastfm-artist-hop"].survivalRate, 1);
  assert.equal(survival["lastfm-tag-crate"].survivalRate, 0);
});
