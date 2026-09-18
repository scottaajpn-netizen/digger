import test from "node:test";
import assert from "node:assert/strict";
import { passesDeepAudienceGate, deduplicate, fromRecording, musicBrainzQuery, obscurityFromLastFmListeners, recommendLive, searchLive, selectDiverseRecommendations, selectSurpriseRecommendations } from "../src/lib/providers/live";

const emptyScoreBreakdown = () => ({
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
const id = "aaaaaaaa-1111-4111-8111-111111111111";
test("live normalization preserves real identity and never invents popularity", () => {
  const track = fromRecording({ id, title: "Test", "artist-credit": [{ name: "Artist", artist: { id: "bbbbbbbb-1111-4111-8111-111111111111" } }] });
  assert.ok(track);
  assert.equal(track.id, id);
  assert.equal(track.externalIds?.musicbrainz, id);
  assert.equal(track.popularity, undefined);
  assert.equal(track.label, "");
  assert.equal(fromRecording({ id: "invalid", title: "Bad" }), null);
  assert.equal(deduplicate([track, { ...track, id: "cccccccc-1111-4111-8111-111111111111", title: "TEST" }]).length, 1);
});
test("search separates artist/title in either order and escapes query operators", () => {
  const query = musicBrainzQuery("Ttabla — Taxi Kebab");
  assert.ok(query.includes('recording:"Ttabla" AND artist:"Taxi Kebab"'));
  assert.ok(query.includes('recording:"Taxi Kebab" AND artist:"Ttabla"'));
  assert.ok(!musicBrainzQuery('Test:* — Artist').includes('*'));
  assert.ok(musicBrainzQuery('أغنية — فنان').includes('أغنية'));
});
test("live requests cannot silently fall back to demo without a selected recording", async () => {
  await assert.rejects(recommendLive({ seed: "unknown", direction: "Même vibe", obscurity: 65, feedback: {}, session: 0 }, AbortSignal.timeout(1000)), /Choisis/);
});
test("live service ranks real-source records, excludes seed and known tracks", async t => {
  const artistId = "dddddddd-1111-4111-8111-111111111111";
  const candidateId = "eeeeeeee-1111-4111-8111-111111111111";
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const path = String(url);
    let data: unknown;
    if (path.includes('/ws/2/recording/')) data = { id, title: "Seed", 'artist-credit': [{ name: "Seed artist", artist: { id: artistId } }] };
    else if (path.includes('/ws/2/artist/')) data = { tags: [{ name: "test-tag" }], area: { name: "France" } };
    else if (path.includes('/lb-radio/artist/')) data = { [artistId]: [{ recording_mbid: candidateId, similar_artist_mbid: artistId }] };
    else if (path.includes('/lb-radio/tags')) data = [];
    else if (path.includes('/metadata/recording/')) data = { [candidateId]: { recording: { name: "Real candidate" }, artist: { name: "Seed artist", artists: [{ artist_mbid: artistId, name: "Seed artist" }] } } };
    else throw new Error(`Unexpected external request ${path}`);
    return Response.json(data);
  });
  const result = await recommendLive({ seed: "Seed", seedId: id, direction: "Même vibe", obscurity: 65, feedback: { [candidateId]: "known" }, session: 0 }, AbortSignal.timeout(10000));
  assert.equal(result.source, "live");
  assert.equal(result.fallback, false);
  assert.equal(result.tracks.length, 0);
  assert.ok(result.notes?.some(note => note.includes("Aucun morceau inventé")));
});


test("diversity selector caps the seed artist and favors different artists", () => {
  const ranked = Array.from({ length: 12 }, (_, index) => ({
    id: `id-${index}`,
    title: `Track ${index}`,
    artist: index < 5 ? "JeanJass" : `Artist ${index}`,
    scene: "Rap",
    label: index < 4 ? "Same Label" : `Label ${index}`,
    tags: ["hip hop"],
    obscurity: 50,
    year: 2020,
    colors: ["#000000", "#111111"] as [string, string],
    reason: "test",
    relevance: 50,
    origin: (index % 2 === 0 ? "tag" : "artist-radio") as "tag" | "artist-radio",
    score: 100 - index,
    scoreBreakdown: emptyScoreBreakdown(),
  }));
  const selected = selectDiverseRecommendations(ranked, "JeanJass", 10);
  assert.equal(selected.filter(track => track.artist === "JeanJass").length, 1);
  assert.ok(new Set(selected.map(track => track.artist)).size >= 7);
});


