import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyzeSeedAnchorCoverage,
  selectBalancedBridges,
  selectBalancedSecondHopArtists,
  discoverySeedAnchor,
} from "../src/lib/discovery/seed-branch-balance";
import { explainSurpriseSelection, selectModeRecommendations, passesDeepAudienceGate, selectMmrRecommendations, type RankedCandidate } from "../src/lib/discovery/ranking";

const anchorA="Léon Phal",anchorB="Jungle Jack";

const neighbours=[
  ...Array.from({length:6},(_,i)=>({anchor:anchorA,name:"Jazz Bridge "+i,match:1-i/10})),
  ...Array.from({length:6},(_,i)=>({anchor:anchorB,name:"Rap Bridge "+i,match:1-i/10})),
];

test("initial seed search is genuinely empty, not prefilled with Ttabla",()=>{
  const ui=readFileSync("src/components/digger.tsx","utf8");
  assert.match(ui,/const \[seed, setSeed\] = useState\(""\);/);
  assert.doesNotMatch(ui,/useState\("Ttabla — Taxi Kebab"\)/);
  assert.match(ui,/disabled=\{busy \|\| !seed\.trim\(\)\}/);
});

test("fixed three second-circle calls alternate independently verified anchors",()=>{
  const first=selectBalancedBridges(neighbours,0,3);
  const next=selectBalancedBridges(neighbours,1,3);
  assert.deepEqual(first.map(x=>x.anchor),[anchorA,anchorB,anchorA]);
  assert.deepEqual(next.map(x=>x.anchor),[anchorB,anchorA,anchorB]);
  assert.equal(new Set(first.map(x=>x.name)).size,3);
  assert.equal(first.length,3);
  assert.equal(first[0].anchor,anchorA);
  assert.equal(next[0].anchor,anchorB);
});

test("one confirmed artist stays single-branch; no guessed Jungle Jack anchors",()=>{
  const only=neighbours.filter(x=>x.anchor===anchorA);
  const selected=selectBalancedBridges(only,0,3);
  assert.equal(selected.length,3);
  assert.ok(selected.every(x=>x.anchor===anchorA));
  assert.deepEqual(selectBalancedBridges([],0,3),[]);
  assert.deepEqual(selectBalancedBridges(neighbours,0,0),[]);
});

test("second-circle candidate expansion round-robins real roots, not bridge order",()=>{
  const rows=[
    ...Array.from({length:7},(_,i)=>({
      anchor:anchorA,bridge:"Gwenno Morgan",name:"Instrumental "+i,
      firstHopMatch:0.9,match:0.9-i/20,
    })),
    ...Array.from({length:4},(_,i)=>({
      anchor:anchorB,bridge:"Rap Neighbour",name:"Rap Artist "+i,
      firstHopMatch:0.8,match:0.8-i/20,
    })),
  ];
  const selected=selectBalancedSecondHopArtists(rows,["Rap Artist 0"],6);
  assert.equal(selected.length,6);
  assert.deepEqual(selected.map(x=>x.anchor),[
    anchorA,anchorB,anchorA,anchorB,anchorA,anchorB,
  ]);
  assert.equal(selected.some(x=>x.name==="Rap Artist 0"),false);
  assert.equal(new Set(selected.map(x=>x.name)).size,6);
  assert.ok(selected.find(x=>x.anchor===anchorB)?.bridge==="Rap Neighbour");
});

const candidate=(id:string,anchor:string,hop=false):RankedCandidate=>({
  id,title:id,artist:"Artist "+id,tags:[],scene:"",label:"",year:0,
  obscurity:100,colors:["#000","#111"],reason:"fixture",
  origin:hop?"lastfm-artist-hop":"lastfm-crate",relevance:60,
  ...(hop
    ? {retrieval:{provider:"lastfm" as const,source:"live" as const,
        artistHop:{anchorArtist:anchor,bridgeArtist:"Bridge",neighbourArtist:"Artist "+id,
          firstHopMatch:0.8,secondHopMatch:0.8,pathStrength:0.64}}}
    : {retrieval:{provider:"lastfm" as const,source:"live" as const,
        artistRelation:{anchorArtist:anchor,neighbourArtist:"Artist "+id}}}),
  score:100-Number(id.replace(/\D/g,"")),
  scoreBreakdown:{
    relevance:0,musicalSimilarity:0,sharedTags:0,preferredTags:0,
    popularityObscurity:0,audience:0,artistAudience:0,
    origin:0,discoveryPath:0,memory:0,discogs:0,direction:0,jitter:0,
  },
  evidence:{tier:"credible",path:"artist-link",retrievalDepth:3,musical:false},
});

test("per-participant counts show generated, gated and selected branches separately",()=>{
  const a1=candidate("a1",anchorA,true),a2=candidate("a2",anchorA),b1=candidate("b1",anchorB,true);
  const rows=analyzeSeedAnchorCoverage(
    [anchorA,anchorB,"Unverified Guest"],
    [anchorA,anchorB],
    [a1,a1,a2,b1],
    [a1,b1],
    [a1],
  );
  assert.deepEqual(rows,[
    {anchor:anchorA,verified:true,generated:2,eligible:1,selected:1},
    {anchor:anchorB,verified:true,generated:1,eligible:1,selected:0},
    {anchor:"Unverified Guest",verified:false,generated:0,eligible:0,selected:0},
  ]);
  assert.equal(discoverySeedAnchor(a1),anchorA);
  assert.equal(discoverySeedAnchor(b1),anchorB);
  assert.equal(discoverySeedAnchor({...b1,origin:"lastfm-similar"}),null);
});

