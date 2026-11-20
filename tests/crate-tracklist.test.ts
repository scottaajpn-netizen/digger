import test from "node:test";
import assert from "node:assert/strict";
import {
  extractReleaseTracks, parseDiscogsDuration, pickReleaseTrack,
  type DiscogsReleaseDetail,
} from "../src/lib/crate/tracklist";

const compilation: DiscogsReleaseDetail = {
  id: 12345, title: "Rare Grooves Collection", year: 1977, country: "Brazil",
  artists: [{ name: "Various" }],
  tracklist: [
    { type_: "heading", title: "Side A" },
    { position: "A1", title: "Sunlit Drum Break", duration: "3:45", type_: "track", artists: [{name:"Orquestra Sol"}] },
    { position: "A2", title: "Full Album 1977", duration: "40:12", type_: "track", artists: [{name:"Fake Radio"}] },
    { position: "B1", title: "Moonlight Bossa", duration: "4:15", type_: "track", artists: [{name:"Ana Costa"}] },
    { position: "B2", title: "Synth Sunset", duration: "10:30", type_: "track", artists: [{name:"Ana Costa"}] },
    { position: "B3", title: "AI Generated Funk", duration: "3:20", type_: "track", artists: [{name:"Ana Costa"}] },
    { position: "B4", title: "Unknown Gem", type_: "track", artists: [{name:"Joao Pessoa"}] },
  ],
};

test("Discogs duration parser distinguishes unknown, mm:ss and hh:mm:ss", () => {
  assert.equal(parseDiscogsDuration("3:45"),225);
  assert.equal(parseDiscogsDuration("01:03:01"),3781);
  assert.equal(parseDiscogsDuration("40:12"),2412);
  assert.equal(parseDiscogsDuration(""),undefined);
  assert.equal(parseDiscogsDuration("3:80"),undefined);
  assert.equal(parseDiscogsDuration("00:20"),20);
});

test("extract individual songs from compilations without showing compilation as a song", () => {
  const tracks = extractReleaseTracks(compilation);
  assert.deepEqual(tracks.map(t=>t.title),["Sunlit Drum Break","Moonlight Bossa","Unknown Gem"]);
  assert.equal(tracks[0].artist,"Orquestra Sol");
  assert.equal(tracks[0].durationSeconds,225);
  assert.equal(tracks[0].releaseTitle,"Rare Grooves Collection");
  assert.equal(tracks[2].durationSource,"unknown");
});

test("skip tracks lacking an individual artist on Various Artists releases", () => {
  assert.deepEqual(
    extractReleaseTracks({id:22,title:"Rare 45s",artists:[{name:"Various"}],tracklist:[{type_:"track",title:"Unknown Artist Track",duration:"3:20"}]}),
    [],
  );
});

test("support normal album artist and nested subtracks", () => {
  const album: DiscogsReleaseDetail = {
    id:77,title:"Unusual Jazz",artists:[{name:"Yves Dupont"}],
    tracklist:[{type_:"index",title:"Suite",sub_tracks:[
      {position:"A1",type_:"track",title:"Dawn",duration:"4:52"},
      {position:"A2",type_:"track",title:"Dusk",duration:"5:12"},
    ]}],
  };
  assert.deepEqual(extractReleaseTracks(album).map(t=>t.artist),["Yves Dupont","Yves Dupont"]);
});

test("do not classify traditional track titles with ai in them as AI music", () => {
  const tracks=extractReleaseTracks({id:77,artists:[{name:"Khaled"}],tracklist:[{type_:"track",title:"Aïcha",duration:"4:20"}]});
  assert.equal(tracks.length,1);
});

test("the same seed selects the same piece; one album can offer different tracks", () => {
  const first=pickReleaseTrack(compilation,17);
  assert.deepEqual(first,pickReleaseTrack(compilation,17));
  assert.equal(first.eligibleCount,3);
  const variants=new Set(Array.from({length:20},(_,seed)=>pickReleaseTrack(compilation,seed).track?.title));
  assert.ok(variants.size>1);
});

test("empty tracklist is not presented as an authenticated song", () => {
  assert.deepEqual(pickReleaseTrack({id:22,title:"Mystery LP",artists:[{name:"Abdul"}]},3),{track:null,eligibleCount:0});
});
