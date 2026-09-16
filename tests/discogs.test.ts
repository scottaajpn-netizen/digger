import test from "node:test";
import assert from "node:assert/strict";
import { discoverDiscogs, parseDiscogsRelease } from "../src/lib/providers/discogs";
import { createDiscogsClient, DiscogsError, type DiscogsGet } from "../src/lib/providers/discogs-http";
import { mergeDiscoveryCandidates, passesDeepAudienceGate, selectDiverseRecommendations } from "../src/lib/providers/live";
import type { DigRequest, Track } from "../src/lib/types";

const seed: Track = {id:"discogs-fixture-seed",title:"Seed track",artist:"Seed Artist",album:"Compilation",scene:"",label:"",tags:["uk garage"],year:0,obscurity:50,colors:["#000000","#111111"]};
const input: DigRequest = {seed:seed.title,direction:"Rabbit hole",obscurity:100,feedback:{},session:2};
const a = (id: number, name: string) => ({id,name});
const seedArtist = a(1,"Seed Artist"), peer = a(2,"Peer"), other = a(3,"Other"), sceneArtist = a(4,"Scene Artist");
const label = {id:50,name:"Small label",catno:"SM-001"};
const root = {id:10,title:"Compilation",artists:[a(194,"Various")],labels:[label],genres:["Electronic"],styles:["UK Garage"],country:"UK",year:2001,formats:[{descriptions:["Compilation"]}],tracklist:[
  {title:seed.title,position:"A1",artists:[seedArtist]}, {title:"Peer track",position:"B1",artists:[peer]},
]};
const otherRelease = {id:20,master_id:120,title:"Other EP",artists:[other],labels:[label],genres:["Electronic"],styles:["UK Garage"],tracklist:[{title:"Other track",position:"A1"}]};
const deepRelease = {id:41,master_id:40,title:"Peer EP",artists:[peer],labels:[{id:51,name:"Adjacent label"}],tracklist:[{title:"Deep track",position:"A1"}]};
const adjacent = {id:30,title:"Adjacent EP",artists:[sceneArtist],labels:[{id:52,name:"Scene label"}],styles:["UK Garage"],country:"UK",year:2001,tracklist:[{title:"Scene track",position:"A1"}]};
function fixture() {
  const paths: string[] = [];
  const get: DiscogsGet = async <T>(path: string, params: Record<string,string>) => {
    paths.push(path);
    let data: unknown;
    if (path === "database/search") data = {results:[{id:params.style ? 30 : 10,type:"release"}]};
    else if (path === "releases/10") data = root;
    else if (path === "labels/50/releases") data = {releases:[{id:20}]};
    else if (path === "releases/20") data = otherRelease;
    else if (path === "artists/2/releases") data = {releases:[{id:40,type:"master",role:"Main"}]};
    else if (path === "masters/40") data = {main_release:41};
    else if (path === "releases/41") data = deepRelease;
    else if (path === "releases/30") data = adjacent;
    else throw new Error(`Unexpected fixture path ${path}`);
    return data as T;
  };
  return {get,paths};
}

test("Discogs without token makes zero requests", async () => {
  let calls = 0;
  const result = await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:false,get:async () => {calls++;throw Error("No request expected");}});
  assert.equal(calls,0); assert.deepEqual(result,{candidates:[],notes:[]});
});

test("Discogs parses track authors and never assigns Various, DJ curator or release styles to tracks", () => {
  const parsed = parseDiscogsRelease(root)!;
  assert.equal(parsed.tracks[1].artists[0].name,"Peer");
  assert.equal(parsed.labels[0].catalogNumber,"SM-001");
  assert.equal(parseDiscogsRelease({...root,tracklist:[{title:"Uncredited"} ]})!.tracks.length,0);
  assert.equal(parseDiscogsRelease({...root,artists:[seedArtist],tracklist:[{title:"Uncredited"}]})!.tracks.length,0);
  assert.equal(parseDiscogsRelease({...root,artists:[seedArtist],formats:[{descriptions:["Mixed"]}],tracklist:[{title:"Uncredited"}]})!.tracks.length,0);
  assert.equal(parseDiscogsRelease({...otherRelease,tracklist:[{title:"Side A",type_:"heading"}]})!.tracks.length,0);
  assert.equal(parseDiscogsRelease({id:-1,title:"Invalid"}),null);
});

