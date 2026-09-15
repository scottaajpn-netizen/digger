import test from "node:test";
import assert from "node:assert/strict";
import { passesDeepAudienceGate, deduplicate, fromRecording, musicBrainzQuery, obscurityFromLastFmListeners, recommendLive, selectDiverseRecommendations } from "../src/lib/providers/live";

const id = "aaaaaaaa-1111-4111-8111-111111111111";
test("live normalization preserves real identity and never invents popularity", () => {
  const track = fromRecording({ id, title: "Test", "artist-credit": [{ name: "Artist", artist: { id: "bbbbbbbb-1111-4111-8111-111111111111" } }] });
  assert.ok(track);
  assert.equal(track.id,id);
  assert.equal(track.externalIds?.musicbrainz,id);
  assert.equal(track.popularity,undefined);
  assert.equal(track.label,"");
  assert.equal(fromRecording({id:"invalid",title:"Bad"}),null);
  assert.equal(deduplicate([track,{...track,id:"cccccccc-1111-4111-8111-111111111111",title:"TEST"}]).length,1);
});
test("search separates artist/title in either order and escapes query operators", () => {
  const query = musicBrainzQuery("Ttabla — Taxi Kebab");
  assert.ok(query.includes('recording:"Ttabla" AND artist:"Taxi Kebab"'));
  assert.ok(query.includes('recording:"Taxi Kebab" AND artist:"Ttabla"'));
  assert.ok(!musicBrainzQuery('Test:* — Artist').includes('*'));
  assert.ok(musicBrainzQuery('أغنية — فنان').includes('أغنية'));
});
test("live requests cannot silently fall back to demo without a selected recording", async () => {
  await assert.rejects(recommendLive({seed:"unknown",direction:"Même vibe",obscurity:65,feedback:{},session:0},AbortSignal.timeout(1000)), /Choisis/);
});
test("live service ranks real-source records, excludes seed and known tracks", async t => {
  const artistId="dddddddd-1111-4111-8111-111111111111";
  const candidateId="eeeeeeee-1111-4111-8111-111111111111";
  t.mock.method(globalThis,"fetch", async (url: URL) => {
    const path=String(url);
    let data: unknown;
    if(path.includes('/ws/2/recording/')) data={id,title:"Seed",'artist-credit':[{name:"Seed artist",artist:{id:artistId}}]};
    else if(path.includes('/ws/2/artist/')) data={tags:[{name:"test-tag"}],area:{name:"France"}};
    else if(path.includes('/lb-radio/artist/')) data={[artistId]:[{recording_mbid:candidateId,similar_artist_mbid:artistId}]};
    else if(path.includes('/lb-radio/tags')) data=[];
    else if(path.includes('/metadata/recording/')) data={[candidateId]:{recording:{name:"Real candidate"},artist:{name:"Seed artist",artists:[{artist_mbid:artistId,name:"Seed artist"}]}}};
    else throw new Error(`Unexpected external request ${path}`);
    return Response.json(data);
  });
  const result = await recommendLive({seed:"Seed",seedId:id,direction:"Même vibe",obscurity:65,feedback:{[candidateId]:"known"},session:0},AbortSignal.timeout(10000));
  assert.equal(result.source,"live");
  assert.equal(result.fallback,false);
  assert.equal(result.tracks.length,0);
  assert.ok(result.notes?.some(note=>note.includes("Aucun morceau inventé")));
});


test("diversity selector caps the seed artist and favors different artists", () => {
  const ranked = Array.from({ length: 12 }, (_, index) => ({
    id: `id-${index}`,
    title: `Track ${index}`,
    artist: index < 5 ? "JeanJass" : `Artist ${index}`,
    scene: "Rap",
    label: index < 4 ? "Same Label" : `Label ${index}`,
    tags: ["hip hop"],
    obscurity: 50,
    year: 2020,
    colors: ["#000000", "#111111"] as [string, string],
    reason: "test",
    relevance: 50,
    origin: (index % 2 === 0 ? "tag" : "artist-radio") as "tag" | "artist-radio",
    score: 100 - index,
  }));
  const selected = selectDiverseRecommendations(ranked, "JeanJass", 10);
  assert.equal(selected.filter(track => track.artist === "JeanJass").length, 1);
  assert.ok(new Set(selected.map(track => track.artist)).size >= 7);
});