test("Surprise MMR keeps ordinary valid tracks and does not fabricate missing roots",()=>{
  const oneRoot=Array.from({length:5},(_,i)=>candidate("a"+i,anchorA,true));
  const selected=selectMmrRecommendations(oneRoot,"Léon Phal & Jungle Jack",5);
  assert.equal(selected.length,5);
  assert.ok(selected.every(item=>discoverySeedAnchor(item)===anchorA));
  const multiRoot=[...oneRoot,candidate("b5",anchorB,true)];
  const balanced=selectMmrRecommendations(multiRoot,"Léon Phal & Jungle Jack",5);
  assert.equal(balanced.length,5);
  assert.equal(new Set(balanced.map(item=>item.id)).size,5);
  assert.ok(balanced.every(item=>multiRoot.includes(item)));
});

test("Surprise diagnostics explain a short list without confusing eligibility with selection",()=>{
  const supported=Array.from({length:5},(_,i)=>candidate("a"+i,anchorA,true));
  const exploratory=Array.from({length:8},(_,i)=>({
    ...candidate("b"+i,anchorB,true),
    evidence:{tier:"exploratory" as const,path:"artist-link" as const,retrievalDepth:3,musical:false},
  }));
  const result=explainSurpriseSelection(
    [...supported,...exploratory],
    "Léon Phal & Jungle Jack",
    10,
  );
  assert.equal(result.selected.length,10);
  assert.deepEqual(result.diagnostics,{
    requested:10,
    eligible:13,
    supportedEligible:5,
    exploratoryEligible:8,
    supportedSelected:5,
    exploratorySelected:5,
    exploratoryLimit:2,
    adaptiveAdded:3,
    nominalQuotaBlocked:6,
    exploratoryDeferred:8,
    rejected:{artistRepresented:0,otherGuard:0,mmrCapacity:3,exploratoryEvidence:0,exploratoryQuota:0},
  });
});

test("adaptive Surprise preserves a full core and fills seven supported artists to ten",()=>{
  const strong=Array.from({length:10},(_,i)=>candidate("a"+i,anchorA,true));
  const exploratory=Array.from({length:5},(_,i)=>({
    ...candidate("b"+i,anchorB),
    evidence:{tier:"exploratory" as const,path:"artist-link" as const,retrievalDepth:2,musical:false},
  }));
  const full=explainSurpriseSelection([...strong,...exploratory],"Seed");
  assert.deepEqual(full.selected,selectMmrRecommendations(strong,"Seed"));
  assert.equal(full.diagnostics.adaptiveAdded,0);
  assert.equal(full.diagnostics.exploratorySelected,0);
  const filled=explainSurpriseSelection([...strong.slice(0,7),...exploratory],"Seed");
  assert.equal(filled.selected.length,10);
  assert.equal(filled.diagnostics.supportedSelected,7);
  assert.equal(filled.diagnostics.exploratorySelected,3);
  assert.equal(filled.diagnostics.adaptiveAdded,1);
});

test("adaptive Surprise exhausts guards without repeating artists or inventing tracks",()=>{
  const first=candidate("a1",anchorA);
  const duplicate={...candidate("b2",anchorB),artist:first.artist,
    evidence:{tier:"exploratory" as const,path:"artist-link" as const,retrievalDepth:2,musical:false}};
  const seed={...duplicate,id:"seed",artist:"Seed"};
  const result=explainSurpriseSelection([first,duplicate,seed],"Seed");
  assert.deepEqual(result.selected,[first]);
  assert.equal(result.diagnostics.rejected.artistRepresented,1);
  assert.equal(result.diagnostics.rejected.otherGuard,1);
  assert.equal(result.diagnostics.nominalQuotaBlocked,0);
  assert.deepEqual(explainSurpriseSelection([],"Seed").selected,[]);
});

test("adaptive fill only consumes post-gate candidates; other modes keep their source caps",()=>{
  const pool=Array.from({length:12},(_,i)=>({...candidate("a"+i,anchorA),
    lastfmListeners:500, evidence:{tier:"exploratory" as const,path:"artist-link" as const,retrievalDepth:2,musical:false}}));
  assert.equal(selectModeRecommendations(pool,"Seed","Surprends-moi").length,10);
  for(const mode of ["Même vibe","Labels","Même scène"] as const)
    assert.equal(selectModeRecommendations(pool,"Seed",mode).length,6);
  assert.equal(selectModeRecommendations(pool,"Seed","Rabbit hole").length,5);
  const invalid=pool.map((row,i)=>({...row,lastfmListeners:i%2?undefined:10001}));
  const eligible=invalid.filter(row=>passesDeepAudienceGate(row,100));
  assert.deepEqual(explainSurpriseSelection(eligible,"Seed").selected,[]);
});
