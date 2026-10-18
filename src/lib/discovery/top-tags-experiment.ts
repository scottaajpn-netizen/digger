import { LastFmApiError, lastFmJson } from "../providers/http";
import { normalized } from "./ranking";

type Target = { artist: string; title: string; status: string; tags: string[]; existingTags: string[] };
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Benchmark only: getInfo has already passed recording/artist identity guards.
 * getTopTags must additionally return the exact artist/title, including versions.
 * This measures metadata only; it never mutates candidates or invokes ranking.
 */
export async function compareTopTags(targets: Target[], signal: AbortSignal) {
  if (targets.length > 5) throw new Error("Five targets maximum");
  if (targets.some(t => !["no-tags", "enriched"].includes(t.status)))
    throw new Error("A previously identity-verified getInfo result is required");
  if (new Set(targets.map(t => normalized(t.artist) + "\0" + normalized(t.title))).size !== targets.length)
    throw new Error("Duplicate targets");
  let requests = 0, cacheHits = 0;
  const outcomes = [];
  for (const target of targets) {
    signal.throwIfAborted();
    let response: unknown;
    let status = "unusable-data", apiCode: number | undefined;
    let rawTagCount = 0, invalidTagCount = 0;
    let tags: string[] = [];
    let returnedIdentity: { artist: unknown; track: unknown } | undefined;
    try {
      response = await lastFmJson<unknown>("track.getTopTags", {
        artist: target.artist, track: target.title, autocorrect: "0",
      }, signal, event => { if (event === "request") requests++; else cacheHits++; }, { retry: false });
      const top = object(object(response)?.toptags);
      const attr = object(top?.["@attr"]);
      returnedIdentity = attr ? { artist: attr.artist, track: attr.track } : undefined;
      const identity = typeof attr?.artist === "string" && typeof attr.track === "string" &&
        normalized(attr.artist) === normalized(target.artist) && normalized(attr.track) === normalized(target.title);
      if (response === null) status = "unavailable";
      else if (top && Array.isArray(top.tag)) {
        rawTagCount = top.tag.length;
        const valid = top.tag.flatMap(item => {
          const row = object(item);
          const name = typeof row?.name === "string" ? row.name.trim() : "";
          const count = typeof row?.count === "string" || typeof row?.count === "number" ? Number(row.count) : NaN;
          if (!name || !Number.isFinite(count) || count <= 0) { invalidTagCount++; return []; }
          return [name];
        });
        if (!identity) status = "identity-rejected";
        else {
          const seen = new Set<string>();
          tags = valid.filter(tag => { const key = normalized(tag); if (seen.has(key)) return false; seen.add(key); return true; });
          status = tags.length ? "tags" : rawTagCount ? "unusable-data" : "no-tags";
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      apiCode = error instanceof LastFmApiError ? error.apiCode : undefined;
      // Code 6 alone means invalid parameters, not necessarily a missing track.
      status = error instanceof LastFmApiError && apiCode === 6 && /track.*not found/i.test(error.message)
        ? "track-not-found" : error instanceof LastFmApiError ? "api-error" : "provider-error";
    }
    const existing = new Set(target.existingTags.map(normalized));
    outcomes.push({ artist: target.artist, title: target.title, getInfoTagCount: target.tags.length,
      status, apiCode, returnedIdentity, rawTagCount, invalidTagCount, usableTagCount: tags.length, tags,
      existingTags: target.existingTags, additionalTags: tags.filter(tag => !existing.has(normalized(tag))),
      // Preserve the successful payload for offline inspection; never save request URLs/API keys.
      response });
  }
  return { requests, cacheHits, enriched: outcomes.filter(o => o.tags.length).length, outcomes };
}