test("diversity selector avoids one candidate source dominating the first pass", () => {
  const ranked = Array.from({ length: 12 }, (_, index) => ({
    id: `source-${index}`,
    title: `Track ${index}`,
    artist: `Artist ${index}`,
    scene: "Electronic",
    label: `Label ${index}`,
    tags: ["deep house"],
    obscurity: 70,
    year: 2024,
    colors: ["#000000", "#111111"] as [string, string],
    reason: "test",
    relevance: 50,
    origin: index < 8 ? "artist-radio" as const : "tag" as const,
    score: 100 - index,
  }));
  const selected = selectDiverseRecommendations(ranked, "Seed Artist", 8);
  const radioCount = selected.filter(track => track.origin === "artist-radio").length;
  const tagCount = selected.filter(track => track.origin === "tag").length;
  assert.ok(radioCount <= 6);
  assert.ok(tagCount >= 2);
});


test("seed artist is excluded from discovery recommendations", () => {
  const ranked = Array.from({ length: 6 }, (_, index) => ({
    id: `seed-artist-${index}`,
    title: `Track ${index}`,
    artist: index < 3 ? "JeanJass" : `Other Artist ${index}`,
    scene: "Hip-Hop",
    label: "Test Label",
    tags: ["hip hop"],
    obscurity: 50,
    year: 2020,
    colors: ["#000000", "#111111"] as [string, string],
    reason: "test",
    relevance: 50,
    origin: "artist-radio" as const,
    score: 100 - index,
  }));
  const selected = selectDiverseRecommendations(ranked.filter(track => track.artist !== "JeanJass"), "JeanJass", 10);
  assert.equal(selected.some(track => track.artist === "JeanJass"), false);
});


test("deep discovery favors second-circle sources", () => {
  const ranked = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `direct-${index}`,
      title: `Direct ${index}`,
      artist: `Direct Artist ${index}`,
      scene: "Hip-Hop",
      label: "",
      tags: ["hip hop"],
      obscurity: 50,
      year: 2020,
      colors: ["#000000", "#111111"] as [string, string],
      reason: "direct",
      relevance: 80,
      origin: "lastfm-similar" as const,
      score: 90 - index,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `deep-${index}`,
      title: `Deep ${index}`,
      artist: `Deep Artist ${index}`,
      scene: "Hip-Hop",
      label: "",
      tags: ["hip hop"],
      obscurity: 50,
      year: 2020,
      colors: ["#000000", "#111111"] as [string, string],
      reason: "deep",
      relevance: 70,
      origin: "lastfm-deep" as const,
      score: 100 - index,
    })),
  ];
  const selected = selectDiverseRecommendations(ranked, "Seed Artist", 6);
  assert.ok(selected.filter(track => track.origin === "lastfm-deep").length >= 3);
});


test("Last.fm audience maps mainstream tracks to lower obscurity", () => {
  assert.ok(obscurityFromLastFmListeners(500) > obscurityFromLastFmListeners(500000));
  assert.ok(obscurityFromLastFmListeners(5000000) < 30);
  assert.ok(obscurityFromLastFmListeners(50) > 70);
});


test("strict digging rejects mainstream and unknown audiences, including contradictory sources", () => {
  assert.equal(passesDeepAudienceGate({lastfmListeners: 500000, popularity: 1}, 100), false);
  assert.equal(passesDeepAudienceGate({}, 100), false);
  assert.equal(passesDeepAudienceGate({lastfmListeners: Number.NaN}, 100), false);
  assert.equal(passesDeepAudienceGate({lastfmListeners: 500}, 100), true);
  assert.equal(passesDeepAudienceGate({popularity: 12}, 100), true);
  assert.equal(passesDeepAudienceGate({lastfmListeners: 500, popularity: 80}, 100), false);
  assert.equal(passesDeepAudienceGate({}, 65), true);
});

