import test from "node:test";
import assert from "node:assert/strict";
import {recommendLive} from "../src/lib/providers/live";
import type {DigRequest} from "../src/lib/types";

const properMia="aaaaaaaa-1111-4111-8111-111111111111";
const germanMia="bbbbbbbb-1111-4111-8111-111111111111";
const seed:DigRequest={
  seed:"Love Me Right — Mia",
  seedTrack:{
    id:"lastfm:mia-love-me-right",artist:"Mia",title:"Love Me Right",
    tags:["boogie"],source:"lastfm",
    credits:[{name:"Mia",role:"primary",source:"musicbrainz",sourceId:properMia}],
  },
  direction:"Même vibe",obscurity:80,feedback:{},session:0,
};

test("Mia: conflicting Last.fm artist MBID cannot introduce German homonym recommendations or tags",async t=>{
  const oldKey=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="mia-homonym-fixture";
  t.after(()=>{if(oldKey===undefined)delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY=oldKey;});
  let neighbours=0;
  t.mock.method(globalThis,"fetch",async(input:URL)=>{
    const u=new URL(String(input)),method=u.searchParams.get("method");
    if(u.pathname.includes("/ws/2/artist/"))return Response.json({tags:[{name:"boogie",count:100}]});
    if(u.pathname.includes("/lb-radio/"))return Response.json(u.pathname.includes("/lb-radio/tags")?[]:{});
    if(method==="track.getTopTags")return Response.json({toptags:{tag:[
      {name:"german",count:100},{name:"indie",count:90},{name:"electronic",count:80},
    ]}});
    if(method==="track.getInfo")return Response.json({track:{
      name:"Love Me Right",artist:{name:"Mia",mbid:germanMia},listeners:"90000",
    }});
    if(method==="track.getSimilar")return Response.json({similartracks:{track:[]}});
    if(method==="artist.getSimilar"){neighbours++;return Response.json({similarartists:{artist:[
      {name:"2raumwohnung",match:1},{name:"LEA",match:0.9},
    ]}});}
    if(method==="tag.getTopTracks")return Response.json({toptracks:{track:[]}});
    throw Error("Unexpected provider route "+u);
  });
  const result=await recommendLive(seed,AbortSignal.timeout(20000));
  assert.equal(neighbours,0,"artist.getSimilar must not run for a conflicting artist identity");
  assert.equal(result.retrievalDiagnostics?.catalogue?.expansionTriggered,false);
  assert.ok(result.notes?.some(note=>note.includes("identité d'artiste ambiguë ou contradictoire")));
  assert.ok(result.seed.tags.includes("boogie"));
  assert.ok(!result.seed.tags.includes("german"));
  assert.ok(!result.seed.tags.includes("indie"));
  assert.equal(result.seed.lastfmListeners,undefined);
  assert.equal(result.tracks.some(row=>["LEA","2raumwohnung"].includes(row.artist)),false);
});

test("Mia: missing Last.fm MBID never enables name-only expansion even when titles match",async t=>{
  const oldKey=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="mia-homonym-fixture";
  t.after(()=>{if(oldKey===undefined)delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY=oldKey;});
  let neighbourCalls=0;
  t.mock.method(globalThis,"fetch",async(input:URL)=>{
    const u=new URL(String(input)),method=u.searchParams.get("method");
    if(u.pathname.includes("/ws/2/artist/"))return Response.json({tags:[{name:"boogie"}]});
    if(u.pathname.includes("/lb-radio/"))return Response.json(u.pathname.includes("/tags")?[]:{});
    if(method==="track.getTopTags")return Response.json({toptags:{tag:[{name:"german"}]}});
    if(method==="track.getInfo")return Response.json({track:{artist:{name:"Mia"},listeners:"10000"}});
    if(method==="track.getSimilar")return Response.json({similartracks:{track:[]}});
    if(method==="artist.getSimilar"){neighbourCalls++;return Response.json({similarartists:{artist:[]}});}
    if(method==="tag.getTopTracks")return Response.json({toptracks:{track:[]}});
    throw Error("Unexpected provider route "+u);
  });
  const result=await recommendLive(seed,AbortSignal.timeout(20000));
  assert.equal(neighbourCalls,0);
  assert.ok(!result.seed.tags.includes("german"));
  assert.equal(result.retrievalDiagnostics?.catalogue?.expansionTriggered,false);
});

test("independently confirmed Mia MBID uses the MBID for Last.fm expansion",async t=>{
  const oldKey=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="mia-confirmed-fixture";
  t.after(()=>{if(oldKey===undefined)delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY=oldKey;});
  let verifiedCalls=0;
  t.mock.method(globalThis,"fetch",async(input:URL)=>{
    const u=new URL(String(input)),method=u.searchParams.get("method");
    if(u.pathname.includes("/ws/2/artist/"))return Response.json({tags:[{name:"boogie"}]});
    if(u.pathname.includes("/lb-radio/"))return Response.json(u.pathname.includes("/tags")?[]:{});
    if(method==="track.getTopTags")return Response.json({toptags:{tag:[{name:"boogie",count:100}]}});
    if(method==="track.getInfo")return Response.json({track:{
      name:u.searchParams.get("track"),artist:{
        name:u.searchParams.get("artist"),mbid:u.searchParams.get("artist")==="Mia"?properMia:undefined,
      },listeners:"600",
    }});
    if(method==="track.getSimilar")return Response.json({similartracks:{track:[]}});
    if(method==="artist.getSimilar"){
      if(u.searchParams.get("mbid")===properMia){
        verifiedCalls++;
        assert.equal(u.searchParams.get("artist"),null);
        return Response.json({similarartists:{artist:[{name:"Boogie Neighbour",match:0.7}]}});
      }
      return Response.json({similarartists:{artist:[]}});
    }
    if(method==="artist.getTopTracks")return Response.json({toptracks:{track:[
      {name:"Boogie Cut",artist:{name:"Boogie Neighbour"},listeners:"600"},
    ]}});
    if(method==="artist.getTopTags")return Response.json({toptags:{tag:[{name:"boogie",count:100}]}});
    if(method==="tag.getTopArtists")return Response.json({topartists:{artist:[]}});
    if(method==="tag.getTopTracks")return Response.json({toptracks:{track:[]}});
    if(method==="artist.getInfo")return Response.json({artist:{stats:{listeners:"2500"}}});
    throw Error("Unexpected provider route "+u);
  });
  const result=await recommendLive(seed,AbortSignal.timeout(20000));
  assert.equal(verifiedCalls,1);
  assert.equal(result.retrievalDiagnostics?.catalogue?.expansionTriggered,true);
  assert.ok(result.tracks.some(row=>row.artist==="Boogie Neighbour"));
});
