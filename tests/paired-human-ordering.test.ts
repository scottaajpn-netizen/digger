import test from "node:test";
import assert from "node:assert/strict";
import { comparePairedHumanOrdering, type HumanRatedTrack } from "../src/lib/evaluation/paired-human-ordering";

const example=(key:string,coherence?:HumanRatedTrack["coherence"],taste?:HumanRatedTrack["taste"]):HumanRatedTrack=>({key,coherence,taste});

const userMia=[
  example("polarkreis18\u0000after all he was sad","weak","neutral"),
  example("lea\u0000kennst du das","none","dislike"),
  example("thee lakesiders\u0000cant fool me twice","strong","like"),
  example("2raumwohnung\u0000liebe ohne ende","none","dislike"),
  example("jeans team\u0000moara mea","weak","like"),
];

test("five Mia verdicts compare ranking coherence, not subjective taste",()=>{
  const unchanged=comparePairedHumanOrdering(userMia,userMia);
  assert.equal(unchanged.sharedReviewedCount,5);
  assert.equal(unchanged.sharedCoherenceCount,5);
  assert.equal(unchanged.sharedTasteCount,5);
  assert.equal(unchanged.comparablePairs,8);
  assert.equal(unchanged.baselineCorrectPairs,4);
  assert.equal(unchanged.experimentalCorrectPairs,4);
  assert.equal(unchanged.accuracyDelta,0);
  const reordered=[userMia[2],userMia[0],userMia[4],userMia[1],userMia[3]];
  const improved=comparePairedHumanOrdering(userMia,reordered);
  assert.equal(improved.comparablePairs,8);
  assert.equal(improved.baselineCorrectPairs,4);
  assert.equal(improved.experimentalCorrectPairs,8);
  assert.equal(improved.improvedPairs,4);
  assert.equal(improved.regressedPairs,0);
  assert.equal(improved.accuracyDelta,0.5);
  // Jeans Team is personally liked but musically weak, which is why
  // comparing taste instead of coherence would give the wrong objective.
});

test("dropping a bad reviewed result for an unknown result is NOT evidence of an improvement",()=>{
  const baseline=[example("good","strong","like"),example("bad","none","dislike")];
  const experimental=[example("good","strong","like"),example("unrated")];
  const result=comparePairedHumanOrdering(baseline,experimental);
  assert.equal(result.baselineRatedCount,2);
  assert.equal(result.experimentalRatedCount,1);
  assert.equal(result.sharedReviewedCount,1);
  assert.equal(result.comparablePairs,0);
  assert.equal(result.accuracyDelta,null);
  assert.equal(result.experimentalPairAccuracy,null);
});

test("a new unknown favorite may still be great but cannot establish a win without listening",()=>{
  const base=[example("a","strong"),example("b","none")];
  const newer=[example("b","none"),example("unknown"),example("a","strong")];
  const result=comparePairedHumanOrdering(base,newer);
  assert.equal(result.comparablePairs,1);
  assert.equal(result.baselineCorrectPairs,1);
  assert.equal(result.experimentalCorrectPairs,0);
  assert.equal(result.regressedPairs,1);
  assert.equal(result.accuracyDelta,-1);
  assert.equal(result.experimentalCount,3);
  assert.equal(result.sharedCount,2);
});

test("ties, isolated verdicts and artist-only labels produce no comparable pairs",()=>{
  const neutral=[example("a","weak"),example("b","weak"),example("unknown")];
  assert.equal(comparePairedHumanOrdering(neutral,[...neutral].reverse()).accuracyDelta,null);
  const artistOnly=[example("artist match"),example("recording","strong")];
  assert.equal(comparePairedHumanOrdering(artistOnly,artistOnly).comparablePairs,0);
  assert.equal(comparePairedHumanOrdering([],[]).accuracyDelta,null);
});

test("duplicate identities cannot inflate the number of reviewed pairs",()=>{
  const baseline=[example("x","strong"),example("x","strong"),example("y","none")];
  const next=[example("y","none"),example("x","strong"),example("x","strong")];
  const result=comparePairedHumanOrdering(baseline,next);
  assert.equal(result.baselineCount,2);
  assert.equal(result.sharedCount,2);
  assert.equal(result.comparablePairs,1);
  assert.equal(result.baselineCorrectPairs,1);
  assert.equal(result.experimentalCorrectPairs,0);
});