test("Surprends-moi at 100 excludes popular second-hop tracks and does not invent genres", async t => {
  const seedId = "aaaaaaaa-2222-4222-8222-222222222222";
  const oldKey = process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY = "fixture-key";
  t.after(() => { if (oldKey === undefined) delete process.env.LASTFM_API_KEY; else process.env.LASTFM_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const u = new URL(String(url));
    if (u.pathname.includes("/ws/2/recording/")) return Response.json({id:seedId,title:"Fixture seed",tags:[{name:"uk garage"}],"artist-credit":[{name:"Fixture artist"}]});
    if (u.pathname.includes("/lb-radio/tags")) return Response.json([]);
    const method = u.searchParams.get("method");
    if (method === "track.getTopTags") return Response.json({toptags:{tag:[]}});
    if (method === "tag.getTopTracks") assert.fail("Deep mode must not request tag charts");
    if (method === "track.getSimilar") {
      if (u.searchParams.get("track") === "Fixture seed") return Response.json({similartracks:{track:Array.from({length:32}, (_,i)=>({name:`Bridge ${i}`,artist:{name:`Bridge artist ${i}`},match:0.7}))}});
      return Response.json({similartracks:{track:[{name:"Underground fixture",artist:{name:"Small fixture"},match:0.5},{name:"Mainstream fixture",artist:{name:"Famous fixture"},match:1}]}});
    }
    if (method === "track.getInfo") return Response.json({track:{listeners:u.searchParams.get("artist") === "Small fixture" ? "500" : "500000"}});
    throw new Error("Unexpected fixture request");
  });
  for (const session of [0, 1, 7]) {
    const result = await recommendLive({seed:"Fixture seed",seedId,direction:"Surprends-moi",obscurity:100,feedback:{},session}, AbortSignal.timeout(20000));
    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0].artist, "Small fixture");
    assert.deepEqual(result.tracks[0].analysis?.subgenres, []);
    assert.equal(result.tracks[0].lastfmListeners, 500);
  }
});

test("live Labels consumes Discogs, verifies audience, preserves exclusions and falls back on failure", async t => {
  const seedId="aaaaaaaa-3333-4333-8333-333333333333";
  const oldLastfm=process.env.LASTFM_API_KEY,oldDiscogs=process.env.DISCOGS_TOKEN;
  process.env.LASTFM_API_KEY="integration-fixture";process.env.DISCOGS_TOKEN="integration-fixture";
  t.after(()=>{if(oldLastfm===undefined)delete process.env.LASTFM_API_KEY;else process.env.LASTFM_API_KEY=oldLastfm;if(oldDiscogs===undefined)delete process.env.DISCOGS_TOKEN;else process.env.DISCOGS_TOKEN=oldDiscogs;});
  t.mock.method(globalThis,"fetch",async (url:URL)=>{
    const u=new URL(String(url));let data:unknown;
    if(u.hostname==="api.discogs.com") {
      if(u.pathname==="/database/search") data={results:[{id:10010,type:"release"}]};
      else if(u.pathname==="/releases/10010") data={id:10010,title:"Integration compilation",artists:[{id:194,name:"Various"}],labels:[{id:10050,name:"Integration label"}],formats:[{descriptions:["Compilation"]}],tracklist:[{title:"Integration seed",artists:[{id:101,name:"Integration artist"}]},{title:"Famous fixture",artists:[{id:102,name:"Famous fixture artist"}]}]};
      else if(u.pathname==="/labels/10050/releases") data={releases:[{id:10020}]};
      else if(u.pathname==="/releases/10020") data={id:10020,title:"Small EP",artists:[{id:103,name:"Small fixture artist"}],labels:[{id:10050,name:"Integration label"}],tracklist:[{title:"Small fixture track",position:"A1"}]};
      else throw Error("Unexpected Discogs fixture");
    } else if(u.pathname.includes('/ws/2/recording/')) data={id:seedId,title:"Integration seed",tags:[{name:"uk garage"}],"artist-credit":[{name:"Integration artist"}]};
    else if(u.pathname.includes('/lb-radio/tags')) data=[];
    else if(u.searchParams.get("method")==="track.getTopTags") data={toptags:{tag:[]}};
    else if(u.searchParams.get("method")==="track.getSimilar") data={similartracks:{track:[]}};
    else if(u.searchParams.get("method")==="track.getInfo") data={track:{name:u.searchParams.get("track"),artist:{name:u.searchParams.get("artist")},listeners:u.searchParams.get("artist")==="Small fixture artist"?"500":"500000"}};
    else throw Error("Unexpected live fixture");
    return Response.json(data);
  });
  const request={seed:"Integration seed",seedId,direction:"Labels" as const,obscurity:100,feedback:{},session:0};
  const result=await recommendLive(request,AbortSignal.timeout(15000));
  assert.equal(result.tracks.length,1);assert.equal(result.tracks[0].artist,"Small fixture artist");
  assert.equal(result.tracks[0].lastfmListeners,500);assert.equal(result.tracks[0].obscurityKnown,true);
  assert.ok(result.tracks[0].reason.includes("Integration label"));
  const excluded=await recommendLive({...request,feedback:{[result.tracks[0].id]:"known"}},AbortSignal.timeout(15000));
  assert.equal(excluded.tracks.length,0);
  delete process.env.DISCOGS_TOKEN;
  const without=await recommendLive(request,AbortSignal.timeout(15000));
  assert.equal(without.source,"live");assert.equal(without.tracks.length,0);
});
