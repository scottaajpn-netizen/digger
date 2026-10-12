import test from "node:test";
import assert from "node:assert/strict";
import { auditMusicalContext, describeMusicalOverlap } from "../src/lib/music/context-evidence";
import { buildMusicalProfile,compareMusicalProfiles } from "../src/lib/music/profile";
import type { Track } from "../src/lib/types";
const song=(id:string,tags:string[]):Track=>({id,artist:"Fixture",title:id,tags,scene:"",label:"",year:0,obscurity:50,colors:["a","b"]});

test("recording and artist metadata are not conflated",()=>{
  const item={...song("Seed",["boogie","jazz"]),tagEvidence:[
    {source:"musicbrainz" as const,scope:"recording" as const,tags:["boogie"]},
    {source:"musicbrainz" as const,scope:"artist" as const,tags:["jazz"]},
  ]};
  const context=auditMusicalContext(item);
  assert.deepEqual(context.recording,["Boogie","groovy"]);
  assert.deepEqual(context.artist,[]);
  assert.deepEqual(context.unscoped,[]);
});

test("Discogs compilation styles are release clues, not track facts",()=>{
  const release={...song("Compilation",[]),discogs:{
    releaseId:100,title:"Various Grooves",artists:[],labels:[],
    genres:["Funk"],styles:["Boogie"],compilation:true,sourceUrl:"https://www.discogs.com/release/100",
    fetchedAt:"2026-10-12T00:00:00Z",position:"A2",trackArtists:[],
    role:"compilation-track" as const,path:[],audience:"unknown" as const,
  }};
  const seed={...song("Seed",["boogie"]),tagEvidence:[{
    source:"lastfm" as const,scope:"recording" as const,tags:["boogie"]
  }]};
  const candidateAudit=auditMusicalContext(release);
  assert.ok(candidateAudit.release.includes("Boogie"));
  assert.deepEqual(candidateAudit.recording,[]);
  const message=describeMusicalOverlap("subgenre",["Boogie"],auditMusicalContext(seed),candidateAudit);
  assert.match(message||"",/sortie\/compilation/);
  assert.match(message||"",/non confirmé/);
});

test("matching recording tags can be described as two catalogue recording tags",()=>{
  const seed={...song("Seed",["uk garage"]),tagEvidence:[{
    source:"musicbrainz" as const,scope:"recording" as const,tags:["uk garage"]
  }]};
  const result={...song("Candidate",["UKG"]),tagEvidence:[{
    source:"lastfm" as const,scope:"recording" as const,tags:["UKG"]
  }]};
  assert.match(describeMusicalOverlap("subgenre",["UK Garage"],auditMusicalContext(seed),auditMusicalContext(result))||"",/deux enregistrements/);
});

test("empty or unclassified tags do not manufacture musical characteristics",()=>{
  const context=auditMusicalContext(song("Unclassified",["unfamiliar tag","2025"]));
  assert.deepEqual(context,{recording:[],artist:[],release:[],context:[],unscoped:[]});
  assert.equal(describeMusicalOverlap("subgenre",[],context,context),undefined);
});

test("metadata audit does not change existing similarity coefficients",()=>{
  const seed=song("Seed",["uk garage","2-step"]), candidate=song("Candidate",["uk garage","2-step"]);
  const baseline=compareMusicalProfiles(buildMusicalProfile(seed),buildMusicalProfile(candidate)).musicalSimilarity;
  auditMusicalContext({...candidate,tagEvidence:[{source:"musicbrainz",scope:"artist",tags:["house"]}]});
  const after=compareMusicalProfiles(buildMusicalProfile(seed),buildMusicalProfile(candidate)).musicalSimilarity;
  assert.equal(after,baseline);
});
