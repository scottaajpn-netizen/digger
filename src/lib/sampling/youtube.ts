export type SamplingDuration = "any" | "short" | "medium" | "long";

export interface SamplingFilters {
  genre?: string;
  keywords?: string;
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
      publishedAt?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
    statistics?: { viewCount?: string };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean; privacyStatus?: string };
  }>;
};

const diggingTerms = [
  "vinyl",
  "rare groove",
  "private press",
  "original mix",
  "7 inch",
  "12 inch",
  "full album",
  "soundtrack",
  "library music",
  "records",
  "deep cut",
  "obscure",
] as const;

const genericMusicTerms = [
  "soul",
  "funk",
  "jazz",
  "boogie",
  "disco",
  "house",
  "hip hop",
  "gospel",
  "soundtrack",
  "library music",
  "psychedelic",
  "folk",
  "electronic",
  "afrobeat",
  "reggae",
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

  return {
    genre: typeof raw.genre === "string" ? raw.genre.trim().slice(0, 80) : undefined,
    keywords: typeof raw.keywords === "string" ? raw.keywords.trim().slice(0, 120) : undefined,
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

  if (!filters.genre && !filters.keywords) parts.push(randomItem(genericMusicTerms));

  if (!relaxed) {
    parts.push(randomItem(diggingTerms));
    if (filters.yearMin || filters.yearMax) {
      const low = filters.yearMin ?? filters.yearMax!;
      const high = filters.yearMax ?? filters.yearMin!;
      const year = low + Math.floor(Math.random() * (high - low + 1));
      parts.push(String(year));
    }
  }

  return parts.filter(Boolean).join(" ").trim();
}

function parseIsoDuration(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
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
    maxResults: "30",
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
    .slice(0, 30);

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
    const views = Number(item.statistics?.viewCount || 0);
    if (!Number.isFinite(views) || views < minViews || views > maxViews) return [];

    const snippet = item.snippet;
    if (!snippet?.title || !snippet.channelTitle || !snippet.publishedAt) return [];

    return [{
      id: item.id,
      title: snippet.title,
      channel: snippet.channelTitle,
      publishedAt: snippet.publishedAt,
      views,
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
      thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
      query,
    } satisfies SamplingVideo];
  });

  return { query, videos: shuffle(videos) };
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
