type SlskdFile = { filename?: string; size?: number; bitRate?: number; bitrate?: number };
type SlskdResponse = { username?: string; hasFreeUploadSlot?: boolean; uploadSpeed?: number; queueLength?: number; files?: SlskdFile[] };

export const maxDuration = 30;

const audioExtensions = /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff?)$/i;

function config() {
  const url = (process.env.SLSKD_URL || "http://127.0.0.1:5030").replace(/\/$/, "");
  const key = process.env.SLSKD_API_KEY;
  if (!key) throw new Error("SLSKD_API_KEY_MISSING");
  return { url, key };
}

async function slskdFetch(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  return fetch(`${url}/api/v0${path}`, {
    ...init,
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const artist = typeof body.artist === "string" ? body.artist.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!artist || !title || artist.length > 160 || title.length > 160) {
      return Response.json({ error: "Morceau ou artiste invalide." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const create = await slskdFetch("/searches", {
      method: "POST",
      body: JSON.stringify({
        id,
        searchText: `${artist} ${title}`,
        searchTimeout: 10000,
        fileLimit: 2500,
        responseLimit: 120,
        filterResponses: true,
        maximumPeerQueueLength: 100,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!create.ok) {
      const detail = await create.text().catch(() => "");
      return Response.json({ error: `slskd refuse la recherche (${create.status}).`, detail: detail.slice(0, 300) }, { status: 502 });
    }

    let finalState: any = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12000) {
      await new Promise(resolve => setTimeout(resolve, 700));
      const stateRequest = await slskdFetch(`/searches/${id}?includeResponses=true`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!stateRequest.ok) break;
      finalState = await stateRequest.json().catch(() => null);
      const label = String(finalState?.state ?? finalState?.status ?? "").toLowerCase();
      const done =
        finalState?.isComplete === true ||
        finalState?.completed === true ||
        ["completed", "complete", "stopped", "cancelled", "failed"].includes(label);
      if (done) break;
    }

    let responses: SlskdResponse[] = Array.isArray(finalState?.responses) ? finalState.responses : [];

    if (responses.length === 0) {
      const responsesRequest = await slskdFetch(`/searches/${id}/responses`, {
        signal: AbortSignal.timeout(5000),
      });
      if (responsesRequest.ok) {
        const raw = await responsesRequest.json().catch(() => null);
        responses = Array.isArray(raw) ? raw : Array.isArray(raw?.responses) ? raw.responses : [];
      }
    }
    const results = responses.flatMap(response =>
      (response.files || [])
        .filter(file => typeof file.filename === "string" && audioExtensions.test(file.filename))
        .map(file => ({
          username: response.username || "inconnu",
          filename: file.filename as string,
          size: Number(file.size) || 0,
          bitRate: Number(file.bitRate ?? file.bitrate) || undefined,
          uploadSpeed: Number(response.uploadSpeed) || undefined,
          freeUploadSlot: Boolean(response.hasFreeUploadSlot),
          queueLength: Number.isFinite(Number(response.queueLength)) ? Number(response.queueLength) : undefined,
        }))
    );

    const needleArtist = artist.toLowerCase();
    const needleTitle = title.toLowerCase();
    results.sort((a, b) => {
      const score = (x: typeof a) => {
        const name = x.filename.toLowerCase();
        let value = 0;
        if (name.includes(needleArtist)) value += 4;
        if (name.includes(needleTitle)) value += 6;
        if (/\.flac$/i.test(name)) value += 3;
        else if (/\.mp3$/i.test(name)) value += 2;
        if (x.freeUploadSlot) value += 2;
        if ((x.queueLength ?? 0) === 0) value += 1;
        return value;
      };
      return score(b) - score(a) || (b.uploadSpeed ?? 0) - (a.uploadSpeed ?? 0);
    });

    await slskdFetch(`/searches/${id}`, { method: "DELETE" }).catch(() => undefined);

    return Response.json({
      query: `${artist} ${title}`,
      results: results.slice(0, 40),
      diagnostics: {
        responseCount: Number(finalState?.responseCount) || responses.length,
        fileCount: Number(finalState?.fileCount) || results.length,
        complete: Boolean(finalState?.isComplete),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SLSKD_API_KEY_MISSING") {
      return Response.json({ error: "Soulseek n’est pas configuré dans Digger. Ajoute SLSKD_API_KEY dans .env.local." }, { status: 503 });
    }
    return Response.json({ error: "Recherche Soulseek temporairement indisponible." }, { status: 503 });
  }
}
