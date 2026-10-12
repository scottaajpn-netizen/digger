import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { assessLastFmRecordingIdentity } from "../src/lib/discovery/recording-identity";
import { recommendLive } from "../src/lib/providers/live";
import type { DigRequest } from "../src/lib/types";

const recordingId="aaaaaaaa-1111-4111-8111-111111111111";
const wrongRecordingId="bbbbbbbb-1111-4111-8111-111111111111";
const artistId="cccccccc-1111-4111-8111-111111111111";

test("a known Mia recording rejects mismatched MBIDs and missing short-name corroboration",()=>{
  const fixture={
    seedArtist:"Mia",expectedRecordingMbid:recordingId,
    artistMbidConflicts:false,confirmedArtistMbid:false,
  };
  const wrong=assessLastFmRecordingIdentity({...fixture,returnedRecordingMbid:wrongRecordingId});
  assert.equal(wrong.reason,"recording-mbid-conflict");
  assert.equal(wrong.allowSeedMetadata,false);
  assert.equal(wrong.allowTrackSimilarity,false);
  const missing=assessLastFmRecordingIdentity(fixture);
  assert.equal(missing.reason,"uncorroborated-short-name");
  assert.equal(missing.allowTrackSimilarity,false);
  const verified=assessLastFmRecordingIdentity({...fixture,returnedRecordingMbid:recordingId.toUpperCase()});
  assert.equal(verified.reason,"allowed");
  assert.equal(verified.recordingConfirmed,true);
  assert.equal(verified.allowTrackSimilarity,true);
  assert.equal(assessLastFmRecordingIdentity({
    ...fixture,confirmedArtistMbid:true,
  }).allowTrackSimilarity,true);
});

test("a rare short artist without a known recording MBID retains direct Last.fm discovery",()=>{
  const missing=assessLastFmRecordingIdentity({
    seedArtist:"DÜK",artistMbidConflicts:false,confirmedArtistMbid:false,
  });
  assert.equal(missing.allowTrackSimilarity,true);
  assert.equal(missing.reason,"allowed");
  const contradictsArtist=assessLastFmRecordingIdentity({
    seedArtist:"DÜK",artistMbidConflicts:true,confirmedArtistMbid:false,
  });
  assert.equal(contradictsArtist.allowTrackSimilarity,false);
});

const input:DigRequest={
  seed:"Love Me Right — Mia",
  seedId:recordingId,
  direction:"Même vibe",
  obscurity:80,
  feedback:{},
  session:0,
};

async function runMia(t: TestContext,reportedRecordingMbid?:string) {
  const previous=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="recording-identity-fixture-"+(reportedRecordingMbid||"missing");
  t.after(()=>{
    if(previous===undefined)delete process.env.LASTFM_API_KEY;
    else process.env.LASTFM_API_KEY=previous;
  });
  let similarCalls=0;
  let catalogueCalls=0;
  t.mock.method(globalThis,"fetch",async(arg:URL)=>{
    const u=new URL(String(arg));
    const method=u.searchParams.get("method");
    if(u.pathname.includes("/ws/2/recording/"))return Response.json({
      id:recordingId,title:"Love Me Right",
      "artist-credit":[{name:"Mia",artist:{id:artistId}}],
      tags:[{name:"boogie",count:100}],
    });
    if(u.pathname.includes("/ws/2/artist/"))return Response.json({
      tags:[{name:"boogie",count:100}],
    });
    if(u.pathname.includes("/lb-radio/"))return Response.json(
      u.pathname.includes("tags")?[]:{},
    );
    if(method==="track.getInfo")return Response.json({track:{
      name:"Love Me Right",mbid:reportedRecordingMbid,
      artist:{name:"Mia"},listeners:"99999",
    }});
    if(method==="track.getTopTags")return Response.json({
      toptags:{tag:[{name:"german",count:100},{name:"indie",count:75}]},
    });
    if(method==="track.getSimilar"){
      similarCalls++;
      return Response.json({similartracks:{track:[{
        name:"Liebe ohne Ende",artist:{name:"2raumwohnung"},match:1,
      }]}});
    }
    if(method==="artist.getSimilar"){catalogueCalls++;return Response.json({similarartists:{artist:[]}});}
    if(method==="tag.getTopTracks")return Response.json({toptracks:{track:[]}});
    throw Error("Unexpected external request "+u);
  });
  const response=await recommendLive(input,AbortSignal.timeout(20000));
  return {response,similarCalls,catalogueCalls};
}

test("known Mia MBID without Last.fm corroboration cannot produce false direct German tracks",async t=>{
  const {response,similarCalls,catalogueCalls}=await runMia(t);
  assert.equal(similarCalls,0,"no ambiguous track.getSimilar API call");
  assert.equal(catalogueCalls,0);
  assert.equal(response.tracks.some(track=>track.artist==="2raumwohnung"),false);
  assert.ok(!response.seed.tags.includes("german"));
  assert.ok(!response.seed.tags.includes("indie"));
  assert.equal(response.seed.lastfmListeners,undefined);
  assert.ok(response.notes?.some(note=>note.includes("uncorroborated-short-name")));
  assert.ok(response.seed.tags.includes("boogie"));
});

test("a contradictory Last.fm recording MBID blocks both listening recommendations and false tags",async t=>{
  const {response,similarCalls,catalogueCalls}=await runMia(t,wrongRecordingId);
  assert.equal(similarCalls,0);
  assert.equal(catalogueCalls,0);
  assert.ok(!response.seed.tags.includes("german"));
  assert.equal(response.seed.lastfmListeners,undefined);
  assert.ok(response.notes?.some(note=>note.includes("recording-mbid-conflict")));
});

test("Last.fm matching recording MBID can still provide direct tracks without an artist MBID",async t=>{
  const {response,similarCalls,catalogueCalls}=await runMia(t,recordingId);
  assert.equal(similarCalls,1);
  assert.equal(catalogueCalls,0,"an exact recording ID must not establish the artist's catalogue identity");
  assert.ok(response.seed.tags.includes("german"));
  assert.ok(response.tracks.some(track=>track.artist==="2raumwohnung"));
});
