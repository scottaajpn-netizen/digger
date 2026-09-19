import test from "node:test";
import assert from "node:assert/strict";
import {matchScore,mergeSuggestions,typoQueries,type Suggestion} from "../src/lib/search/matching";
import {suggest,providers} from "../src/lib/search/service";
import {SearchController,moveSelection,type SearchState} from "../src/lib/search/controller";
const track=(title="Mes jambes",artist="JeanJass",source="MusicBrainz"):Suggestion=>({id:"test",title,artist,scene:"",label:"",tags:[],year:0,obscurity:50,colors:["a","b"],sources:[source],matchScore:0});
test("autocomplete accepts order, split artist, accents, transposition and title completion",()=>{
  for(const q of ["mes jambes jeanjass","jeanjass mes jambes","mes jambe jean jass"])assert.ok(matchScore(q,track())>.85);
  const duk=track("Yoru no Groove","DÜK");
  for(const q of ["your no gro","your no groove duk","duk your no groove"])assert.ok(matchScore(q,duk)>.78);
  assert.ok(matchScore("your no gro",duk)>matchScore("your no gro",track("Your No Good","Ken Boothe")));
  assert.ok(typoQueries("your no gro").includes("yoru no gro"));
});
test("merge keeps MusicBrainz identity, source badges and distinct remixes",()=>{
  const mb={...track(),id:"mb",externalIds:{musicbrainz:"mb"}};
  const lf={...track("Mes jambes","Jean Jass","Last.fm"),id:"lf",externalIds:{lastfm:"https://www.last.fm/music/test"}};
  const merged=mergeSuggestions("mes jambes jeanjass",[lf,mb]);
  assert.equal(merged.length,1);assert.equal(merged[0].id,"mb");assert.equal(merged[0].sources.length,2);
  assert.equal(merged[0].externalIds?.lastfm,lf.externalIds.lastfm);
});
test("503 falls through to Last.fm and a strong identity avoids Discogs",async()=>{
  let discogs=0;
  const result=await suggest("mes jambes jeanjass",new AbortController().signal,{mb:async()=>{throw Error("503");},lastfm:async()=>[track("Mes jambes","JeanJass","Last.fm")],discogs:async()=>{discogs++;return [];}});
  assert.equal(result.suggestions.length,1);assert.equal(discogs,0);assert.equal(result.warnings.length,1);
});
test("short queries and absent credentials cause no provider request",async()=>{
  let calls=0;const dep=async()=>{calls++;return [];};
  await suggest("ab",new AbortController().signal,{mb:dep,lastfm:dep,discogs:dep});assert.equal(calls,0);
  const lf=process.env.LASTFM_API_KEY,dc=process.env.DISCOGS_TOKEN;
  delete process.env.LASTFM_API_KEY;delete process.env.DISCOGS_TOKEN;
  try {assert.deepEqual(await providers.lastfm("abc",new AbortController().signal),[]);assert.deepEqual(await providers.discogs("abc",new AbortController().signal),[]);}
  finally{if(lf!==undefined)process.env.LASTFM_API_KEY=lf;if(dc!==undefined)process.env.DISCOGS_TOKEN=dc;}
});
test("300ms debounce, abort, stale response suppression and client cache",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  const states:SearchState[]=[],pending:{signal:AbortSignal;resolve:(value:{suggestions:Suggestion[];warnings:string[]})=>void}[]=[];
  const c=new SearchController(s=>states.push(s),async(q,signal)=>new Promise(resolve=>pending.push({signal,resolve})));
  c.search("mes");t.mock.timers.tick(299);assert.equal(pending.length,0);t.mock.timers.tick(1);assert.equal(pending.length,1);
  c.search("mes jambes");assert.equal(pending[0].signal.aborted,true);t.mock.timers.tick(300);
  pending[0].resolve({suggestions:[track("stale")],warnings:[]});await Promise.resolve();await Promise.resolve();
  assert.equal(states.at(-1)?.status,"loading");
  pending[1].resolve({suggestions:[track()],warnings:[]});await Promise.resolve();await Promise.resolve();
  c.search("mes jambes");assert.equal(states.at(-1)?.status,"done");assert.equal(pending.length,2);c.cancel();
});
test("keyboard arrows wrap and empty lists never select a missing track",()=>{
  assert.equal(moveSelection("ArrowDown",-1,5),0);assert.equal(moveSelection("ArrowUp",0,5),4);assert.equal(moveSelection("ArrowDown",4,5),0);assert.equal(moveSelection("ArrowUp",0,0),-1);
});

test("partial words can be omitted and entered in any order without accepting unrelated words",()=>{
  const t=track("I Fall in Love Too Easily","Chet Baker");
  for(const q of ["fall love chet","chet fall love","baker love easily"])
    assert.ok(matchScore(q,t)>.85,q);
  assert.ok(matchScore("fall love metallica",t)<.66);
  assert.ok(matchScore("bon ker",track("Kerala","Bonobo"))>.85);
});
