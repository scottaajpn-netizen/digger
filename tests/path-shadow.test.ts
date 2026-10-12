import test from "node:test";
import assert from "node:assert/strict";
import { cautiousPathIncentive } from "../src/lib/discovery/path-reliability";
import { comparePathShadow } from "../src/lib/discovery/shadow-comparison";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { buildMusicalProfile } from "../src/lib/music/profile";
import { lastFmArtistHopPath,lastFmSimilarityPath,discogsPath } from "../src/lib/discovery/paths";
import { selectModeRecommendations,type Candidate } from "../src/lib/discovery/ranking";
import type { DigRequest,Track } from "../src/lib/types";
const seed:Track={id:"seed",artist:"Mia",title:"Love Me Right",tags:[],scene:"",label:"",obscurity:60,year:0,colors:["a","b"]};
const request:DigRequest={seed:"Love Me Right — Mia",direction:"Surprends-moi",obscurity:70,feedback:{},session:0};
const candidate=(id:string,artist:string,discoveryPath:Candidate["discoveryPath"],origin:Candidate["origin"]):Candidate=>({
 id,artist,title:"Track "+id,tags:[],scene:"",label:"",obscurity:60,year:0,colors:["a","b"],
 relevance:65,reason:"fixture",origin,discoveryPath,
});
const direct=candidate("direct","Direct Artist",
 lastFmSimilarityPath(seed,{id:"direct",artist:"Direct Artist",title:"Track direct"}),"lastfm-similar");
const chain=candidate("chain","Chain Artist",
 lastFmArtistHopPath(seed,"Mia","Bridge","Chain Artist",{id:"chain",artist:"Chain Artist",title:"Track chain"}),"lastfm-artist-hop");
const discogs=candidate("discogs","Label Artist",
 discogsPath(seed,"editorial",[{kind:"release",name:"Compilation",id:5,url:"https://www.discogs.com/release/5"}],
 {id:"discogs",artist:"Label Artist",title:"Track discogs"}),"discogs-compilation");

test("shadow path incentive only caps positive bonus for indirect route types",()=>{
 assert.equal(cautiousPathIncentive(direct,14),14);
 assert.equal(cautiousPathIncentive(chain,14),7);
 assert.equal(cautiousPathIncentive(discogs,30),22);
 assert.equal(cautiousPathIncentive(chain,-6),-6);
 assert.equal(cautiousPathIncentive(chain,0),0);
});
test("production ranking untouched; shadow changes only the discoveryPath score contribution",()=>{
 const options={pool:[direct,chain,discogs],seed,seedProfile:buildMusicalProfile(seed),input:request,seedParticipantKeys:new Set(["mia"])};
 const baseline=rankDiscoveryCandidates(options);
 const experimental=rankDiscoveryCandidates({...options,strategy:"path-aware"});
 const byId=new Map(baseline.map(x=>[x.id,x]));
 let changed=0;
 for(const item of experimental) {
   const before=byId.get(item.id)!;
   assert.equal(item.scoreBreakdown.musicalSimilarity,before.scoreBreakdown.musicalSimilarity);
   assert.equal(item.scoreBreakdown.discogs,before.scoreBreakdown.discogs);
   assert.deepEqual(item.evidence,before.evidence);
   const change=before.score-item.score;
   const changeInPath=before.scoreBreakdown.discoveryPath-item.scoreBreakdown.discoveryPath;
   assert.ok(Math.abs(change-changeInPath)<1e-6);
   assert.ok(change>=0&&change<=8);
   if(change>0)changed++;
 }
 assert.ok(changed>=1);
 assert.deepEqual(rankDiscoveryCandidates(options).map(x=>x.score),baseline.map(x=>x.score));
});
test("same-pool path comparison makes zero requests and respects selection rules",t=>{
 t.mock.method(globalThis,"fetch",()=>{throw Error("Unexpected API request");});
 const options={pool:[direct,chain,discogs],seed,seedProfile:buildMusicalProfile(seed),input:request,seedParticipantKeys:new Set(["mia"])};
 const baselineRanked=rankDiscoveryCandidates(options);
 const baselineSelected=selectModeRecommendations(baselineRanked,seed.artist,request.direction,10);
 const output=comparePathShadow({...options,baselineRanked,baselineSelected});
 assert.equal(output.strategy,"path-aware");
 assert.equal(output.rankedCandidateCount,baselineRanked.length);
 assert.equal(output.experimentEligibleCount,output.baselineEligibleCount);
 assert.equal(output.sharedCount,output.baselineCount);
 assert.deepEqual(new Set(output.experimentTracks.map(x=>x.id)),new Set(baselineSelected.map(x=>x.id)));
});
