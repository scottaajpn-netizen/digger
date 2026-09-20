import test from "node:test";
import assert from "node:assert/strict";

import {
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
