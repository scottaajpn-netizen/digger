export type SamplingDuration = "any" | "short" | "medium" | "long";

export interface SamplingFilters {
  genre?: string;
  keywords?: string;
  country?: string;
  instrument?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  excludeShorts?: boolean;
  excludeAI?: boolean;
  excludeCompilations?: boolean;
  archiveFocus?: boolean;
  minViews?: number;
  maxViews?: number;
  yearMin?: number;
  yearMax?: number;
  duration?: SamplingDuration;
}

export interface SamplingVideo {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  views: number;
  durationSeconds?: number;
  thumbnail?: string;
  query: string;
}

type YouTubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }>;
};

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelTitle?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
    statistics?: { viewCount?: string };
    contentDetails?: {
      duration?: string;
      regionRestriction?: { allowed?: string[]; blocked?: string[] };
    };
    status?: { embeddable?: boolean; privacyStatus?: string };
  }>;
};

// Search for recordings or physical releases, not a topic about music.
const diggingTerms = [
  "vinyl rip",
  "rare 45 rpm",
  "7 inch record",
  "private press record",
  "rare vinyl single",
  "original pressing",
  "45 rpm B side",
  "archival recording",
] as const;

const genericMusicTerms = [
  "soul",
  "funk",
  "jazz funk",
  "boogie",
  "disco",
  "psychedelic rock",
  "library music",
  "afrobeat",
  "reggae",
  "brazilian jazz",
  "turkish funk",
  "ethiopian jazz",
  "r&b",
] as const;

const clampInt = (value: number | undefined, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value!))) : undefined;

const randomItem = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

export function normalizeSamplingFilters(raw: SamplingFilters): SamplingFilters {
  const currentYear = new Date().getFullYear();
  const yearMin = clampInt(raw.yearMin, 1900, currentYear);
  const yearMax = clampInt(raw.yearMax, 1900, currentYear);
  const minViews = clampInt(raw.minViews, 0, 10_000_000_000);
  const maxViews = clampInt(raw.maxViews, 0, 10_000_000_000);
  const minDuration = clampInt(raw.minDurationSeconds, 0, 7200);
  const maxDuration = clampInt(raw.maxDurationSeconds, 0, 7200);

  return {
    genre: typeof raw.genre === "string" ? raw.genre.trim().slice(0, 80) : undefined,
    keywords: typeof raw.keywords === "string" ? raw.keywords.trim().slice(0, 120) : undefined,
    country: typeof raw.country === "string" ? raw.country.trim().slice(0, 60) : undefined,
    instrument: typeof raw.instrument === "string" ? raw.instrument.trim().slice(0, 60) : undefined,
    minDurationSeconds: minDuration !== undefined && maxDuration !== undefined ? Math.min(minDuration, maxDuration) : minDuration,
    maxDurationSeconds: minDuration !== undefined && maxDuration !== undefined ? Math.max(minDuration, maxDuration) : maxDuration,
    excludeShorts: raw.excludeShorts !== false,
    excludeAI: raw.excludeAI !== false,
    excludeCompilations: raw.excludeCompilations !== false,
    archiveFocus: raw.archiveFocus !== false,
    minViews,
    maxViews,
    yearMin: yearMin !== undefined && yearMax !== undefined ? Math.min(yearMin, yearMax) : yearMin,
    yearMax: yearMin !== undefined && yearMax !== undefined ? Math.max(yearMin, yearMax) : yearMax,
    duration: ["any", "short", "medium", "long"].includes(raw.duration || "")
      ? raw.duration
      : "any",
  };
}

export function buildSamplingQuery(filters: SamplingFilters, relaxed = false) {
  const parts: string[] = [];
  if (filters.genre) parts.push(filters.genre);
  if (filters.keywords) parts.push(filters.keywords);
  if (filters.country) parts.push(filters.country);
  if (filters.instrument) parts.push(filters.instrument);

  if (!filters.genre && !filters.keywords) parts.push(randomItem(genericMusicTerms));

  // For the default sample hunt, search for old recordings rather than the
  // latest content containing generic words such as "gospel library music".
  // A selected user year always wins over the archival decade hint.
  if (filters.archiveFocus !== false) {
    parts.push(randomItem(diggingTerms));
  } else if (!relaxed) {
    parts.push(randomItem(["original recording", "full track", "music"]));
  }

  if (filters.yearMin || filters.yearMax) {
    const low = filters.yearMin ?? filters.yearMax!;
    const high = filters.yearMax ?? filters.yearMin!;
    parts.push(String(low + Math.floor(Math.random() * (high - low + 1))));
  } else if (filters.archiveFocus !== false) {
    // Only a discovery hint: YouTube provides upload date, not release date.
    parts.push(String(1960 + Math.floor(Math.random() * 40)));
  }

  // Helpful exclusions at search time; all candidates are still checked after
  // the API returns them. Keep these broad exclusions out of user-selected terms.
  parts.push("-shorts", "-reaction", "-tutorial", "-suno", "-udio");
  return parts.filter(Boolean).join(" ").trim();
}

