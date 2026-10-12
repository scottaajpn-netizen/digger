import test from "node:test";
import assert from "node:assert/strict";

import { compareScopeShadow } from "../src/lib/discovery/shadow-comparison";
import { buildMusicalProfile } from "../src/lib/music/profile";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { passesDeepAudienceGate, selectModeRecommendations, type Candidate } from "../src/lib/discovery/ranking";
import type { DigRequest, Track } from "../src/lib/types";

const seed: Track = {
  id:"seed",title:"Love Me Right",artist:"Mia",tags:["boogie"],
  tagEvidence:[{source:"lastfm",scope:"recording",tags:["boogie"]}],
  label:"",scene:"",year:0,obscurity:100,colors:["#123","#456"],
};
const request: DigRequest = {
  seed:"Love Me Right — Mia",direction:"Même vibe",obscurity:65,feedback:{},session:0,
};
const simple=(id:string,artist:string,tags:string[],relevance:number):Candidate=>({
  id,title:"Test "+id,artist,tags,scene:"",label:"",year:0,obscurity:100,
  colors:["#123","#456"],reason:"fixture",origin:"lastfm-similar",relevance,
});
const release:Candidate = {
  ...simple("release","Release Artist",[],90),
  origin:"discogs-compilation",
  discogs:{
    releaseId:501,title:"Obscure Boogie Vol 1",artists:[],labels:[],genres:["Funk"],
    styles:["Boogie"],compilation:true,sourceUrl:"https://www.discogs.com/release/501",
    fetchedAt:"2026-10-12T00:00:00Z",position:"B2",trackArtists:[],
    role:"compilation-track",path:[],audience:"unknown",
  },
};
const direct:Candidate = {
  ...simple("direct","Direct Artist",["boogie"],60),
  tagEvidence:[{source:"musicbrainz",scope:"recording",tags:["boogie"]}],
};
const untagged:Candidate = simple("untagged","Other Artist",[],48);
const keys=new Set(["mia"]);
const seedProfile=buildMusicalProfile(seed);

function fixture(pool:Candidate[]= [release,direct,untagged],input:DigRequest=request) {
  const baselineRanked=rankDiscoveryCandidates({
    pool,seed,seedProfile,input,seedParticipantKeys:keys,
  });
  const gate=(row:Candidate)=>input.obscurity<90 ||
    (row.origin!=="lastfm-tag" && passesDeepAudienceGate(row,input.obscurity));
  const baselineSelected=selectModeRecommendations(
    baselineRanked.filter(gate),seed.artist,input.direction,10,
    new Set((input.memory?.knownTracks||[]).map(item=>item.split("\u0000")[0])),
  );
  return {pool,seed,seedProfile,input,seedParticipantKeys:keys,baselineRanked,baselineSelected};
}

test("shadow reranks same candidates; leaves production scores and objects untouched",t=>{
  t.mock.method(globalThis,"fetch",()=>{throw Error("shadow attempted a network call");});
  const initial=fixture();
  const snapshot=JSON.stringify(initial.pool);
  const scoreMap=new Map(initial.baselineRanked.map(row=>[row.id,row.score]));
  const productionOrder=initial.baselineSelected.map(row=>row.id);
  const result=compareScopeShadow(initial);
  assert.equal(result.strategy,"scope-aware");
  assert.equal(result.rankedCandidateCount,initial.baselineRanked.length);
  assert.equal(result.baselineCount,result.experimentCount);
  assert.deepEqual(result.experimentTracks.map(row=>row.id),["direct","release","untagged"]);
  assert.deepEqual(productionOrder,["release","direct","untagged"]);
  assert.equal(result.sharedCount,3);
  assert.equal(result.entered.length,0);
  assert.equal(result.dropped.length,0);
  assert.ok(result.moved.some(row=>row.id==="release"&&row.baselinePosition===1&&row.experimentPosition===2));
  assert.ok(result.moved.some(row=>row.id==="direct"&&row.baselinePosition===2&&row.experimentPosition===1));
  assert.equal(JSON.stringify(initial.pool),snapshot);
  assert.deepEqual(initial.baselineSelected.map(row=>row.id),productionOrder);
  for(const row of initial.baselineRanked)assert.equal(row.score,scoreMap.get(row.id));
});

test("experiment only penalizes release-based fine tags, not the verified track",()=>{
  const input=fixture();
  const summary=compareScopeShadow(input);
  const original=new Map(input.baselineRanked.map(row=>[row.id,row]));
  const experiment=new Map(summary.experimentTracks.map(row=>[row.id,row]));
  assert.ok((experiment.get("release")?.score||0)<(original.get("release")?.score||0));
  assert.equal(experiment.get("release")?.analysis?.overlapScope,"release-context");
  assert.equal(experiment.get("direct")?.score,original.get("direct")?.score);
  assert.equal(experiment.get("direct")?.analysis?.overlapScope,"recording");
  assert.equal(experiment.get("release")?.scoreBreakdown?.discogs,original.get("release")?.scoreBreakdown.discogs);
});

test("an empty or fully excluded pool remains empty in both strategies",()=>{
  const excluded=fixture([simple("known","Known Artist",["boogie"],100)],
    {...request,feedback:{known:"known"}});
  const comparison=compareScopeShadow(excluded);
  assert.deepEqual(comparison.experimentTracks,[]);
  assert.equal(comparison.baselineCount,0);
  assert.equal(comparison.sharedCount,0);
  assert.equal(comparison.entered.length,0);
});

test("strict obscurity gate is applied identically; unknown audiences stay excluded",()=>{
  const extra={
    ...simple("known-audience","Underground Artist",["boogie"],70),
    lastfmListeners:300,lastfmArtistListeners:4000,
  };
  const obscure=fixture([release,direct,extra],{
    ...request,obscurity:100,direction:"Surprends-moi",
  });
  const report=compareScopeShadow(obscure);
  assert.equal(report.baselineEligibleCount,1);
  assert.equal(report.experimentEligibleCount,1);
  assert.deepEqual(report.experimentTracks.map(x=>x.id),["known-audience"]);
});

test("shadow respects memory exclusions while comparing the same selection policy",()=>{
  const known=fixture([release,direct,untagged],{
    ...request,memory:{pathScores:{},knownTracks:["direct artist\u0000test direct"]},
  });
  const result=compareScopeShadow(known);
  assert.equal(result.experimentTracks.some(track=>track.id==="direct"),false);
  assert.equal(result.sharedCount,result.baselineCount);
});
