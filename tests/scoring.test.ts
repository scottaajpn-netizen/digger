import test from "node:test";
import assert from "node:assert/strict";
import { buildMusicalProfile } from "../src/lib/music/profile";
import { assessCandidateEvidence } from "../src/lib/discovery/evidence";
import { discoveryPathPreferenceKey } from "../src/lib/discovery/paths";
import { candidateEligibilityFailure, discoveryPathScoreAdjustment, rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { modeSelectionAdjustment, selectModeAwareArtistCandidates, selectModeRecommendations, type Candidate, type RankedCandidate } from "../src/lib/discovery/ranking";
import type { DigRequest, DiscoveryPath, Track } from "../src/lib/types";

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
test("scoreBreakdown sums to the final score", () => {
  const ranked = rank([
    candidate("breakdown-check", {
      relevance: 73,
      lastfmListeners: 2400,
      obscurity: 82,
      origin: "lastfm-deep",
    }),
  ], request({
    direction: "Surprends-moi",
    obscurity: 90,
  }));

  assert.equal(ranked.length, 1);

  const track = ranked[0];
  const breakdownTotal = Object.values(track.scoreBreakdown)
    .reduce((sum, value) => sum + value, 0);

  assert.ok(
    Math.abs(track.score - breakdownTotal) < 0.000001,
    `score=${track.score}, breakdown=${breakdownTotal}`,
  );
});
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


const path = (
  evidence: DiscoveryPath["evidence"],
  distance: number,
  kinds: DiscoveryPath["nodes"][number]["kind"][] = ["track", "track"],
): DiscoveryPath => ({
  source: evidence === "editorial" ? "discogs" : "lastfm",
  evidence,
  distance,
  nodes: kinds.map((kind, index) => ({
    kind,
    name: `${kind}-${index}`,
    source: evidence === "editorial" ? "discogs" : "lastfm",
  })),
});

test("evidence separates a credible behavioral path from unsupported catalogue retrieval", () => {
  const noMusicalOverlap = {
    genre: 0,
    subgenre: 0,
    traits: 0,
    rawTags: 0,
    labels: 0,
    country: 0,
    year: 0,
  };

  const behavioral = assessCandidateEvidence(
    { discoveryPath: path("listening", 2) },
    noMusicalOverlap,
  );
  const catalogue = assessCandidateEvidence(
    { discoveryPath: path("catalogue", 3) },
    noMusicalOverlap,
  );

  assert.equal(behavioral.tier, "credible");
  assert.equal(behavioral.path, "behavioral");
  assert.equal(catalogue.tier, "exploratory");
  assert.equal(catalogue.path, "catalogue");
});

test("artist context can support evidence without masquerading as track affinity", () => {
  const ranked = rank([
    candidate("artist-context-only", {
      scene: "",
      tags: [],
      year: 0,
      country: undefined,
      origin: "lastfm-crate",
      discoveryPath: path("catalogue", 3),
      retrieval: {
        provider: "lastfm",
        source: "live",
        artistRelation: {
          anchorArtist: "Seed Artist",
          neighbourArtist: "Context Artist",
          similarity: 0.72,
          tags: ["uk garage", "2-step"],
        },
      },
    }),
  ], request({ direction: "Surprends-moi" }));

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].analysis?.similarity, 0);
  assert.equal(ranked[0].evidence?.tier, "credible");
  assert.equal(ranked[0].evidence?.musical, true);
});

test("Surprends-moi keeps retrieval rank and jitter subordinate to recommendation evidence", () => {
  const ranked = rank([
    candidate("retrieval-heavy", {
      relevance: 80,
      tags: [],
      year: 0,
      country: undefined,
      origin: "lastfm-deep",
      discoveryPath: path("listening", 2),
    }),
  ], request({
    direction: "Surprends-moi",
    obscurity: 100,
    session: 7,
  }));

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].scoreBreakdown.relevance, 16);
  assert.equal(ranked[0].scoreBreakdown.origin, 0);
  assert.ok(Math.abs(ranked[0].scoreBreakdown.jitter) <= 3.75);
  assert.equal(ranked[0].evidence?.tier, "credible");
  assert.equal(ranked[0].evidence?.musical, false);
});

