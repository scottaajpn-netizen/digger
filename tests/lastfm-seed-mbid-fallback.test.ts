import test from "node:test";
import assert from "node:assert/strict";
import {
  assessLastFmArtistIdentity,
  canExpandVerifiedArtistCatalogue,
  catalogueAnchorMbid,
  resolveVerifiedArtistAnchors,
} from "../src/lib/discovery/artist-anchors";
import { lastFmJson, LastFmApiError } from "../src/lib/providers/http";
import { recommendLive } from "../src/lib/providers/live";
import type { DigRequest } from "../src/lib/types";

const recordingId="aaaaaaaa-1111-4111-8111-111111111111";
const leonId="bbbbbbbb-1111-4111-8111-111111111111";
const jungleId="cccccccc-1111-4111-8111-111111111111";

test("independent MusicBrainz IDs can authorize both collaborator branches without Last.fm track.getInfo",()=>{
  const anchors=resolveVerifiedArtistAnchors({
    seedArtist:"Léon Phal ft Jungle Jack",
    credits:[
      {name:"Léon Phal",role:"primary",source:"musicbrainz",sourceId:leonId},
      {name:"Jungle Jack",role:"featured",source:"musicbrainz",sourceId:jungleId},
    ],
  });
  const ids=[leonId,jungleId];
  const result=assessLastFmArtistIdentity(anchors,ids,undefined);
  assert.equal(result.approved.length,2);
  assert.equal(canExpandVerifiedArtistCatalogue(result.approved,ids),true);
  assert.deepEqual(result.approved.map(row=>catalogueAnchorMbid(row,ids)),ids);
});

test("unknown names and conflicting Last.fm MBIDs cannot become verified seed branches",()=>{
  const ids=[leonId];
  const fromFreeText=resolveVerifiedArtistAnchors({
    seedArtist:"Léon Phal ft Jungle Jack",
  });
  assert.equal(canExpandVerifiedArtistCatalogue(fromFreeText,ids),false);
  const fromCredits=resolveVerifiedArtistAnchors({
    seedArtist:"Léon Phal",
    credits:[{name:"Léon Phal",role:"primary",source:"musicbrainz",sourceId:leonId}],
  });
  assert.equal(assessLastFmArtistIdentity(fromCredits,ids,jungleId).approved.length,0);
  assert.equal(canExpandVerifiedArtistCatalogue([],ids),false);
});

test("Mia short-name homonym stays blocked even with a trusted MusicBrainz artist ID",()=>{
  const mia="dddddddd-1111-4111-8111-111111111111";
  const anchors=resolveVerifiedArtistAnchors({
    seedArtist:"Mia",
    credits:[{name:"Mia",role:"primary",source:"musicbrainz",sourceId:mia}],
  });
  const assessed=assessLastFmArtistIdentity(anchors,[mia],undefined);
  assert.deepEqual(assessed.approved,[]);
  assert.equal(canExpandVerifiedArtistCatalogue(assessed.approved,[mia]),false);
  const matched=assessLastFmArtistIdentity(anchors,[mia],mia);
  assert.equal(canExpandVerifiedArtistCatalogue(matched.approved,[mia]),true);
});

test("Last.fm API errors preserve a safe numeric error code without printing the API key",async t=>{
  const prev=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="fake-audit-key-"+recordingId;
  t.after(()=>{
    if(prev===undefined)delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY=prev;
  });
  t.mock.method(globalThis,"fetch",async()=>Response.json({
    error:6,message:"Artist or Track not found",
  }));
  await assert.rejects(
    lastFmJson("track.getInfo",{artist:"Léon Phal ft Jungle Jack",track:"Pleine forêt"},
      AbortSignal.timeout(20000)),
    (error:unknown)=>error instanceof LastFmApiError && error.apiCode===6,
  );
});

test("if Last.fm has no seed track, structured MBIDs still request both artists by MBID",async t=>{
  const prev=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="lastfm-collaboration-fallback-fixture-"+recordingId;
  t.after(()=>{
    if(prev===undefined)delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY=prev;
  });
  const requestedMbids:string[]=[];
  let seedTrackInfo=0;
  t.mock.method(globalThis,"fetch",async(input:URL)=>{
    const u=new URL(String(input));
    const method=u.searchParams.get("method");
    if(u.pathname.includes("/ws/2/recording/"))return Response.json({
      id:recordingId,title:"Pleine forêt",
      "artist-credit":[
        {name:"Léon Phal",joinphrase:" feat. ",artist:{id:leonId}},
        {name:"Jungle Jack",artist:{id:jungleId}},
      ],
      tags:[{name:"jazz",count:100}],
    });
    if(u.pathname.includes("/ws/2/artist/"))return Response.json({
      tags:[{name:"jazz",count:30}],
    });
    if(u.pathname.includes("/lb-radio/"))return Response.json(
      u.pathname.includes("tags")?[]:{},
    );
    if(method==="track.getInfo"){
      if(u.searchParams.get("artist")==="Léon Phal feat. Jungle Jack"){
        seedTrackInfo++;return Response.json({error:6,message:"Track not found"});
      }
      return Response.json({track:{listeners:"50"}});
    }
    if(method==="track.getTopTags"){
      if(u.searchParams.get("artist")==="Léon Phal feat. Jungle Jack")
        return Response.json({error:6,message:"Track not found"});
      return Response.json({toptags:{tag:[]}});
    }
    if(method==="track.getSimilar")
      return Response.json({error:6,message:"Track not found"});
    if(method==="artist.getSimilar"){
      const mbid=u.searchParams.get("mbid");
      if(mbid){
        requestedMbids.push(mbid);
        const who=mbid===leonId?"Jazz Root":"Rap Root";
        return Response.json({similarartists:{artist:[{name:who,match:0.9}]}});
      }
      return Response.json({similarartists:{artist:[]}});
    }
    if(method==="artist.getTopTracks"){
      const artist=u.searchParams.get("artist")||"Unknown";
      return Response.json({toptracks:{track:[
        {name:artist+" cut 1",artist:{name:artist},listeners:"60"},
        {name:artist+" cut 2",artist:{name:artist},listeners:"75"},
      ]}});
    }
    if(method==="artist.getTopTags")return Response.json({toptags:{tag:[]}});
    if(method==="artist.getInfo")return Response.json({artist:{stats:{listeners:"400"}}});
    if(method==="tag.getTopTracks")return Response.json({toptracks:{track:[]}});
    throw Error("Unexpected "+u.pathname+" "+method);
  });
  const input:DigRequest={
    seed:"Pleine forêt — Léon Phal feat. Jungle Jack",
    seedId:recordingId,direction:"Surprends-moi",obscurity:80,
    feedback:{},session:0,
  };
  const report=await recommendLive(input,AbortSignal.timeout(30000));
  assert.ok(seedTrackInfo>0);
  assert.ok(requestedMbids.includes(leonId));
  assert.ok(requestedMbids.includes(jungleId));
  assert.deepEqual(report.retrievalDiagnostics?.catalogue?.anchors,["Léon Phal","Jungle Jack"]);
  assert.ok(report.notes?.some(s=>s.includes("code 6")||s.includes("code 6]")));
  assert.ok(report.notes?.some(s=>s.includes("identités MusicBrainz vérifiées")));
  assert.equal(report.retrievalDiagnostics?.anchorCoverage?.find(r=>r.anchor==="Léon Phal")?.verified,true);
  assert.equal(report.retrievalDiagnostics?.anchorCoverage?.find(r=>r.anchor==="Jungle Jack")?.verified,true);
});
