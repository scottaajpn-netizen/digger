/**
 * Only exposes official YouTube embeds explicitly associated with Discogs releases.
 * Does not extract an audio stream, bypass platform playback, or download media.
 * An embeddable video ID is NOT proof that the iframe will actually play in region.
 */
import { matchTrackToAudio } from "./audio-match";
import type { AudioCandidate } from "./audio-quality";
import {
  extractReleaseTracks, type DiscogsReleaseDetail, type DiscogsTrackPick,
} from "./tracklist";

export interface DiscogsVideo {
  uri?: string;
  title?: string;
  description?: string;
  duration?: number;
  embed?: boolean;
}

export interface ReleaseWithVideos extends DiscogsReleaseDetail {
  videos?: DiscogsVideo[];
}

export interface OfficialVideoEmbed {
  provider: "youtube-embed";
  videoId: string;
  embedUrl: string;
  title: string;
  durationSeconds: number;
}

export interface ReleaseAudioChoice {
  track: DiscogsTrackPick | null;
  preview: OfficialVideoEmbed | null;
  matchingPairs: number;
  eligibleTracks: number;
}

const youtubeId = /^[a-zA-Z0-9_-]{11}$/;

export function getYouTubeVideoId(uri: string | undefined): string | null {
  if (!uri || uri.length > 800) return null;
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      id = url.pathname.match(/^\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] || null;
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else id = url.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})\/?$/)?.[1] || null;
    }
    return id && youtubeId.test(id) ? id : null;
  } catch { return null; }
}

function candidateForVideo(video: DiscogsVideo): AudioCandidate | null {
  if (video.embed === false || typeof video.duration !== "number" ||
      !Number.isFinite(video.duration)) return null;
  const id = getYouTubeVideoId(video.uri);
  if (!id || !video.title?.trim()) return null;
  return {
    id,
    title: video.title,
    description: video.description,
    durationSeconds: video.duration,
  };
}

/**
 * Find an individual credited track with a plausible embedded listening source.
 * If there is no close match, return a track with no preview rather than play
 * the full album or a wrongly matched / AI-labelled upload.
 */
export function chooseTrackAndEmbed(
  release: ReleaseWithVideos,
  seed = 0,
): ReleaseAudioChoice {
  const tracks = extractReleaseTracks(release);
  const candidates = (release.videos || []).slice(0, 100)
    .map(candidateForVideo)
    .filter((candidate): candidate is AudioCandidate => candidate !== null);
  const matches: { track: DiscogsTrackPick; video: AudioCandidate; score: number }[] = [];
  for (const track of tracks.slice(0, 150)) {
    for (const match of matchTrackToAudio(track, candidates).matches) {
      // Discogs duration is an optional cross-check, not always known.
      // Reject gross mismatches (e.g. track vs an album mix with a similar title).
      if (track.durationSeconds !== undefined &&
          Math.abs(track.durationSeconds - (match.candidate.durationSeconds || 0)) > 90) continue;
      matches.push({ track, video: match.candidate, score: match.score });
    }
  }
  if (!matches.length) {
    const fallback = tracks.length ? tracks[(seed >>> 0) % tracks.length] : null;
    return { track:fallback, preview:null, matchingPairs:0, eligibleTracks:tracks.length };
  }
  // Prefer highest-confidence match, then rotate between ties using seed.
  matches.sort((a,b) => b.score-a.score || a.track.id.localeCompare(b.track.id) || a.video.id.localeCompare(b.video.id));
  const best = matches.filter(match => match.score === matches[0].score);
  const chosen = best[(seed >>> 0) % best.length];
  return {
    track: chosen.track,
    preview: {
      provider:"youtube-embed",
      videoId:chosen.video.id,
      embedUrl:`https://www.youtube.com/embed/${chosen.video.id}`,
      title:chosen.video.title,
      durationSeconds:chosen.video.durationSeconds!,
    },
    matchingPairs: matches.length,
    eligibleTracks: tracks.length,
  };
}