test("Surprends-moi does not treat a Discogs origin as recommendation proof by itself", () => {
  const ranked = rank([
    candidate("discogs-source-only", {
      relevance: 80,
      tags: [],
      year: 0,
      country: undefined,
      origin: "discogs-deep",
      discogs: {
        releaseId: 1,
        title: "Fixture release",
        artists: [{ id: 1, name: "Fixture Artist" }],
        labels: [],
        genres: [],
        styles: [],
        compilation: false,
        sourceUrl: "https://www.discogs.com/release/1",
        fetchedAt: "2026-09-18T00:00:00.000Z",
        position: "A1",
        trackArtists: [{ id: 1, name: "Fixture Artist" }],
        role: "release-track",
        path: [],
        audience: "unknown",
      },
    }),
  ], request({ direction: "Surprends-moi", obscurity: 100 }));

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].scoreBreakdown.discogs, 0);
  assert.equal(ranked[0].evidence?.tier, "credible");
  assert.equal(ranked[0].evidence?.path, "structured");
});

test("path scoring rewards verified depth without making longest path automatically best", () => {
  const directListening = discoveryPathScoreAdjustment(path("listening", 1), "Rabbit hole");
  const deepListening = discoveryPathScoreAdjustment(path("listening", 3), "Rabbit hole");
  const veryDeepTag = discoveryPathScoreAdjustment(path("tag", 8), "Rabbit hole");
  assert.ok(deepListening > directListening);
  assert.ok(deepListening > veryDeepTag);
});

test("path scoring favors label evidence specifically in Labels", () => {
  const labelPath = path("editorial", 2, ["track", "label", "track"]);
  const releasePath = path("editorial", 2, ["track", "release", "track"]);
  assert.ok(
    discoveryPathScoreAdjustment(labelPath, "Labels") >
    discoveryPathScoreAdjustment(releasePath, "Labels"),
  );
});

test("path scoring values explicit scene context in Même scène", () => {
  const contextPath = path("editorial", 2, ["track", "context", "track"]);
  const plainPath = path("editorial", 2, ["track", "release", "track"]);
  assert.ok(
    discoveryPathScoreAdjustment(contextPath, "Même scène") >
    discoveryPathScoreAdjustment(plainPath, "Même scène"),
  );
});

test("path-aware Rabbit hole ranking can prefer a coherent deeper path at equal relevance", () => {
  const direct = candidate("direct-path", {
    relevance: 70,
    origin: "lastfm-similar",
    discoveryPath: path("listening", 1),
  });
  const deep = candidate("deep-path", {
    relevance: 70,
    origin: "lastfm-similar",
    discoveryPath: path("listening", 3),
  });
  const ranked = rank([direct, deep], request({ direction: "Rabbit hole", obscurity: 70 }));
  assert.equal(ranked[0].id, "deep-path");
});


test("learned path preferences adjust the score for a matching path shape", () => {
  const learnedPath = path("listening", 2);
  const row = candidate("memory-preferred", {
    relevance: 70,
    discoveryPath: learnedPath,
  });
  const key = discoveryPathPreferenceKey(learnedPath, "Même vibe");
  assert.ok(key);
  const baseline = rank([row], request({ direction: "Même vibe" }))[0].score;
  const learned = rank(
    [row],
    request({
      direction: "Même vibe",
      memory: { pathScores: { [key!]: 8 }, knownTracks: [] },
    }),
  )[0].score;
  assert.equal(learned - baseline, 8);
});

