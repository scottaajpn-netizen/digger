export class SlskdError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function validSearchId(id: string) { return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id); }
export async function slskdRequest(path: string, init: RequestInit = {}) {
  const key = process.env.SLSKD_API_KEY;
  if (!key) throw new SlskdError("Soulseek n’est pas configuré : SLSKD_API_KEY manquante.");
  const base = (process.env.SLSKD_URL || "http://127.0.0.1:5030").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/api/v0${path}`, { ...init, headers: { "X-API-Key": key, "Content-Type": "application/json" },
      signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(5000)]), cache: "no-store", redirect: "error" });
  } catch { throw new SlskdError("slskd ne répond pas. Vérifie qu’il est démarré."); }
  if (!response.ok && response.status !== 304) throw new SlskdError(response.status === 401 || response.status === 403
    ? "slskd refuse la clé API ou ses permissions." : response.status === 404 ? "Cette recherche n’existe plus dans slskd. Relance-la."
    : response.status === 429 ? "slskd est occupé. Patiente puis réessaie." : `Erreur slskd (${response.status}).`, response.status === 404 ? 404 : 503);
  return response;
}
