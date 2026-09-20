import { suggest } from "@/lib/search/service";
export const maxDuration=30;
export async function GET(request:Request) {
  const q=new URL(request.url).searchParams.get("q")||"";
  if(q.length>160)return Response.json({error:"Recherche trop longue."},{status:400});
  try {return Response.json(await suggest(q,AbortSignal.any([request.signal,AbortSignal.timeout(17000)])),{headers:{"Cache-Control":"no-store"}});}
  catch {return Response.json({error:"La recherche est temporairement indisponible. Réessaie."},{status:request.signal.aborted?499:503});}
}
