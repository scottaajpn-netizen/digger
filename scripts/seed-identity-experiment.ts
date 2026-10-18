import { readFile, writeFile, open } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import assert from "node:assert/strict";
import { fromRecording, artistAudienceReferences } from "../src/lib/providers/live";
import { musicJson, lastFmJson } from "../src/lib/providers/http";
import { discoverDiscogs } from "../src/lib/providers/discogs";
import { createDiscogsClient } from "../src/lib/providers/discogs-http";
import { normalized, mergeDiscoveryCandidates, passesDeepAudienceGate, selectModeRecommendations, obscurityFromLastFmListeners, discoverySeedAnchor } from "../src/lib/discovery/ranking";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { buildMusicalProfile } from "../src/lib/music/profile";
import type { compareRecordingEnrichment } from "../src/lib/discovery/recording-enrichment-experiment";

// Isolated causal experiment: replay the same historical non-Discogs pool.
// Do not regenerate Last.fm/LB branches or write any runtime catalogue.
type Experiment = Awaited<ReturnType<typeof compareRecordingEnrichment>>;
type Capture = Record<string, { status: number; body: string }>;
const prefix = "benchmark-results/seed-identity-pleine-foret";
const source = "benchmark-results/discovery-2026-10-13T05-35-52-532Z.json";
const mbid = "b25ebfbd-6223-434c-93ba-e42856bebf90";

