import test from "node:test";
import assert from "node:assert/strict";
import { auditDiscoveryPath } from "../src/lib/discovery/path-reliability";
import { assessCandidateEvidence } from "../src/lib/discovery/evidence";
import {
  lastFmArtistHopPath, lastFmSimilarityPath, discogsPath, listenBrainzPath,
} from "../src/lib/discovery/paths";
import type { Recommendation, Track } from "../src/lib/types";

const seed: Track = {id:"seed",title:"Love Me Right",artist:"Mia",scene:"",label:"",
  tags:[],year:0,obscurity:90,colors:["a","b"]};
const candidate: Recommendation = {
  ...seed,id:"candidate",title:"B Side",artist:"Underground Artist",reason:"fixture",
};
const noOverlap = {genre:0,subgenre:0,traits:0,rawTags:0,labels:0,country:0,year:0};

test("direct Last.fm track.getSimilar has no misleading artist-chain flag",()=>{
  const row = {...candidate,origin:"lastfm-similar",
    discoveryPath:lastFmSimilarityPath(seed,candidate)};
  const result=auditDiscoveryPath(row);
  assert.equal(result.relation,"track-similarity");
  assert.deepEqual(result.flags,[]);
  assert.equal(result.pathLength,1);
});

test("artist similarity chain is not direct track-level listening evidence",()=>{
  const row={...candidate,origin:"lastfm-artist-hop",
    discoveryPath:lastFmArtistHopPath(seed,"Mia","Bridge","Neighbour",candidate),
    evidence:assessCandidateEvidence({
      discoveryPath:lastFmArtistHopPath(seed,"Mia","Bridge","Neighbour",candidate),
    },noOverlap),
  };
  const audit=auditDiscoveryPath(row);
  assert.equal(audit.relation,"artist-similarity-chain");
  assert.ok(audit.flags.includes("artist-chain-mislabeled-listening"));
  assert.ok(audit.flags.includes("long-path-no-recording-match"));
  // Reveals a currently existing false-positive credible behavioral path.
  assert.equal(row.evidence.path,"behavioral");
  assert.equal(row.evidence.tier,"credible");
});

test("Discogs compilation association is a catalogue fact, not an editorial review",()=>{
  const discogs=discogsPath(seed,"editorial",[
    {kind:"release",id:24,name:"Various Classics",url:"https://www.discogs.com/release/24"},
  ],candidate);
  const audit=auditDiscoveryPath({...candidate,origin:"discogs-compilation",
    discoveryPath:discogs});
  assert.equal(audit.relation,"catalogue-link");
  assert.ok(audit.flags.includes("discogs-link-labeled-editorial"));
});

test("release-scoped genre overlap is flagged when promoted to musical evidence",()=>{
  const path=discogsPath(seed,"editorial",[
    {kind:"release",id:3,name:"Modern Funk Cuts",url:"https://www.discogs.com/release/3"},
  ],candidate);
  const ranked={...candidate,origin:"discogs-compilation",discoveryPath:path,
    evidence:{tier:"strong" as const,musical:true,path:"structured" as const,retrievalDepth:2},
    analysis:{genres:["Funk"],subgenres:["Boogie"],traits:[],overlapScope:"release-context" as const}};
  const audit=auditDiscoveryPath(ranked);
  assert.ok(audit.flags.includes("release-tags-used-as-musical-proof"));
  assert.ok(audit.flags.includes("discogs-link-labeled-editorial"));
});

test("artist radio is marked indirect rather than direct track-similarity",()=>{
  const path=listenBrainzPath(seed,candidate,"listening");
  const audit=auditDiscoveryPath({...candidate,origin:"artist-radio",discoveryPath:path});
  assert.equal(audit.relation,"artist-listening");
  assert.deepEqual(audit.flags,[]);
});

test("weak tag context is not invented as musical proof without overlap",()=>{
  const audit=auditDiscoveryPath({...candidate,origin:"lastfm-tag-crate",
    analysis:{genres:[],subgenres:[],traits:[],overlapScope:"none"},
    evidence:{tier:"exploratory",musical:false,path:"tag",retrievalDepth:3}});
  assert.equal(audit.relation,"tag-context");
  assert.deepEqual(audit.flags,[]);
});

test("scenes and unscoped tags expose subjective claims without scoring changes",()=>{
  const row={...candidate,origin:"discogs-scene",
    analysis:{genres:[],subgenres:[],traits:[],overlapScope:"unscoped" as const},
    evidence:{tier:"strong" as const,musical:true,path:"structured" as const,retrievalDepth:3}};
  const audit=auditDiscoveryPath(row);
  assert.ok(audit.flags.includes("scene-context-is-not-musical-proof"));
  assert.ok(audit.flags.includes("unscoped-tags-used-as-proof"));
});
