import { suggest, providers } from "@/lib/search/service";

export const maxDuration=30;

export async function GET(request:Request) {
  const url=new URL(request.url);
  const q=url.searchParams.get("q")||"";
  if(q.length>160)return Response.json({error:"Recherche trop longue."},{status:400});
  if(url.searchParams.get("stream")!=="1") {
    try {return Response.json(await suggest(q,AbortSignal.any([request.signal,AbortSignal.timeout(17000)])),{headers:{"Cache-Control":"no-store"}});}
    catch {return Response.json({error:"La recherche est temporairement indisponible. Réessaie."},{status:request.signal.aborted?499:503});}
  }

  const encoder=new TextEncoder();
  const cancellation=new AbortController();
  const signal=AbortSignal.any([request.signal,cancellation.signal,AbortSignal.timeout(17000)]);
  let closed=false;
  const stream=new ReadableStream<Uint8Array>({
    start(controller) {
      const send=(message:unknown)=>{
        if(closed||signal.aborted)return;
        try {controller.enqueue(encoder.encode(JSON.stringify(message)+"\n"));}
        catch {closed=true;cancellation.abort();}
      };
      void (async()=>{
        try {
          const result=await suggest(q,signal,providers,value=>send({type:"partial",value}));
          send({type:"done",value:result});
        } catch {
          if(!signal.aborted)send({type:"error",error:"La recherche est temporairement indisponible. Réessaie."});
        } finally {
          if(!closed) {
            closed=true;
            try {controller.close();} catch { /* client disconnected */ }
          }
        }
      })();
    },
    cancel() {
      closed=true;
      cancellation.abort();
    },
  });
  return new Response(stream,{headers:{
    "Content-Type":"application/x-ndjson; charset=utf-8",
    "Cache-Control":"no-store, no-transform",
    "X-Content-Type-Options":"nosniff",
  }});
}
