import type { SearchResult } from "./matching";

type SearchMessage =
  | { type: "partial" | "done"; value: SearchResult }
  | { type: "error"; error: string };

function isResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SearchResult>;
  return Array.isArray(result.suggestions) && Array.isArray(result.warnings);
}

/**
 * Read newline-delimited JSON snapshots from the search route.
 * TextDecoder and buffering handle frames split across arbitrary UTF-8 chunks.
 */
export async function readSearchStream(
  response: Response,
  onProgress: (value: SearchResult) => void,
  signal?: AbortSignal,
): Promise<SearchResult> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
    throw new Error(typeof error === "string" ? error : "Recherche indisponible.");
  }
  if (!response.body) throw new Error("Le flux de recherche est indisponible.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remaining = "";
  let complete: SearchResult | undefined;

  const frame = (text: string) => {
    if (!text.trim()) return;
    let message: SearchMessage;
    try {
      message = JSON.parse(text) as SearchMessage;
    } catch {
      throw new Error("Réponse de recherche illisible.");
    }
    if (message.type === "error") {
      throw new Error(typeof message.error === "string" ? message.error : "Recherche interrompue.");
    }
    if ((message.type !== "partial" && message.type !== "done") || !isResult(message.value)) {
      throw new Error("Réponse de recherche invalide.");
    }
    signal?.throwIfAborted();
    if (message.type === "partial") onProgress(message.value);
    else complete = message.value;
  };

  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      remaining += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = remaining.indexOf("\n")) !== -1) {
        frame(remaining.slice(0, newline));
        remaining = remaining.slice(newline + 1);
      }
      if (remaining.length > 1_000_000) throw new Error("Réponse de recherche trop volumineuse.");
    }
    remaining += decoder.decode();
    frame(remaining);
    signal?.throwIfAborted();
    if (!complete) throw new Error("La recherche s'est interrompue avant la fin.");
    return complete;
  } finally {
    reader.releaseLock();
  }
}
