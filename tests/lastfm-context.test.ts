import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanLastFmArtistTags,
  isUsefulLastFmArtistTag,
  lastFmNeighbourStrength,
} from "../src/lib/music/lastfm-context";

test("Last.fm artist context removes personal and technical tags", () => {
  const tags = cleanLastFmArtistTags([
    { name: "jazz", count: 100 },
    { name: "funk_add_to_lidarr_batch_9", count: 99 },
    { name: "Seen Live", count: 98 },
    { name: "broken beat", count: 80 },
    { name: "spotify", count: 70 },
    { name: "composer", count: 60 },
  ]);

  assert.deepEqual(tags, ["jazz", "broken beat", "composer"]);
  assert.equal(isUsefulLastFmArtistTag("nu jazz"), true);
  assert.equal(isUsefulLastFmArtistTag("my playlist"), false);
});

test("Last.fm neighbour strength is qualitative rather than a percentage claim", () => {
  assert.equal(lastFmNeighbourStrength(1), "très fort");
  assert.equal(lastFmNeighbourStrength(0.72), "fort");
  assert.equal(lastFmNeighbourStrength(0.5), "modéré");
  assert.equal(lastFmNeighbourStrength(0.2), "faible");
});
