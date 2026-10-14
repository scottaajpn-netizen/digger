import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CATALOGUE_TTL_MS,
  loadCatalogueEntries,
  rememberCatalogueEntries,
  defaultCataloguePath,
  catalogueRuntimeScope,
} from "../src/lib/discovery/catalogue";

test("provider mocks cannot read or overwrite an inherited live catalogue; benchmark has a separate store", async t => {
  const directory = await mkdtemp(join(tmpdir(), "digger-isolation-"));
  const livePath = join(directory, "live.json");
  const original = JSON.stringify({schemaVersion:1,entries:[]});
  await writeFile(livePath, original);
  const previous = process.env.DIGGER_CATALOGUE_PATH;
  process.env.DIGGER_CATALOGUE_PATH = livePath;
  t.after(async () => {
    if(previous === undefined) delete process.env.DIGGER_CATALOGUE_PATH;
    else process.env.DIGGER_CATALOGUE_PATH = previous;
    await rm(directory,{recursive:true,force:true});
  });
  assert.equal(catalogueRuntimeScope(), "test");
  assert.equal(defaultCataloguePath("live"), livePath);
  assert.notEqual(defaultCataloguePath(), livePath);
  assert.notEqual(defaultCataloguePath("benchmark"), livePath);
  assert.notEqual(defaultCataloguePath("benchmark"), defaultCataloguePath());
  await rememberCatalogueEntries([{anchorArtist:"Fixture Anchor",neighbourArtist:"Fixture Artist",
    neighbourRank:0,trackRank:0,track:{id:"fixture",artist:"Fixture Artist",title:"Fixture cut"}}]);
  assert.equal((await loadCatalogueEntries(["Fixture Anchor"])).length,1);
  assert.equal(await readFile(livePath,"utf8"),original);
});

test("fixture quarantine is exact, recoverable and idempotent; legitimate lookalikes survive", async t => {
  const { quarantine } = require(join(process.cwd(),"scripts/quarantine-catalogue-fixtures.cjs"));
  const directory=await mkdtemp(join(tmpdir(),"digger-quarantine-"));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const filePath=join(directory,"catalogue.json");
  const fixture={anchorArtist:"Léon Phal",anchorArtistMbid:"8b8b8b8b-1111-4111-8111-111111111111",
    neighbourArtist:"Jazz Root",neighbourRank:0,trackRank:0,similarity:0.9,artistTags:[],savedAt:"2026-10-12T12:00:00Z",
    track:{id:"lastfm-crate:1418421032",artist:"Jazz Root",title:"Jazz Root cut 1",lastfmListeners:60,externalIds:{}}};
  const legitimate={...fixture,anchorArtistMbid:"real-provider-id"};
  const original=JSON.stringify({schemaVersion:1,entries:[fixture,legitimate]});
  await writeFile(filePath,original);
  const result=quarantine(filePath);
  assert.equal(result.removed,1);
  assert.equal(result.preserved,1);
  assert.equal(await readFile(result.backup,"utf8"),original);
  assert.deepEqual(JSON.parse(await readFile(filePath,"utf8")).entries,[legitimate]);
  assert.equal(quarantine(filePath).removed,0);
});

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
      artistTags: ["jazz", "broken beat"],
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
  assert.equal(fresh[0].similarity, 0.7);
  assert.deepEqual(fresh[0].artistTags, ["jazz", "broken beat"]);

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


test("Mia cache excludes old name-only paths and separates distinct artist MBIDs",async t=>{
  const directory=await mkdtemp(join(tmpdir(),"digger-homonym-"));
  const filePath=join(directory,"catalogue.json");
  t.after(async()=>rm(directory,{recursive:true,force:true}));
  const correct="aaaaaaaa-1111-4111-8111-111111111111";
  const other="bbbbbbbb-1111-4111-8111-111111111111";
  const now=Date.parse("2026-10-12T12:00:00Z");
  const entry=(id:string,anchorArtistMbid?:string)=>({
    anchorArtist:"Mia",anchorArtistMbid,neighbourArtist:"Artist",
    neighbourRank:0,trackRank:0,track:{
      id,title:"Cut "+id,artist:"Artist",lastfmListeners:1200,
    },
  });
  await rememberCatalogueEntries([entry("legacy"),entry("correct",correct),entry("wrong",other)],{filePath,now});
  assert.deepEqual(await loadCatalogueEntries(["Mia"],{filePath,now:now+1000}),[]);
  const good=await loadCatalogueEntries(["Mia"],{
    filePath,now:now+1000,anchorMbids:{mia:correct},
  });
  assert.deepEqual(good.map(x=>x.track.title),["Cut correct"]);
  const wrong=await loadCatalogueEntries(["Mia"],{
    filePath,now:now+1000,anchorMbids:{mia:other},
  });
  assert.deepEqual(wrong.map(x=>x.track.title),["Cut wrong"]);
});