test("exploration softly penalizes another track by an already-known artist", () => {
  const sameArtist = candidate("same-artist", {
    artist: "Known Artist",
    title: "Another Cut",
  });
  const newArtist = candidate("new-artist", {
    artist: "New Artist",
    title: "Fresh Cut",
  });

  const baseline = rank(
    [sameArtist, newArtist],
    request({ direction: "Surprends-moi" }),
  );
  const remembered = rank(
    [sameArtist, newArtist],
    request({
      direction: "Surprends-moi",
      memory: {
        pathScores: {},
        knownTracks: ["known artist\u0000known cut"],
      },
    }),
  );

  const baselineSame = baseline.find(track => track.id === "same-artist");
  const rememberedSame = remembered.find(track => track.id === "same-artist");
  const rememberedNew = remembered.find(track => track.id === "new-artist");
  assert.ok(baselineSame && rememberedSame && rememberedNew);
  assert.equal(
    rememberedSame.score - baselineSame.score,
    -8,
  );
  assert.equal(rememberedSame.scoreBreakdown.memory, -8);
  assert.equal(rememberedNew.scoreBreakdown.memory, 0);
});

test("server memory excludes tracks marked as already known", () => {
  const known = candidate("server-known", { artist: "Known Artist", title: "Known Cut" });
  const kept = candidate("server-kept");
  const ranked = rank(
    [known, kept],
    request({
      memory: {
        pathScores: {},
        knownTracks: ["known artist\u0000known cut"],
      },
    }),
  );
  assert.deepEqual(ranked.map(track => track.id), ["server-kept"]);
});


const emptyBreakdown = () => ({
  relevance: 0,
  musicalSimilarity: 0,
  sharedTags: 0,
  preferredTags: 0,
  popularityObscurity: 0,
  audience: 0,
  artistAudience: 0,
  origin: 0,
  discoveryPath: 0,
  memory: 0,
  discogs: 0,
  direction: 0,
  jitter: 0,
});

function rankedFixture(
  id: string,
  score: number,
  origin: RankedCandidate["origin"],
  distance: number,
  evidence: RankedCandidate["evidence"],
): RankedCandidate {
  return {
    ...candidate(id, {
      artist: `Artist ${id}`,
      origin,
      discoveryPath: {
        source: origin.startsWith("discogs") ? "discogs" : "lastfm",
        evidence:
          evidence?.path === "structured"
            ? "editorial"
            : evidence?.path === "catalogue"
              ? "catalogue"
              : "listening",
        nodes: [],
        distance,
      },
    }),
    score,
    scoreBreakdown: emptyBreakdown(),
    evidence,
  };
}

test("mode policy separates direct vibe from deep rabbit-hole selection", () => {
  const direct = rankedFixture(
    "direct",
    100,
    "artist-radio",
    1,
    { tier: "strong", musical: true, path: "behavioral", retrievalDepth: 1 },
  );
  const deepStructured = rankedFixture(
    "deep-structured",
    94,
    "discogs-deep",
    5,
    { tier: "strong", musical: true, path: "structured", retrievalDepth: 5 },
  );
  const secondHop = rankedFixture(
    "second-hop",
    96,
    "lastfm-deep",
    2,
    { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 2 },
  );

  assert.ok(
    modeSelectionAdjustment(direct, "Même vibe") >
      modeSelectionAdjustment(deepStructured, "Même vibe"),
  );
  assert.ok(
    modeSelectionAdjustment(deepStructured, "Rabbit hole") >
      modeSelectionAdjustment(direct, "Rabbit hole"),
  );

  const vibe = selectModeRecommendations(
    [direct, deepStructured, secondHop],
    "Seed Artist",
    "Même vibe",
    3,
  );
  const rabbit = selectModeRecommendations(
    [direct, deepStructured, secondHop],
    "Seed Artist",
    "Rabbit hole",
    3,
  );

  assert.equal(vibe[0]?.id, "direct");
  assert.equal(rabbit[0]?.id, "deep-structured");
});

