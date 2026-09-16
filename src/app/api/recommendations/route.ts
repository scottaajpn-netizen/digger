import { recommendLive, mbidPattern } from "@/lib/providers/live";
import { MusicServiceError } from "@/lib/providers/http";
import { directions, feedbackValues, type DigRequest } from "@/lib/types";
import { suggest } from "@/lib/search/service";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 25000) return Response.json({ error: "La demande est trop volumineuse." }, { status: 413 });
    const body = JSON.parse(raw);
    if (!body || typeof body.seed !== "string" || !body.seed.trim() || body.seed.length > 160 || !directions.includes(body.direction) || !Number.isFinite(body.obscurity) || body.obscurity < 0 || body.obscurity > 100 || !Number.isSafeInteger(body.session) || body.session < 0 || !body.feedback || typeof body.feedback !== "object" || Array.isArray(body.feedback) || Object.keys(body.feedback).length > 200 || !Object.values(body.feedback).every(v => feedbackValues.includes(v as typeof feedbackValues[number]))) {
      return Response.json({ error: "Vérifie le morceau et les paramètres de ton exploration." }, { status: 400 });
    }
    if (body.seedId !== undefined && (typeof body.seedId !== "string" || !mbidPattern.test(body.seedId))) return Response.json({ error: "Identifiant de morceau invalide." }, { status: 400 });
    if (body.seedTrack !== undefined && (!body.seedTrack || typeof body.seedTrack !== "object" || typeof body.seedTrack.id !== "string" || typeof body.seedTrack.title !== "string" || typeof body.seedTrack.artist !== "string" || !body.seedTrack.title.trim() || !body.seedTrack.artist.trim() || body.seedTrack.title.length > 300 || body.seedTrack.artist.length > 300)) {
      return Response.json({ error: "Référence de morceau invalide." }, { status: 400 });
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
    if (!body.seedId && !body.seedTrack) {
      const {suggestions: choices} = await suggest(body.seed.trim(), signal);
      if (!choices.length) return Response.json({ error: "Aucun morceau trouvé. Essaie avec quelques mots du titre ou de l’artiste." }, { status: 404 });
      return Response.json({ choices });
    }
    const seedTrack = body.seedTrack ? {
      id: body.seedTrack.id,
      title: body.seedTrack.title.trim(),
      artist: body.seedTrack.artist.trim(),
      scene: typeof body.seedTrack.scene === "string" ? body.seedTrack.scene.slice(0, 160) : undefined,
      label: typeof body.seedTrack.label === "string" ? body.seedTrack.label.slice(0, 160) : undefined,
      tags: Array.isArray(body.seedTrack.tags) ? body.seedTrack.tags.filter((tag: unknown): tag is string => typeof tag === "string").slice(0, 8) : undefined,
      year: Number.isFinite(body.seedTrack.year) ? body.seedTrack.year : undefined,
      artistId: typeof body.seedTrack.artistId === "string" ? body.seedTrack.artistId : undefined,
      releaseId: typeof body.seedTrack.releaseId === "string" ? body.seedTrack.releaseId : undefined,
      country: typeof body.seedTrack.country === "string" ? body.seedTrack.country.slice(0, 100) : undefined,
      album: typeof body.seedTrack.album === "string" ? body.seedTrack.album.slice(0, 300) : undefined,
      externalIds: body.seedTrack.externalIds && typeof body.seedTrack.externalIds === "object" ? {
        musicbrainz: typeof body.seedTrack.externalIds.musicbrainz === "string" ? body.seedTrack.externalIds.musicbrainz : undefined,
        lastfm: typeof body.seedTrack.externalIds.lastfm === "string" ? body.seedTrack.externalIds.lastfm : undefined,
        discogs: typeof body.seedTrack.externalIds.discogs === "string" ? body.seedTrack.externalIds.discogs : undefined,
        listenbrainz: typeof body.seedTrack.externalIds.listenbrainz === "string" ? body.seedTrack.externalIds.listenbrainz : undefined,
      } : undefined,
      credits: Array.isArray(body.seedTrack.credits) ? body.seedTrack.credits.flatMap((credit: unknown) => {
        if (!credit || typeof credit !== "object") return [];
        const row = credit as Record<string, unknown>;
        const role = String(row.role);
        const source = String(row.source);
        if (typeof row.name !== "string" || !row.name.trim() || !["primary","featured","remixer","producer"].includes(role) || !["musicbrainz","discogs","lastfm"].includes(source)) return [];
        return [{
          name: row.name.trim().slice(0, 200),
          role: role as "primary" | "featured" | "remixer" | "producer",
          source: source as "musicbrainz" | "discogs" | "lastfm",
          sourceId: typeof row.sourceId === "string" ? row.sourceId.slice(0, 100) : undefined,
          joinPhrase: typeof row.joinPhrase === "string" ? row.joinPhrase.slice(0, 40) : undefined,
        }];
      }).slice(0, 12) : undefined,
      source: ["musicbrainz", "lastfm", "discogs", "mixed"].includes(body.seedTrack.source) ? body.seedTrack.source : undefined,
    } : undefined;
    return Response.json(await recommendLive({ ...body, seed: body.seed.trim(), seedTrack } as DigRequest, signal));
  } catch (error) {
    if (error instanceof MusicServiceError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Demande illisible." }, { status: 400 });
    console.error("Recommendation failure", error);
    return Response.json({ error: "L’exploration a échoué. Réessaie dans un instant." }, { status: 500 });
  }
}
