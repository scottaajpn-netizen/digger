import type { AudioCandidate, AudioQualityPolicy, AudioRejectReason } from "./audio-quality";
import { inspectAudioCandidate } from "./audio-quality";
import type { DiscogsTrackPick } from "./tracklist";

export type TrackAudioRejection =
  | AudioRejectReason | "wrong-title" | "unverified-artist" | "different-version";

export interface RankedAudioMatch {
  candidate: AudioCandidate;
  score: number;
}

export interface AudioMatchResult {
  matches: RankedAudioMatch[];
  rejected: { candidateId: string; reasons: TrackAudioRejection[] }[];
}

const normalize = (value: string) => value.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu," ")
  .replace(/\s+/g," ")
  .trim();

const containsPhrase = (haystack: string, needle: string) =>
  needle.length > 0 && (` ${haystack} `).includes(` ${needle} `);

const divergentVersions = [
  /\bremix\b/i,
  /\bcover\b/i,
  /\bkaraoke\b/i,
  /\b(?:sped\s*up|slowed\s*down)\b/i,
  /\b(?:live\s+(?:at|in|version|performance)|concert)\b/i,
  /\binstrumental\b/i,
];

function differentVersion(songTitle: string, videoTitle: string): boolean {
  return divergentVersions.some(pattern => pattern.test(videoTitle) && !pattern.test(songTitle));
}

/**
 * Precision-first matcher: known media duration + source-aware song title + artist.
 * Useful for ranking future provider metadata, but *never* proves an audio URL is playable.
 */
export function matchTrackToAudio(
  song: DiscogsTrackPick,
  candidates: AudioCandidate[],
  policy: AudioQualityPolicy = {},
): AudioMatchResult {
  const matches: RankedAudioMatch[] = [];
  const rejected: AudioMatchResult["rejected"] = [];
  const seen = new Set<string>();
  const songTitle = normalize(song.title);
  const artist = normalize(song.artist);

  for (const candidate of candidates) {
    if (!candidate.id || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const reasons: TrackAudioRejection[] = [
      ...inspectAudioCandidate(candidate, policy).reasons,
    ];
    const candidateTitle = normalize(candidate.title || "");
    const uploader = normalize(candidate.uploader || "");
    if (!containsPhrase(candidateTitle, songTitle)) reasons.push("wrong-title");
    if (!containsPhrase(candidateTitle, artist) && !containsPhrase(uploader, artist))
      reasons.push("unverified-artist");
    if (differentVersion(song.title, candidate.title || "")) reasons.push("different-version");

    if (reasons.length) {
      rejected.push({candidateId:candidate.id,reasons});
      continue;
    }
    const score = 10
      + (candidateTitle === songTitle ? 4 : 0)
      + (containsPhrase(candidateTitle, artist) ? 3 : 0)
      + (uploader.endsWith(" topic") ? 2 : 0);
    matches.push({candidate,score});
  }
  matches.sort((a,b)=>b.score-a.score || a.candidate.id.localeCompare(b.candidate.id));
  return {matches,rejected};
}
