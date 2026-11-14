import type { Track } from "../types";

const normal = (value: string) => value.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const compact = (value: string) => normal(value).replace(/ /g, "");
const mbid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const recordingId = (track: Track) => track.externalIds?.musicbrainz;

/** Names corroborate a search result; they never establish sonic similarity.
 * Keep full titles (including remix/live qualifiers), and require every credited
 * performer. Never split an arbitrary band name on '&'. */
function compatible(reference: Track, candidate: Track) {
  if (normal(reference.title) !== normal(candidate.title)) return false;
  const leftId = recordingId(reference), rightId = recordingId(candidate);
  if (leftId && rightId && leftId !== rightId) return false;
  if (reference.externalIds?.isrc && candidate.externalIds?.isrc &&
      reference.externalIds.isrc !== candidate.externalIds.isrc) return false;
  if (reference.artistId && candidate.artistId && reference.artistId !== candidate.artistId) return false;
  if (reference.album && candidate.album && normal(reference.album) !== normal(candidate.album)) return false;

  const credits = candidate.credits?.filter(c => c.role === "primary" || c.role === "featured") || [];
  const sameName = compact(reference.artist) === compact(candidate.artist);
  const renderedCredits = credits.map(c => c.name).join(" ");
  const withoutJoinWords = reference.artist.replace(/\b(?:feat(?:uring)?|ft)\.?\s+/gi, " ");
  const sameCredits = credits.length > 1 && credits.every(c => c.source === "musicbrainz" && c.sourceId) &&
    compact(withoutJoinWords) === compact(renderedCredits);
  if (!sameName && !sameCredits) return false;
  // Mia/CARLA-style homonyms need more than an identical spelling.
  if (/^[a-z]{2,5}$/.test(normal(reference.artist)) && leftId !== rightId &&
      !(reference.album && candidate.album && normal(reference.album) === normal(candidate.album)) &&
      !(reference.artistId && reference.artistId === candidate.artistId)) return false;
  return true;
}

/** Reuse a unique, richer result already fetched. No extra network request.
 * Conflicting recording IDs remain separate, including identical artist/title.
 * Only transfer MusicBrainz metadata, not unverified tags or audience counts. */
export function reconcileSearchTracks<T extends Track>(pool: T[]): T[] {
  return pool.map(reference => {
    if (recordingId(reference)) return reference;
    const matches = pool.filter(candidate => mbid.test(recordingId(candidate) || "") &&
      candidate.credits?.some(c => c.source === "musicbrainz" && c.sourceId) && compatible(reference, candidate));
    if (new Set(matches.map(recordingId)).size !== 1) return reference;
    const rich = matches[0];
    return {
      ...reference,
      id: rich.id, artistId: rich.artistId, credits: rich.credits,
      releaseId: rich.releaseId, album: rich.album, country: rich.country,
      year: rich.year, tags: rich.tags, tagEvidence: rich.tagEvidence,
      scene: rich.scene, label: rich.label,
      externalIds: { ...reference.externalIds, ...rich.externalIds },
      // Keep the spelling selected by the user; the recording lookup will load
      // canonical MusicBrainz credits when exploration starts.
      artist: reference.artist,
    };
  });
}

export function searchTrackKey(track: Track) {
  return recordingId(track)
    ? `mb:${recordingId(track)}`
    : `name:${compact(track.artist)}|${compact(track.title)}`;
}