test("Surprends-moi mode policy spreads origins before relaxing", () => {
  const rows: RankedCandidate[] = [
    rankedFixture(
      "radio-1",
      100,
      "artist-radio",
      1,
      { tier: "strong", musical: true, path: "behavioral", retrievalDepth: 1 },
    ),
    rankedFixture(
      "radio-2",
      99,
      "artist-radio",
      1,
      { tier: "strong", musical: true, path: "behavioral", retrievalDepth: 1 },
    ),
    rankedFixture(
      "radio-3",
      98,
      "artist-radio",
      1,
      { tier: "strong", musical: true, path: "behavioral", retrievalDepth: 1 },
    ),
    rankedFixture(
      "discogs-1",
      88,
      "discogs-label",
      4,
      { tier: "strong", musical: true, path: "structured", retrievalDepth: 4 },
    ),
    rankedFixture(
      "deep-1",
      86,
      "lastfm-deep",
      2,
      { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 2 },
    ),
  ];

  const selected = selectModeRecommendations(
    rows,
    "Seed Artist",
    "Surprends-moi",
    4,
  );

  assert.ok(selected.some(track => track.origin === "discogs-label"));
  assert.ok(selected.some(track => track.origin === "lastfm-deep"));
  assert.ok(
    selected.filter(track => track.origin === "artist-radio").length <= 2,
  );
});


test("Surprends-moi does not fill an origin with a much weaker second candidate", () => {
  const first = rankedFixture(
    "quality-1",
    20,
    "lastfm-artist-hop",
    4,
    { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 4 },
  );
  const close = rankedFixture(
    "quality-2",
    13,
    "lastfm-artist-hop",
    4,
    { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 4 },
  );
  const weak = rankedFixture(
    "quality-3",
    5,
    "lastfm-artist-hop",
    4,
    { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 4 },
  );

  const selected = selectModeRecommendations(
    [first, close, weak],
    "Seed Artist",
    "Surprends-moi",
    3,
  );

  assert.deepEqual(
    selected.map(track => track.id),
    ["quality-1", "quality-2"],
  );
});

test("Rabbit hole never relaxes into repeated artists", () => {
  const first = rankedFixture(
    "artist-a-1",
    120,
    "lastfm-deep",
    2,
    { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 2 },
  );
  const second = {
    ...rankedFixture(
      "artist-a-2",
      118,
      "lastfm-deep",
      2,
      { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 2 },
    ),
    artist: first.artist,
  };
  const third = rankedFixture(
    "artist-b",
    90,
    "discogs-deep",
    5,
    { tier: "strong", musical: true, path: "structured", retrievalDepth: 5 },
  );

  const selected = selectModeRecommendations(
    [first, second, third],
    "Seed Artist",
    "Rabbit hole",
    3,
  );

  assert.equal(
    new Set(selected.map(track => track.artist)).size,
    selected.length,
  );
});

test("artist audience shortlist follows mode policy and deduplicates artists", () => {
  const direct = rankedFixture(
    "audience-direct",
    100,
    "artist-radio",
    1,
    { tier: "strong", musical: true, path: "behavioral", retrievalDepth: 1 },
  );
  const deep = rankedFixture(
    "audience-deep",
    95,
    "discogs-deep",
    5,
    { tier: "strong", musical: true, path: "structured", retrievalDepth: 5 },
  );
  const duplicateArtist = {
    ...rankedFixture(
      "audience-deep-2",
      94,
      "discogs-label",
      4,
      { tier: "strong", musical: true, path: "structured", retrievalDepth: 4 },
    ),
    artist: deep.artist,
  };

  const rabbit = selectModeAwareArtistCandidates(
    [direct, deep, duplicateArtist],
    "Rabbit hole",
    2,
  );
  const vibe = selectModeAwareArtistCandidates(
    [direct, deep, duplicateArtist],
    "Même vibe",
    2,
  );

  assert.equal(rabbit[0]?.id, "audience-deep");
  assert.equal(vibe[0]?.id, "audience-direct");
  assert.equal(new Set(rabbit.map(track => track.artist)).size, rabbit.length);
});


