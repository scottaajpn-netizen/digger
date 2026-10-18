import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { compareTopTags } from "../src/lib/discovery/top-tags-experiment";

const targets = (n: number) => Array.from({ length: n }, (_, i) => ({
  artist: "Top Tags Artist", title: "Cut " + i, status: "no-tags", tags: [], existingTags: ["jazz"],
}));
function credentials(t: TestContext, key: string) {
  const old = process.env.LASTFM_API_KEY; process.env.LASTFM_API_KEY = key;
  t.after(() => { if (old === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = old; });
}
test("top tags counts usable deduplicated tags, compares existing metadata, checks identity and caches", async t => {
  credentials(t, "top-tags-success");
  const input = targets(3), before = structuredClone(input);
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const u = new URL(String(url)), track = u.searchParams.get("track")!;
    assert.equal(u.searchParams.get("method"), "track.getTopTags");
    assert.equal(u.searchParams.get("autocorrect"), "0");
    return Response.json({ toptags: { "@attr": { artist: input[0].artist, track: track === "Cut 2" ? "Cut 2 Remix" : track },
      tag: track === "Cut 1" ? [] : [{ name: "jazz", count: 100 }, { name: "broken beat", count: "80" },
        { name: "JAZZ", count: 10 }, { name: "", count: 5 }, { name: "unused", count: 0 }] } });
  });
  const first = await compareTopTags(input, AbortSignal.timeout(5000));
  assert.equal(first.requests, 3);
  assert.deepEqual(first.outcomes.map(o => o.status), ["tags", "no-tags", "identity-rejected"]);
  assert.equal(first.outcomes[0].usableTagCount, 2);
  assert.equal(first.outcomes[0].invalidTagCount, 2);
  assert.deepEqual(first.outcomes[0].additionalTags, ["broken beat"]);
  assert.deepEqual(input, before);
  const second = await compareTopTags(input, AbortSignal.timeout(5000));
  assert.equal(second.requests, 0); assert.equal(second.cacheHits, 3);
});
test("top tags distinguishes missing tracks, API errors, malformed data and provider errors without retries", async t => {
  credentials(t, "top-tags-errors");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    const payloads = [{ error: 6, message: "Track not found" }, { error: 6, message: "Invalid parameters" },
      { toptags: { tag: "invalid" } }, { toptags: { tag: [{ name: "jazz", count: 1 }] } }];
    const i = calls++;
    return i === 4 ? new Response("", { status: 503 }) : Response.json(payloads[i]);
  });
  const result = await compareTopTags(targets(5), AbortSignal.timeout(5000));
  assert.equal(calls, 5); assert.equal(result.requests, 5);
  assert.deepEqual(result.outcomes.map(o => o.status), ["track-not-found", "api-error", "unusable-data", "identity-rejected", "provider-error"]);
  assert.equal(result.enriched, 0);
});
test("invalid, excessive or duplicate targets are rejected before any request", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  for (const input of [targets(6), [targets(1)[0], targets(1)[0]], [{ ...targets(1)[0], status: "identity-rejected" }]])
    await assert.rejects(compareTopTags(input, AbortSignal.timeout(5000)));
});
