import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { analyzeHoldoutExport, type HoldoutExport } from "../src/lib/evaluation/report";

const fixturePath = "tests/fixtures/holdout-a-2026-09-20.json.gz";
const expectedJsonSha256 = "830570284eca7bc94628950b23df1c2b19555cb2ef5028112b1c64170010ddd9";

function loadBaseline() {
  const json = gunzipSync(readFileSync(fixturePath));
  const digest = createHash("sha256").update(json).digest("hex");
  assert.equal(digest, expectedJsonSha256, "HOLDOUT-A raw export changed unexpectedly");
  return JSON.parse(json.toString("utf8")) as HoldoutExport;
}

test("HOLDOUT-A stays frozen and exposes the expected baseline", () => {
  const report = analyzeHoldoutExport(loadBaseline());

  assert.equal(report.complete, true);
  assert.equal(report.mode.direction, "Surprends-moi");
  assert.equal(report.mode.obscurity, 100);
  assert.equal(report.seedCount, 15);
  assert.equal(report.runCount, 15);
  assert.equal(report.ratingCount, 54);

  assert.equal(report.voteCounts.love, 21);
  assert.equal(report.voteCounts.ok, 8);
  assert.equal(report.voteCounts.relevant_not_for_me, 17);
  assert.equal(report.voteCounts.off_topic, 6);
  assert.equal(report.voteCounts.known, 0);
  assert.equal(report.voteCounts.too_popular, 2);
  assert.equal(report.voteCounts.unavailable, 0);

  assert.equal(report.noResultsCount, 1);
  assert.equal(report.resolutionFailedCount, 1);
  assert.equal(report.errorCount, 0);
  assert.equal(report.resolvedSeedCount, 14);
  assert.equal(report.seedsWithRecommendations, 13);

  assert.equal(report.bySource.find(row => row.source === "listenbrainz")?.count, 25);
  assert.equal(report.bySource.find(row => row.source === "lastfm")?.count, 25);
  assert.equal(report.bySource.find(row => row.source === "discogs")?.count, 4);
});

test("HOLDOUT report keeps score and path metrics reproducible", () => {
  const report = analyzeHoldoutExport(loadBaseline());

  assert.ok(Math.abs((report.scoresByVote.love.average ?? 0) - 8.945936080592427) < 1e-9);
  assert.ok(Math.abs((report.scoresByVote.ok.average ?? 0) - 27.47175595238095) < 1e-9);
  assert.ok(Math.abs((report.scoresByVote.off_topic.average ?? 0) - 7.4569082231106565) < 1e-9);

  const listenbrainz = report.bySource.find(row => row.source === "listenbrainz");
  assert.deepEqual(listenbrainz?.voteCounts, {
    love: 10,
    ok: 4,
    relevant_not_for_me: 10,
    off_topic: 1,
  });

  const lastfm = report.bySource.find(row => row.source === "lastfm");
  assert.equal(lastfm?.voteCounts.off_topic, 5);
  assert.equal(lastfm?.voteCounts.too_popular, 2);

  const leon = report.bySeed.find(row => row.seedId === "leon-phal-pleine-foret");
  assert.equal(leon?.status, "no-results");
  assert.equal(leon?.resolved, true);
  assert.equal(leon?.recommendationCount, 0);

  const adam = report.bySeed.find(row => row.seedId === "adam-chini-stimulation");
  assert.equal(adam?.status, "resolution-failed");
  assert.equal(adam?.resolved, false);
});
