import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CATALOGUE_TTL_MS,
  loadCatalogueEntries,
  rememberCatalogueEntries,
} from "../src/lib/discovery/catalogue";

test("catalogue survives a fresh read and expires after seven days", async t => {
  const directory = await mkdtemp(join(tmpdir(), "digger-catalogue-"));
  const filePath = join(directory, "catalogue.json");
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const now = Date.parse("2026-09-20T12:00:00.000Z");
  await rememberCatalogueEntries(
    [{
      anchorArtist: "Léon Phal",
      neighbourArtist: "Neighbour",
      neighbourRank: 0,
      trackRank: 0,
      similarity: 0.7,
      track: {
        id: "lastfm:cached",
        title: "Cached cut",
        artist: "Neighbour",
        lastfmListeners: 600,
        externalIds: { lastfm: "https://www.last.fm/cached" },
      },
    }],
    { filePath, now },
  );

  const fresh = await loadCatalogueEntries(["Léon Phal"], {
    filePath,
    now: now + 60_000,
  });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].track.title, "Cached cut");

  const expired = await loadCatalogueEntries(["Léon Phal"], {
    filePath,
    now: now + CATALOGUE_TTL_MS + 1,
  });
  assert.deepEqual(expired, []);
});

test("catalogue is scoped by verified anchor and refreshes duplicate paths", async t => {
  const directory = await mkdtemp(join(tmpdir(), "digger-catalogue-"));
  const filePath = join(directory, "catalogue.json");
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const base = {
    anchorArtist: "Anchor A",
    neighbourArtist: "Neighbour",
    neighbourRank: 0,
    trackRank: 0,
    track: {
      id: "lastfm:duplicate",
      title: "Same cut",
      artist: "Neighbour",
      lastfmListeners: 700,
    },
  };

  await rememberCatalogueEntries([base], { filePath, now: 1000 });
  await rememberCatalogueEntries(
    [{ ...base, track: { ...base.track, lastfmListeners: 500 } }],
    { filePath, now: 2000 },
  );

  const a = await loadCatalogueEntries(["Anchor A"], {
    filePath,
    now: 3000,
  });
  const b = await loadCatalogueEntries(["Anchor B"], {
    filePath,
    now: 3000,
  });

  assert.equal(a.length, 1);
  assert.equal(a[0].track.lastfmListeners, 500);
  assert.deepEqual(b, []);
});
