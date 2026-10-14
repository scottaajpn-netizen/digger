import { discoverSamplingVideos, type SamplingFilters } from "@/lib/sampling/youtube";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 12000) {
      return Response.json({ error: "La demande Sampling est trop volumineuse." }, { status: 413 });
    }

    const body = JSON.parse(raw || "{}") as {
      filters?: SamplingFilters;
      excludeIds?: unknown;
    };

    const excludeIds = Array.isArray(body.excludeIds)
      ? body.excludeIds
          .filter((value): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(value))
          .slice(-300)
      : [];

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
    const result = await discoverSamplingVideos(body.filters || {}, excludeIds, signal);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Demande Sampling illisible." }, { status: 400 });
    }

    if (error instanceof Error && error.name === "YouTubeConfigError") {
      return Response.json(
        {
          error: "Le mode Sampling a besoin d’une clé YouTube Data API dans YOUTUBE_API_KEY.",
          code: "YOUTUBE_KEY_MISSING",
        },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json({ error: "YouTube met trop de temps à répondre. Réessaie." }, { status: 504 });
    }

    console.error("Sampling discovery failure", error);
    return Response.json(
      { error: "Impossible de charger de nouveaux morceaux YouTube pour le moment." },
      { status: 502 },
    );
  }
}
