import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildTasteProfile, tasteFeatures, tasteScore } from "../src/lib/discovery/taste-profile";
import { clearDiscoveryMemory, loadDiscoveryMemorySnapshot, recordDiscoveryFeedback } from "../src/lib/discovery/memory";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { buildMusicalProfile } from "../src/lib/music/profile";
import type { Candidate } from "../src/lib/discovery/ranking";
import { buildTasteImport } from "../src/lib/discovery/taste-import";

const candidate: Candidate = {
  id: "candidate", title: "New discovery", artist: "Test Artist", artistId: "22222222-2222-4222-8222-222222222222",
  tags: ["boogie"], tagEvidence: [{ source: "musicbrainz", scope: "recording", tags: ["boogie"] }],
  scene: "", label: "", year: 2000, colors: ["a", "b"], obscurity: 50,
  reason: "test", relevance: 60, origin: "lastfm-similar",
};

test("persistent musical feedback changes ranking on an identical pool, and can be undone", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "digger-taste-profile-")), "memory.json");
  const seed = { ...candidate, id: "seed", title: "Seed", artist: "Seed Artist", artistId: undefined };
  const other = { ...candidate, id: "other", title: "Other", artist: "Other Artist", artistId: undefined,
    tags: ["disco"], tagEvidence: [{ source: "musicbrainz" as const, scope: "recording" as const, tags: ["disco"] }] };
  const input = { seed: "Seed", direction: "Surprends-moi" as const, obscurity: 50, session: 0, feedback: {} };
  const run = async () => rankDiscoveryCandidates({ pool: [candidate, other], seed,
    seedProfile: buildMusicalProfile(seed), input: { ...input, memory: await loadDiscoveryMemorySnapshot(file) }, seedParticipantKeys: new Set() });
  const initial = await run();
  other.relevance += (initial.find(t => t.id === "candidate")!.score - initial.find(t => t.id === "other")!.score + 1) / 0.2;
  const before = await run();
  assert.equal(before[0].id, "other");
  // A different liked recording teaches facts for a later request, without
  // needing the liked recording to still be in the candidate pool.
  await recordDiscoveryFeedback({ ...candidate, title: "Previously heard" }, "love", "Surprends-moi", file);
  const after = await run();
  assert.equal(after[0].id, "candidate");
  assert.ok(after.find(t => t.id === "candidate")!.score > before.find(t => t.id === "candidate")!.score);
  assert.equal(after.find(t => t.id === "other")!.score, before.find(t => t.id === "other")!.score);
  await recordDiscoveryFeedback({ ...candidate, title: "Previously heard" }, null, "Surprends-moi", file);
  assert.deepEqual(await run(), before);
  await clearDiscoveryMemory(file);
  assert.equal(tasteScore(candidate, (await loadDiscoveryMemorySnapshot(file)).tasteProfile), 0);
});

test("sample feedback survives reload, replacement and removal without phantom path scores", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "digger-sample-")), "memory.json");
  const track = { ...candidate, discoveryPath: { source: "lastfm" as const, evidence: "catalogue" as const, distance: 1,
    nodes: [{ kind: "track" as const, name: "Example", source: "lastfm" as const }] } };
  await recordDiscoveryFeedback(track, "sample", "Rabbit hole", file);
  const first = await loadDiscoveryMemorySnapshot(file);
  assert.ok(Object.values(first.pathScores)[0] > 0);
  assert.equal(tasteScore(candidate, first.tasteProfile), 0);
  await recordDiscoveryFeedback(track, "sample", "Rabbit hole", file);
  assert.deepEqual((await loadDiscoveryMemorySnapshot(file)).pathScores, first.pathScores);
  await recordDiscoveryFeedback(track, null, "Rabbit hole", file);
  assert.equal(Object.values((await loadDiscoveryMemorySnapshot(file)).pathScores)[0], 0);
});

test("preferences stay bounded and do not mistake context or curiosity for listening evidence", () => {
  const features = tasteFeatures({ ...candidate, discogs: { labels: [{ id: 12, name: "Label" }] } });
  const profile = buildTasteProfile(Array.from({ length: 50 }, () => ({ feedback: "love" as const, features })));
  assert.ok(tasteScore(candidate, profile) <= 8);
  const disliked = buildTasteProfile([{ feedback: "neutral", features }]);
  assert.ok(tasteScore(candidate, disliked) < 0);
  assert.ok(tasteScore(candidate, disliked) >= -6);
  for (const feedback of ["curious", "sample", "known"] as const) assert.equal(tasteScore(candidate, buildTasteProfile([{ feedback, features }])), 0);
  assert.deepEqual(tasteFeatures({ tagEvidence: [{ source: "discogs", scope: "release", tags: ["boogie"] }], scene: "Boogie" }).tags, []);
  assert.deepEqual(tasteFeatures({ artist: "Mia" }).artists, []);
});

test("imports contribute cautiously: AUTO only, confidence, duplicate recordings and short names", () => {
  const header = "video_id,raw_artist,raw_title,resolved_artist,resolved_title,resolver_source,resolver_confidence,confidence,safe_sync_status,safe_sync_playlists";
  const csv = `${header}\n1,Long Artist,One,Long Artist,One,test,99,90,AUTO,\n2,Long Artist,One,Long Artist,One,test,99,90,AUTO,\n3,Other Artist,Two,Other Artist,Two,test,99,90,REVIEW,\n4,Mia,Three,Mia,Three,test,99,90,AUTO,\n5,Low Artist,Four,Low Artist,Four,test,40,90,AUTO,`;
  const profile = buildTasteProfile([], buildTasteImport(csv));
  assert.equal(profile.artists["name:long artist"], 0.15);
  for (const name of ["other artist", "mia", "low artist"]) assert.equal(profile.artists[`name:${name}`], undefined);
});