test("diversity selector avoids one candidate source dominating the first pass", () => {
  const ranked = Array.from({ length: 12 }, (_, index) => ({
    id: `source-${index}`,
    title: `Track ${index}`,
    artist: `Artist ${index}`,
    scene: "Electronic",
    label: `Label ${index}`,
    tags: ["deep house"],
    obscurity: 70,
    year: 2024,
    colors: ["#000000", "#111111"] as [string, string],
    reason: "test",
    relevance: 50,
    origin: index < 8 ? "artist-radio" as const : "tag" as const,
    score: 100 - index,
    scoreBreakdown: emptyScoreBreakdown(),
  }));
  const selected = selectDiverseRecommendations(ranked, "Seed Artist", 8);
  const radioCount = selected.filter(track => track.origin === "artist-radio").length;
  const tagCount = selected.filter(track => track.origin === "tag").length;
  assert.ok(radioCount <= 6);
  assert.ok(tagCount >= 2);
});


test("seed artist is excluded from discovery recommendations", () => {
  const ranked = Array.from({ length: 6 }, (_, index) => ({
    id: `seed-artist-${index}`,
    title: `Track ${index}`,
    artist: index < 3 ? "JeanJass" : `Other Artist ${index}`,
    scene: "Hip-Hop",
    label: "Test Label",
    tags: ["hip hop"],
    obscurity: 50,
    year: 2020,
    colors: ["#000000", "#111111"] as [string, string],
    reason: "test",
    relevance: 50,
    origin: "artist-radio" as const,
    score: 100 - index,
    scoreBreakdown: emptyScoreBreakdown(),
  }));
  const selected = selectDiverseRecommendations(ranked.filter(track => track.artist !== "JeanJass"), "JeanJass", 10);
  assert.equal(selected.some(track => track.artist === "JeanJass"), false);
});


test("deep discovery favors second-circle sources", () => {
  const ranked = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `direct-${index}`,
      title: `Direct ${index}`,
      artist: `Direct Artist ${index}`,
      scene: "Hip-Hop",
      label: "",
      tags: ["hip hop"],
      obscurity: 50,
      year: 2020,
      colors: ["#000000", "#111111"] as [string, string],
      reason: "direct",
      relevance: 80,
      origin: "lastfm-similar" as const,
      score: 90 - index,
      scoreBreakdown: emptyScoreBreakdown(),
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `deep-${index}`,
      title: `Deep ${index}`,
      artist: `Deep Artist ${index}`,
      scene: "Hip-Hop",
      label: "",
      tags: ["hip hop"],
      obscurity: 50,
      year: 2020,
      colors: ["#000000", "#111111"] as [string, string],
      reason: "deep",
      relevance: 70,
      origin: "lastfm-deep" as const,
      score: 100 - index,
      scoreBreakdown: emptyScoreBreakdown(),
    })),
  ];
  const selected = selectDiverseRecommendations(ranked, "Seed Artist", 6);
  assert.ok(selected.filter(track => track.origin === "lastfm-deep").length >= 3);
});


