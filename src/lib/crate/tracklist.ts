/**
 * Turn a Discogs release (which may be an album or compilation) into individual
 * recorded pieces. Metadata only: a tracklist is not evidence that audio plays.
 */
export interface DiscogsArtistCredit { name?: string; join?: string }
export interface DiscogsTrackEntry {
  title?: string;
  position?: string;
  duration?: string;
  type_?: string;
  artists?: DiscogsArtistCredit[];
  sub_tracks?: DiscogsTrackEntry[];
}
export interface DiscogsReleaseDetail {
  id: number;
  title?: string;
  artists?: DiscogsArtistCredit[];
  tracklist?: DiscogsTrackEntry[];
  year?: number;
  country?: string;
}

export interface DiscogsTrackPick {
  id: string;
  releaseId: number;
  position: string;
  title: string;
  artist: string;
  durationSeconds?: number;
  durationSource: "discogs" | "unknown";
  releaseTitle?: string;
  year?: number;
  country?: string;
}

const bannedTitles = [
  /\bAI[ -]generated\b/i,
  /\bAI[ -](?:music|song|cover|voice|vocals?)\b/i,
  /\b(?:suno|udio)[ -](?:ai|generated|creation|track)\b/i,
  /\b(?:full|complete|entire)\s+album\b/i,
  /\b(?:full|complete)\s+(?:mixtape|playlist)\b/i,
  /\bcompilation\b/i,
  /\b(?:dj\s+set|nonstop\s+mix|continuous\s+mix|mega\s*mix)\b/i,
  /\b(?:best\s+of|greatest\s+hits)\b/i,
];
const unusableTitle = /^(?:untitled|unknown|no\s+audio|silence|intro|outro|interlude|skit)(?:\s*\d+)?$/i;
const normalize = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const credits = (artists?: DiscogsArtistCredit[]) => (artists || [])
  .map(a => (a.name || "").trim() + (a.join || ""))
  .join("").trim();

export function parseDiscogsDuration(input: string | undefined): number | undefined {
  if (!input || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(input)) return undefined;
  const numbers = input.split(":").map(Number);
  if (numbers.some(n => !Number.isInteger(n))) return undefined;
  if (numbers.length === 2) {
    if (numbers[1] >= 60) return undefined;
    return numbers[0] * 60 + numbers[1];
  }
  if (numbers[1] >= 60 || numbers[2] >= 60) return undefined;
  return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
}

function flatten(entries: DiscogsTrackEntry[], depth = 0): DiscogsTrackEntry[] {
  if (depth > 4) return [];
  const result: DiscogsTrackEntry[] = [];
  for (const entry of entries) {
    const children = Array.isArray(entry.sub_tracks) ? entry.sub_tracks : [];
    if (children.length) {
      result.push(...flatten(children, depth + 1));
      continue;
    }
    // Headings and index placeholders are not tracks.
    if (entry.type_ && entry.type_ !== "track") continue;
    result.push(entry);
  }
  return result;
}

export function extractReleaseTracks(
  release: DiscogsReleaseDetail,
  options: { minDuration?: number; maxDuration?: number } = {},
): DiscogsTrackPick[] {
  if (!Number.isSafeInteger(release.id) || release.id <= 0) return [];
  const min = options.minDuration ?? 60;
  const max = options.maxDuration ?? 600;
  const defaultArtist = credits(release.artists);
  const result: DiscogsTrackPick[] = [];
  const seen = new Set<string>();

  for (const [i, track] of flatten(release.tracklist || []).entries()) {
    const title = (track.title || "").trim();
    if (!title || unusableTitle.test(title) || bannedTitles.some(p => p.test(title))) continue;
    const artist = credits(track.artists) || defaultArtist;
    // Various is fine on a compilation release, but not as a recording's actual artist.
    if (!artist || /^(?:various|various artists|unknown artist)$/i.test(artist)) continue;
    const durationSeconds = parseDiscogsDuration(track.duration);
    // Only enforce bounds when tracklist actually has a trustworthy numeric duration.
    if (durationSeconds !== undefined && (durationSeconds < min || durationSeconds > max)) continue;
    const key = normalize(artist) + "|" + normalize(title);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `discogs-track:${release.id}:${i}`,
      releaseId: release.id,
      position: (track.position || "").trim(),
      title,
      artist,
      durationSeconds,
      durationSource: durationSeconds === undefined ? "unknown" : "discogs",
      releaseTitle: release.title,
      year: Number.isSafeInteger(release.year) && release.year! > 0 ? release.year : undefined,
      country: release.country,
    });
  }
  return result;
}

/** Deterministically pick one track, varying by seed rather than always playing side A1. */
export function pickReleaseTrack(
  release: DiscogsReleaseDetail,
  seed = 0,
): { track: DiscogsTrackPick | null; eligibleCount: number } {
  const tracks = extractReleaseTracks(release);
  if (!tracks.length) return { track: null, eligibleCount: 0 };
  // A simple deterministic multiplicative hash to distribute selections.
  let hash = ((seed >>> 0) ^ Math.imul(release.id, 2654435761)) >>> 0;
  hash ^= hash >>> 16;
  return { track: tracks[hash % tracks.length], eligibleCount: tracks.length };
}