test("Rabbit hole walks real compilation, label, master and contextual links with provenance", async () => {
  const {get,paths} = fixture();
  const result = await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get});
  assert.deepEqual(result.notes,[]);
  assert.ok(paths.includes("masters/40"));
  assert.ok(paths.length <= 18);
  assert.deepEqual(new Set(result.candidates.map(c=>c.origin)),new Set(["discogs-label","discogs-compilation","discogs-deep","discogs-scene"]));
  const deep = result.candidates.find(c=>c.origin === "discogs-deep")!;
  assert.deepEqual(deep.discogs.path.map(p=>p.kind),["release","artist","release"]);
  assert.deepEqual(deep.discogs.path.map(p=>p.id),[10,2,41]);
  assert.equal(deep.discogs.masterId,40);
  assert.equal(deep.discogs.audience,"unknown");
  assert.equal(deep.obscurityKnown,false);
  assert.equal(passesDeepAudienceGate(deep,100),false);
  assert.equal(deep.externalIds?.discogs,"https://www.discogs.com/release/41");
  assert.ok(deep.reason.includes("Compilation → Peer → Peer EP"));
  for (const c of result.candidates) { assert.deepEqual(c.tags,[]); assert.equal(c.country,undefined); assert.notEqual(c.artist,seed.artist); }
});

test("Labels prioritizes label traversal and scene mode requires matching edition context", async () => {
  const {get} = fixture();
  const labels = await discoverDiscogs(seed,{...input,direction:"Labels"},AbortSignal.timeout(1000),{enabled:true,get});
  assert.ok(labels.candidates.find(c=>c.origin === "discogs-label")!.relevance > labels.candidates.find(c=>c.origin === "discogs-compilation")!.relevance);
  assert.ok(!labels.candidates.some(c=>c.origin === "discogs-scene"));
  const scenes = await discoverDiscogs(seed,{...input,direction:"Même scène"},AbortSignal.timeout(1000),{enabled:true,get});
  assert.ok(scenes.candidates.some(c=>c.origin === "discogs-scene"));
  const misleading: DiscogsGet = async <T>(path: string,params:Record<string,string>,signal:AbortSignal) => path === "releases/30" ? {...adjacent,country:"US"} as T : get<T>(path,params,signal);
  const rejected = await discoverDiscogs(seed,{...input,direction:"Même scène"},AbortSignal.timeout(1000),{enabled:true,get:misleading});
  assert.ok(!rejected.candidates.some(c=>c.origin === "discogs-scene"));
});

test("Discogs identity rejects wrong remixes and ambiguous artist IDs", async () => {
  const get: DiscogsGet = async <T>(path:string) => (path === "database/search" ? {results:[{id:10},{id:11}]} : {...root,id:Number(path.split("/")[1]),tracklist:[{title:seed.title,artists:[a(path.endsWith("/10") ? 1 : 99,"Seed Artist")]}]}) as T;
  const result = await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get});
  assert.equal(result.candidates.length,0);
  const remixGet: DiscogsGet = async <T>(path:string) => (path === "database/search" ? {results:[{id:10}]} : {...root,tracklist:[{title:"Seed track (Remix)",artists:[seedArtist]}]}) as T;
  assert.equal((await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get:remixGet})).candidates.length,0);
});

test("Cross-source merge preserves MusicBrainz facts, feedback aliases and Discogs evidence", async () => {
  const {get} = fixture();
  const {candidates} = await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get});
  const d = candidates.find(c=>c.origin === "discogs-label")!;
  const mb = {...seed,id:"mbid",artist:d.artist,title:d.title,tags:["verified tag"],country:"FR",year:1999,label:"Verified label",reason:"MusicBrainz",relevance:60,origin:"tag" as const,externalIds:{musicbrainz:"mbid"},popularity:10,obscurity:90};
  const [merged] = mergeDiscoveryCandidates([d,mb]);
  assert.equal(merged.id,"mbid"); assert.deepEqual(merged.tags,["verified tag"]);
  assert.equal(merged.country,"FR"); assert.equal(merged.year,1999); assert.equal(merged.label,"Verified label");
  assert.equal(merged.popularity,10); assert.equal(merged.obscurity,90);
  assert.ok(merged.feedbackIds?.includes(d.id)); assert.ok(merged.externalIds?.discogs);
  assert.ok(merged.reason.includes("Discogs"));
});