test("Surprends-moi selection prefers evidence-backed unique artists and caps wildcards", () => {
  const make = (
    id: string,
    artist: string,
    score: number,
    tier: "strong" | "credible" | "exploratory",
  ) => ({
    id,
    title: id,
    artist,
    scene: "",
    label: "",
    tags: [],
    obscurity: 90,
    year: 0,
    colors: ["a", "b"] as [string, string],
    reason: "fixture",
    relevance: 60,
    origin: "lastfm-deep" as const,
    score,
    scoreBreakdown: emptyScoreBreakdown(),
    evidence: {
      tier,
      musical: tier === "strong",
      path: tier === "exploratory" ? "catalogue" as const : "behavioral" as const,
      retrievalDepth: 2,
    },
  });

  const selected = selectSurpriseRecommendations([
    make("supported-a1", "Artist A", 70, "credible"),
    make("supported-a2", "Artist A", 69, "credible"),
    make("supported-b", "Artist B", 60, "strong"),
    make("wild-1", "Wild 1", 200, "exploratory"),
    make("wild-2", "Wild 2", 190, "exploratory"),
    make("wild-3", "Wild 3", 180, "exploratory"),
  ], "Seed Artist", 10);

  assert.deepEqual(
    selected.map(track => track.id),
    ["supported-a1", "supported-b", "wild-1", "wild-2"],
  );
  assert.equal(new Set(selected.map(track => track.artist)).size, selected.length);
  assert.equal(selected.filter(track => track.evidence?.tier === "exploratory").length, 2);
});

test("Surprends-moi selection does not fill the list with repeated supported artists", () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    id: `rita-${index}`,
    title: `Track ${index}`,
    artist: index < 2 ? "Doug Duffey" : "Tõnu Naissoo",
    scene: "",
    label: "",
    tags: [],
    obscurity: 90,
    year: 0,
    colors: ["a", "b"] as [string, string],
    reason: "second circle",
    relevance: 76,
    origin: "lastfm-deep" as const,
    score: 40 - index,
    scoreBreakdown: emptyScoreBreakdown(),
    evidence: {
      tier: "credible" as const,
      musical: false,
      path: "behavioral" as const,
      retrievalDepth: 2,
    },
  }));

  const selected = selectSurpriseRecommendations(rows, "Rita Moss", 10);
  assert.equal(selected.length, 2);
  assert.equal(new Set(selected.map(track => track.artist)).size, 2);
});

test("Last.fm audience maps mainstream tracks to lower obscurity", () => {
  assert.ok(obscurityFromLastFmListeners(500) > obscurityFromLastFmListeners(500000));
  assert.ok(obscurityFromLastFmListeners(5000000) < 30);
  assert.ok(obscurityFromLastFmListeners(50) > 70);
});


test("strict digging rejects mainstream and unknown audiences, including contradictory sources", () => {
  assert.equal(passesDeepAudienceGate({ lastfmListeners: 500000, popularity: 1 }, 100), false);
  assert.equal(passesDeepAudienceGate({}, 100), false);
  assert.equal(passesDeepAudienceGate({ lastfmListeners: Number.NaN }, 100), false);
  assert.equal(passesDeepAudienceGate({ lastfmListeners: 500 }, 100), true);
  assert.equal(passesDeepAudienceGate({ popularity: 12 }, 100), true);
  assert.equal(passesDeepAudienceGate({ lastfmListeners: 500, popularity: 80 }, 100), false);
  assert.equal(passesDeepAudienceGate({ lastfmListeners: 500, lastfmArtistListeners: 5000000 }, 100), false);
  assert.equal(passesDeepAudienceGate({ lastfmListeners: 500, lastfmArtistListeners: 1500000 }, 100), true);
  assert.equal(passesDeepAudienceGate({}, 65), true);
});

