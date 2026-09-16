import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicalProfile } from "../src/lib/music/profile";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import type { Candidate } from "../src/lib/discovery/ranking";
import type { DigRequest, Track } from "../src/lib/types";

const seed: Track = {
  id: "seed",
  title: "Seed",
  artist: "Seed Artist",
  scene: "UK Garage",
  label: "Shared Label",
  tags: ["uk garage", "2-step", "soulful"],
  obscurity: 70,
  year: 2001,
  country: "GB",
  colors: ["a", "b"],
};

const candidate = (
  id: string,
  overrides: Partial<Candidate> = {},
): Candidate => ({
  id,
  title: id,
  artist: `Artist ${id}`,
  scene: "UK Garage",
  label: "",
  tags: ["uk garage", "2-step", "soulful"],
  obscurity: 70,
  year: 2002,
  country: "GB",
  colors: ["a", "b"],
  reason: "fixture",
  relevance: 60,
  origin: "lastfm-similar",
  ...overrides,
});

const request = (
  overrides: Partial<DigRequest> = {},
): DigRequest => ({
  seed: "Seed — Seed Artist",
  seedId: seed.id,
  direction: "Même vibe",
  obscurity: 70,
  feedback: {},
  session: 0,
  ...overrides,
});

function rank(pool: Candidate[], input = request()) {
  return rankDiscoveryCandidates({
    pool,
    seed,
    seedProfile: buildMusicalProfile(seed),
    input,
    seedParticipantKeys: new Set(["seed artist"]),
  });
}

test("scoring preserves Même vibe preference for musically close tracks", () => {
  const close = candidate("close");
  const far = candidate("far", {
    tags: ["trap"],
    scene: "Trap",
    year: 2025,
    country: "US",
    relevance: 60,
  });
  const ranked = rank([far, close]);
  assert.equal(ranked[0].id, "close");
  assert.ok((ranked[0].analysis?.similarity || 0) > (ranked[1].analysis?.similarity || 0));
});

test("scoring preserves Labels bonus for the seed label", () => {
  const shared = candidate("shared", { label: "Shared Label", relevance: 60 });
  const other = candidate("other", { label: "Other Label", relevance: 60 });
  const ranked = rank([other, shared], request({ direction: "Labels" }));
  assert.equal(ranked[0].id, "shared");
});

test("scoring preserves Rabbit hole preference for deep/crate origins", () => {
  const direct = candidate("direct", { origin: "lastfm-similar", relevance: 70 });
  const deep = candidate("deep", { origin: "lastfm-deep", relevance: 70 });
  const ranked = rank([direct, deep], request({ direction: "Rabbit hole", obscurity: 85 }));
  assert.equal(ranked[0].id, "deep");
});

test("scoring preserves strict-audience penalties before the deep gate", () => {
  const small = candidate("small", {
    lastfmListeners: 500,
    obscurity: 90,
    relevance: 70,
  });
  const popular = candidate("popular", {
    lastfmListeners: 500000,
    obscurity: 20,
    relevance: 70,
  });
  const ranked = rank([popular, small], request({ obscurity: 100, direction: "Surprends-moi" }));
  assert.equal(ranked[0].id, "small");
});

test("scoring preserves exclusions and participant filtering", () => {
  const known = candidate("known");
  const participant = candidate("participant", { artist: "Seed Artist" });
  const kept = candidate("kept");
  const ranked = rank(
    [known, participant, kept],
    request({ feedback: { known: "known" } }),
  );
  assert.deepEqual(ranked.map(track => track.id), ["kept"]);
});

test("Surprends-moi jitter is deterministic for a session", () => {
  const pool = [candidate("a"), candidate("b"), candidate("c")];
  const first = rank(pool, request({ direction: "Surprends-moi", session: 4 }));
  const second = rank(pool, request({ direction: "Surprends-moi", session: 4 }));
  assert.deepEqual(
    first.map(track => [track.id, track.score]),
    second.map(track => [track.id, track.score]),
  );
});
