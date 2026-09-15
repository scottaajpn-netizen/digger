export class MusicServiceError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
const cache = new Map<string, { data: unknown; expires: number }>();
let nextMusicBrainzRequest = 0;
const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal.reason); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
  signal.addEventListener("abort", abort, { once: true });
});

// Bounded process cache and a shared 1.1 second spacing for MusicBrainz requests.
// Multi-instance deployments need a shared limiter or a dedicated MusicBrainz mirror.
export async function musicJson<T>(base: "mb" | "lb", path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  const url = new URL(path, base === "mb" ? "https://musicbrainz.org/ws/2/" : "https://api.listenbrainz.org/1/");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (base === "mb") url.searchParams.set("fmt", "json");
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    if (base === "mb") {
      const slot = Math.max(Date.now(), nextMusicBrainzRequest);
      if (slot - Date.now() > 8000) throw new MusicServiceError("Trop de recherches simultanées. Réessaie dans quelques secondes.", 429);
      nextMusicBrainzRequest = slot + 1100;
      await delay(Math.max(0, slot - Date.now()), signal);
    }
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": process.env.MUSICBRAINZ_USER_AGENT || "Digger/0.2 (personal local music discovery)" }, signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), cache: "no-store" });
    } catch {
      throw new MusicServiceError(`${base === "mb" ? "MusicBrainz" : "ListenBrainz"} ne répond pas. Vérifie ta connexion et réessaie.`, 503);
    }
    if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
      const retry = Number(response.headers.get("retry-after"));
      if (base === "mb" && Number.isFinite(retry) && retry > 4) {
        throw new MusicServiceError("MusicBrainz demande de patienter avant une nouvelle requête. Réessaie dans quelques secondes.", 429);
      }
      await delay(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 4000) : 1300 * (attempt + 1), signal);
      continue;
    }
    if (!response.ok) throw new MusicServiceError(`${base === "mb" ? "MusicBrainz" : "ListenBrainz"} est momentanément indisponible (${response.status}). Réessaie.`, 503);
    const data: unknown = await response.json();
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + 60 * 60 * 1000 });
    return data as T;
  }
  throw new MusicServiceError("La source musicale est occupée. Réessaie.", 503);
}


export async function lastFmJson<T>(method: string, params: Record<string, string>, signal: AbortSignal): Promise<T | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const key = url.toString();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;

  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": process.env.MUSICBRAINZ_USER_AGENT || "Digger/0.3 (personal local music discovery)",
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        cache: "no-store",
      });
    } catch {
      throw new MusicServiceError("Last.fm ne répond pas. Les autres sources restent disponibles.", 503);
    }

    if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
      const retry = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retry) && retry > 0 ? Math.min(retry * 1000, 4000) : 1300 * (attempt + 1), signal);
      continue;
    }

    if (!response.ok) throw new MusicServiceError(`Last.fm est momentanément indisponible (${response.status}).`, 503);
    const data = await response.json() as { error?: number; message?: string } & T;
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new MusicServiceError(data.message || "Last.fm a refusé la requête.", 503);
    }

    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + 60 * 60 * 1000 });
    return data as T;
  }

  return null;
}

export { discogsJson } from "./discogs-http";
