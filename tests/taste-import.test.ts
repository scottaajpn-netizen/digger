import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildTasteImport, loadTasteImport, writeTasteImport } from "../src/lib/discovery/taste-import";

const header = "video_id,raw_artist,raw_title,resolved_artist,resolved_title,resolver_source,resolver_confidence,confidence,safe_sync_status,safe_sync_playlists,safe_sync_reason,region,sources";

test("taste import is cautious, auditable and groups recording duplicates", async () => {
  const csv = `${header}\n1,Raw A,Song,Artist,Song,raw_metadata_trusted,99,92,AUTO,ELECTRONIC,,INTL,lastfm:artist\n2,Artist,Song,Artist,Song,title_parse_unverified,90,74,REVIEW,A VERIFIER,preuve faible,,audio:maest\n`;
  const store = buildTasteImport(csv, "2026-10-14T00:00:00.000Z");
  assert.deepEqual(store.report, { rows: 2, auto: 1, review: 1, unclassified: 0, mix: 0, duplicateGroups: 1 });
  assert.equal(store.tasteTags.electronic, 1);
  assert.equal(store.tracks[0].duplicateGroup, store.tracks[1].duplicateGroup);
  assert.deepEqual(store.tracks[1].playlists, []);
  const directory = await mkdtemp(path.join(tmpdir(), "digger-taste-"));
  const file = path.join(directory, "taste.json");
  await writeTasteImport(store, file);
  assert.deepEqual(await loadTasteImport(file), store);
});

test("taste import rejects duplicate video ids and incompatible exports", () => {
  const row = "1,A,T,A,T,raw_metadata_trusted,99,92,AUTO,ELECTRONIC,,,lastfm:artist";
  assert.throws(() => buildTasteImport(`${header}\n${row}\n${row}\n`), /dupliqué/);
  assert.throws(() => buildTasteImport("video_id,title\n1,T\n"), /incompatible/);
});
