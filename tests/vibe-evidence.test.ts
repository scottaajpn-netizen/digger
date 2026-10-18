import test from "node:test";
import assert from "node:assert/strict";
import { calibrateIndirectVibe } from "../src/lib/discovery/vibe-evidence";
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

test("vibe correction withdraws only unsupported artist and catalogue boosts",()=>{
  const effect=(origin:Candidate["origin"],scope:"recording"|"none"|"artist-context",obscurity:number,match?:number)=>
    calibrateIndirectVibe("Même vibe",origin,scope,obscurity,match);
  assert.deepEqual(effect("lastfm-crate","none",80,1),{
    origin:-24,discoveryPath:-6,direction:0,
  });
  assert.deepEqual(effect("lastfm-crate","artist-context",95,0.5),{
    origin:-24,discoveryPath:-3,direction:0,
  });
  assert.deepEqual(effect("lastfm-crate","none",70,0.5),{
    origin:0,discoveryPath:-3,direction:-8,
  });
  assert.deepEqual(effect("lastfm-artist-hop","none",80,0.75),{
    origin:0,discoveryPath:-4.5,direction:-8,
  });
  assert.deepEqual(effect("lastfm-tag-crate","artist-context",80),{
    origin:0,discoveryPath:0,direction:-12,
  });
  assert.deepEqual(effect("lastfm-crate","recording",80,1),{
    origin:0,discoveryPath:0,direction:0,
  });
  assert.deepEqual(effect("discogs-compilation","none",80,1),{
    origin:0,discoveryPath:0,direction:0,
  });
  assert.deepEqual(effect("lastfm-similar","none",80,1),{
    origin:0,discoveryPath:0,direction:0,
  });
  assert.deepEqual(calibrateIndirectVibe("Surprends-moi","lastfm-crate","none",80,1),{
    origin:0,discoveryPath:0,direction:0,
  });
  assert.deepEqual(calibrateIndirectVibe("Rabbit hole","lastfm-artist-hop","none",100,1),{
    origin:0,discoveryPath:0,direction:0,
  });
  assert.deepEqual(calibrateIndirectVibe("Labels","lastfm-crate","none",80,1),{
    origin:0,discoveryPath:0,direction:0,
  });
});

test("out-of-range or missing Last.fm similarity cannot inflate correction",()=>{
  const score=(value:number|undefined)=>
    calibrateIndirectVibe("Même vibe","lastfm-crate","none",80,value).discoveryPath;
  assert.equal(score(undefined),0);
  assert.equal(score(NaN),0);
  assert.equal(score(Number.POSITIVE_INFINITY),0);
  assert.equal(score(-3),0);
  assert.equal(score(12),-6);
});

test("vibe shadow corrects precise components but preserves verified and Discogs scores",()=>{
  const distantMatched={
    ...distant,
    retrieval:{
      provider:"lastfm" as const,source:"live" as const,
      artistRelation:{anchorArtist:"Mia",neighbourArtist:"Fake Neighbor",similarity:0.5},
    },
  };
  const unsupportedHop={
    ...candidate("hop","Distant Two-Hop","lastfm-artist-hop",[],69),
    retrieval:{
      provider:"lastfm" as const,source:"live" as const,
      artistRelation:{anchorArtist:"Bridge",neighbourArtist:"Distant Two-Hop",similarity:0.8},
    },
  };
  const pool=[distantMatched,coherent,editorial,direct,unsupportedHop];
  const options={pool,seed,seedProfile,input:request,seedParticipantKeys:new Set(["mia"])};
  const baseline=rankDiscoveryCandidates(options);
  const shadow=rankDiscoveryCandidates({...options,strategy:"vibe-aware"});
  const byId=new Map(baseline.map(track=>[track.id,track]));
  const expectedById:Record<string,{origin:number;discoveryPath:number;direction:number}>={
    distant:{origin:-24,discoveryPath:-3,direction:0},
    coherent:{origin:0,discoveryPath:0,direction:0},
    editorial:{origin:0,discoveryPath:0,direction:0},
    direct:{origin:0,discoveryPath:0,direction:0},
    hop:{origin:0,discoveryPath:-4.8,direction:-8},
  };
  for(const track of shadow){
    const before=byId.get(track.id)!;
    const expected=expectedById[track.id];
    for(const component of ["origin","discoveryPath","direction"] as const){
      const difference=track.scoreBreakdown[component]-before.scoreBreakdown[component];
      assert.ok(Math.abs(difference-expected[component])<1e-8,track.id+" "+component);
    }
    assert.ok(Math.abs(
      track.score-before.score-Object.values(expected).reduce((a,b)=>a+b,0),
    )<1e-7,"total delta "+track.id);
    assert.equal(before.scoreBreakdown.musicalSimilarity,track.scoreBreakdown.musicalSimilarity);
    assert.equal(before.scoreBreakdown.discogs,track.scoreBreakdown.discogs);
    assert.deepEqual(before.evidence,track.evidence);
    assert.ok(Math.abs(track.score-
      Object.values(track.scoreBreakdown).reduce((a,b)=>a+b,0))<1e-7);
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
