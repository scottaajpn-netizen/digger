import test from "node:test";
import assert from "node:assert/strict";
import { chooseTrackAndEmbed, getYouTubeVideoId, type ReleaseWithVideos } from "../src/lib/crate/video-preview";

const fixture: ReleaseWithVideos = {
  id:21890,
  title:"Soul International Volume 7",
  artists:[{name:"Various"}],
  tracklist:[
    {type_:"track",position:"A1",title:"Golden Drums",duration:"3:42",artists:[{name:"Luna Band"}]},
    {type_:"track",position:"A2",title:"Deep Water",duration:"5:15",artists:[{name:"Musa Quartet"}]},
  ],
  videos:[
    {uri:"https://www.youtube.com/watch?v=abcdef12345",title:"Luna Band - Golden Drums",duration:224,embed:true},
    {uri:"https://youtu.be/ZZZZZZZZZZZ",title:"Luna Band - Golden Drums (Full Album)",duration:2420,embed:true},
    {uri:"https://www.youtube.com/watch?v=AAAAAAAAAAA",title:"Musa Quartet - Deep Water (AI Generated)",duration:315,embed:true},
    {uri:"https://www.youtube.com/watch?v=BBBBBBBBBBB",title:"Musa Quartet - Deep Water",duration:318,embed:false},
    {uri:"https://www.youtube.com/watch?v=CCCCCCCCCCC",title:"Other Artist - Deep Water",duration:315,embed:true},
  ],
};

test("only accept a narrow exact YouTube video ID from HTTPS trusted hosts",()=>{
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=abcdef12345"),"abcdef12345");
  assert.equal(getYouTubeVideoId("https://youtu.be/abcdef12345"),"abcdef12345");
  assert.equal(getYouTubeVideoId("https://www.youtube-nocookie.com/embed/abcdef12345"),"abcdef12345");
  assert.equal(getYouTubeVideoId("https://youtube.com.evil.example/watch?v=abcdef12345"),null);
  assert.equal(getYouTubeVideoId("http://www.youtube.com/watch?v=abcdef12345"),null);
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=javascript%3A"),null);
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=abcdef12345&list=PLrandom"),"abcdef12345");
});

test("prefer an individual credited track; reject AI-labelled, long compilation, wrong artist or embed-disabled videos",()=>{
  const result=chooseTrackAndEmbed(fixture,11);
  assert.equal(result.track?.title,"Golden Drums");
  assert.equal(result.track?.artist,"Luna Band");
  assert.equal(result.preview?.videoId,"abcdef12345");
  assert.equal(result.preview?.embedUrl,"https://www.youtube.com/embed/abcdef12345");
  assert.equal(result.matchingPairs,1);
});

test("a release with no matching safe preview returns a track but no pretend audio",()=>{
  const result=chooseTrackAndEmbed({...fixture,videos:[
    {uri:"https://www.youtube.com/watch?v=DDDDDDDDDDD",title:"Rare Soul Full Album (45 min)",duration:2700},
    {uri:"https://youtu.be/EEEEEEEEEEE",title:"Musa Quartet - Deep Water",duration:315,embed:false},
  ]},1);
  assert.equal(result.preview,null);
  assert.equal(result.eligibleTracks,2);
  assert.ok(result.track?.title);
});

test("grossly mismatched durations do not become a track preview",()=>{
  const result=chooseTrackAndEmbed({...fixture,videos:[
    {uri:"https://youtu.be/FFFFFFFFFFF",title:"Luna Band - Golden Drums",duration:500,embed:true},
  ]},0);
  assert.equal(result.preview,null);
});

test("never build an embed from malicious, unsupported or missing URL",()=>{
  const result=chooseTrackAndEmbed({...fixture,videos:[
    {uri:"https://youtu.be.evil.example/abcdef12345",title:"Luna Band - Golden Drums",duration:223},
    {uri:"https://example.com/abcdef12345",title:"Luna Band - Golden Drums",duration:223},
  ]},0);
  assert.equal(result.preview,null);
});
