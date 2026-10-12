import test from "node:test";
import assert from "node:assert/strict";
import { fromRecording } from "../src/lib/providers/live";
import { deduplicate, mergeDiscoveryCandidates, type Candidate } from "../src/lib/discovery/ranking";
import { normalizeIsrc, partitionByRecordingIdentity, singleVerifiedIsrc } from "../src/lib/discovery/recording-identity";

const firstIsrc = "GBUM71029604", otherIsrc = "USRC17607839";
const song = (id: string, isrc?: string) => ({
  id, artist: "Mia", title: "Love Me Right", scene: "", label: "", tags: [],
  obscurity: 70, year: 0, colors: ["#123", "#234"] as [string, string],
  ...(isrc ? { externalIds: { isrc } } : {}),
});
const candidate = (id: string, isrc?: string): Candidate => ({
  ...song(id, isrc), reason: "fixture", relevance: 60, origin: "release",
});

test("ISRC normalization requires a valid code and an unambiguous value", () => {
  assert.equal(normalizeIsrc("gb-um7-10-29604"), firstIsrc);
  assert.equal(normalizeIsrc("not-an-isrc"), undefined);
  assert.equal(normalizeIsrc(""), undefined);
  assert.equal(singleVerifiedIsrc([firstIsrc, "gb-um7-10-29604"]), firstIsrc);
  assert.equal(singleVerifiedIsrc([firstIsrc, otherIsrc]), undefined);
  assert.equal(singleVerifiedIsrc(undefined), undefined);
});

test("MusicBrainz recording preserves a single valid ISRC, not contradictory ones", () => {
  const input = {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    title: "Love Me Right",
    "artist-credit": [{ name: "Mia" }],
  };
  assert.equal(fromRecording({ ...input, isrcs: ["gb-um7-10-29604"] })?.externalIds?.isrc, firstIsrc);
  assert.equal(fromRecording({ ...input, isrcs: [firstIsrc, otherIsrc] })?.externalIds?.isrc, undefined);
});

test("conflicting verified recordings survive text deduplication in original order", () => {
  const tracks = [
    song("first", firstIsrc),
    song("interlude"),
    { ...song("other-artist"), artist: "Another Artist" },
    song("second", otherIsrc),
    song("repeat-first", firstIsrc),
  ];
  assert.deepEqual(deduplicate(tracks).map(track => track.id), ["first", "interlude", "other-artist", "second"]);
});

test("conflicting ISRCs and unverified tracks cannot exchange discovery evidence", () => {
  const first = { ...candidate("first", firstIsrc), externalIds: { isrc: firstIsrc, musicbrainz: "mb-1" } };
  const second = candidate("second", otherIsrc);
  const unverified = candidate("unverified");
  const merged = mergeDiscoveryCandidates([first, second, unverified]);
  assert.equal(merged.length, 3);
  assert.deepEqual(new Set(merged.map(track => track.externalIds?.isrc)), new Set([firstIsrc, otherIsrc, undefined]));
  assert.equal(merged.find(track => track.id === "second")?.externalIds?.musicbrainz, undefined);
  assert.equal(partitionByRecordingIdentity([first, second]).length, 2);
});

test("one supported ISRC preserves existing source fusion and can be propagated", () => {
  const catalogued = candidate("catalogue");
  const verified = { ...candidate("mb", firstIsrc), externalIds: { musicbrainz: "mb-1", isrc: firstIsrc } };
  const merged = mergeDiscoveryCandidates([catalogued, verified]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "mb");
  assert.equal(merged[0].externalIds?.isrc, firstIsrc);
  assert.deepEqual(deduplicate([song("plain"), song("isrc", firstIsrc)]).map(row => row.id), ["plain"]);
});

test("named remix titles stay distinct even if they carry the same ISRC", () => {
  assert.equal(mergeDiscoveryCandidates([
    candidate("original", firstIsrc),
    { ...candidate("remix", firstIsrc), title: "Love Me Right (Dub Remix)" },
  ]).length, 2);
});
