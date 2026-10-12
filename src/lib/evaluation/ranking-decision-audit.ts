import type { Recommendation } from "../types";
import type { HumanCoherence } from "./paired-human-ordering";
import { normalized } from "../discovery/ranking";
import { auditDiscoveryPath } from "../discovery/path-reliability";

type ScoreBreakdown = NonNullable<Recommendation["scoreBreakdown"]>;
export type ScoreComponent = keyof ScoreBreakdown;
const COMPONENTS:readonly ScoreComponent[]=[
  "relevance","musicalSimilarity","sharedTags","preferredTags",
  "popularityObscurity","audience","artistAudience","origin",
  "discoveryPath","memory","discogs","direction","jitter",
];
const COHERENCE:Record<HumanCoherence,number>={
  none:0,weak:1,moderate:2,strong:3,
};

export type RankingAuditTrack = Pick<
  Recommendation,
  "id"|"artist"|"title"|"score"|"scoreBreakdown"|"analysis"|
  "evidence"|"discoveryPath"|"retrieval"|"discogs"
> & {
  origin?:string;
  // Only an explicitly rated recording should carry coherence here.
  human?: { coherence?:HumanCoherence; taste?:string; match?:"track"|"artist" };
};

export type ComponentContribution={component:ScoreComponent;points:number};
export type RankingTrackAudit={
  id:string;
  artist:string;
  title:string;
  position:number;
  baselinePosition:number|null;
  positionChange:number|null; // Positive = climbed to a better position.
  score:number|null;
  baselineScore:number|null;
  scoreChange:number|null;
  positiveDrivers:ComponentContribution[];
  negativeDrivers:ComponentContribution[];
  changedComponents:ComponentContribution[];
  scoreComponentSum:number|null;
  residualScore:number|null;
  origin:string|null;
  evidenceTier:Recommendation["evidence"] extends infer _ ? "strong"|"credible"|"exploratory"|null : never;
  metadataOverlapScope:string|null;
  pathRelation:string;
  pathFlags:string[];
  contextOnlySteps:number;
  directTrackAssociations:number;
  humanCoherence:HumanCoherence|null;
  humanTaste:string|null;
};
export type RankingInversion={
  // Higher human coherence should be above lower human coherence.
  shouldBeAhead:{artist:string;title:string;position:number;coherence:HumanCoherence;score:number|null};
  currentlyAhead:{artist:string;title:string;position:number;coherence:HumanCoherence;score:number|null};
  rawScoreGap:number|null; // Score of wrongly promoted track minus coherent track.
  advantageousComponents:ComponentContribution[];
  selectionMayExplainInversion:boolean; // raw scores contradict displayed selection
  misleadingPathFlags:string[];
};
export type RankingDecisionAudit={
  evaluatedCount:number;
  exactHumanCoherenceCount:number;
  pathWarningCount:number;
  tracks:RankingTrackAudit[];
  inversions:RankingInversion[];
  // Empty inversions + zero rated comparisons is NOT proof of correctness.
  comparableHumanPairs:number;
  ratedInversionCount:number;
};

const identity=(track:Pick<RankingAuditTrack,"artist"|"title">)=>
  normalized(track.artist)+"\u0000"+normalized(track.title);
const finiteScore=(value:number|undefined)=>
  typeof value==="number"&&Number.isFinite(value)?value:null;
const contributions=(row:ScoreBreakdown|undefined):ComponentContribution[]=>
  row?COMPONENTS.flatMap(component=>{
    const points=row[component];
    return Number.isFinite(points)?[{component,points}]:[];
  }):[];
const strongest=(rows:ComponentContribution[],positive:boolean,limit=4)=>
  rows.filter(row=>positive?row.points>0:row.points<0)
    .sort((a,b)=>positive?b.points-a.points:a.points-b.points)
    .slice(0,limit);
const differences=(a:ScoreBreakdown|undefined,b:ScoreBreakdown|undefined)=>
  a&&b?COMPONENTS.map(component=>({
    component,points:a[component]-b[component],
  })).filter(row=>Number.isFinite(row.points)&&Math.abs(row.points)>1e-8):[];

