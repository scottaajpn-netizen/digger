import test from "node:test";
import assert from "node:assert/strict";
import { auditRankingDecisions, type RankingAuditTrack } from "../src/lib/evaluation/ranking-decision-audit";

const components=(relevance:number,musicalSimilarity=0)=>({
  relevance,musicalSimilarity,
  sharedTags:0,preferredTags:0,popularityObscurity:0,audience:0,
  artistAudience:0,origin:0,discoveryPath:0,memory:0,discogs:0,
  direction:0,jitter:0,
});
function track(
  id:string,artist:string,score:number,
  coherence?: "strong"|"moderate"|"weak"|"none",
  extras:Partial<RankingAuditTrack>={},
):RankingAuditTrack {
  return {
    id,artist,title:id,score,
    scoreBreakdown:components(score),
    evidence:{tier:"credible",musical:false,path:"catalogue",retrievalDepth:2},
    discoveryPath:{source:"lastfm",evidence:"catalogue",nodes:[],distance:2},
    origin:"lastfm-crate",
    ...(coherence?{human:{match:"track",coherence}}:{}),
    ...extras,
  };
}

test("Mia: identify four incorrect coherence pairs and which bonuses favor the wrong track",()=>{
  const mia=[
    track("After All, He Was Sad","Polarkreis 18",101,"weak"),
    track("Kennst du das","LEA",96,"none"),
    track("Can’t Fool Me Twice","Thee Lakesiders",84,"strong",{
      origin:"discogs-compilation",
      discoveryPath:{source:"discogs",evidence:"editorial",nodes:[],distance:2},
      scoreBreakdown:{...components(40,24),discogs:10,origin:10},
    }),
    track("Liebe ohne Ende","2raumwohnung",75,"none"),
    track("Moara Mea","Jeans Team",65,"weak"),
  ];
  const result=auditRankingDecisions(mia);
  assert.equal(result.evaluatedCount,5);
  assert.equal(result.exactHumanCoherenceCount,5);
  assert.equal(result.comparableHumanPairs,8);
  assert.equal(result.ratedInversionCount,4);
  const first=result.inversions.find(row=>
    row.currentlyAhead.artist==="Polarkreis 18"&&row.shouldBeAhead.artist==="Thee Lakesiders"
  );
  assert.ok(first);
  assert.equal(first.rawScoreGap,17);
  assert.equal(first.currentlyAhead.position,1);
  assert.equal(first.shouldBeAhead.position,3);
  assert.ok(first.advantageousComponents.some(c=>c.component==="relevance"&&c.points===61));
  assert.equal(first.selectionMayExplainInversion,false);
  assert.equal(result.tracks[2].origin,"discogs-compilation");
  assert.equal(result.tracks[2].positiveDrivers[0].component,"relevance");
});

test("before and after diagnostics show rank shifts, score deltas and the changed score components",()=>{
  const baseline=[
    track("weak","Weak",90,"weak"),
    track("good","Good",80,"strong",{
      scoreBreakdown:{...components(40,30),origin:10},
    }),
  ];
  const experimental=[
    {...baseline[1],score:98,scoreBreakdown:{...components(40,30),origin:28}},
    {...baseline[0],score:70,scoreBreakdown:components(70)},
  ];
  const audit=auditRankingDecisions(experimental,baseline);
  assert.equal(audit.comparableHumanPairs,1);
  assert.equal(audit.ratedInversionCount,0);
  assert.equal(audit.tracks[0].baselinePosition,2);
  assert.equal(audit.tracks[0].positionChange,1);
  assert.equal(audit.tracks[0].scoreChange,18);
  assert.deepEqual(audit.tracks[0].changedComponents,[{component:"origin",points:18}]);
  assert.equal(audit.tracks[1].baselinePosition,1);
  assert.equal(audit.tracks[1].positionChange,-1);
  assert.equal(audit.tracks[1].scoreChange,-20);
});

test("raw score contradicting displayed position warns about selection constraints",()=>{
  const bad=track("bad","Wrong",30,"none");
  const good=track("good","Relevant",90,"strong");
  const report=auditRankingDecisions([bad,good]);
  assert.equal(report.ratedInversionCount,1);
  assert.equal(report.inversions[0].rawScoreGap,-60);
  assert.equal(report.inversions[0].selectionMayExplainInversion,true);
  assert.equal(report.inversions[0].advantageousComponents.length,0);
});

test("unrated discoveries, artist-only opinions and missing breakdowns never invent judgments",()=>{
  const unrated=track("unknown","Another",87,undefined,{
    scoreBreakdown:undefined,
    evidence:undefined,discoveryPath:undefined,origin:undefined,
  });
  const artistOnly=track("artist","Artist",75,undefined,{
    human:{match:"artist",coherence:"none"},
  });
  const report=auditRankingDecisions([unrated,artistOnly]);
  assert.equal(report.exactHumanCoherenceCount,0);
  assert.equal(report.comparableHumanPairs,0);
  assert.equal(report.ratedInversionCount,0);
  assert.equal(report.tracks[0].humanCoherence,null);
  assert.equal(report.tracks[0].scoreComponentSum,null);
  assert.equal(report.tracks[0].residualScore,null);
  assert.equal(report.tracks[1].humanCoherence,null);
});

test("path flags remain warnings, not automatically negative human verdicts",()=>{
  const warning=track("hop","Last.fm Artist",70,undefined,{
    origin:"lastfm-artist-hop",
    discoveryPath:{source:"lastfm",evidence:"listening",nodes:[],distance:3},
  });
  const report=auditRankingDecisions([warning]);
  assert.equal(report.ratedInversionCount,0);
  assert.equal(report.exactHumanCoherenceCount,0);
  assert.equal(report.pathWarningCount,1);
  assert.ok(report.tracks[0].pathFlags.includes("artist-chain-mislabeled-listening"));
});
