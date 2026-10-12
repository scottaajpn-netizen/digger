import test from "node:test";
import assert from "node:assert/strict";
import {
  discogsPath,lastFmArtistHopPath,lastFmCataloguePath,lastFmDeepPath,
  lastFmSimilarityPath,lastFmTagArtistPath,listenBrainzPath,
} from "../src/lib/discovery/paths";
import { inspectPathEdges } from "../src/lib/discovery/path-edges";
import { auditDiscoveryPath } from "../src/lib/discovery/path-reliability";
import type { Track } from "../src/lib/types";
const seed:Track={id:"seed",title:"Seed",artist:"Source",tags:[],scene:"",label:"",year:0,obscurity:60,colors:["a","b"]};
const candidate={id:"target",title:"Target",artist:"Destination"};

test("direct Last.fm track similarity is one provider association, not artist catalogue",()=>{
  const path=lastFmSimilarityPath(seed,candidate);
  const edges=inspectPathEdges(path,"lastfm-similar");
  assert.deepEqual(edges.map(edge=>edge.relation),["track-similarity"]);
  assert.deepEqual(edges.map(edge=>edge.support),["provider-association"]);
  assert.equal(auditDiscoveryPath({discoveryPath:path,origin:"lastfm-similar"}).directTrackAssociations,1);
});
test("two-hop similar tracks consist of two reported track-level relationships",()=>{
  const path=lastFmDeepPath(seed,{artist:"Bridge",title:"Bridge song"},candidate);
  assert.deepEqual(inspectPathEdges(path,"lastfm-deep").map(edge=>edge.relation),
    ["track-similarity","track-similarity"]);
});
test("artist neighbours are not confused with direct track similarity",()=>{
  const path=lastFmCataloguePath(seed,"Source","Neighbour",candidate);
  assert.deepEqual(inspectPathEdges(path,"lastfm-crate").map(edge=>edge.relation),
    ["artist-anchor","artist-similarity","artist-catalogue-track"]);
  const hop=lastFmArtistHopPath(seed,"Source","Bridge","Neighbour",candidate);
  const audit=auditDiscoveryPath({discoveryPath:hop,origin:"lastfm-artist-hop"});
  assert.deepEqual(audit.edges.map(edge=>edge.relation),
    ["artist-anchor","artist-similarity","artist-similarity","artist-catalogue-track"]);
  assert.equal(audit.directTrackAssociations,0);
  assert.equal(audit.contextualSteps,1);
  assert.equal(audit.unclassifiedSteps,0);
});
test("Last.fm tag crating has context, tag-artist and catalogue edges",()=>{
  const path=lastFmTagArtistPath(seed,"modern funk","Guest",candidate);
  assert.deepEqual(inspectPathEdges(path,"lastfm-tag-crate").map(edge=>edge.relation),
    ["seed-tag-context","tag-artist-context","artist-catalogue-track"]);
});
test("Discogs release-label-release and compilation links are catalogue facts",()=>{
  const path=discogsPath(seed,"editorial",[
    {kind:"release",name:"Seed compilation",id:1,url:"https://www.discogs.com/release/1"},
    {kind:"label",name:"Label",id:3,url:"https://www.discogs.com/label/3"},
    {kind:"release",name:"Other release",id:4,url:"https://www.discogs.com/release/4"},
  ],candidate);
  const edges=inspectPathEdges(path,"discogs-label");
  assert.deepEqual(edges.map(edge=>edge.relation),[
    "release-membership","release-label","label-release","release-membership"]);
  assert.ok(edges.every(edge=>edge.support==="catalogue-fact"));
});
test("Discogs context matching never certifies musical similarity",()=>{
  const path=discogsPath(seed,"catalogue",[
    {kind:"release",name:"Seed compilation",id:1,url:"https://www.discogs.com/release/1"},
    {kind:"context",name:"Modern Funk FR 2020",url:"https://www.discogs.com/search"},
    {kind:"release",name:"Other",id:2,url:"https://www.discogs.com/release/2"},
  ],candidate);
  const audit=auditDiscoveryPath({discoveryPath:path,origin:"discogs-scene"});
  assert.deepEqual(audit.edges.map(edge=>edge.support),[
    "catalogue-fact","contextual","contextual","catalogue-fact"]);
  assert.equal(audit.directTrackAssociations,0);
});
test("ListenBrainz listening radio is a provider association; tag context is contextual",()=>{
  assert.equal(inspectPathEdges(listenBrainzPath(seed,candidate,"listening"),"artist-radio")[0].relation,"radio-association");
  assert.deepEqual(inspectPathEdges(listenBrainzPath(seed,candidate,"tag","funk"),"tag").map(edge=>edge.support),
    ["contextual","contextual"]);
});
test("unclassified edge is surfaced, never silently upgraded to a musical fact",()=>{
  const path=discogsPath(seed,"editorial",[
    {kind:"label",name:"Unexplained label",id:1,url:"https://www.discogs.com/label/1"},
    {kind:"context",name:"Unknown hop",url:"https://www.discogs.com"},
  ],candidate);
  const audit=auditDiscoveryPath({discoveryPath:path,origin:"discogs-label"});
  assert.equal(audit.unclassifiedSteps,3);
  assert.ok(audit.flags.includes("unclassified-path-step"));
  assert.equal(audit.directTrackAssociations,0);
});
