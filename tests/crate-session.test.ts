import test from "node:test";
import assert from "node:assert/strict";
import {buildSeenKeys, pushViewed, validateFeedback, validateHistory, rejectionLabels} from "../src/lib/crate/session";
import type {CrateRelease} from "../src/lib/crate/select";

const sample:CrateRelease={id:"discogs:15",masterId:"42",artist:"Les Étoiles",title:"Lumière",year:1975,genres:["Soul"],styles:[]};
const second:CrateRelease={id:"discogs:16",masterId:"43",artist:"Musa",title:"Autre chanson",genres:["Jazz"],styles:[]};

test("history persists unique normalized work and master keys",()=>{
  assert.deepEqual(pushViewed([],sample),["work:les etoiles|lumiere","master:42"]);
  assert.deepEqual(pushViewed(pushViewed([],sample),sample),["work:les etoiles|lumiere","master:42"]);
  assert.deepEqual(pushViewed(pushViewed([],sample),second),[
    "work:les etoiles|lumiere","master:42","work:musa|autre chanson","master:43"
  ]);
});
test("reject malformed and excessive stored data without losing safe keys",()=>{
  assert.deepEqual(validateHistory(["invalid","master:42","master:42","work:a|b","master:-1"]),["master:42","work:a|b"]);
  assert.deepEqual(validateHistory(null),[]);
  const safe=validateFeedback({
    "discogs:15":{reason:"ai-suspected",at:1700},
    "discogs:bad":{reason:"already-heard",at:123},
    "discogs:16":{reason:"inject",at:500},
    "discogs:17":null,
  });
  assert.deepEqual(safe,{"discogs:15":{reason:"ai-suspected",at:1700}});
  assert.equal(rejectionLabels["ai-suspected"],"IA suspectée");
});
test("rejection remains excluded even when history was cleared",()=>{
  const result=buildSeenKeys([], [sample,second], {"discogs:15":{reason:"compilation",at:1}});
  assert.deepEqual(result,["work:les etoiles|lumiere","master:42"]);
});
test("seen keys remain bounded to avoid oversized API query URLs",()=>{
  const history=Array.from({length:200},(_,i)=>"master:"+i);
  const keys=buildSeenKeys(history,[],{},60);
  assert.equal(keys.length,60);
  assert.equal(keys[0],"master:140");
});
