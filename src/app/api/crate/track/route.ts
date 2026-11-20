import { chooseTrackAndEmbed, type ReleaseWithVideos } from "@/lib/crate/video-preview";

export const maxDuration = 20;
export const dynamic = "force-dynamic";

const cache = new Map<number, { until: number; detail: ReleaseWithVideos }>();
const parseId = (value: string | null) =>
  value && /^[1-9]\d{0,9}$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value) : null;
const parseSeed = (value: string | null) =>
  value && /^\d{1,10}$/.test(value) && Number(value) <= 2147483647
    ? Number(value) : null;

async function getRelease(id: number, signal: AbortSignal): Promise<ReleaseWithVideos> {
  const existing = cache.get(id);
  if (existing && existing.until > Date.now()) return existing.detail;
  const response = await fetch(`https://api.discogs.com/releases/${id}`, {
    headers: {
      Accept: "application/vnd.discogs.v2.discogs+json",
      "User-Agent": "SukottoCrateDigger/0.1 (+https://github.com/scottaajpn-netizen/digger)",
      Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
    },
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
  });
  if (response.status === 404) throw new Error("release-not-found");
  if (response.status === 429) throw new Error("rate-limit");
  if (!response.ok) throw new Error(`Discogs a renvoyé le code ${response.status}.`);
  const detail = await response.json() as ReleaseWithVideos;
  if (!detail || detail.id !== id || !Array.isArray(detail.tracklist))
    throw new Error("invalid-tracklist");
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(id,{detail,until:Date.now()+15*60*1000});
  return detail;
}

/** Lookup one specific recorded piece from the Discogs tracklist, not an LP stream. */
export async function GET(request: Request) {
  if (!process.env.DISCOGS_TOKEN)
    return Response.json({error:"Discogs n'est pas configuré côté serveur."},{status:503});

  const params = new URL(request.url).searchParams;
  const releaseId = parseId(params.get("releaseId"));
  const seed = params.has("seed") ? parseSeed(params.get("seed")) : 0;
  if (!releaseId || seed === null)
    return Response.json({error:"Identifiant de disque ou graine invalide."},{status:400});

  try {
    const detail = await getRelease(releaseId,request.signal);
    const choice = chooseTrackAndEmbed(detail,seed);
    if (!choice.track) return Response.json({
      error:"Aucun morceau individuel exploitable trouvé dans la liste de pistes de ce disque.",
      eligibleCount:0,
    },{status:404});
    return Response.json({
      ...choice,
      mode:"discogs-track-with-optional-youtube-embed",
      embedAvailable:Boolean(choice.preview),
      audioStreamReady:false,
      note:choice.preview
        ? "Vidéo associée au disque sur Discogs et correspondant au morceau. Lecteur intégré YouTube officiel : lecture finale non garantie, aucun flux audio MPC."
        : "Piste Discogs identifiée, sans vidéo correspondante suffisamment fiable. Pas d'audio jouable disponible pour ce morceau.",
    },{headers:{"Cache-Control":"no-store"}});
  } catch(e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "release-not-found") return Response.json({error:"Disque introuvable sur Discogs."},{status:404});
    if (code === "invalid-tracklist") return Response.json({error:"Tracklist indisponible pour ce disque."},{status:422});
    if (code === "rate-limit") return Response.json({error:"Limite Discogs atteinte, réessaie plus tard."},{status:429});
    return Response.json({error:"Impossible de récupérer les pistes du disque."},{status:503});
  }
}