test("Surprends-moi at 100 excludes popular second-hop tracks and does not invent genres", async t => {
  const seedId = "aaaaaaaa-2222-4222-8222-222222222222";
  const oldKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "fixture-key";
  t.after(() => { if (oldKey === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const u = new URL(String(url));
    if (u.pathname.includes("/ws/2/recording/")) return Response.json({ id: seedId, title: "Fixture seed", tags: [{ name: "uk garage" }], "artist-credit": [{ name: "Fixture artist" }] });
    if (u.pathname.includes("/lb-radio/tags")) return Response.json([]);
    const method = u.searchParams.get("method");
    if (method === "track.getTopTags") return Response.json({ toptags: { tag: [] } });
    if (method === "tag.getTopTracks") assert.fail("Deep mode must not request tag charts");
    if (method === "track.getSimilar") {
      if (u.searchParams.get("track") === "Fixture seed") return Response.json({ similartracks: { track: Array.from({ length: 32 }, (_, i) => ({ name: `Bridge ${i}`, artist: { name: `Bridge artist ${i}` }, match: 0.7 })) } });
      return Response.json({ similartracks: { track: [{ name: "Underground fixture", artist: { name: "Small fixture" }, match: 0.5 }, { name: "Mainstream fixture", artist: { name: "Famous fixture" }, match: 1 }] } });
    }
    if (method === "track.getInfo") return Response.json({ track: { listeners: u.searchParams.get("artist") === "Small fixture" ? "500" : "500000" } });
    throw new Error("Unexpected fixture request");
  });
  for (const session of [0, 1, 7]) {
    const result = await recommendLive({ seed: "Fixture seed", seedId, direction: "Surprends-moi", obscurity: 100, feedback: {}, session }, AbortSignal.timeout(20000));
    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0].artist, "Small fixture");
    assert.deepEqual(result.tracks[0].analysis?.subgenres, []);
    assert.equal(result.tracks[0].lastfmListeners, 500);
    assert.equal(result.tracks[0].discoveryPath?.evidence, "listening");
    assert.equal(result.tracks[0].evidence?.path, "behavioral");
  }
});

test("live Labels consumes Discogs, verifies audience, preserves exclusions and falls back on failure", async t => {
  const seedId = "aaaaaaaa-3333-4333-8333-333333333333";
  const oldLastfm = process.env.LASTFM_API_KEY, oldDiscogs = process.env.DISCOGS_TOKEN;
  process.env.LASTFM_API_KEY = "integration-fixture"; process.env.DISCOGS_TOKEN = "integration-fixture";
  t.after(() => { if (oldLastfm === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = oldLastfm; if (oldDiscogs === undefined) delete process.env.DISCOGS_TOKEN; else process.env.DISCOGS_TOKEN = oldDiscogs; });
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const u = new URL(String(url)); let data: unknown;
    if (u.hostname === "api.discogs.com") {
      if (u.pathname === "/database/search") data = { results: [{ id: 10010, type: "release" }] };
      else if (u.pathname === "/releases/10010") data = { id: 10010, title: "Integration compilation", artists: [{ id: 194, name: "Various" }], labels: [{ id: 10050, name: "Integration label" }], formats: [{ descriptions: ["Compilation"] }], tracklist: [{ title: "Integration seed", artists: [{ id: 101, name: "Integration artist" }] }, { title: "Famous fixture", artists: [{ id: 102, name: "Famous fixture artist" }] }] };
      else if (u.pathname === "/labels/10050/releases") data = { releases: [{ id: 10020 }] };
      else if (u.pathname === "/releases/10020") data = { id: 10020, title: "Small EP", artists: [{ id: 103, name: "Small fixture artist" }], labels: [{ id: 10050, name: "Integration label" }], tracklist: [{ title: "Small fixture track", position: "A1" }] };
      else throw Error("Unexpected Discogs fixture");
    } else if (u.pathname.includes('/ws/2/recording/')) data = { id: seedId, title: "Integration seed", tags: [{ name: "uk garage" }], "artist-credit": [{ name: "Integration artist" }] };
    else if (u.pathname.includes('/lb-radio/tags')) data = [];
    else if (u.searchParams.get("method") === "track.getTopTags") data = { toptags: { tag: [] } };
    else if (u.searchParams.get("method") === "track.getSimilar") data = { similartracks: { track: [] } };
    else if (u.searchParams.get("method") === "track.getInfo") data = { track: { name: u.searchParams.get("track"), artist: { name: u.searchParams.get("artist") }, listeners: u.searchParams.get("artist") === "Small fixture artist" ? "500" : "500000" } };
    else throw Error("Unexpected live fixture");
    return Response.json(data);
  });
  const request = { seed: "Integration seed", seedId, direction: "Labels" as const, obscurity: 100, feedback: {}, session: 0 };
  const result = await recommendLive(request, AbortSignal.timeout(15000));
  assert.equal(result.tracks.length, 1); assert.equal(result.tracks[0].artist, "Small fixture artist");
  assert.equal(result.tracks[0].lastfmListeners, 500); assert.equal(result.tracks[0].obscurityKnown, true);
  assert.ok(result.tracks[0].reason.includes("Integration label"));
  const excluded = await recommendLive({ ...request, feedback: { [result.tracks[0].id]: "known" } }, AbortSignal.timeout(15000));
  assert.equal(excluded.tracks.length, 0);
  delete process.env.DISCOGS_TOKEN;
  const without = await recommendLive(request, AbortSignal.timeout(15000));
  assert.equal(without.source, "live"); assert.equal(without.tracks.length, 0);
});