/** Some videos are not viewable in a given country even when embeddable. */
export function samplingPlayableInRegion(
  restriction: { allowed?: string[]; blocked?: string[] } | undefined,
  country = "FR",
): boolean {
  const code = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return true;
  if (!restriction) return true;
  if (restriction.blocked?.includes(code)) return false;
  if (restriction.allowed && !restriction.allowed.includes(code)) return false;
  return true;
}

function parseIsoDuration(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}


// YouTube Data API does not expose a reliable Shorts flag, AI provenance or the
// original release year. These conservative heuristics reduce noise, not certify it.
// Positive recording evidence is more useful than trying to guess AI provenance.
// A title without clues can be an excellent real track; archive focus is therefore
// a user-selectable trade-off between precision and discovery coverage.
export function archivalEvidenceScore(
  video: { title: string; channel?: string; description?: string; publishedAt?: string },
): number {
  const title = video.title.toLowerCase();
  const description = (video.description || "").toLowerCase();
  const channel = (video.channel || "").toLowerCase();
  let score = 0;
  // Reissues or archive uploads can be new, but the record release is old.
  if (/\b(?:19[4-9]\d|200[0-9])\b/.test(title)) score += 2;
  if (/\b(?:19[4-9]\d|200[0-9])\b/.test(description.slice(0, 600))) score += 1;
  // "Vinyl" alone is a musical/aesthetic word (e.g. a song named "Vinyl Soul").
  // Require physical-record evidence before granting an archival boost.
  if (/\b(?:vinyl\s+(?:rip|transfer|recording|pressing|single)|record\s+(?:rip|transfer)|45\s*rpm|7[\s-]*inch|12[\s-]*inch|private[\s-]*press|acetate|original pressing|recorded in)\b|(?:\b(?:7|12)\s*["″]\s*(?:single|record)?)/.test(title)) score += 3;
  if (/\b(?:record label|catalog(?:ue)?\s*(?:no\.?|number|#)|cat\.\s*no\.?|matrix\s*(?:number|no\.?))\b/i.test(title)) score += 2;
  if (/\b(?:vinyl\s+(?:rip|transfer|recording|pressing|single)|record\s+(?:rip|transfer)|45\s*rpm|7[\s-]*inch|12[\s-]*inch|private[\s-]*press|original pressing|catalogue no|catalog number|matrix number)\b/.test(description.slice(0, 1000))) score += 2;
  if (/\b(?:vinyl|archive|records|recordings)\b/.test(channel)) score += 1;
  if (/\s[-–—]\s/.test(title) && title.length < 100) score += 1;
  if (/^(?:19\d{2}|200\d|201[0-4])/.test(video.publishedAt || "")) score += 1;
  if ((title.match(/\s\|\s/g) || []).length >= 2) score -= 2;
  if (/\b20(?:2[0-9])\b/.test(title) && /\b(?:new|latest|trending|viral)\b/.test(title)) score -= 3;
  return score;
}

export function samplingRejectionReason(
  video: { title: string; channel?: string; description?: string; publishedAt?: string; durationSeconds?: number },
  filters: SamplingFilters,
): string | null {
  const title = video.title.toLowerCase();
  const description = (video.description || "").toLowerCase();
  const duration = video.durationSeconds;

  if (filters.minDurationSeconds !== undefined && (duration === undefined || duration < filters.minDurationSeconds)) {
    return "too-short";
  }
  if (filters.maxDurationSeconds !== undefined && (duration === undefined || duration > filters.maxDurationSeconds)) {
    return "too-long";
  }

  // Excludes obvious video essays, recommendation lists and tutorials.
  if (/\b(?:top|best)\s*(?:\d{1,3}|ten|five)\b|\bmust[\s-]*know\b|\brecommendations?\b|\breviews?\b|\breactions?\b|\binterviews?\b|\btutorials?\b|\bunboxing\b|\bhow to\b|\bexplained\b|\b(?:album|record)\s+ranking\b|\balbums?\s+(?:to|you|ranked|reviewed)\b/i.test(title)) {
    return "editorial";
  }

  if (filters.excludeShorts !== false && /(?:#shorts\b|\byoutube shorts?\b|\bshorts?\s+video\b)/i.test(title)) {
    return "short";
  }

  if (filters.excludeCompilations !== false &&
    /\b(?:full\s+(?:album|lp|ep)|complete\s+album|compilation|playlist|mixtape|dj\s+(?:set|mix)|continuous\s+mix|nonstop\s+mix|greatest\s+hits|(?:\d+)\s+(?:hours?|hrs?)\s+(?:of\s+)?(?:music|mix))\b/i.test(title)) {
    return "compilation";
  }

  if (filters.excludeAI !== false &&
    /\b(?:ai[\s-]*(?:generated|made|music|song|cover|vocals?)|generated\s+(?:with|by)\s+(?:ai|suno|udio)|suno(?:\.ai)?|udio(?:\.com)?|synthetic\s+vocals?)\b/i.test([title, description].join(" "))) {
    return "ai-suspected";
  }

  // High-volume SEO/promotional titles often masquerade as rare recordings.
  // This does not prove AI generation, so use a separate reason.
  if (filters.archiveFocus !== false && (
    /\b(?:new|latest)\s+(?:(?:christian|gospel|worship|devotional|hindi|nagpuri|punjabi)\s+)?(?:song|music|track|release)\b/i.test(title) ||
    /\b(?:new|latest)\s+(?:christian|gospel|worship)\s+(?:song|music)\b/i.test(title) ||
    /\b(?:trending|viral)\s+(?:song|music|track)\b/i.test(title)
  )) return "promotion";

  if (filters.archiveFocus !== false && archivalEvidenceScore(video) < 2) return "not-archival-enough";
  return null;
}

// Prefer different uploaders at the start of each crate, while preserving all
// valid unique videos for later digging.
function diversifyByChannel(videos: SamplingVideo[]): SamplingVideo[] {
  const remaining: SamplingVideo[] = [];
  const firstPerChannel: SamplingVideo[] = [];
  const seen = new Set<string>();
  for (const video of shuffle(videos)) {
    const key = video.channel.toLocaleLowerCase();
    if (seen.has(key)) remaining.push(video);
    else {
      seen.add(key);
      firstPerChannel.push(video);
    }
  }
  return [...firstPerChannel, ...remaining];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

async function youtubeJson<T>(path: string, params: Record<string, string>, signal: AbortSignal) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    const error = new Error("YOUTUBE_API_KEY_MISSING");
    error.name = "YouTubeConfigError";
    throw error;
  }

  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));

  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`YouTube API ${response.status}: ${text.slice(0, 180)}`);
    error.name = "YouTubeApiError";
    throw error;
  }

  return response.json() as Promise<T>;
}

async function searchOnce(filters: SamplingFilters, signal: AbortSignal, relaxed = false) {
  const query = buildSamplingQuery(filters, relaxed);
  const searchParams: Record<string, string> = {
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    maxResults: "50",
    q: query,
    safeSearch: "none",
  };

  if (filters.duration && filters.duration !== "any") {
    searchParams.videoDuration = filters.duration;
  }

  const search = await youtubeJson<YouTubeSearchResponse>("search", searchParams, signal);
  const ids = (search.items || [])
    .map(item => item.id?.videoId)
    .filter((id): id is string => Boolean(id))
    .slice(0, 50);

  if (!ids.length) return { query, videos: [] as SamplingVideo[] };

  const details = await youtubeJson<YouTubeVideosResponse>(
    "videos",
    {
      part: "snippet,statistics,contentDetails,status",
      id: ids.join(","),
      maxResults: "50",
    },
    signal,
  );

  const minViews = filters.minViews ?? 0;
  const maxViews = filters.maxViews ?? Number.MAX_SAFE_INTEGER;

  const videos = (details.items || []).flatMap(item => {
    if (!item.id || item.status?.embeddable === false || item.status?.privacyStatus === "private") return [];
    if (!samplingPlayableInRegion(item.contentDetails?.regionRestriction)) return [];
    const views = Number(item.statistics?.viewCount || 0);
    if (!Number.isFinite(views) || views < minViews || views > maxViews) return [];

    const snippet = item.snippet;
    if (!snippet?.title || !snippet.channelTitle || !snippet.publishedAt) return [];
    const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
    if (samplingRejectionReason({ title: snippet.title, channel: snippet.channelTitle, description: snippet.description, publishedAt: snippet.publishedAt, durationSeconds }, filters)) return [];

    return [{
      id: item.id,
      title: snippet.title,
      channel: snippet.channelTitle,
      publishedAt: snippet.publishedAt,
      views,
      durationSeconds,
      thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
      query,
    } satisfies SamplingVideo];
  });

  return { query, videos: diversifyByChannel(videos) };
}

export async function discoverSamplingVideos(
  rawFilters: SamplingFilters,
  excludeIds: string[],
  signal: AbortSignal,
) {
  const filters = normalizeSamplingFilters(rawFilters);
  const excluded = new Set(excludeIds.slice(-300));

  const first = await searchOnce(filters, signal, false);
  let videos = first.videos.filter(video => !excluded.has(video.id));

  if (!videos.length) {
    const fallback = await searchOnce(filters, signal, true);
    videos = fallback.videos.filter(video => !excluded.has(video.id));
    return {
      videos: videos.slice(0, 20),
      query: fallback.query,
      relaxed: true,
      filters,
    };
  }

  return {
    videos: videos.slice(0, 20),
    query: first.query,
    relaxed: false,
    filters,
  };
}
