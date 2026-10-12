/**
 * Offline comparison of the SAME reviewed recordings across two ranked lists.
 * An unseen replacement does not count as an improvement.
 * Musical coherence is separate from personal taste and novelty.
 */
export type HumanCoherence = "strong" | "moderate" | "weak" | "none";
export interface HumanRatedTrack {
  key: string; // normalized artist + title identity supplied by caller
  coherence?: HumanCoherence;
  taste?: "love" | "like" | "neutral" | "dislike";
}
const levels:Record<HumanCoherence,number>={none:0,weak:1,moderate:2,strong:3};
export interface PairedHumanOrdering {
  baselineCount:number;
  experimentalCount:number;
  baselineRatedCount:number;
  experimentalRatedCount:number;
  sharedCount:number;
  sharedReviewedCount:number;
  sharedCoherenceCount:number;
  sharedTasteCount:number;
  comparablePairs:number;
  baselineCorrectPairs:number;
  experimentalCorrectPairs:number;
  improvedPairs:number;
  regressedPairs:number;
  baselinePairAccuracy:number|null;
  experimentalPairAccuracy:number|null;
  accuracyDelta:number|null;
}

export function comparePairedHumanOrdering(
  baseline:readonly HumanRatedTrack[],
  experimental:readonly HumanRatedTrack[],
):PairedHumanOrdering {
  // Deduplicate a repeated track without counting its verdict twice.
  const indexed=(tracks:readonly HumanRatedTrack[])=>{
    const indexedTracks=new Map<string,{item:HumanRatedTrack;position:number}>();
    tracks.forEach((item,position)=>{
      if(item.key&&!indexedTracks.has(item.key))
        indexedTracks.set(item.key,{item,position});
    });
    return indexedTracks;
  };
  const first=indexed(baseline),second=indexed(experimental);
  const countRated=(m:typeof first)=>[...m.values()].filter(
    ({item})=>item.coherence!==undefined||item.taste!==undefined,
  ).length;
  const shared=[...first.entries()].flatMap(([key,entry])=>{
    const other=second.get(key);
    return other?[{baseline:entry,experimental:other}]:[];
  });
  const reviewed=shared.filter(r=>
    r.baseline.item.coherence!==undefined||r.baseline.item.taste!==undefined
  );
  const sameCoherence=reviewed.filter(r=>
    r.baseline.item.coherence!==undefined&&
    r.baseline.item.coherence===r.experimental.item.coherence
  );
  const sameTaste=reviewed.filter(r=>
    r.baseline.item.taste!==undefined&&
    r.baseline.item.taste===r.experimental.item.taste
  );

  let pairs=0,baseCorrect=0,newCorrect=0,improved=0,regressed=0;
  for(let i=0;i<sameCoherence.length;i++){
    for(let j=i+1;j<sameCoherence.length;j++){
      const a=sameCoherence[i],b=sameCoherence[j];
      const aCoherence=levels[a.baseline.item.coherence!];
      const bCoherence=levels[b.baseline.item.coherence!];
      if(aCoherence===bCoherence)continue;
      pairs++;
      const bestFirst=aCoherence>bCoherence;
      const baseRight=(a.baseline.position<b.baseline.position)===bestFirst;
      const newRight=(a.experimental.position<b.experimental.position)===bestFirst;
      if(baseRight)baseCorrect++;
      if(newRight)newCorrect++;
      if(!baseRight&&newRight)improved++;
      if(baseRight&&!newRight)regressed++;
    }
  }
  return {
    baselineCount:first.size,experimentalCount:second.size,
    baselineRatedCount:countRated(first),experimentalRatedCount:countRated(second),
    sharedCount:shared.length,sharedReviewedCount:reviewed.length,
    sharedCoherenceCount:sameCoherence.length,sharedTasteCount:sameTaste.length,
    comparablePairs:pairs,baselineCorrectPairs:baseCorrect,
    experimentalCorrectPairs:newCorrect,improvedPairs:improved,regressedPairs:regressed,
    baselinePairAccuracy:pairs?baseCorrect/pairs:null,
    experimentalPairAccuracy:pairs?newCorrect/pairs:null,
    accuracyDelta:pairs?(newCorrect-baseCorrect)/pairs:null,
  };
}
