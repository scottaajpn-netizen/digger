import type { Track } from "../types";

// An ISRC identifies a recording, not its release. Catalogues can contain
// missing, duplicated or incorrectly reused ISRCs.
export function normalizeIsrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.trim().replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(compact) ? compact : undefined;
}

// Never arbitrarily pick one ISRC from contradictory MusicBrainz metadata.
export function singleVerifiedIsrc(values: unknown): string | undefined {
  if (!Array.isArray(values)) return undefined;
  const ids = [...new Set(values.map(normalizeIsrc).filter((id): id is string => Boolean(id)))];
  return ids.length === 1 ? ids[0] : undefined;
}

// Called after grouping by artist + title: conflicting known ISRCs must
// remain separate; unknown rows remain unverified rather than being assigned
// to either recording. The old text fallback applies otherwise.
export function partitionByRecordingIdentity<T extends Pick<Track, "externalIds">>(
  tracks: readonly T[],
): T[][] {
  if (!tracks.length) return [];
  const ids = new Set(tracks.map(track => normalizeIsrc(track.externalIds?.isrc)).filter((id): id is string => Boolean(id)));
  if (ids.size <= 1) return [[...tracks]];
  const groups = new Map<string, T[]>();
  for (const track of tracks) {
    const isrc = normalizeIsrc(track.externalIds?.isrc);
    const key = isrc ? "isrc:" + isrc : "unverified";
    const group = groups.get(key) || [];
    group.push(track);
    groups.set(key, group);
  }
  return [...groups.values()];
}
