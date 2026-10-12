import test from "node:test";
import assert from "node:assert/strict";
import { indirectVibeAdjustment } from "../src/lib/discovery/vibe-evidence";
import { compareVibeShadow } from "../src/lib/discovery/shadow-comparison";
import { rankDiscoveryCandidates } from "../src/lib/discovery/scoring";
import { buildMusicalProfile } from "../src/lib/music/profile";
import { selectModeRecommendations, type Candidate } from "../src/lib/discovery/ranking";
import { discoveryBenchmark } from "./fixtures/discovery-benchmark";
import type { DigRequest, Track } from "../src/lib/types";

const seed: Track = {
  id: "mia", artist: "Mia", title: "Love Me Right",
  tags: ["boogie"], label: "", scene: "", year: 0,
  obscurity: 80, colors: ["#000", "#111"],
  tagEvidence: [{source:"musicbrainz",scope:"recording",tags:["boogie"]}],
};
const request: DigRequest = {
  seed:"Mia — Love Me Right",direction:"Même vibe",obscurity:80,
  feedback:{},session:0,
};
const candidate=(id:string,artist:string,origin:Candidate["origin"],tags:string[],relevance=60):Candidate=>({
  id,artist,title:id,tags,origin,relevance,label:"",scene:"",year:0,obscurity:80,
  colors:["#000","#111"],reason:"fixture",
});
const distant=candidate("distant","Fake Neighbor","lastfm-crate",[],90);
const coherent={
  ...candidate("coherent","Relevant Neighbor","lastfm-crate",["boogie"],65),
  tagEvidence:[{source:"musicbrainz" as const,scope:"recording" as const,tags:["boogie"]}],
};
const editorial=candidate("editorial","Mango Hill Find","discogs-compilation",[],68);
const direct=candidate("direct","Direct Recording","lastfm-similar",[],67);
const seedProfile=buildMusicalProfile(seed);

test("vibe experiment discounts indirect artist connections only in Même vibe",()=>{
  assert.equal(indirectVibeAdjustment("Même vibe","lastfm-crate","none"),-20);
  assert.equal(indirectVibeAdjustment("Même vibe","lastfm-artist-hop","unscoped"),-20);
  assert.equal(indirectVibeAdjustment("Même vibe","lastfm-tag-crate","artist-context"),-16);
  assert.equal(indirectVibeAdjustment("Même vibe","lastfm-crate","recording"),0);
  assert.equal(indirectVibeAdjustment("Même vibe","discogs-compilation","release-context"),0);
  assert.equal(indirectVibeAdjustment("Même vibe","lastfm-similar","none"),0);
  assert.equal(indirectVibeAdjustment("Surprends-moi","lastfm-crate","none"),0);
  assert.equal(indirectVibeAdjustment("Rabbit hole","lastfm-crate","none"),0);
});

test("shadow changes only direction component, preserves verified and Discogs candidate scores",()=>{
  const options={
    pool:[distant,coherent,editorial,direct],seed,seedProfile,input:request,
    seedParticipantKeys:new Set(["mia"]),
  };
  const baseline=rankDiscoveryCandidates(options);
  const shadow=rankDiscoveryCandidates({...options,strategy:"vibe-aware"});
  const byId=new Map(baseline.map(track=>[track.id,track]));
  for (const track of shadow) {
    const before=byId.get(track.id)!;
    const expected=track.id==="distant"?20:0;
    assert.equal(before.score-track.score,expected);
    assert.equal(before.scoreBreakdown.direction-track.scoreBreakdown.direction,expected);
    assert.equal(before.scoreBreakdown.musicalSimilarity,track.scoreBreakdown.musicalSimilarity);
    assert.equal(before.scoreBreakdown.discogs,track.scoreBreakdown.discogs);
    assert.deepEqual(before.evidence,track.evidence);
  }
  assert.equal(shadow.find(x=>x.id==="coherent")?.analysis?.overlapScope,"recording");
  assert.deepEqual(rankDiscoveryCandidates(options).map(x=>x.score),baseline.map(x=>x.score));
  const surprise={...request,direction:"Surprends-moi" as const};
  assert.deepEqual(
    rankDiscoveryCandidates({...options,input:surprise}).map(x=>x.score),
    rankDiscoveryCandidates({...options,input:surprise,strategy:"vibe-aware"}).map(x=>x.score),
  );
});

test("same-pool experiment neither fetches data nor mutates production recommendations",t=>{
  t.mock.method(globalThis,"fetch",()=>{throw Error("Unexpected API request");});
  const options={
    pool:[distant,coherent,editorial,direct],seed,seedProfile,input:request,
    seedParticipantKeys:new Set(["mia"]),
  };
  const baselineRanked=rankDiscoveryCandidates(options);
  const baselineSelected=selectModeRecommendations(
    baselineRanked,seed.artist,request.direction,10,
  );
  const snapshot=JSON.stringify(options.pool);
  const report=compareVibeShadow({...options,baselineRanked,baselineSelected});
  assert.equal(report.strategy,"vibe-aware");
  assert.equal(report.rankedCandidateCount,baselineRanked.length);
  assert.equal(report.experimentEligibleCount,report.baselineEligibleCount);
  assert.equal(report.sharedCount,baselineSelected.length);
  assert.deepEqual(new Set(report.experimentTracks.map(t=>t.id)),
    new Set(baselineSelected.map(t=>t.id)));
  assert.equal(JSON.stringify(options.pool),snapshot);
  assert.equal(baselineSelected[0].id,rankDiscoveryCandidates(options)[0].id);
});

test("human benchmark preserves independent coherence and taste for five Mia tracks",()=>{
  const mia=discoveryBenchmark.find(x=>x.id==="mia-love-me-right-vibe-80");
  assert.ok(mia);
  assert.equal(mia.direction,"same-vibe");
  assert.equal(mia.obscurity,80);
  assert.equal(mia.examples.length,5);
  assert.equal(mia.examples.filter(x=>x.coherence==="strong").length,1);
  assert.equal(mia.examples.filter(x=>x.coherence==="none").length,2);
  assert.equal(mia.examples.filter(x=>x.coherence==="weak").length,2);
  assert.equal(mia.examples.filter(x=>x.taste==="like").length,2);
  assert.ok(mia.examples.some(x=>x.artist==="Jeans Team"&&x.taste==="like"&&x.coherence==="weak"));
  assert.ok(mia.examples.some(x=>x.artist==="Thee Lakesiders"&&x.taste==="like"&&x.coherence==="strong"));
  assert.ok(discoveryBenchmark.some(x=>x.id==="mia-love-me-right"&&x.obscurity===100));
});