async function main() {
  const captureMode = process.argv.includes("--capture");
  if (!captureMode && !process.argv.includes("--replay")) throw Error("Choose --capture or --replay");
  const captures: Capture = captureMode ? {} : JSON.parse(await readFile(prefix + "-http.json", "utf8"));
  if (captureMode) {
    const lock = await open(prefix + "-capture.lock", "wx"); await lock.close();
    loadEnvFile(".env.local");
    if (!process.env.LASTFM_API_KEY || !process.env.DISCOGS_TOKEN) throw Error("Missing credentials");
  } else {
    process.env.LASTFM_API_KEY = "offline-replay";
    process.env.DISCOGS_TOKEN = "offline-replay";
  }
  const snapshot = JSON.parse(await readFile(source, "utf8")) as { runs: Array<{ caseId: string; recordingEnrichment: Experiment }> };
  const base = snapshot.runs.find(r => r.caseId === "leon-phal-jungle-jack-pleine-foret")!.recordingEnrichment.replay;
  const fetchOriginal = globalThis.fetch;
  const events: Array<{ phase: string; key: string; network: boolean; status: number }> = [];
  let phase = "identity";
  const missing = new Set<string>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    url.searchParams.delete("api_key"); url.searchParams.sort();
    const key = url.toString();
    const saved = captures[key];
    if (saved) { events.push({ phase, key, network: false, status: saved.status }); return new Response(saved.body, { status: saved.status }); }
    if (!captureMode) { missing.add(key); throw Error("Uncaptured replay request"); }
    const response = await fetchOriginal(input, init);
    const body = await response.clone().text();
    captures[key] = { status: response.status, body };
    events.push({ phase, key, network: true, status: response.status });
    await writeFile(prefix + "-http.json", JSON.stringify(captures, null, 2));
    return response;
  };
  try {
    const signal = AbortSignal.timeout(120000);
    type Recording = Parameters<typeof fromRecording>[0];
    const recording = await musicJson<Recording>("mb", "recording/" + mbid, { inc: "artists+releases+tags+isrcs" }, signal);
    const mbSeed = fromRecording(recording);
    assert.ok(mbSeed);
    assert.equal(normalized(mbSeed.title), normalized(base.seed.title));
    assert.ok(!recording.disambiguation || !/remix|live|instrumental|version/i.test(recording.disambiguation));
    assert.deepEqual(mbSeed.credits!.map(c => normalized(c.name)).sort(), ["jungle jack", "leon phal"]);
    assert.ok(mbSeed.credits!.every(c => c.sourceId && c.source === "musicbrainz"));
    const artists = [];
    for (const credit of mbSeed.credits!) {
      const row = await musicJson<{ id: string; name: string; tags?: Array<{ name: string }>; relations?: Array<{ type?: string; url?: { resource?: string } }> }>(
        "mb", "artist/" + credit.sourceId, { inc: "tags+url-rels" }, signal);
      assert.equal(row.id, credit.sourceId);
      assert.equal(normalized(row.name), normalized(credit.name));
      artists.push(row);
    }
    const anchors = artists.flatMap(row => (row.relations || []).flatMap(rel => {
      const value = rel.url?.resource;
      if (!value) return [];
      const url = new URL(value);
      const match = url.pathname.match(/^\/artist\/(\d+)/);
      return /^(www\.)?discogs\.com$/.test(url.hostname) && match ? [{ id: Number(match[1]), name: row.name }] : [];
    }));
    const artistTags = artists.flatMap(row => row.tags || []).map(t => t.name).slice(0, 8);
    mbSeed.tags = [...new Set([...mbSeed.tags, ...artistTags])].slice(0, 8);
    if (artistTags.length) mbSeed.tagEvidence = [...(mbSeed.tagEvidence || []), { source: "musicbrainz", scope: "artist", tags: artistTags }];
    const results = [];
    for (const [name, seed] of [["lastfm", base.seed], ["musicbrainz", mbSeed]] as const) {
      phase = name;
      const discogs = await discoverDiscogs(structuredClone(seed), base.input, signal, {
        enabled: true, artistAnchors: name === "musicbrainz" ? anchors : [], get: createDiscogsClient(),
      });
      assert.ok(discogs.diagnostics.calls <= 18);
      // Same non-Discogs background and exclusions for both arms; no catalogue writes.
      const pool = mergeDiscoveryCandidates([...structuredClone(base.baselinePool), ...discogs.candidates]);
      const targets = pool.filter(t => t.discogs && t.lastfmListeners === undefined).sort((a, b) => b.relevance - a.relevance).slice(0, 60);
      const audience = [];
      for (const target of targets) {
        let info: { track?: { name?: string; artist?: { name?: string }; listeners?: string; toptags?: { tag?: Array<{ name?: string }> } } } | null = null;
        let error = false;
        try { info = await lastFmJson("track.getInfo", { artist: target.artist, track: target.title, autocorrect: "0" }, signal, undefined, { retry: false }); }
        catch { error = true; }
        const row = info?.track;
        const identity = Boolean(row?.name && row.artist?.name && normalized(row.name) === normalized(target.title) && normalized(row.artist.name) === normalized(target.artist));
        const listeners = Number(row?.listeners);
        if (identity && Number.isFinite(listeners) && listeners > 0) {
          target.lastfmListeners = listeners;
          target.obscurityKnown = true;
          target.obscurity = obscurityFromLastFmListeners(listeners);
        }
        if (identity) target.tags = [...new Set([...target.tags, ...(row?.toptags?.tag || []).flatMap(t => t.name?.trim() ? [t.name.trim()] : [])])];
        audience.push({ id: target.id, artist: target.artist, title: target.title, identity, listeners: target.lastfmListeners, error });
      }
      const artistAudience = new Map<string, number>();
      for (const target of pool.filter(t => t.discogs)) {
        for (const ref of artistAudienceReferences(target)) {
          if (artistAudience.has(ref.key)) continue;
          if (artistAudience.size >= 60) break;
          let listeners = NaN;
          try {
            const response = await lastFmJson<{ artist?: { stats?: { listeners?: string } } }>("artist.getInfo", { artist: ref.artist, autocorrect: "1" }, signal, undefined, { retry: false });
            listeners = Number(response?.artist?.stats?.listeners);
          } catch { /* Unknown is not fabricated. */ }
          artistAudience.set(ref.key, listeners);
        }
        const known = artistAudienceReferences(target).map(ref => artistAudience.get(ref.key)).filter((v): v is number => v !== undefined && Number.isFinite(v) && v > 0);
        if (known.length) target.lastfmArtistListeners = Math.max(...known);
      }
      const seedProfile = discogs.seedRelease ? buildMusicalProfile({ ...seed, tags: [...seed.tags, ...discogs.seedRelease.styles, ...discogs.seedRelease.genres] }) : name === "lastfm" ? base.seedProfile : buildMusicalProfile(seed);
      const keys = new Set((seed.credits || []).filter(c => c.role === "primary" || c.role === "featured").map(c => normalized(c.name)));
      const ranked = rankDiscoveryCandidates({ pool, seed, seedProfile, input: base.input, seedParticipantKeys: keys });
      const eligible = ranked.filter(t => t.origin !== "lastfm-tag" && passesDeepAudienceGate(t, base.input.obscurity));
      const known = new Set((base.input.memory?.knownTracks || []).map(k => k.split("\0")[0]));
      const selected = selectModeRecommendations(eligible, seed.artist, base.input.direction, 10, known);
      results.push({ name, seed, discogs, audience, trackAudienceLookups: targets.length, artistAudienceLookups: artistAudience.size,
        eligibleDiscogs: eligible.filter(t => t.discogs), selected,
        selectedBranches: selected.map(t => ({ artist: t.artist, anchor: discoverySeedAnchor(t), origin: t.origin })),
        replay: { pool, seed, seedProfile, input: base.input, seedParticipantKeys: [...keys] } });
    }
    assert.equal(missing.size, 0, "Replay must never substitute missing provider responses");
    const root = results[1].discogs.seedRelease;
    assert.ok(root, "No cross-source recording corroboration: do not infer identity");
    const rootPayload = JSON.parse(captures[`https://api.discogs.com/releases/${root.releaseId}`].body) as {
      title: string; artists: Array<{ id: number; name: string }>;
      tracklist: Array<{ title: string; duration?: string; extraartists?: Array<{ id: number; name: string; role: string }> }>;
    };
    assert.equal(normalized(rootPayload.title), normalized(mbSeed.album!));
    const seedTracks = rootPayload.tracklist.filter(t => normalized(t.title) === normalized(mbSeed.title));
    assert.equal(seedTracks.length, 1);
    const leonIds = anchors.filter(a => normalized(a.name) === "leon phal").map(a => a.id);
    const jackIds = anchors.filter(a => normalized(a.name) === "jungle jack").map(a => a.id);
    assert.ok(rootPayload.artists.some(a => leonIds.includes(a.id)));
    assert.ok(seedTracks[0].extraartists?.some(a => jackIds.includes(a.id) && /featuring/i.test(a.role)));
    const corroboration = { releaseId: root.releaseId, album: rootPayload.title, track: seedTracks[0], musicbrainzLengthMs: (recording as Recording & { length?: number }).length };
    assert.deepEqual(results[0].selected.map(t => t.id), base.baselineTracks.map(t => t.id), "Reference selection must be reproduced");
    if (!captureMode) {
      const previous = JSON.parse(await readFile(prefix + "-result.json", "utf8"));
      for (let i = 0; i < results.length; i++) {
        assert.deepEqual(results[i].selected.map(t => ({ id: t.id, score: t.score })), previous.results[i].selected.map((t: { id: string; score: number }) => ({ id: t.id, score: t.score })));
        assert.deepEqual(results[i].eligibleDiscogs.map(t => t.id), previous.results[i].eligibleDiscogs.map((t: { id: string }) => t.id));
      }
    }
    const result = { source, generatedAt: new Date().toISOString(), scope: "frozen non-Discogs pool; only Discogs generation and seed metadata vary", recording, artists, anchors, corroboration, events, results };
    await writeFile(prefix + (captureMode ? "-result.json" : "-replay.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ anchors, calls: events.reduce<Record<string, number>>((a, e) => { const k = e.phase + (e.network ? ":network" : ":capture"); a[k] = (a[k] || 0) + 1; return a; }, {}), results: results.map(r => ({ name: r.name, diagnostics: r.discogs.diagnostics, audience: r.audience, eligibleDiscogs: r.eligibleDiscogs.map(t => ({ artist: t.artist, title: t.title })), selected: r.selected.map(t => ({ artist: t.artist, title: t.title, score: t.score, origin: t.origin })) })) }, null, 2));
  } finally { globalThis.fetch = fetchOriginal; }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Experiment failed; inspect captures before any rerun."); process.exitCode = 1; });
