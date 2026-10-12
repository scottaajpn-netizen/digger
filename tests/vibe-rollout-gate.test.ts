import test from "node:test";
import assert from "node:assert/strict";
import {
  assessVibeRollout,
  formatVibeDecisionMarkdown,
  type VibeBenchmarkSnapshot,
  type VibeReviewTrack,
  type VibeReviewRun,
} from "../src/lib/evaluation/vibe-rollout-gate";

const reviewed = (
  artist:string,
  coherence: "strong" | "moderate" | "weak" | "none",
): VibeReviewTrack => ({
  artist, title:"Cut "+artist,
  humanVerdict:{match:"track",coherence},
});

const sameMode=(caseId:string, baseline:VibeReviewTrack[], shadow:VibeReviewTrack[]):VibeReviewRun=>({
  caseId,direction:"Même vibe",historicalDirection:"same-vibe",
  historicalObscurity:80,obscurity:80,
  tracks:baseline,vibeShadow:{tracks:shadow},
});

const sources = { lastfm:true, discogs:true };

test("no benchmark or credentials cannot certify improved musical coherence",()=>{
  const result=assessVibeRollout({runs:[]});
  assert.equal(result.status,"insufficient-evidence");
  assert.equal(result.canAutoEnable,false);
  assert.equal(result.comparablePairs,0);
  assert.equal(result.distinctReviewedSeeds,0);
  assert.ok(result.reasons.some(r=>r.includes("Aucun benchmark")));
});

test("historical reviews from Surprise or a different obscurity cannot certify Same vibe",()=>{
  const baseline=[reviewed("B","none"),reviewed("A","strong")];
  const improved=[...baseline].reverse();
  const surprise:VibeReviewRun={
    ...sameMode("historical-surprise",baseline,improved),
    historicalDirection:"surprise",
  };
  const differentObscurity:VibeReviewRun={
    ...sameMode("wrong-obscurity",baseline,improved),
    historicalObscurity:100,
  };
  const oldSnapshot:VibeReviewRun={
    ...sameMode("without-original-mode",baseline,improved),
    historicalDirection:undefined,
  };
  const output=assessVibeRollout({sourceAvailability:sources,
    runs:[surprise,differentObscurity,oldSnapshot]});
  assert.equal(output.status,"insufficient-evidence");
  assert.equal(output.comparedRuns,0);
  assert.equal(output.distinctReviewedSeeds,0);
  assert.ok(output.reasons.some(r=>r.includes("3 run(s) exclus")));
});

test("a single five-track Mia case remains insufficient, even with improved ordering",()=>{
  const baseline=[
    reviewed("Polarkreis18","weak"),
    reviewed("LEA","none"),
    reviewed("Thee Lakesiders","strong"),
    reviewed("2raumwohnung","none"),
    reviewed("Jeans Team","weak"),
  ];
  const experiment=[baseline[2],baseline[0],baseline[4],baseline[1],baseline[3]];
  const r=assessVibeRollout({sourceAvailability:sources,
    runs:[sameMode("mia-love-me-right-vibe-80",baseline,experiment)]});
  assert.equal(r.status,"insufficient-evidence");
  assert.equal(r.distinctReviewedSeeds,1);
  assert.equal(r.comparablePairs,8);
  assert.equal(r.improvedPairs,4);
  assert.equal(r.regressedPairs,0);
  assert.equal(r.sharedReviewRetention,1);
  assert.equal(r.canAutoEnable,false);
  assert.ok(r.reasons.some(reason=>reason.includes("minimum prudent : 4")));
});

test("a worse relative ranking triggers regression-risk even when evidence is sparse",()=>{
  const best=reviewed("Good","strong");
  const wrong=reviewed("Bad","none");
  const report=assessVibeRollout({sourceAvailability:sources,
    runs:[sameMode("regressed",[best,wrong],[wrong,best])]});
  assert.equal(report.status,"regression-risk");
  assert.equal(report.regressedPairs,1);
  assert.equal(report.improvedPairs,0);
  assert.equal(report.canAutoEnable,false);
});

test("replacing a known coherent song with an unreviewed track cannot be called improvement",()=>{
  const good=reviewed("Good","strong");
  const wrong=reviewed("Wrong","none");
  const unreviewed:VibeReviewTrack={artist:"Unknown",title:"New Track"};
  const report=assessVibeRollout({sourceAvailability:sources,
    runs:[sameMode("replacement",[wrong,good],[wrong,unreviewed])]});
  assert.equal(report.status,"regression-risk");
  assert.equal(report.lostCoherentTracks,1);
  assert.equal(report.sharedReviewRetention,0.5);
  assert.equal(report.comparedRuns,1);
});

test("a sufficiently reviewed same-mode positive comparison is only a listening candidate",()=>{
  const strong=reviewed("Strong","strong");
  const moderate=reviewed("Moderate","moderate");
  const weak=reviewed("Weak","weak");
  const bad=reviewed("Bad","none");
  const original=[bad,weak,moderate,strong];
  const reordered=[strong,moderate,weak,bad];
  const runs=Array.from({length:4},(_,i)=>
    sameMode("seed-"+i,
      original.map(row=>({...row,artist:row.artist+i})),
      reordered.map(row=>({...row,artist:row.artist+i})),
    ));
  const report=assessVibeRollout({sourceAvailability:sources,
    errorCount:0,runs});
  assert.equal(report.status,"candidate-for-listening");
  assert.equal(report.distinctReviewedSeeds,4);
  assert.equal(report.baselineReviewed,16);
  assert.equal(report.sharedReviewed,16);
  assert.equal(report.comparablePairs,24);
  assert.equal(report.improvedPairs,24);
  assert.equal(report.regressedPairs,0);
  assert.equal(report.canAutoEnable,false);
  assert.match(formatVibeDecisionMarkdown(report),/jamais activée automatiquement/);
});

test("missing provider source or incomplete benchmark blocks promotion even with adequate labels",()=>{
  const original=[reviewed("B","none"),reviewed("W","weak"),reviewed("A","strong"),reviewed("S","moderate")];
  const corrected=[...original].reverse();
  const runs=Array.from({length:4},(_,i)=>sameMode("seed"+i,
    original.map(row=>({...row,artist:row.artist+i})),
    corrected.map(row=>({...row,artist:row.artist+i})),
  ));
  const missing=assessVibeRollout({sourceAvailability:{lastfm:true,discogs:false},runs});
  assert.equal(missing.status,"insufficient-evidence");
  assert.ok(missing.reasons.some(reason=>reason.includes("Sources musicales incomplètes")));
  const errors=assessVibeRollout({sourceAvailability:sources,errorCount:1,runs});
  assert.equal(errors.status,"insufficient-evidence");
  assert.ok(errors.reasons.some(reason=>reason.includes("erreur(s)")));
});

test("artist-only judgment does not count as a recording-coherence vote",()=>{
  const artistOnly:VibeReviewTrack={artist:"Ambiguous",title:"Different recording",
    humanVerdict:{match:"artist",coherence:"strong"}};
  const actual=reviewed("Known","none");
  const report=assessVibeRollout({sourceAvailability:sources,
    runs:[sameMode("artist",[artistOnly,actual],[actual,artistOnly])]});
  assert.equal(report.baselineReviewed,1);
  assert.equal(report.comparablePairs,0);
  assert.equal(report.status,"insufficient-evidence");
});
