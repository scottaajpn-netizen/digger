import test from "node:test";
import assert from "node:assert/strict";
import { selectCrate, workKey, releaseKeys, type CrateRelease } from "../src/lib/crate/select";

const entries: CrateRelease[] = [
  { id: "1", masterId: "7", title: "Lumière", artist: "Étoile", year: 1974, country: "France", genres: ["Funk / Soul"], styles: ["Soul"] },
  { id: "2", masterId: "7", title: "Lumiere", artist: "ETOILE", year: 1975, country: "France", genres: ["Funk / Soul"], styles: ["Soul"] },
  { id: "3", title: "Forest", artist: "Orchid", year: 1981, country: "Brazil", genres: ["Jazz"], styles: ["Fusion"] },
  { id: "4", title: "Clouds", artist: "Orchid", year: 1982, country: "Brazil", genres: ["Jazz"], styles: ["Fusion"] },
  { id: "5", title: "Velvet", artist: "Harbor", year: 1967, country: "Japan", genres: ["Funk / Soul"], styles: ["Soul"] },
  { id: "6", title: "Sun", artist: "Papaya", year: 1972, country: "Brazil", genres: ["Funk / Soul"], styles: ["Soul"] },
];

test("the same seed returns the same discoveries", () => {
  const a = selectCrate(entries, { count: 4 }, 42);
  const b = selectCrate(entries, { count: 4 }, 42);
  assert.deepEqual(a.releases.map(r => r.id), b.releases.map(r => r.id));
});

test("repress duplicate editions even if accents/case differ", () => {
  const picked = selectCrate(entries, { count: 10 }, 88).releases;
  assert.equal(picked.filter(r => r.id === "1" || r.id === "2").length, 1);
  assert.equal(workKey(entries[0]), workKey(entries[1]));
  assert.deepEqual(releaseKeys(entries[0]), ["work:etoile|lumiere", "master:7"]);
});

test("respect year, genre and country, with no imaginary extra tracks", () => {
  const result = selectCrate(entries, { yearFrom: 1960, yearTo: 1979, genre: "Funk / Soul", country: "Brazil" }, 17);
  assert.deepEqual(result.releases.map(r => r.id), ["6"]);
  assert.equal(result.eligibleCount, 1);
});

test("exclude heard works regardless of editions", () => {
  const result = selectCrate(entries, { seenKeys: ["master:7"], count: 10 }, 15);
  assert.ok(result.releases.every(r => r.masterId !== "7"));
});

test("never assume unknown instrument credits or view counts", () => {
  const result = selectCrate(entries, { instrument: "Flute", maxViews: 5000 }, 15);
  assert.equal(result.releases.length, 0);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0], /Instrument/);
  assert.match(result.warnings[1], /Vues/);
});

test("SURPRISE bypasses filters but not listening history", () => {
  const result = selectCrate(entries, { genre: "Noise", yearFrom: 2020, surprise: true, seenKeys: ["master:7"], count: 10 }, 40);
  assert.ok(result.releases.length > 0);
  assert.ok(result.releases.every(r => r.masterId !== "7"));
});

test("stop at twelve and avoid repeated artists when other artists exist", () => {
  const result = selectCrate(entries, { count: 999 }, 3);
  assert.ok(result.releases.length <= 12);
  assert.equal(new Set(result.releases.slice(0, 4).map(r => r.artist)).size, 4);
});
