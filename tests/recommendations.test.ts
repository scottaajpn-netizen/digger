import test from "node:test";
import assert from "node:assert/strict";
import { recommend } from "../src/lib/recommendations";
import { directions, type DigRequest } from "../src/lib/types";
const base: DigRequest = { seed: "Ttabla Taxi Kebab", direction: "Même vibe", obscurity: 65, feedback: {}, session: 0 };
test("each direction returns ten distinct tracks and excludes the seed", async () => {
  for (const direction of directions) {
    const result = await recommend({ ...base, direction });
    assert.equal(result.tracks.length, 10);
    assert.equal(new Set(result.tracks.map(t => t.id)).size, 10);
    assert.ok(result.tracks.every(t => t.id !== result.seed.id && t.reason.length > 0));
  }
});
test("obscurity and direction meaningfully affect selections", async () => {
  const familiar = await recommend({ ...base, obscurity: 0 });
  const obscure = await recommend({ ...base, obscurity: 100 });
  const average = (tracks: typeof familiar.tracks) => tracks.reduce((n, t) => n + t.obscurity, 0) / tracks.length;
  assert.ok(average(obscure.tracks) > average(familiar.tracks) + 20);
  const scene = await recommend({ ...base, direction: "Même scène" });
  assert.equal(scene.tracks[0].scene, scene.seed.scene);
  const label = await recommend({ ...base, direction: "Labels" });
  assert.equal(label.tracks[0].label, label.seed.label);
});
test("known and disliked tracks are excluded; unknown seed is explicit", async () => {
  const initial = await recommend(base);
  const [a,b] = initial.tracks;
  const result = await recommend({ ...base, feedback: { [a.id]: "known", [b.id]: "neutral" } });
  assert.ok(result.tracks.every(t => ![a.id,b.id].includes(t.id)));
  assert.equal((await recommend({ ...base, seed: "zzzz unknown" })).fallback, true);
  assert.equal((await recommend({ ...base, seed: "Kerala — Bonobo" })).seed.artist, "Bonobo");
});
test("feedback influences subsequent ranking and exhausted catalog is safe", async () => {
  const initial = await recommend(base);
  const changed = await recommend({ ...base, feedback: { "mock-23": "love", "mock-24": "curious" } });
  assert.notDeepEqual(initial.tracks.map(t => t.id), changed.tracks.map(t => t.id));
  const feedback = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`mock-${i}`, "known" as const]));
  assert.equal((await recommend({ ...base, feedback })).tracks.length, 0);
});
