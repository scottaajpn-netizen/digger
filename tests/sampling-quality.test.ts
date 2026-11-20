import assert from "node:assert/strict";
import test from "node:test";

import {
  archivalEvidenceScore,
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
  archiveFocus: false,
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
    archiveFocus: false,
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

test("default crate searches for archival records rather than generic modern gospel videos", () => {
  const defaults = normalizeSamplingFilters({ genre: "", keywords: "" });
  assert.equal(defaults.archiveFocus, true);
  for (let i = 0; i < 20; i++) {
    const query = buildSamplingQuery(defaults);
    assert.match(query, /\b(?:19[6-9]\d)\b/);
    assert.match(query, /vinyl|record|pressing|rpm|archive/i);
    assert.doesNotMatch(query, /\bgospel\b/i);
  }
});

test("modern promotional gospel search result from real user trial is rejected", () => {
  const defaults = normalizeSamplingFilters({
    minDurationSeconds: 90,
    maxDurationSeconds: 480,
    archiveFocus: true,
  });
  const result = {
    title: "SACHE RE BIBLE HAMARA 🙏 | Nagpuri Gospel Song 2026 | New Christian Song | Nagpuri Worship Song",
    channel: "GOSPEL MUSIC LIBRARY",
    publishedAt: "2026-10-02T12:00:00Z",
    durationSeconds: 259,
  };
  assert.equal(samplingRejectionReason(result, defaults), "promotion");
  assert.ok(archivalEvidenceScore(result) < 2);
});

test("archive mode retains genuine track clues and limits SEO spam", () => {
  const archive = normalizeSamplingFilters({ archiveFocus: true });
  assert.equal(samplingRejectionReason({
    title: "The Pioneers - Sweet Number One (1975) 7 inch vinyl rip",
    channel: "Record Archive",
    publishedAt: "2025-04-02T12:00:00Z",
    durationSeconds: 194,
  }, archive), null);
  assert.equal(samplingRejectionReason({
    title: "Mystery Singer - Forgotten Song",
    channel: "Unknown Channel",
    publishedAt: "2025-04-02T12:00:00Z",
    durationSeconds: 194,
  }, archive), "not-archival-enough");
  const allPeriods = normalizeSamplingFilters({ archiveFocus: false });
  assert.equal(samplingRejectionReason({
    title: "Mystery Singer - Forgotten Song",
    channel: "Unknown Channel",
    publishedAt: "2025-04-02T12:00:00Z",
    durationSeconds: 194,
  }, allPeriods), null);
});

test("explicit user decade remains in archival search, with no invented publication date filtering", () => {
  const query = buildSamplingQuery(normalizeSamplingFilters({
    genre: "gospel",
    yearMin: 1977,
    yearMax: 1977,
    archiveFocus: true,
  }), true);
  assert.match(query, /gospel/);
  assert.match(query, /1977/);
  assert.doesNotMatch(query, /2026/);
});

test("a modern song titled Vinyl Soul is not mistaken for a vinyl rip", () => {
  const archive = normalizeSamplingFilters({
    archiveFocus: true,
    minDurationSeconds: 90,
    maxDurationSeconds: 480,
  });
  const video = {
    title: "Vinyl Soul",
    channel: "SUKISHA - Topic",
    publishedAt: "2019-03-01T00:00:00Z",
    durationSeconds: 96,
    description: "Provided to YouTube by a distributor. Vinyl Soul.",
  };
  assert.equal(archivalEvidenceScore(video), 0);
  assert.equal(samplingRejectionReason(video, archive), "not-archival-enough");
  assert.equal(samplingRejectionReason(video, { ...archive, archiveFocus: false }), null);
});

test("private press 7-inch record example remains eligible as real archival evidence", () => {
  const archive = normalizeSamplingFilters({ archiveFocus: true, minDurationSeconds: 90, maxDurationSeconds: 480 });
  const video = {
    title: 'SOUTHGREEN RECORDERS - Seashore - obscure private press 7"',
    channel: "forummusic.co.uk",
    publishedAt: "2013-06-10T00:00:00Z",
    durationSeconds: 126,
  };
  assert.ok(archivalEvidenceScore(video) >= 2);
  assert.equal(samplingRejectionReason(video, archive), null);
});

test("archive clues in description count, but bare aesthetic words do not", () => {
  assert.equal(archivalEvidenceScore({ title: "Vinyl Dreams", channel: "New Artist - Topic" }), 0);
  assert.ok(archivalEvidenceScore({
    title: "Seashore - Southgreen Recorders",
    description: "Original pressing. 45 rpm single, catalog number 620B.",
  }) >= 2);
});
