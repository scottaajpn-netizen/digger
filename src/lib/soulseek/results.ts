export interface SoulseekResult { username: string; filename: string; format: string; size: number; bitRate?: number; uploadSpeed?: number; freeUploadSlot?: boolean; queueLength?: number }
const record = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const number = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : undefined;
export function parseSearch(raw: unknown) {
  const state = record(raw);
  const responses = Array.isArray(raw) ? raw : Array.isArray(state.responses) ? state.responses : [];
  const results: SoulseekResult[] = [];
  const seen = new Set<string>();
  for (const item of responses) {
    const row = record(item);
    if (typeof row.username !== "string" || !Array.isArray(row.files)) continue;
    for (const item of row.files) {
      const file = record(item);
      if (typeof file.filename !== "string" || file.isLocked === true) continue;
      const format = file.filename.match(/\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff?)$/i)?.[1].toUpperCase();
      const size = number(file.size);
      if (!format || size === undefined || size === 0) continue;
      const key = JSON.stringify([row.username, file.filename]);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ username: row.username, filename: file.filename, format, size,
        bitRate: number(file.bitRate), uploadSpeed: number(row.uploadSpeed), queueLength: number(row.queueLength),
        freeUploadSlot: typeof row.hasFreeUploadSlot === "boolean" ? row.hasFreeUploadSlot : undefined });
    }
  }
  results.sort((a,b) => Number(b.freeUploadSlot === true) - Number(a.freeUploadSlot === true) || (a.queueLength ?? Infinity) - (b.queueLength ?? Infinity) || (b.uploadSpeed || 0) - (a.uploadSpeed || 0));
  const label = typeof state.state === "string" ? state.state : "Unknown";
  return { id: typeof state.id === "string" ? state.id : undefined, state: label,
    complete: state.isComplete === true || /(?:Completed|Cancelled|Canceled|Errored|Failed)/i.test(label),
    cancelled: /cancel/i.test(label), failed: /error|failed/i.test(label),
    responseCount: number(state.responseCount) ?? responses.length, fileCount: number(state.fileCount) ?? results.length,
    results: results.slice(0, 100), totalAudio: results.length };
}