test("search falls back to Last.fm when MusicBrainz has too few matches", async t => {
  const oldKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "search-fixture-key";
  t.after(() => { if (oldKey === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const u = new URL(String(url));
    if (u.hostname === "musicbrainz.org") return Response.json({ recordings: [] });
    if (u.searchParams.get("method") === "track.search") return Response.json({
      results: { trackmatches: { track: [{ name: "Your no Groove", artist: "DÜK", url: "https://www.last.fm/music/DUK/_/Your+no+Groove" }] } }
    });
    throw new Error(`Unexpected search request ${u}`);
  });
  const choices = await searchLive("Your no Groove — DÜK", AbortSignal.timeout(5000));
  assert.equal(choices.length, 1);
  assert.equal(choices[0].title, "Your no Groove");
  assert.equal(choices[0].artist, "DÜK");
  assert.ok(choices[0].id.startsWith("lastfm:"));
  assert.equal(choices[0].externalIds?.musicbrainz, undefined);
});

test("a verified Last.fm seed can be explored without a MusicBrainz ID", async t => {
  const oldKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "seed-fixture-key";
  t.after(() => { if (oldKey === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const u = new URL(String(url));
    const method = u.searchParams.get("method");
    if (u.hostname === "api.listenbrainz.org" && u.pathname.includes("/lb-radio/tags")) return Response.json([]);
    if (method === "track.getTopTags") return Response.json({ toptags: { tag: [{ name: "electronic", count: 10 }] } });
    if (method === "track.getInfo") return Response.json({ track: { name: u.searchParams.get("track"), artist: { name: u.searchParams.get("artist") }, listeners: "1200", url: "https://www.last.fm/fixture" } });
    if (method === "track.getSimilar") return Response.json({ similartracks: { track: [{ name: "Neighbour", artist: { name: "Small Artist" }, match: 0.6, url: "https://www.last.fm/neighbour" }] } });
    throw new Error(`Unexpected seed request ${u}`);
  });
  const result = await recommendLive({
    seed: "Your no Groove — DÜK",
    seedTrack: {
      id: "lastfm:fixture",
      title: "Your no Groove",
      artist: "DÜK",
      externalIds: { lastfm: "https://www.last.fm/fixture-seed" },
      source: "lastfm",
    },
    direction: "Même vibe",
    obscurity: 65,
    feedback: {},
    session: 0,
  }, AbortSignal.timeout(10000));
  assert.equal(result.seed.title, "Your no Groove");
  assert.equal(result.seed.artist, "DÜK");
  assert.equal(result.seed.externalIds?.musicbrainz, undefined);
  assert.ok(result.notes?.some(note => note.includes("multi-source")));
  const neighbour = result.tracks.find(track => track.artist === "Small Artist");
  assert.ok(neighbour);
  assert.equal(neighbour.discoveryPath?.source, "lastfm");
  assert.equal(neighbour.discoveryPath?.evidence, "listening");
  assert.equal(neighbour.evidence?.path, "behavioral");
});


test("catalogue fallback serves sparse non-MBID seeds in every direction and supports chaining", async t => {
  const oldKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "catalogue-fallback-fixture";
  t.after(() => { if (oldKey === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", async (input: URL) => {
    const u = new URL(String(input)), method = u.searchParams.get("method");
    if (method === "track.getTopTags") return Response.json({ toptags: { tag: [] } });
    if (method === "track.getInfo") return Response.json({ track: { name: u.searchParams.get("track"), artist: { name: u.searchParams.get("artist") }, listeners: "600" } });
    if (method === "track.getSimilar") return Response.json({ similartracks: { track: [] } });
    if (method === "artist.getSimilar") return Response.json({ similarartists: { artist: [{ name: u.searchParams.get("artist") === "Niche fixture" ? "Neighbour fixture" : "Next fixture", match: 0.6 }] } });
    if (method === "artist.getTopTracks") return Response.json({ toptracks: { track: [{ name: "Catalogue cut", artist: { name: u.searchParams.get("artist") }, listeners: "600", url: "https://www.last.fm/music/fixture" }] } });
    throw Error(`Unexpected catalogue route ${u.pathname}`);
  });
  const request = { seed: "Sparse seed", seedTrack: { id: "lastfm:niche", title: "Sparse seed", artist: "Niche fixture", source: "lastfm" as const }, direction: "Même vibe" as const, obscurity: 65, feedback: {}, session: 0 };
  const first = await recommendLive(request, AbortSignal.timeout(10000));
  assert.equal(first.tracks[0]?.artist, "Neighbour fixture");
  assert.equal(first.tracks[0]?.externalIds?.musicbrainz, undefined);
  assert.equal(first.tracks[0]?.discoveryPath?.evidence, "catalogue");
  assert.equal(first.tracks[0]?.evidence?.path, "catalogue");
  const second = await recommendLive({ ...request, seedTrack: first.tracks[0] }, AbortSignal.timeout(10000));
  assert.equal(second.seed.artist, "Neighbour fixture");
  assert.equal(second.tracks[0]?.artist, "Next fixture");
});
test("catalogue fallback rejects an artist identity contradicted by Last.fm track info", async t => {
  const oldKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "ambiguous-artist-fixture";

  t.after(() => {
    if (oldKey === undefined) delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY = oldKey;
  });

  t.mock.method(globalThis, "fetch", async (input: URL) => {
    const u = new URL(String(input));
    const method = u.searchParams.get("method");

    if (method === "track.getTopTags") {
      return Response.json({ toptags: { tag: [] } });
    }

    if (method === "track.getInfo") {
      return Response.json({
        track: {
          name: u.searchParams.get("track"),
          artist: { name: "Different Artist" },
          listeners: "600",
        },
      });
    }

    if (method === "track.getSimilar") {
      return Response.json({ similartracks: { track: [] } });
    }

    if (method === "artist.getSimilar") {
      return Response.json({
        similarartists: {
          artist: [{ name: "Wrong Neighbour", match: 0.9 }],
        },
      });
    }

    if (method === "artist.getTopTracks") {
      return Response.json({
        toptracks: {
          track: [{
            name: "Wrong Catalogue Cut",
            artist: { name: "Wrong Neighbour" },
            listeners: "600",
          }],
        },
      });
    }

    throw Error(`Unexpected ambiguous artist route ${u.pathname}`);
  });

  const result = await recommendLive({
    seed: "Love Me Right",
    seedTrack: {
      id: "lastfm:ambiguous-mia",
      title: "Love Me Right",
      artist: "Mia",
      source: "lastfm" as const,
    },
    direction: "Surprends-moi",
    obscurity: 100,
    feedback: {},
    session: 0,
  }, AbortSignal.timeout(10000));

  assert.equal(
    result.tracks.some(track => track.artist === "Wrong Neighbour"),
    false,
  );
});

test("discovery selection prefers a fifth artist before doubles and collapses edition variants", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: `edition-${i}`, title: i < 2 ? `Track - ${i === 0 ? 'Radio Edit' : 'Extended Mix'}` : `Track ${i}`, artist: i < 2 ? 'Artist 0' : `Artist ${i}`, scene: '', label: '', tags: [], obscurity: 50, year: 0, colors: ['a', 'b'] as [string, string], reason: 'catalogue', relevance: 60, origin: 'lastfm-crate' as const, score: 100 - i, scoreBreakdown: emptyScoreBreakdown() }));
  const selected = selectDiverseRecommendations(rows, 'seed', 6);
  assert.equal(selected.length, 6);
  assert.equal(new Set(selected.map(t => t.artist)).size, 6);
  assert.equal(selected.filter(t => t.title.startsWith('Track -')).length, 1);
});

