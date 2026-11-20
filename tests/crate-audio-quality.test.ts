import test from "node:test";
import assert from "node:assert/strict";
import { inspectAudioCandidate, selectPlayableCandidates } from "../src/lib/crate/audio-quality";

test("accept ordinary full tracks with known duration", () => {
  const result = inspectAudioCandidate({ id: "1", title: "Soulful Groove (Extended Mix)", uploader: "Archive Records", durationSeconds: 388, viewCount: 478 });
  assert.deepEqual(result, { accepted: true, reasons: [] });
});

test("reject forty-minute compilations and albums", () => {
  const result = inspectAudioCandidate({ id: "2", title: "Rare Funk - Full Album (1975)", durationSeconds: 2400 });
  assert.equal(result.accepted, false);
  assert.deepEqual(result.reasons, ["too-long", "compilation"]);
});

test("reject AI labels with explicit signals but not legitimate words containing ai", () => {
  assert.deepEqual(
    inspectAudioCandidate({id:"3", title:"Deep Soul (AI Generated Music)", durationSeconds:175}).reasons,
    ["ai-labeled"],
  );
  assert.deepEqual(
    inspectAudioCandidate({id:"4", title:"Lost Soul", description:"Created with Suno AI", durationSeconds:200}).reasons,
    ["ai-labeled"],
  );
  assert.equal(
    inspectAudioCandidate({id:"5", title:"Aïcha", artist:"Khaled", durationSeconds:240}).accepted,
    true,
  );
  assert.equal(
    inspectAudioCandidate({id:"6", title:"Bossa Nova (1980 Original Mix)", durationSeconds:240}).accepted,
    true,
  );
});

test("unknown duration is not silently treated as a full song", () => {
  assert.deepEqual(inspectAudioCandidate({id:"6", title:"Deep Grooves"}).reasons,["missing-duration"]);
});

test("views filter needs actual views, and remains independent of AI filter", () => {
  assert.deepEqual(
    inspectAudioCandidate({id:"7", title:"Jazzy Break", durationSeconds:200}, {maxViews:5000}).reasons,
    ["missing-views"],
  );
  assert.deepEqual(
    inspectAudioCandidate({id:"8", title:"Jazzy Break", durationSeconds:200,viewCount:10000},{maxViews:5000}).reasons,
    ["too-popular"],
  );
});

test("SURPRISE-like discovery must still exclude problematic audio", () => {
  const c = [
    {id:"a",title:"Authentic Jazz",durationSeconds:220},
    {id:"b",title:"AI generated jazz",durationSeconds:245},
    {id:"c",title:"Best of Rare Soul Compilation",durationSeconds:3300},
  ];
  const result = selectPlayableCandidates(c);
  assert.deepEqual(result.accepted.map(x=>x.id),["a"]);
  assert.equal(result.rejected.length,2);
});

test("accept slightly longer instrumental tracks when configured", () => {
  const longer = {id:"a", title:"Live Jazz Quartet",durationSeconds:660};
  assert.deepEqual(inspectAudioCandidate(longer).reasons,["too-long"]);
  assert.equal(inspectAudioCandidate(longer,{maxDurationSeconds:720}).accepted,true);
  assert.deepEqual(inspectAudioCandidate({...longer,isLive:true},{maxDurationSeconds:720}).reasons,["live-stream"]);
});
