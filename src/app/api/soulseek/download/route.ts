import { SlskdError, slskdRequest, validSearchId } from "../../../../lib/soulseek/client";
import { parseSearch } from "../../../../lib/soulseek/results";
export const maxDuration = 15;
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
      return Response.json({error:"Origine non autorisée."},{status:403});
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string" || !validSearchId(body.id) || typeof body.username !== "string" || typeof body.filename !== "string")
      return Response.json({error:"Sélection invalide."},{status:400});
    const state = parseSearch(await (await slskdRequest(`/searches/${body.id}?includeResponses=true`, {signal:request.signal})).json());
    const selected = state.results.find(file => file.username === body.username && file.filename === body.filename);
    if (!selected) return Response.json({error:"Ce fichier ne figure plus parmi les résultats accessibles. Relance la recherche."},{status:409});
    const config = await (await slskdRequest("/options", {signal:request.signal})).json();
    const destination = String(config?.directories?.downloads || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    if (destination !== "c:\\music\\00_inbox") return Response.json({error:"Le dossier de téléchargement slskd doit être C:\\MUSIC\\00_INBOX avant de télécharger depuis Digger."},{status:409});
    const queued = await slskdRequest(`/transfers/downloads/${encodeURIComponent(selected.username)}`, {
      method:"POST", body:JSON.stringify([{filename:selected.filename,size:selected.size}]), signal:request.signal });
    const data = await queued.json().catch(() => null);
    if (data && Array.isArray(data.failed) && data.failed.length && !(Array.isArray(data.enqueued) && data.enqueued.length))
      throw new SlskdError("slskd n’a pas pu mettre ce fichier en téléchargement. Choisis une autre source.");
    return Response.json({queued:true,message:"Demande transmise à slskd. Suis le transfert dans slskd ; les fichiers terminés arrivent dans 00_INBOX."},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return Response.json({error:error instanceof SlskdError ? error.message : "Téléchargement non confirmé. Vérifie slskd avant de réessayer."},{status:error instanceof SlskdError ? error.status : 503});
  }
}
