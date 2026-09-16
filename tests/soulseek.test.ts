import test from "node:test";
import assert from "node:assert/strict";
import { parseSearch } from "../src/lib/soulseek/results";
import { POST, GET, PUT } from "../src/app/api/soulseek/search/route";
const id = "ee5b7c8d-be32-4d41-8dc4-be55a7827ff4";
const response = { username: "fixture-peer", hasFreeUploadSlot: true, uploadSpeed: 2673960, queueLength: 0,
  files: [{ filename: "music\\You Man\\Restless\\01 Birdcage.mp3", size: 13800377, bitRate: 320, isLocked: false }] };
test("slskd parses real response shape, bitrate in kbps, availability and duplicates", () => {
  const result = parseSearch({ isComplete: true, state: "Completed, TimedOut", responses: [response, response] });
  assert.equal(result.complete, true); assert.equal(result.results.length, 1);
  assert.equal(result.results[0].bitRate, 320); assert.equal(result.results[0].format, "MP3");
  assert.equal(result.results[0].queueLength, 0); assert.equal(result.results[0].uploadSpeed, 2673960);
});
test("slskd ignores malformed/non-audio/locked files without inventing an available slot", () => {
  const d = parseSearch([{ username: "peer", files: [null, {filename:"cover.jpg",size:30}, {filename:"locked.flac",size:50,isLocked:true}, {filename:"ok.opus",size:50}] }]);
  assert.equal(d.results.length, 1); assert.equal(d.results[0].freeUploadSlot, undefined);
  assert.equal(parseSearch(null).complete, false);
});
test("slskd uses the installed timeout default and returns immediately, without deleting it", async t => {
  const old = process.env.SLSKD_API_KEY; process.env.SLSKD_API_KEY = "test-secret";
  t.after(() => { if(old === undefined) delete process.env.SLSKD_API_KEY; else process.env.SLSKD_API_KEY = old; });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(url.endsWith("/searches")); assert.equal(init.method,"POST");
    const body = JSON.parse(init.body as string); assert.equal(body.searchTimeout,undefined); assert.equal(body.searchText,"You Man Birdcage");
    assert.equal(body.maximumPeerQueueLength,undefined);
    return Response.json({id, state:"InProgress", isComplete:false, responses:[],fileCount:0});
  });
  const r = await POST(new Request("http://localhost/api/soulseek/search", {method:"POST",body:JSON.stringify({artist:"You Man",title:"Birdcage"})}));
  assert.equal(r.status,202); assert.equal((await r.json()).id,id);
});
test("slskd polling does not confuse pending empty responses with no results", async t => {
  const old=process.env.SLSKD_API_KEY;process.env.SLSKD_API_KEY="fixture";
  t.after(()=>{if(old===undefined)delete process.env.SLSKD_API_KEY;else process.env.SLSKD_API_KEY=old;});
  let complete=false;
  t.mock.method(globalThis,"fetch",async(url:string)=>{assert.ok(url.endsWith("?includeResponses=true"));return Response.json({id,isComplete:complete,state:complete?"Completed, TimedOut":"InProgress",fileCount:71,responseCount:34,responses:complete?[response]:[]});});
  const req=()=>new Request(`http://localhost/api/soulseek/search?id=${id}`);
  assert.equal((await (await GET(req())).json()).ready,false);
  complete=true;const done=await (await GET(req())).json();assert.equal(done.ready,true);assert.equal(done.results.length,1);
});
test("slskd cancellation uses PUT, never DELETE or transfers", async t=>{
  const old=process.env.SLSKD_API_KEY;process.env.SLSKD_API_KEY="fixture";
  t.after(()=>{if(old===undefined)delete process.env.SLSKD_API_KEY;else process.env.SLSKD_API_KEY=old;});
  t.mock.method(globalThis,"fetch",async(url:string,init:RequestInit)=>{assert.ok(url.endsWith(`/searches/${id}`));assert.equal(init.method,"PUT");return new Response(null,{status:200});});
  assert.equal((await PUT(new Request(`http://localhost/api/soulseek/search?id=${id}`,{method:"PUT"}))).status,200);
  assert.equal((await GET(new Request("http://localhost/api/soulseek/search?id=../../transfers"))).status,400);
});
test("slskd upstream errors are explicit and never reflect secrets or raw bodies",async t=>{
  const old=process.env.SLSKD_API_KEY;process.env.SLSKD_API_KEY="fixture-secret";
  t.after(()=>{if(old===undefined)delete process.env.SLSKD_API_KEY;else process.env.SLSKD_API_KEY=old;});
  t.mock.method(globalThis,"fetch",async()=>new Response("fixture-secret",{status:401}));
  const r=await GET(new Request(`http://localhost/api/soulseek/search?id=${id}`));assert.equal(r.status,503);assert.ok(!(await r.text()).includes("fixture-secret"));
});

// Transfers are mocked: verification never downloads a music file.
test("manual download checks search membership and inbox before queuing server-verified size", async t => {
  const { POST: download } = await import("../src/app/api/soulseek/download/route");
  const old=process.env.SLSKD_API_KEY;process.env.SLSKD_API_KEY="fixture";
  t.after(()=>{if(old===undefined)delete process.env.SLSKD_API_KEY;else process.env.SLSKD_API_KEY=old;});
  let destination="C:\\MUSIC\\00_INBOX", sends=0;
  t.mock.method(globalThis,"fetch",async(url:string,init:RequestInit)=>{
    if(url.endsWith("?includeResponses=true"))return Response.json({id,isComplete:true,responses:[response]});
    if(url.endsWith("/options"))return Response.json({directories:{downloads:destination}});
    assert.ok(url.endsWith("/transfers/downloads/fixture-peer"));assert.equal(init.method,"POST");
    assert.deepEqual(JSON.parse(init.body as string),[{filename:response.files[0].filename,size:13800377}]);
    sends++;return Response.json({enqueued:[{id:"transfer"}],failed:[]},{status:201});
  });
  const req=(filename=response.files[0].filename)=>new Request("http://localhost/api/soulseek/download",{method:"POST",body:JSON.stringify({id,username:"fixture-peer",filename,size:1})});
  assert.equal((await download(req("unexpected.mp3"))).status,409);assert.equal(sends,0);
  destination="C:\\OTHER";assert.equal((await download(req())).status,409);assert.equal(sends,0);
  destination="C:\\MUSIC\\00_INBOX";assert.equal((await download(req())).status,200);assert.equal(sends,1);
});