test("all discovery modes keep artists unique while relaxing other caps", () => {
  const first = rankedFixture(
    "global-artist-a-1",
    120,
    "artist-radio",
    1,
    { tier: "strong", musical: true, path: "behavioral", retrievalDepth: 1 },
  );
  const duplicate = {
    ...rankedFixture(
      "global-artist-a-2",
      119,
      "lastfm-deep",
      2,
      { tier: "credible", musical: false, path: "behavioral", retrievalDepth: 2 },
    ),
    artist: first.artist,
    artistId: first.artistId,
  };
  const uniqueRows = Array.from({ length: 4 }, (_, index) =>
    rankedFixture(
      `global-unique-${index}`,
      100 - index,
      index % 2 === 0 ? "artist-radio" : "discogs-label",
      index + 1,
      {
        tier: "strong",
        musical: true,
        path: index % 2 === 0 ? "behavioral" : "structured",
        retrievalDepth: index + 1,
      },
    ),
  );

  for (const direction of [
    "Même vibe",
    "Même scène",
    "Labels",
    "Rabbit hole",
    "Surprends-moi",
  ] as const) {
    const selected = selectModeRecommendations(
      [first, duplicate, ...uniqueRows],
      "Seed Artist",
      direction,
      6,
    );
    assert.equal(
      new Set(selected.map(track => track.artist)).size,
      selected.length,
      `repeated artist in ${direction}`,
    );
  }
});


test("candidate eligibility reports explicit pre-ranking rejection reasons", () => {
  const participantKeys = new Set(["seed artist", "featured seed artist"]);
  const input = request({
    feedback: { feedback: "known" },
    memory: { pathScores: {}, knownTracks: ["known artist\u0000known track"] },
  });

  assert.equal(
    candidateEligibilityFailure(
      candidate("seed", { artist: "Other Artist" }),
      seed,
      input,
      participantKeys,
    ),
    "seed-id",
  );
  assert.equal(
    candidate("same-track", { title: seed.title, artist: seed.artist }).id,
    "same-track",
  );
  assert.equal(
    candidateEligibilityFailure(
      candidate("same-track", { title: seed.title, artist: seed.artist }),
      seed,
      input,
      participantKeys,
    ),
    "seed-track",
  );
  assert.equal(
    candidateEligibilityFailure(
      candidate("participant", { artist: "Featured Seed Artist" }),
      seed,
      input,
      participantKeys,
    ),
    "seed-participant",
  );
  assert.equal(
    candidateEligibilityFailure(
      candidate("participant-collab", {
        artist: "Featured Seed Artist, Other Artist",
      }),
      seed,
      input,
      participantKeys,
    ),
    "seed-participant",
  );
  assert.equal(
    candidateEligibilityFailure(
      candidate("known", { title: "Known Track", artist: "Known Artist" }),
      seed,
      input,
      participantKeys,
    ),
    "known-track",
  );
  assert.equal(
    candidateEligibilityFailure(
      candidate("feedback", { feedbackIds: ["feedback"] }),
      seed,
      input,
      participantKeys,
    ),
    "feedback-excluded",
  );
  assert.equal(
    candidateEligibilityFailure(
      candidate("allowed"),
      seed,
      input,
      participantKeys,
    ),
    undefined,
  );
});


test("artist-anchored Discogs catalogue paths are weaker than direct editorial paths", () => {
  const cataloguePath: DiscoveryPath = {
    source: "discogs",
    evidence: "catalogue",
    distance: 3,
    nodes: [
      { kind: "track", name: "Seed", source: "discogs" },
      { kind: "artist", name: "Seed Artist", source: "discogs" },
      { kind: "release", name: "Related Release", source: "discogs" },
      { kind: "track", name: "Candidate", source: "discogs" },
    ],
  };
  const editorialPath: DiscoveryPath = {
    ...cataloguePath,
    evidence: "editorial",
  };

  const catalogueEvidence = assessCandidateEvidence(
    { discoveryPath: cataloguePath },
    {
      genre: 0,
      subgenre: 0,
      traits: 0,
      rawTags: 0,
      labels: 0,
      country: 0,
      year: 0,
    },
  );
  const editorialEvidence = assessCandidateEvidence(
    { discoveryPath: editorialPath },
    {
      genre: 0,
      subgenre: 0,
      traits: 0,
      rawTags: 0,
      labels: 0,
      country: 0,
      year: 0,
    },
  );

  assert.equal(catalogueEvidence.path, "catalogue");
  assert.equal(catalogueEvidence.tier, "exploratory");
  assert.equal(editorialEvidence.path, "structured");
  assert.equal(editorialEvidence.tier, "credible");
});