/**
 * Read-only diagnostic of the already selected recommendations. The score
 * components are accounting contributions, not acoustic proof. Selection
 * may reorder raw scores through diversity, origin and artist constraints.
 *
 * The optional baseline supplies position/score deltas on the SAME selected
 * titles. All human coherence labels must come from exact track verdicts.
 */
export function auditRankingDecisions(
  tracks:readonly RankingAuditTrack[],
  baseline?:readonly RankingAuditTrack[],
):RankingDecisionAudit {
  const baselineMap=new Map(
    (baseline||[]).map((track,index)=>[identity(track),{track,position:index+1}]),
  );
  const audited=tracks.map((track,index):RankingTrackAudit=>{
    const prior=baselineMap.get(identity(track));
    const path=auditDiscoveryPath(track);
    const parts=contributions(track.scoreBreakdown);
    const score=finiteScore(track.score);
    const priorScore=finiteScore(prior?.track.score);
    const sum=parts.length?parts.reduce((total,p)=>total+p.points,0):null;
    const changes=prior?differences(track.scoreBreakdown,prior.track.scoreBreakdown):[];
    return {
      id:track.id,artist:track.artist,title:track.title,
      position:index+1,
      baselinePosition:prior?.position||null,
      positionChange:prior?prior.position-(index+1):null,
      score,baselineScore:priorScore,
      scoreChange:score!==null&&priorScore!==null?score-priorScore:null,
      positiveDrivers:strongest(parts,true),
      negativeDrivers:strongest(parts,false),
      changedComponents:changes.sort((a,b)=>Math.abs(b.points)-Math.abs(a.points)).slice(0,5),
      scoreComponentSum:sum,
      residualScore:sum!==null&&score!==null?score-sum:null,
      origin:track.origin||null,
      evidenceTier:track.evidence?.tier||null,
      metadataOverlapScope:track.analysis?.overlapScope||null,
      pathRelation:path.relation,pathFlags:path.flags,
      contextOnlySteps:path.contextualSteps,
      directTrackAssociations:path.directTrackAssociations,
      humanCoherence:track.human?.match==="track"?
        track.human.coherence||null:null,
      humanTaste:track.human?.match==="track"?
        track.human.taste||null:null,
    };
  });

  const rated=tracks.map((track,index)=>({track,index})).filter(
    (row):row is {track:RankingAuditTrack&{human:{coherence:HumanCoherence;match:"track"}};index:number}=>
      row.track.human?.match==="track"&&row.track.human.coherence!==undefined,
  );
  let comparableHumanPairs=0;
  const inversions:RankingInversion[]=[];
  for(let i=0;i<rated.length;i++){
    for(let j=i+1;j<rated.length;j++){
      const first=rated[i],second=rated[j];
      const firstRating=COHERENCE[first.track.human.coherence];
      const secondRating=COHERENCE[second.track.human.coherence];
      if(firstRating===secondRating)continue;
      comparableHumanPairs++;
      if(firstRating>secondRating)continue; // already placed correctly
      const worse=first.track,better=second.track;
      const worseScore=finiteScore(worse.score),betterScore=finiteScore(better.score);
      const worsePath=auditDiscoveryPath(worse);
      const betterPath=auditDiscoveryPath(better);
      inversions.push({
        shouldBeAhead:{
          artist:better.artist,title:better.title,position:second.index+1,
          coherence:better.human.coherence,score:betterScore,
        },
        currentlyAhead:{
          artist:worse.artist,title:worse.title,position:first.index+1,
          coherence:worse.human.coherence,score:worseScore,
        },
        rawScoreGap:worseScore!==null&&betterScore!==null?worseScore-betterScore:null,
        advantageousComponents:strongest(
          differences(worse.scoreBreakdown,better.scoreBreakdown),true,5,
        ),
        selectionMayExplainInversion:worseScore!==null&&betterScore!==null?
          worseScore<=betterScore:true,
        misleadingPathFlags:[...new Set([...worsePath.flags,...betterPath.flags])],
      });
    }
  }
  return {
    evaluatedCount:audited.length,
    exactHumanCoherenceCount:rated.length,
    pathWarningCount:audited.filter(track=>track.pathFlags.length>0).length,
    tracks:audited,
    inversions,
    comparableHumanPairs,
    ratedInversionCount:inversions.length,
  };
}
