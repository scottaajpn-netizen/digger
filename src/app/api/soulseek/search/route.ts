import { SlskdError, slskdRequest, validSearchId } from "../../../../lib/soulseek/client";
import { parseSearch } from "../../../../lib/soulseek/results";
export const maxDuration = 15;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failure = (error: unknown) => json({ error: error instanceof SlskdError ? error.message : "Réponse slskd invalide ou indisponible." }, error instanceof SlskdError ? error.status : 503);
function idFrom(request: Request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!validSearchId(id)) throw new SlskdError("Identifiant de recherche invalide.", 400);
  return id;
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!artist || !title || artist.length > 160 || title.length > 160) return json({ error: "Morceau ou artiste invalide." }, 400);
    const id = crypto.randomUUID();
    // Let the installed slskd version use its native inactivity timeout.
    // Do not confuse it with the separate 60-second UI budget.
    const response = await slskdRequest("/searches", { method: "POST", body: JSON.stringify({ id, searchText: `${artist} ${title}`,
      fileLimit: 2500, responseLimit: 120, filterResponses: true }), signal: request.signal });
    const state = parseSearch(await response.json());
    if (!state.id || !validSearchId(state.id)) throw new SlskdError("slskd n’a pas retourné d’identifiant de recherche valide.");
    return json(state, 202);
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try {
    const id = idFrom(request);
    const response = await slskdRequest(`/searches/${id}?includeResponses=true`, { signal: request.signal });
    const state = parseSearch(await response.json());
    // Finished counters may precede persistence. Retry on the next client poll.
    return json({ ...state, ready: state.complete && (state.fileCount === 0 || state.results.length > 0 || state.responseCount === 0), id });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    await slskdRequest(`/searches/${idFrom(request)}`, { method: "PUT", signal: request.signal });
    return json({ cancelled: true });
  } catch (error) { return failure(error); }
}
