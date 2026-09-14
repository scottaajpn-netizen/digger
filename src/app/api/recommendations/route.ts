import { recommendLive, searchLive, mbidPattern } from "@/lib/providers/live";
import { MusicServiceError } from "@/lib/providers/http";
import { directions, feedbackValues, type DigRequest } from "@/lib/types";
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
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
    if (!body.seedId) {
      const choices = await searchLive(body.seed.trim(), signal);
      if (!choices.length) return Response.json({ error: "Aucun morceau trouvé. Essaie « titre — artiste », en vérifiant l’orthographe." }, { status: 404 });
      return Response.json({ choices });
    }
    return Response.json(await recommendLive({ ...body, seed: body.seed.trim() } as DigRequest, signal));
  } catch (error) {
    if (error instanceof MusicServiceError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Demande illisible." }, { status: 400 });
    console.error("Recommendation failure", error);
    return Response.json({ error: "L’exploration a échoué. Réessaie dans un instant." }, { status: 500 });
  }
}
