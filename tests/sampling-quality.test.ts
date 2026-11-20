import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSamplingQuery,
  normalizeSamplingFilters,
  samplingRejectionReason,
} from "../src/lib/sampling/youtube";

const filters = normalizeSamplingFilters({
  minDurationSeconds: 90,
  maxDurationSeconds: 480,
  excludeShorts: true,
  excludeAI: true,
  excludeCompilations: true,
});

test("rejects recommendation Shorts instead of treating them as sample tracks", () => {
  assert.equal(samplingRejectionReason({ title: "10 Must Know Jazz Albums #shorts", durationSeconds: 60 }, filters), "too-short");
  assert.equal(samplingRejectionReason({ title: "10 MUST KNOW JAZZ ALBUMS", durationSeconds: 210 }, filters), "editorial");
  assert.equal(samplingRejectionReason({ title: "Rare Funk #shorts", durationSeconds: 210 }, filters), "short");
});

test("rejects long compilations, playlists and DJ sets", () => {
  assert.equal(samplingRejectionReason({ title: "Rare Groove Full Album", durationSeconds: 300 }, filters), "compilation");
  assert.equal(samplingRejectionReason({ title: "Jazz Funk DJ Set 1978", durationSeconds: 300 }, filters), "compilation");
  assert.equal(samplingRejectionReason({ title: "Fantastic Funk Compilation", durationSeconds: 300 }, filters), "compilation");
  assert.equal(samplingRejectionReason({ title: "Original Mix - Classic House", durationSeconds: 300 }, filters), null);
});

test("rejects explicit AI labels but not genuine artist names containing 'ai'", () => {
  assert.equal(samplingRejectionReason({ title: "Rare Soul (AI Generated)", durationSeconds: 230 }, filters), "ai-suspected");
  assert.equal(samplingRejectionReason({ title: "Soul demo", description: "made with Suno AI", durationSeconds: 230 }, filters), "ai-suspected");
  assert.equal(samplingRejectionReason({ title: "Thai Funk 1976", durationSeconds: 230 }, filters), null);
});

test("enforces exact duration limits using YouTube metadata", () => {
  assert.equal(samplingRejectionReason({ title: "Rare Track", durationSeconds: 30 }, filters), "too-short");
  assert.equal(samplingRejectionReason({ title: "Rare Track", durationSeconds: 490 }, filters), "too-long");
  assert.equal(samplingRejectionReason({ title: "Rare Track" }, filters), "too-short");
  assert.equal(samplingRejectionReason({ title: "Rare Track", durationSeconds: 240 }, filters), null);
});

test("quality switches can be disabled independently", () => {
  const disabled = normalizeSamplingFilters({
    excludeShorts: false,
    excludeAI: false,
    excludeCompilations: false,
  });
  assert.equal(samplingRejectionReason({ title: "Soul #shorts", durationSeconds: 40 }, disabled), null);
  assert.equal(samplingRejectionReason({ title: "AI Generated Song", durationSeconds: 240 }, disabled), null);
  assert.equal(samplingRejectionReason({ title: "Funk Full Album", durationSeconds: 1800 }, disabled), null);
});

test("search keeps geographic, instrument and year hints in relaxed discovery", () => {
  const query = buildSamplingQuery(normalizeSamplingFilters({
    genre: "jazz",
    country: "Brazil",
    instrument: "Rhodes",
    yearMin: 1977,
    yearMax: 1977,
  }), true);
  assert.match(query, /jazz/);
  assert.match(query, /Brazil/);
  assert.match(query, /Rhodes/);
  assert.match(query, /1977/);
});

test("normalization handles inverted ranges safely", () => {
  const normalized = normalizeSamplingFilters({
    minDurationSeconds: 480,
    maxDurationSeconds: 90,
    yearMin: 1985,
    yearMax: 1970,
  });
  assert.equal(normalized.minDurationSeconds, 90);
  assert.equal(normalized.maxDurationSeconds, 480);
  assert.equal(normalized.yearMin, 1970);
  assert.equal(normalized.yearMax, 1985);
});