test("discovery selection collapses artist aliases that share a MusicBrainz artist id", () => {
  const sharedArtistId = "e56aee57-d90e-40cf-a70d-beb70f6f3c69";
  const rows = [
    {
      id: "kaytradamus-cut",
      title: "I'll Try (interlude) / BOOM!",
      artist: "Kaytradamus",
      artistId: sharedArtistId,
      scene: "",
      label: "",
      tags: [],
      obscurity: 90,
      year: 0,
      colors: ["a", "b"] as [string, string],
      reason: "ListenBrainz",
      relevance: 70,
      origin: "artist-radio" as const,
      score: 20,
      scoreBreakdown: emptyScoreBreakdown(),
      evidence: {
        tier: "strong" as const,
        musical: true,
        path: "behavioral" as const,
        retrievalDepth: 1,
      },
    },
    {
      id: "kaytranada-cut",
      title: "Snap My Finger (instrumental)",
      artist: "KAYTRANADA",
      artistId: sharedArtistId,
      scene: "",
      label: "",
      tags: [],
      obscurity: 90,
      year: 0,
      colors: ["a", "b"] as [string, string],
      reason: "ListenBrainz",
      relevance: 69,
      origin: "artist-radio" as const,
      score: 19,
      scoreBreakdown: emptyScoreBreakdown(),
      evidence: {
        tier: "strong" as const,
        musical: true,
        path: "behavioral" as const,
        retrievalDepth: 1,
      },
    },
  ];

  const selected = selectSurpriseRecommendations(rows, "LAUSSE THE CAT", 10);

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.artist, "Kaytradamus");
});

