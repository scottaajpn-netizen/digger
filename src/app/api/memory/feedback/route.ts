import { recordDiscoveryFeedback } from "@/lib/discovery/memory";
import {
  directions,
  feedbackValues,
  type Direction,
  type DiscoveryPath,
  type DiscoveryPathEvidence,
  type DiscoveryPathSource,
  type Feedback,
} from "@/lib/types";

const sources: DiscoveryPathSource[] = ["discogs", "lastfm", "listenbrainz", "musicbrainz"];
const evidenceValues: DiscoveryPathEvidence[] = ["editorial", "listening", "catalogue", "tag", "release"];
const nodeKinds = ["track", "artist", "release", "label", "context"] as const;

function isLoopbackOrigin(value: string) {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function parsePath(value: unknown): DiscoveryPath | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (
    !sources.includes(raw.source as DiscoveryPathSource) ||
    !evidenceValues.includes(raw.evidence as DiscoveryPathEvidence) ||
    !Number.isSafeInteger(raw.distance) ||
    Number(raw.distance) < 0 ||
    !Array.isArray(raw.nodes) ||
    raw.nodes.length > 12
  ) return undefined;

  const nodes = raw.nodes.flatMap(node => {
    if (!node || typeof node !== "object") return [];
    const row = node as Record<string, unknown>;
    if (
      !nodeKinds.includes(row.kind as typeof nodeKinds[number]) ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 400 ||
      !sources.includes(row.source as DiscoveryPathSource)
    ) return [];
    return [{
      kind: row.kind as typeof nodeKinds[number],
      name: row.name.trim(),
      source: row.source as DiscoveryPathSource,
      id: typeof row.id === "string" ? row.id.slice(0, 200) : undefined,
      url: typeof row.url === "string" && /^https?:\/\//i.test(row.url) ? row.url.slice(0, 1000) : undefined,
    }];
  });
  if (!nodes.length) return undefined;

  return {
    source: raw.source as DiscoveryPathSource,
    evidence: raw.evidence as DiscoveryPathEvidence,
    nodes,
    distance: Math.min(12, Number(raw.distance)),
  };
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const requestOrigin = new URL(request.url).origin;
    if (
      origin &&
      origin !== requestOrigin &&
      !(isLoopbackOrigin(origin) && isLoopbackOrigin(requestOrigin))
    ) {
      return Response.json({ error: "Origine non autorisée." }, { status: 403 });
    }

    const raw = await request.text();
    if (raw.length > 12000) {
      return Response.json({ error: "Avis trop volumineux." }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (
      !body ||
      typeof body.artist !== "string" ||
      typeof body.title !== "string" ||
      !body.artist.trim() ||
      !body.title.trim() ||
      body.artist.length > 300 ||
      body.title.length > 300 ||
      !directions.includes(body.direction as Direction) ||
      (body.feedback !== null && !feedbackValues.includes(body.feedback as Feedback))
    ) {
      return Response.json({ error: "Avis invalide." }, { status: 400 });
    }

    await recordDiscoveryFeedback(
      {
        artist: body.artist.trim(),
        title: body.title.trim(),
        discoveryPath: parsePath(body.discoveryPath),
      },
      body.feedback as Feedback | null,
      body.direction as Direction,
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Avis illisible." }, { status: 400 });
    }
    console.error("Discovery memory write failure", error);
    return Response.json({ error: "Mémoire locale indisponible." }, { status: 500 });
  }
}
