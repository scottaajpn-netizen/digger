import test from "node:test";
import assert from "node:assert/strict";

import {
  assessLastFmArtistIdentity,
  containsArtistParticipant,
  resolveVerifiedArtistAnchors,
  selectBalancedArtistNeighbours,
  shouldExpandArtistCatalogue,
} from "../src/lib/discovery/artist-anchors";

test("Last.fm may verify one constituent artist without inventing the rest of a collaboration", () => {
  const anchors = resolveVerifiedArtistAnchors({
    seedArtist: "Léon Phal & Jungle Jack",
    lastFmTrackArtist: "Léon Phal",
  });

  assert.deepEqual(
    anchors.map(anchor => anchor.name),
    ["Léon Phal"],
  );
  assert.equal(
    anchors.some(anchor => anchor.name === "Jungle Jack"),
    false,
  );
});

test("a Last.fm-confirmed collaboration string opens constituent artist anchors", () => {
  const ampersand = resolveVerifiedArtistAnchors({
    seedArtist: "Léon Phal & Jungle Jack",
    lastFmTrackArtist: "Léon Phal & Jungle Jack",
  });
  assert.deepEqual(
    ampersand.map(anchor => anchor.name),
    ["Léon Phal", "Jungle Jack"],
  );

  const punctuationVariant = resolveVerifiedArtistAnchors({
    seedArtist: "Léon Phal & Jungle Jack",
    lastFmTrackArtist: "Léon Phal, Jungle Jack",
  });
  assert.deepEqual(
    punctuationVariant.map(anchor => anchor.name),
    ["Léon Phal", "Jungle Jack"],
  );
});

test("candidate collaborations expose seed participants before ranking", () => {
  assert.equal(
    containsArtistParticipant(
      "Jungle Jack, JeanJass",
      undefined,
      new Set(["jungle jack"]),
    ),
    true,
  );
  assert.equal(
    containsArtistParticipant(
      "JeanJass",
      undefined,
      new Set(["jungle jack"]),
    ),
    false,
  );
});

test("an unrelated Last.fm artist cannot become an anchor", () => {
  const anchors = resolveVerifiedArtistAnchors({
    seedArtist: "Mia",
    lastFmTrackArtist: "Different Artist",
  });
  assert.deepEqual(anchors, []);
});

test("structured credits remain valid anchors and are deduplicated with Last.fm", () => {
  const anchors = resolveVerifiedArtistAnchors({
    seedArtist: "Artist A feat. Artist B",
    credits: [
      {
        name: "Artist A",
        role: "primary",
        source: "musicbrainz",
        sourceId: "artist-a",
      },
      {
        name: "Artist B",
        role: "featured",
        source: "musicbrainz",
        sourceId: "artist-b",
      },
    ],
    lastFmTrackArtist: "Artist A",
  });

  assert.deepEqual(
    anchors.map(anchor => anchor.name),
    ["Artist A", "Artist B"],
  );
});

test("sparse or weak direct similarity triggers catalogue expansion", () => {
  assert.equal(shouldExpandArtistCatalogue([]), true);
  assert.equal(
    shouldExpandArtistCatalogue([
      { name: "One", artist: { name: "A" }, match: 0.8 },
      { name: "Two", artist: { name: "B" }, match: 0.8 },
    ]),
    true,
  );

  const healthy = Array.from({ length: 12 }, (_, index) => ({
    name: `Track ${index}`,
    artist: { name: `Artist ${index % 6}` },
    match: 0.5,
  }));
  assert.equal(shouldExpandArtistCatalogue(healthy), false);
});

test("neighbour selection round-robins verified anchors", () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, index) => ({
      anchor: "Anchor A",
      name: `A neighbour ${index}`,
      match: 1 - index / 10,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      anchor: "Anchor B",
      name: `B neighbour ${index}`,
      match: 1 - index / 10,
    })),
  ];

  const selected = selectBalancedArtistNeighbours(rows, [], 6);
  assert.deepEqual(
    selected.map(row => row.anchor),
    ["Anchor A", "Anchor B", "Anchor A", "Anchor B", "Anchor A", "Anchor B"],
  );
});


test("Mia name-only match cannot open the Last.fm German homonym catalogue",()=>{
  const trusted="aaaaaaaa-1111-4111-8111-111111111111";
  const anchors=resolveVerifiedArtistAnchors({
    seedArtist:"Mia",lastFmTrackArtist:"Mia",
    credits:[{name:"Mia",role:"primary",source:"musicbrainz",sourceId:trusted}],
  });
  const unknown=assessLastFmArtistIdentity(anchors,[trusted],undefined);
  assert.deepEqual(unknown.approved,[]);
  assert.equal(unknown.blocked[0]?.reason,"ambiguous-short-name");
  const wrong=assessLastFmArtistIdentity(anchors,[trusted],"bbbbbbbb-1111-4111-8111-111111111111");
  assert.equal(wrong.conflictingMbid,true);
  assert.deepEqual(wrong.approved,[]);
  assert.equal(wrong.blocked[0]?.reason,"conflicting-mbid");
  const correct=assessLastFmArtistIdentity(anchors,[trusted],trusted.toUpperCase());
  assert.equal(correct.approved.length,1);
  assert.equal(correct.approved[0].confirmedMbid,trusted);
  assert.deepEqual(correct.blocked,[]);
});
test("Léon Phal retains name fallback when no MBID is returned, except explicit conflict",()=>{
  const anchors=resolveVerifiedArtistAnchors({
    seedArtist:"Léon Phal & Jungle Jack",lastFmTrackArtist:"Léon Phal",
  });
  assert.deepEqual(assessLastFmArtistIdentity(anchors,[],undefined).approved.map(a=>a.name),["Léon Phal"]);
  const trusted="aaaaaaaa-1111-4111-8111-111111111111";
  const credited=resolveVerifiedArtistAnchors({
    seedArtist:"Léon Phal",lastFmTrackArtist:"Léon Phal",
    credits:[{name:"Léon Phal",role:"primary",source:"musicbrainz",sourceId:trusted}],
  });
  assert.deepEqual(assessLastFmArtistIdentity(credited,[trusted],"bbbbbbbb-1111-4111-8111-111111111111").approved,[]);
});
