import { selectCrate, type CrateRelease, type CrateFilters } from "@/lib/crate/select";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface DiscogsSearch {
  pagination?: { pages?: number };
  results?: {
    id?: number;
    master_id?: number;
    title?: string;
    year?: number;
    country?: string;
    genre?: string[];
    style?: string[];
    uri?: string;
  }[];
}

const cache = new Map<string, { until: number; body: DiscogsSearch }>();
const parseNum = (raw: string | null, min: number, max: number): number | undefined => {
  if (raw === null || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : undefined;
};
const year = (raw: string | null) => parseNum(raw, 1900, 2100);
const safeText = (raw: string | null) => raw?.trim().slice(0, 60) || undefined;

async function discogs(params: URLSearchParams, signal: AbortSignal): Promise<DiscogsSearch> {
  const endpoint = `https://api.discogs.com/database/search?${params.toString()}`;
  const current = cache.get(endpoint);
  if (current && current.until > Date.now()) return current.body;
  const headers: Record<string, string> = {
    Accept: "application/vnd.discogs.v2.discogs+json",
    "User-Agent": "SukottoCrateDigger/0.1 (+https://github.com/scottaajpn-netizen/digger)",
  };
  headers.Authorization = `Discogs token=${process.env.DISCOGS_TOKEN}`;
  const response = await fetch(endpoint, {
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("Jeton Discogs refusé : vérifie sa configuration côté serveur.");
  if (response.status === 429) throw new Error("Discogs limite temporairement les appels. Réessaie plus tard.");
  if (!response.ok) throw new Error(`Discogs ne répond pas correctement (HTTP ${response.status}).`);
  const body = await response.json() as DiscogsSearch;
  if (cache.size > 150) cache.delete(cache.keys().next().value!);
  cache.set(endpoint, { body, until: Date.now() + 15 * 60 * 1000 });
  return body;
}

function fromDiscogs(value: NonNullable<DiscogsSearch["results"]>[number]): CrateRelease | null {
  if (!Number.isSafeInteger(value.id) || !value.title) return null;
  const split = value.title.indexOf(" - ");
  // Skip records without a distinguishable credited artist; don't invent one.
  if (split < 1) return null;
  const artist = value.title.slice(0, split).trim();
  const title = value.title.slice(split + 3).trim();
  if (!artist || !title) return null;
  return {
    id: `discogs:${value.id}`,
    masterId: value.master_id ? String(value.master_id) : undefined,
    artist, title,
    year: Number.isSafeInteger(value.year) && value.year! > 0 ? value.year : undefined,
    country: value.country || undefined,
    genres: Array.isArray(value.genre) ? value.genre : [],
    styles: Array.isArray(value.style) ? value.style : [],
    discogsUrl: value.uri?.startsWith("/") ? `https://www.discogs.com${value.uri}` : undefined,
    // No reliable instrument credits, per-video views or audio stream at this stage.
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.search.length > 4500) return Response.json({ error: "Trop de paramètres." }, { status: 413 });
  // Search API authentication is required. Never put this secret in a browser URL.
  if (!process.env.DISCOGS_TOKEN) {
    return Response.json({ error: "La connexion Discogs n'est pas encore configurée : ajoute DISCOGS_TOKEN côté serveur (jamais dans le navigateur)." }, { status: 503 });
  }
  const params = url.searchParams;
  const surprise = params.get("surprise") === "1";
  const genre = safeText(params.get("genre"));
  const style = safeText(params.get("style"));
  const country = safeText(params.get("country"));
  const yearFrom = year(params.get("from"));
  const yearTo = year(params.get("to"));
  const count = parseNum(params.get("count"), 1, 12) ?? 8;
  const seed = parseNum(params.get("seed"), 0, 2147483647) ?? Math.floor(Math.random() * 2147483647);
  const seenKeys = (params.get("seen") || "").split(",").filter(Boolean).slice(0, 200);

  if (params.has("instrument") || params.has("maxViews")) {
    return Response.json({ error: "Le filtrage par instrument et par vues exige des données enrichies et n'est pas encore disponible en V0.1." }, { status: 422 });
  }
  if ((params.has("from") && yearFrom === undefined) || (params.has("to") && yearTo === undefined)
    || (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo)
    || (params.has("count") && parseNum(params.get("count"), 1, 12) === undefined)
    || (params.has("seed") && parseNum(params.get("seed"), 0, 2147483647) === undefined)) {
    return Response.json({ error: "Années, taille ou graine de sélection invalides." }, { status: 400 });
  }

  const filters: CrateFilters = { genre, style, country, yearFrom, yearTo, count, surprise, seenKeys };
  const discogsParams = new URLSearchParams({ type: "release", per_page: "50", page: "1" });
  if (!surprise) {
    if (genre) discogsParams.set("genre", genre);
    if (style) discogsParams.set("style", style);
    if (country) discogsParams.set("country", country);
    if (yearFrom !== undefined || yearTo !== undefined) {
      discogsParams.set("year", `${yearFrom ?? 1900}-${yearTo ?? 2100}`);
    }
  }
  try {
    const first = await discogs(discogsParams, request.signal);
    const pages = Math.max(1, Math.min(100, Math.floor(first.pagination?.pages ?? 1)));
    // Randomise the Discogs search page, not merely the order of page 1.
    const pickedPage = 1 + (seed % pages);
    let page = first;
    if (pickedPage !== 1) {
      discogsParams.set("page", String(pickedPage));
      page = await discogs(discogsParams, request.signal);
    }
    const releases = (page.results || []).map(fromDiscogs).filter((r): r is CrateRelease => r !== null);
    const selection = selectCrate(releases, filters, seed);
    return Response.json({
      mode: "metadata-only",
      playable: false,
      source: "Discogs",
      seed,
      page: pickedPage,
      ...selection,
      note: "Découverte de disques uniquement. Lecture audio et sampling non intégrés à ce stade.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "La recherche a échoué.";
    return Response.json({ error: message }, { status: message.includes("limite") ? 429 : 503 });
  }
}
