import test from "node:test";
import assert from "node:assert/strict";
import { matchTrackToAudio } from "../src/lib/crate/audio-match";
import type { DiscogsTrackPick } from "../src/lib/crate/tracklist";

const song: DiscogsTrackPick = {
  id: "discogs-track:77:1", releaseId:77, position:"A1",
  title:"Sunlit Drum Break", artist:"Orquestra Sol", durationSource:"discogs", durationSeconds:225,
};

test("select correct song with verified duration and uploader identity",()=>{
  const result=matchTrackToAudio(song,[
    {id:"clean",title:"Sunlit Drum Break",uploader:"Orquestra Sol - Topic",durationSeconds:224,viewCount:2200},
    {id:"wrong",title:"Orquestra Sol - Another Tune",uploader:"Orquestra Sol",durationSeconds:230},
    {id:"comp",title:"Orquestra Sol - Sunlit Drum Break (Full Album)",durationSeconds:2480},
    {id:"ai",title:"Orquestra Sol - Sunlit Drum Break (AI Generated)",durationSeconds:224},
    {id:"remix",title:"Orquestra Sol - Sunlit Drum Break Remix",durationSeconds:230},
    {id:"unknown",title:"Sunlit Drum Break",uploader:"Unrelated Uploader",durationSeconds:225},
  ]);
  assert.deepEqual(result.matches.map(m=>m.candidate.id),["clean"]);
  assert.ok(result.rejected.find(r=>r.candidateId==="wrong")?.reasons.includes("wrong-title"));
  assert.ok(result.rejected.find(r=>r.candidateId==="comp")?.reasons.includes("too-long"));
  assert.ok(result.rejected.find(r=>r.candidateId==="ai")?.reasons.includes("ai-labeled"));
  assert.ok(result.rejected.find(r=>r.candidateId==="remix")?.reasons.includes("different-version"));
  assert.ok(result.rejected.find(r=>r.candidateId==="unknown")?.reasons.includes("unverified-artist"));
});

test("accept versions matching explicit original-track descriptor",()=>{
  const instrumental = {...song,title:"Sunlit Drum Break (Instrumental)"};
  const result=matchTrackToAudio(instrumental,[
    {id:"instrumental",title:"Orquestra Sol - Sunlit Drum Break (Instrumental)",durationSeconds:220},
    {id:"other",title:"Orquestra Sol - Sunlit Drum Break (Live at Home)",durationSeconds:220},
  ]);
  assert.deepEqual(result.matches.map(m=>m.candidate.id),["instrumental"]);
});

test("preserve unknown views unless maximum view filter is on",()=>{
  const c=[{id:"x",title:"Orquestra Sol - Sunlit Drum Break",durationSeconds:225}];
  assert.equal(matchTrackToAudio(song,c).matches.length,1);
  assert.deepEqual(matchTrackToAudio(song,c,{maxViews:1000}).matches,[]);
  assert.ok(matchTrackToAudio(song,c,{maxViews:1000}).rejected[0].reasons.includes("missing-views"));
});

test("not every match is playable: matching only checks metadata",()=>{
  const matches=matchTrackToAudio(song,[{id:"youtubeid",title:"Orquestra Sol - Sunlit Drum Break",durationSeconds:220}]);
  assert.equal(matches.matches.length,1);
  assert.equal("audioUrl" in matches.matches[0].candidate,false);
});
