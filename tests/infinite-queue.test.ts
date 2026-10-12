import test from "node:test";
import assert from "node:assert/strict";
import { startInfiniteQueue, appendInfiniteQueue, advanceInfiniteQueue, infiniteTrackKeys } from "../src/lib/discovery/infinite-queue";
import type { Recommendation, Track } from "../src/lib/types";

const song = (id: string, title: string, artist = "Artist"): Recommendation => ({
  id, title, artist, scene:"",label:"",tags:[],obscurity:60,year:0,colors:["a","b"],reason:"fixture"
});
const seed: Track = song("seed", "Seed");

test("initial batch skips seed, aliases and duplicates without altering candidate order", () => {
  const q = startInfiniteQueue([
    song("seed-copy","Seed"),
    song("first","Fête"),
    song("alt","Fete"),
    song("next","Next"),
    song("next","Next"),
  ],seed);
  assert.equal(q.current?.id,"first");
  assert.deepEqual(q.upcoming.map(x=>x.id),["next"]);
  assert.ok(infiniteTrackKeys(q.current!).some(x=>x.includes("fete")));
});

test("append keeps current track while loading and excludes all prior tracks", () => {
  const q=startInfiniteQueue([song("a","A"),song("b","B")],seed);
  const next=appendInfiniteQueue(q,[song("a-new","A"),song("b-new","B"),song("c","C")],seed);
  assert.equal(q.current?.id,"a");
  assert.equal(next.current?.id,"a");
  assert.deepEqual(next.upcoming.map(t=>t.id),["b","c"]);
  assert.equal(q.upcoming.length,1);
});

test("advancing past the final buffered song never drops it on failure", () => {
  const start=startInfiniteQueue([song("only","Only")],seed);
  assert.equal(advanceInfiniteQueue(start),start);
  const replenished=appendInfiniteQueue(start,[song("only-again","Only"),song("second","Second")],seed);
  assert.equal(advanceInfiniteQueue(replenished).current?.title,"Second");
  assert.equal(advanceInfiniteQueue(replenished).explored,1);
});

test("ISRC or MusicBrainz-linked naming variants do not duplicate verified recordings", () => {
  const first={...song("a","First"),externalIds:{musicbrainz:"aaaaaaaa-1111-4111-8111-111111111111"}};
  const alias={...song("b","Different spelling"),externalIds:{musicbrainz:"aaaaaaaa-1111-4111-8111-111111111111"}};
  const q=startInfiniteQueue([first,alias,song("c","Third")],seed);
  assert.deepEqual([q.current?.id,...q.upcoming.map(x=>x.id)],["a","c"]);
});

test("empty refill preserves queue unchanged", () => {
  const q=startInfiniteQueue([song("a","A")],seed);
  assert.deepEqual(appendInfiniteQueue(q,[],seed),q);
});
