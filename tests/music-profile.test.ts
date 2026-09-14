import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMusicTags } from "../src/lib/music/taxonomy";
import { buildMusicalProfile, compareMusicalProfiles } from "../src/lib/music/profile";

test("normalizes musical tags into genres, subgenres and traits", () => {
  const result = normalizeMusicTags(["UK Garage", "2 step", "soulful", "weird-custom-tag"]);
  assert.deepEqual(result.genres, ["Electronic"]);
  assert.ok(result.subgenres.includes("UK Garage"));
  assert.ok(result.subgenres.includes("2-Step"));
  assert.ok(result.traits.includes("syncopated"));
  assert.ok(result.traits.includes("soulful"));
  assert.ok(result.unknownTags.includes("weird-custom-tag"));
});

test("musical profile similarity rewards shared subgenres and traits", () => {
  const seed = buildMusicalProfile({ tags: ["uk garage", "2-step", "soulful"], year: 2001, country: "GB", label: "" });
  const close = buildMusicalProfile({ tags: ["uk garage", "2-step", "soulful"], year: 2002, country: "GB", label: "" });
  const far = buildMusicalProfile({ tags: ["trap"], year: 2024, country: "US", label: "" });
  assert.ok(compareMusicalProfiles(seed, close).musicalSimilarity > compareMusicalProfiles(seed, far).musicalSimilarity);
});
