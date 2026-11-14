import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSearchTracks } from "../src/lib/search/reconcile";
import { mergeSuggestions, resolveSeedSuggestion, type Suggestion } from "../src/lib/search/matching";

const recording = "11111111-1111-4111-8111-111111111111";
const artist = "22222222-2222-4222-8222-222222222222";
const mb: Suggestion = {
  id: recording, title: "Pleine forêt", artist: "Léon Phal ft Jungle Jack", album: "Stress Killer",
  artistId: artist, credits: [
    { name: "Léon Phal", role: "primary", source: "musicbrainz", sourceId: artist },
    { name: "Jungle Jack", role: "featured", source: "musicbrainz", sourceId: "33333333-3333-4333-8333-333333333333" },
  ],
  externalIds: { musicbrainz: recording }, tags: [], scene: "", label: "", year: 2023,
  obscurity: 50, colors: ["a", "b"], sources: ["MusicBrainz"], matchScore: 0,
};
const lf: Suggestion = { ...mb, id: "lastfm:pleine", artist: "Léon Phal & Jungle Jack", album: undefined,
  artistId: undefined, credits: undefined, externalIds: { lastfm: "https://www.last.fm/music/example" }, sources: ["Last.fm"] };

test("collaboration search reuses unique fetched recording credits without an API call", () => {
  const result = mergeSuggestions("Pleine forêt Léon Phal Jungle Jack", [mb, lf]);
  assert.equal(result.length, 1);
  assert.equal(result[0].externalIds?.musicbrainz, recording);
  assert.equal(result[0].credits?.length, 2);
  assert.deepEqual(new Set(result[0].sources), new Set(["MusicBrainz", "Last.fm"]));
  assert.equal(result[0].externalIds?.lastfm, lf.externalIds?.lastfm);
  const thinWithId = { ...lf, id: recording, externalIds: { ...lf.externalIds, musicbrainz: recording } };
  const reordered = mergeSuggestions("Pleine forêt Léon Phal Jungle Jack", [thinWithId, mb]);
  assert.equal(reordered.length, 1);
  assert.equal(reordered[0].credits?.length, 2);
});

test("reconciliation rejects ambiguous recordings, remixes, album conflicts and partial credits", () => {
  const other = { ...mb, id: "44444444-4444-4444-8444-444444444444", externalIds: { musicbrainz: "44444444-4444-4444-8444-444444444444" } };
  assert.equal(reconcileSearchTracks([mb, other, lf])[2].externalIds?.musicbrainz, undefined);
  for (const reference of [
    { ...lf, title: "Pleine forêt (Remix)" },
    { ...lf, album: "Other album" },
    { ...lf, artist: "Léon Phal" },
    { ...lf, artistId: "different" },
  ]) assert.equal(reconcileSearchTracks([mb, reference])[1].externalIds?.musicbrainz, undefined);
  assert.equal(mergeSuggestions("Pleine forêt Léon Phal Jungle Jack", [mb, other]).length, 2);
  assert.equal(resolveSeedSuggestion(mb.title, mb.artist, [mb, other]), undefined);
});

test("Mia needs corroboration and band names are not split into collaborators", () => {
  const mia = { ...mb, artist: "Mia", title: "Love Me Right", credits: [{ name: "Mia", role: "primary" as const, source: "musicbrainz" as const, sourceId: artist }] };
  const unknown = { ...lf, artist: "Mia", title: "Love Me Right" };
  assert.equal(reconcileSearchTracks([mia, unknown])[1].externalIds?.musicbrainz, undefined);
  assert.equal(reconcileSearchTracks([mia, { ...unknown, album: mia.album }])[1].externalIds?.musicbrainz, recording);
  const band = { ...mb, artist: "Earth, Wind & Fire", credits: [{ name: "Earth, Wind & Fire", role: "primary" as const, source: "musicbrainz" as const, sourceId: artist }] };
  assert.equal(reconcileSearchTracks([band, { ...lf, artist: "Earth" }])[1].externalIds?.musicbrainz, undefined);
});