test("discovery selection collapses instrumental variants of the same track", () => {
  const rows = [
    {
      id: "stevie-original",
      title: "Right Girl Wrong Time",
      artist: "Stevie Fontaine",
      scene: "",
      label: "",
      tags: [],
      obscurity: 90,
      year: 0,
      colors: ["a", "b"] as [string, string],
      reason: "Discogs",
      relevance: 80,
      origin: "discogs-label" as const,
      score: 100,
      scoreBreakdown: emptyScoreBreakdown(),
    },
    {
      id: "stevie-instrumental",
      title: "Right Girl, Wrong Time (Saxophone Instrumental)",
      artist: "Stevie Fontaine",
      scene: "",
      label: "",
      tags: [],
      obscurity: 90,
      year: 0,
      colors: ["a", "b"] as [string, string],
      reason: "Discogs",
      relevance: 79,
      origin: "discogs-label" as const,
      score: 99,
      scoreBreakdown: emptyScoreBreakdown(),
    },
  ];

  const selected = selectDiverseRecommendations(
    rows,
    "Mia",
    10,
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.title, "Right Girl Wrong Time");
});


test("structured MusicBrainz credits preserve collaborations without splitting artist names", () => {
  const collaboration = fromRecording({
    id: "aaaaaaaa-4444-4444-8444-444444444444",
    title: "Collab",
    "artist-credit": [
      { name: "Alpha & Omega", joinphrase: " feat. ", artist: { id: "bbbbbbbb-4444-4444-8444-444444444444" } },
      { name: "Guest", artist: { id: "cccccccc-4444-4444-8444-444444444444" } },
    ],
  });
  assert.ok(collaboration);
  assert.equal(collaboration.artist, "Alpha & Omega feat. Guest");
  assert.deepEqual(collaboration.credits?.map(c => [c.name, c.role]), [
    ["Alpha & Omega", "primary"],
    ["Guest", "featured"],
  ]);
  assert.equal(collaboration.credits?.[0].sourceId, "bbbbbbbb-4444-4444-8444-444444444444");
});
