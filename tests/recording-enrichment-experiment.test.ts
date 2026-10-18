import test from "node:test";
import assert from "node:assert/strict";
import { compareRecordingEnrichment } from "../src/lib/discovery/recording-enrichment-experiment";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { selectModeRecommendations, type Candidate } from "../src/lib/discovery/ranking";
import { buildMusicalProfile } from "../src/lib/music/profile";
import type { ShadowInput } from "../src/lib/discovery/shadow-comparison";

function fixture():ShadowInput {
  const seed={id:"seed",title:"Seed",artist:"Seed Artist",tags:["broken beat"],scene:"",label:"",year:0,obscurity:100,colors:["a","b"] as [string,string]};
  const pool:Candidate[]=Array.from({length:3},(_,i)=>({...seed,id:"cut"+i,title:"Cut "+i,
    artist:"Candidate Artist "+i,tags:[],lastfmListeners:100,lastfmArtistListeners:1000,
    origin:"lastfm-crate",relevance:60,reason:"fixture"}));
  const input:ShadowInput={pool,seed,seedProfile:buildMusicalProfile(seed),
    input:{seed:"Seed",direction:"Surprends-moi",obscurity:100,feedback:{},session:0},
    seedParticipantKeys:new Set(),baselineRanked:[],baselineSelected:[]};
  input.baselineRanked=rankDiscoveryCandidates(input);
  input.baselineSelected=selectModeRecommendations(input.baselineRanked,seed.artist,input.input.direction);
  return input;
}

test("recording experiment verifies identity, reuses cache and preserves baseline for exact replay",async t=>{
  const previous=process.env.LASTFM_API_KEY;
  process.env.LASTFM_API_KEY="recording-experiment-identity-test";
  t.after(()=>{if(previous===undefined)delete process.env.LASTFM_API_KEY;else process.env.LASTFM_API_KEY=previous;});
  const input=fixture();const snapshot=JSON.stringify(input);
  let calls=0;
  t.mock.method(globalThis,"fetch",async(url:URL)=>{
    calls++;const u=new URL(String(url));const title=u.searchParams.get("track")!;
    assert.equal(u.searchParams.get("autocorrect"),"0");
    return Response.json({track:{name:title==="Cut 1"?title+" (Remix)":title,
      artist:{name:u.searchParams.get("artist")},toptags:{tag:title==="Cut 2"?[]:[{name:"broken beat"}]}}});
  });
  const first=await compareRecordingEnrichment(input,57,AbortSignal.timeout(5000));
  assert.equal(first.requests,3);assert.equal(first.enriched,1);
  assert.equal(first.outcomes.filter(o=>o.status==="identity-rejected").length,1);
  assert.equal(first.outcomes.filter(o=>o.status==="no-tags").length,1);
  assert.equal(first.recordingCoverageBefore,0);assert.equal(first.recordingCoverageAfter,1);
  assert.equal(JSON.stringify(input),snapshot);
  assert.deepEqual(first.replay.baselinePool,input.pool);
  const replayRanked=rankDiscoveryCandidates({...input,pool:first.replay.pool});
  assert.deepEqual(selectModeRecommendations(replayRanked,input.seed.artist,input.input.direction),first.experimentTracks);
  const second=await compareRecordingEnrichment(input,57,AbortSignal.timeout(5000));
  assert.equal(second.requests,0);assert.equal(second.cacheHits,3);assert.equal(calls,3);
});

test("no spare budget or another mode makes zero enrichment requests and preserves selection",async t=>{
  t.mock.method(globalThis,"fetch",async()=>{throw Error("Unexpected call");});
  for(const mode of ["Surprends-moi","Même vibe"] as const){
    const input=fixture();input.input.direction=mode;
    input.baselineRanked=rankDiscoveryCandidates(input);
    input.baselineSelected=selectModeRecommendations(input.baselineRanked,input.seed.artist,mode);
    const result=await compareRecordingEnrichment(input,mode==="Surprends-moi"?60:0,AbortSignal.timeout(5000));
    assert.equal(result.lookups,0);assert.equal(result.requests,0);
    assert.deepEqual(result.experimentTracks,input.baselineSelected);
  }
});

test("recording MBID conflicts never attribute tags and an exhausted audience budget is bounded",async t=>{
  const previous=process.env.LASTFM_API_KEY;process.env.LASTFM_API_KEY="recording-experiment-mbid-test";
  t.after(()=>{if(previous===undefined)delete process.env.LASTFM_API_KEY;else process.env.LASTFM_API_KEY=previous;});
  const input=fixture();
  for(const row of [...input.pool,...input.baselineSelected])row.externalIds={musicbrainz:"aaaaaaaa-1111-4111-8111-111111111111"};
  t.mock.method(globalThis,"fetch",async(url:URL)=>{const u=new URL(String(url));return Response.json({track:{
    name:u.searchParams.get("track"),artist:{name:u.searchParams.get("artist")},
    mbid:"bbbbbbbb-1111-4111-8111-111111111111",toptags:{tag:[{name:"jazz"}]}}});});
  const result=await compareRecordingEnrichment(input,59,AbortSignal.timeout(5000));
  assert.equal(result.lookups,1);assert.equal(result.requests,1);assert.equal(result.enriched,0);
  assert.equal(result.outcomes[0].status,"identity-rejected");
});