test("Diversity limits shared labels across all Discogs origins, including co-labels", async () => {
  const {get} = fixture();
  const {candidates} = await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get});
  const d = candidates[0];
  const ranked = Array.from({length:16},(_,i)=>({...d,id:`candidate-${i}`,artist:`Artist ${i}`,label:`Unique ${i}`,score:100-i,discogs:{...d.discogs,trackArtists:[a(3000+i,`Artist ${i}`)],labels:[{id:999,name:"Shared"},{id:2000+i,name:`Unique ${i}`} ]}}));
  const selected = selectDiverseRecommendations(ranked,seed.artist,10);
  assert.equal(selected.length,3);
  assert.equal(new Set(selected.map(c=>c.artist)).size,selected.length);
});

test("Partial Discogs failures preserve successful compilation candidates", async () => {
  const {get} = fixture();
  const partial: DiscogsGet = async <T>(path:string,params:Record<string,string>,signal:AbortSignal) => {
    if (path.startsWith("labels/") || path.startsWith("artists/")) throw new DiscogsError(429);
    return get<T>(path,params,signal);
  };
  const result = await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get:partial});
  assert.ok(result.candidates.some(c=>c.origin === "discogs-compilation"));
  assert.ok(result.notes.length > 0);
});

test("Discogs HTTP authenticates only on fixed API host, caches and spaces requests", async () => {
  let clock=1000; const calls: {url:string;headers:Headers}[]=[]; const waits:number[]=[];
  const get=createDiscogsClient({token:()=>"test-secret",now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;},fetch:async (url,init)=>{
    calls.push({url:String(url),headers:new Headers(init?.headers)});return Response.json({id:1});
  }});
  const signal=AbortSignal.timeout(1000);
  await get("releases/1",{},signal); await get("releases/1",{},signal); await get("releases/2",{},signal);
  assert.equal(calls.length,2); assert.ok(waits[0]>=1100);
  assert.ok(calls.every(c=>!c.url.includes("test-secret") && c.headers.get("authorization")==="Discogs token=test-secret"));
  await assert.rejects(get("https://example.com",{},signal),DiscogsError);
});

test("Discogs HTTP respects long Retry-After and blocks following queued requests", async () => {
  let clock=1000,calls=0;
  const get=createDiscogsClient({token:()=>"test",now:()=>clock,sleep:async ms=>{clock+=ms;},fetch:async ()=>{calls++;return new Response("",{status:429,headers:{"Retry-After":"60"}});}});
  const signal=AbortSignal.timeout(1000);
  await assert.rejects(get("releases/1",{},signal),DiscogsError);
  await assert.rejects(get("releases/2",{},signal),DiscogsError);
  assert.equal(calls,1);
});

test("Discogs HTTP retries transient errors within budget and never caches failures", async () => {
  let clock=1000,calls=0; const waits:number[]=[];
  const get=createDiscogsClient({token:()=>"test",now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms;},fetch:async ()=>{
    calls++; return calls===1 ? new Response("",{status:503,headers:{"Retry-After":"2"}}) : Response.json({id:1});
  }});
  assert.deepEqual(await get("releases/1",{},AbortSignal.timeout(1000)),{id:1});
  assert.equal(calls,2);assert.ok(waits[0]>=2000);
  const noToken=createDiscogsClient({token:()=>undefined,fetch:async ()=>{throw Error("must not fetch");}});
  await assert.rejects(noToken("releases/1",{},AbortSignal.timeout(1000)),DiscogsError);
});

test("Discogs HTTP cancels queued requests without bypassing the shared limiter", async () => {
  let releaseFirst!: (response:Response)=>void;
  let calls=0;
  const get=createDiscogsClient({token:()=>"test",sleep:async()=>{},fetch:async()=>{
    calls++;return calls===1?await new Promise<Response>(resolve=>{releaseFirst=resolve;}):Response.json({id:3});
  }});
  const first=get("releases/1",{},AbortSignal.timeout(3000));
  await new Promise(resolve=>setImmediate(resolve));
  const controller=new AbortController();
  const queued=get("releases/2",{},controller.signal);
  controller.abort();
  await assert.rejects(queued);
  const third=get("releases/3",{},AbortSignal.timeout(3000));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);
  releaseFirst(Response.json({id:1}));await first;await third;assert.equal(calls,2);
});

