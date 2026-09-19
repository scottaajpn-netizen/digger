import test from "node:test";
import assert from "node:assert/strict";
import {
  discogsPath,
  discoveryPath,
  lastFmCataloguePath,
  lastFmDeepPath,
  lastFmListenBrainzNeighbourPath,
  lastFmSimilarityPath,
  listenBrainzPath,
  pathNode,
} from "../src/lib/discovery/paths";
import { mergeDiscoveryCandidates, type Candidate } from "../src/lib/discovery/ranking";
import type { Track } from "../src/lib/types";

const seed: Track = {
  id: "seed",
  title: "Seed Track",
  artist: "Seed Artist",
  scene: "",
  label: "",
  tags: [],
  obscurity: 50,
  year: 0,
  colors: ["a", "b"],
};

const candidate = {
  id: "candidate",
  title: "Candidate Track",
  artist: "Candidate Artist",
  externalIds: { lastfm: "https://www.last.fm/candidate" },
};

test("discovery paths expose evidence and graph distance", () => {
  const direct = lastFmSimilarityPath(seed, candidate);
  assert.equal(direct.source, "lastfm");
  assert.equal(direct.evidence, "listening");
  assert.equal(direct.distance, 1);

  const deep = lastFmDeepPath(
    seed,
    { artist: "Bridge Artist", title: "Bridge Track" },
    candidate,
  );
  assert.equal(deep.distance, 2);
  assert.deepEqual(deep.nodes.map(node => node.kind), ["track", "track", "track"]);

  const crate = lastFmCataloguePath(
    seed,
    "Seed Artist",
    "Neighbour Artist",
    candidate,
  );
  assert.equal(crate.distance, 3);
  assert.deepEqual(
    crate.nodes.map(node => node.kind),
    ["track", "artist", "artist", "track"],
  );
});

test("Discogs paths preserve editorial release/label/artist hops", () => {
  const path = discogsPath(
    seed,
    "editorial",
    [
      { kind: "release", id: 10, name: "Compilation", url: "https://discogs/release/10" },
      { kind: "artist", id: 20, name: "Bridge Artist", url: "https://discogs/artist/20" },
      { kind: "release", id: 30, name: "Other Release", url: "https://discogs/release/30" },
    ],
    { ...candidate, externalIds: { discogs: "https://discogs/release/30" } },
  );
  assert.equal(path.source, "discogs");
  assert.equal(path.evidence, "editorial");
  assert.equal(path.distance, 4);
  assert.equal(path.nodes[2].name, "Bridge Artist");
});

test("ListenBrainz tag paths keep their explicit context", () => {
  const path = listenBrainzPath(seed, candidate, "tag", "UK Garage");
  assert.equal(path.evidence, "tag");
  assert.equal(path.distance, 2);
  assert.equal(path.nodes[1].kind, "context");
  assert.equal(path.nodes[1].name, "UK Garage");
});

test("adjacent duplicate path nodes are compacted", () => {
  const node = pathNode("artist", "Same Artist", "lastfm");
  const path = discoveryPath("lastfm", "catalogue", [node, node, pathNode("track", "Cut", "lastfm")]);
  assert.equal(path.nodes.length, 2);
  assert.equal(path.distance, 1);
});

test("candidate merge keeps the verified editorial path", () => {
  const editorialPath = discogsPath(
    seed,
    "editorial",
    [{ kind: "label", id: 12, name: "Deep Label", url: "https://discogs/label/12" }],
    { id: "discogs", title: "Shared", artist: "Artist", externalIds: { discogs: "https://discogs/release/50" } },
  );
  const base: Candidate = {
    id: "mbid",
    title: "Shared",
    artist: "Artist",
    scene: "",
    label: "",
    tags: [],
    obscurity: 50,
    year: 0,
    colors: ["a", "b"],
    reason: "base",
    relevance: 70,
    origin: "lastfm-similar",
    externalIds: { musicbrainz: "mbid" },
  };
  const editorial: Candidate = {
    ...base,
    id: "discogs",
    reason: "editorial",
    relevance: 65,
    origin: "discogs-label",
    discoveryPath: editorialPath,
    discogs: {
      releaseId: 50,
      title: "Release",
      artists: [],
      labels: [{ id: 12, name: "Deep Label" }],
      genres: [],
      styles: [],
      compilation: false,
      sourceUrl: "https://discogs/release/50",
      fetchedAt: "2026-09-16T00:00:00.000Z",
      position: "A1",
      trackArtists: [],
      role: "release-track",
      path: [],
      audience: "unknown",
    },
  };

  const [merged] = mergeDiscoveryCandidates([base, editorial]);
  assert.equal(merged.discoveryPath?.source, "discogs");
  assert.equal(merged.discoveryPath?.nodes[1].name, "Deep Label");
});


test("cross-source sparse-seed paths preserve both Last.fm and ListenBrainz hops", () => {
  const path = lastFmListenBrainzNeighbourPath(
    seed,
    "Seed Artist",
    "Neighbour Artist",
    {
      ...candidate,
      externalIds: { listenbrainz: "candidate-recording" },
    },
  );

  assert.equal(path.source, "listenbrainz");
  assert.equal(path.evidence, "listening");
  assert.equal(path.distance, 3);
  assert.deepEqual(
    path.nodes.map(node => [node.kind, node.source]),
    [
      ["track", "lastfm"],
      ["artist", "lastfm"],
      ["artist", "lastfm"],
      ["track", "listenbrainz"],
    ],
  );
});
