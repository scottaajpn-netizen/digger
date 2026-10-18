import test from "node:test";
import assert from "node:assert/strict";
import { lastFmArtistHopPath,lastFmSimilarityPath,discoveryPathPreferenceKey } from "../src/lib/discovery/paths";
import { assessCandidateEvidence } from "../src/lib/discovery/evidence";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { buildMusicalProfile } from "../src/lib/music/profile";
import { selectModeRecommendations,type Candidate } from "../src/lib/discovery/ranking";
import type { DigRequest,Track } from "../src/lib/types";

const seed:Track={
  id:"seed",artist:"Léon Phal & Jungle Jack",title:"Pleine Forêt",
  tags:[],scene:"",label:"",year:0,obscurity:70,colors:["a","b"],
};
const neighbour:Candidate={
  id:"veust",artist:"Veust",title:"4 Chemins",tags:[],
  scene:"",label:"",year:0,obscurity:70,colors:["a","b"],
  relevance:68,reason:"fixture",origin:"lastfm-artist-hop",
  discoveryPath:lastFmArtistHopPath(seed,"Jungle Jack","Infinit'","Veust",{
    id:"veust",artist:"Veust",title:"4 Chemins",
  }),
};
const direct:Candidate={
  ...neighbour,id:"direct",artist:"Direct Neighbour",title:"Direct",
  origin:"lastfm-similar",
  discoveryPath:lastFmSimilarityPath(seed,{id:"direct",artist:"Direct Neighbour",title:"Direct"}),
};
const input:DigRequest={
  seed:"Pleine Forêt — Léon Phal & Jungle Jack",
  direction:"Surprends-moi",obscurity:70,feedback:{},session:0,
};
const base={pool:[neighbour,direct],seed,seedProfile:buildMusicalProfile(seed),
  input,seedParticipantKeys:new Set(["leon phal","jungle jack"])};

test("artist hop is credible exploration rather than fabricated track listening",()=>{
  assert.equal(neighbour.discoveryPath?.evidence,"catalogue");
  const comparison={genre:0,subgenre:0,traits:0,rawTags:0,labels:0,country:0,year:0};
  const evidence=assessCandidateEvidence(neighbour,comparison);
  assert.equal(evidence.path,"artist-link");
  assert.equal(evidence.musical,false);
  assert.equal(evidence.tier,"credible");
  assert.equal(assessCandidateEvidence(direct,comparison).path,"behavioral");
});

test("surprise mode can still present a good candidate found through artist-hop",()=>{
  const ranked=rankDiscoveryCandidates(base);
  const hop=ranked.find(row=>row.id==="veust");
  assert.ok(hop);
  assert.equal(hop.evidence?.tier,"credible");
  assert.equal(hop.evidence?.path,"artist-link");
  const selected=selectModeRecommendations(ranked,seed.artist,input.direction,10);
  assert.ok(selected.some(row=>row.id==="veust"));
  assert.ok(selected.some(row=>row.id==="direct"));
});

test("path feedback learned before the correction survives under legacy key",()=>{
  const corrected=neighbour.discoveryPath!;
  const newKey=discoveryPathPreferenceKey(corrected,input.direction)!;
  const legacyKey=discoveryPathPreferenceKey({...corrected,evidence:"listening"},input.direction)!;
  assert.notEqual(newKey,legacyKey);
  const oldMemory={pathScores:{[legacyKey]:9},knownTracks:[]};
  const oldRanked=rankDiscoveryCandidates({...base,input:{...input,memory:oldMemory}});
  const without=rankDiscoveryCandidates(base);
  const oldScore=oldRanked.find(row=>row.id==="veust")!;
  assert.equal(oldScore.scoreBreakdown.memory,9);
  const baseline=without.find(row=>row.id==="veust")!;
  assert.ok(Math.abs(oldScore.score-baseline.score-9)<1e-7);
  const newMemory={pathScores:{[legacyKey]:9,[newKey]:-6},knownTracks:[]};
  const newRanked=rankDiscoveryCandidates({...base,input:{...input,memory:newMemory}});
  assert.equal(newRanked.find(row=>row.id==="veust")?.scoreBreakdown.memory,-6);
});