test("Non-compilation deep path continues through a label artist to another release", async () => {
  const {get} = fixture();
  const singleRoot={...root,artists:[seedArtist],formats:[],tracklist:[{title:seed.title,position:"A1"}]};
  const indirect:DiscogsGet=async<T>(path:string,params:Record<string,string>,signal:AbortSignal)=> {
    if(path==="releases/10") return singleRoot as T;
    if(path==="artists/3/releases") return {releases:[{id:42,type:"release",role:"Main"}]} as T;
    if(path==="releases/42") return {...deepRelease,id:42,master_id:142,artists:[other]} as T;
    return get<T>(path,params,signal);
  };
  const {candidates}=await discoverDiscogs(seed,input,AbortSignal.timeout(1000),{enabled:true,get:indirect});
  const deep=candidates.find(c=>c.origin==="discogs-deep")!;
  assert.ok(deep);
  assert.deepEqual(deep.discogs.path.map(n=>n.kind),["release","label","release","artist","release"]);
  assert.equal(deep.discogs.path[3].id,3);
});

test("Catalog pagination samples a bounded additional page without popularity sorting", async () => {
  const {get}=fixture();const pages:string[]=[];
  const paged:DiscogsGet=async<T>(path:string,params:Record<string,string>,signal:AbortSignal)=>{
    if(path==="labels/50/releases") {
      pages.push(params.page);assert.equal(params.sort,undefined);
      return (params.page==="1"?{pagination:{pages:1000},releases:[{id:10}]}:{releases:[{id:20}]}) as T;
    }
    return get<T>(path,params,signal);
  };
  const result=await discoverDiscogs(seed,{...input,direction:"Labels"},AbortSignal.timeout(1000),{enabled:true,get:paged});
  assert.equal(pages.length,2);assert.equal(pages[0],"1");assert.ok(Number(pages[1])>=2 && Number(pages[1])<=100);
  assert.ok(result.candidates.some(c=>c.origin==="discogs-label"));
});


test("Cross-source identity keeps artist and title boundaries separate", () => {
  const base={...seed,reason:"fixture",relevance:50,origin:"tag" as const};
  const result=mergeDiscoveryCandidates([{...base,id:"one",artist:"A B",title:"C"},{...base,id:"two",artist:"A",title:"B C"}]);
  assert.equal(result.length,2);
});


test("Discogs keeps explicit track roles separate from the displayed artist credit", () => {
  const parsed = parseDiscogsRelease({
    id: 90,
    title: "Role fixture",
    artists: [a(10, "Main Artist")],
    tracklist: [{
      title: "Role track",
      artists: [a(10, "Main Artist")],
      extraartists: [
        { id: 11, name: "Remix Person", role: "Remix" },
        { id: 12, name: "Producer Person", role: "Producer" },
        { id: 13, name: "Artwork Person", role: "Design" },
      ],
    }],
  })!;
  assert.deepEqual(parsed.tracks[0].credits.map(c => [c.name, c.role]), [
    ["Main Artist", "primary"],
    ["Remix Person", "remixer"],
    ["Producer Person", "producer"],
  ]);
});

test("Discogs confirms multi-artist seeds from structured credits even when join punctuation differs", async () => {
  const collabSeed: Track = {
    ...seed,
    id: "collab-seed",
    title: "Together",
    artist: "Alpha feat. Beta",
    credits: [
      { name: "Alpha", role: "primary", source: "musicbrainz", sourceId: "aaaaaaaa-5555-4555-8555-555555555555" },
      { name: "Beta", role: "featured", source: "musicbrainz", sourceId: "bbbbbbbb-5555-4555-8555-555555555555" },
    ],
  };
  const get: DiscogsGet = async <T>(path: string) => {
    if (path === "database/search") return { results: [{ id: 91, type: "release" }] } as T;
    if (path === "releases/91") return {
      id: 91,
      title: "Together EP",
      artists: [a(20, "Alpha"), a(21, "Beta")],
      labels: [{ id: 61, name: "Fixture Label" }],
      tracklist: [
        { title: "Together", artists: [{...a(20, "Alpha"), join: " & "}, a(21, "Beta")] },
        { title: "Peer", artists: [a(22, "Peer Artist")] },
      ],
    } as T;
    if (path === "labels/61/releases") return { releases: [] } as T;
    throw new Error(`Unexpected collaboration path ${path}`);
  };
  const result = await discoverDiscogs(collabSeed, {...input, seed: collabSeed.title, direction: "Même vibe"}, AbortSignal.timeout(1000), {enabled:true,get});
  assert.ok(result.candidates.some(c => c.artist === "Peer Artist"));
});
