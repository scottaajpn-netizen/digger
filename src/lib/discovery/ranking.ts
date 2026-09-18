import type { DiscogsOrigin } from "../providers/discogs";
import type { ArtistCredit, CandidateEvidence, Recommendation, Track } from "../types";

export type CandidateOrigin =
  | DiscogsOrigin
  | "artist-radio"
  | "tag"
  | "release"
  | "label"
  | "lastfm-similar"
  | "lastfm-tag"
  | "lastfm-deep"
  | "lastfm-crate";

export type Candidate = Recommendation & {
  relevance: number;
  origin: CandidateOrigin;
  feedbackIds?: string[];
};

export type ScoreBreakdown = {
  relevance: number;
  musicalSimilarity: number;
  sharedTags: number;
  preferredTags: number;
  popularityObscurity: number;
  audience: number;
  origin: number;
  discoveryPath: number;
  memory: number;
  discogs: number;
  direction: number;
  jitter: number;
};

export type RankedCandidate = Candidate & {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  evidence?: CandidateEvidence;
};

export function obscurityFromLastFmListeners(listeners: number) {
  if (!Number.isFinite(listeners) || listeners <= 0) return 90;
  const log = Math.log10(listeners + 1);
  return Math.max(5, Math.min(98, Math.round(102 - log * 17)));
}

// Product thresholds, not a universal definition of underground music.
// Unknown audience must never become a shortcut around strict digging.
export function passesDeepAudienceGate(
  track: Pick<Track, "lastfmListeners" | "popularity">,
  obscurity: number,
) {
  if (obscurity < 90) return true;
  const listenerCap = obscurity >= 95 ? 10000 : 30000;
  const popularityCap = obscurity >= 95 ? 20 : 35;
  const listeners = track.lastfmListeners;
  const popularity = track.popularity;
  const hasListeners =
    listeners !== undefined &&
    Number.isFinite(listeners) &&
    listeners >= 0;
  const hasPopularity =
    popularity !== undefined &&
    Number.isFinite(popularity) &&
    popularity >= 0 &&
    popularity <= 100;
  if (hasListeners && listeners > listenerCap) return false;
  if (hasPopularity && popularity > popularityCap) return false;
  return hasListeners || hasPopularity;
}

export const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const trackIdentity = (track: Pick<Track, "artist" | "title">) =>
  `${normalized(track.artist)}\u0000${normalized(track.title)}`;

export function deduplicate<T extends Track>(tracks: T[]): T[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  return tracks.filter(track => {
    const name = trackIdentity(track);
    if (ids.has(track.id) || names.has(name)) return false;
    ids.add(track.id);
    names.add(name);
    return true;
  });
}

const mergeCredits = (tracks: Track[]): ArtistCredit[] | undefined => {
  const result: ArtistCredit[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    for (const credit of track.credits || []) {
      const key = `${normalized(credit.name)}\u0000${credit.role}\u0000${credit.source}\u0000${credit.sourceId || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(credit);
    }
  }
  return result.length ? result : undefined;
};

/** Merge only exact artist/title identities; preserve existing track-scoped facts. */
export function mergeDiscoveryCandidates(pool: Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const track of pool) {
    const key = trackIdentity(track);
    groups.set(key, [...(groups.get(key) || []), track]);
  }
  return [...groups.values()].map(group => {
    const ordered = [...group].sort((a, b) => b.relevance - a.relevance);
    const base =
      ordered.find(track => !track.discogs && track.externalIds?.musicbrainz) ||
      ordered.find(track => !track.discogs) ||
      ordered[0];
    const editorial = ordered.find(track => track.discogs);
    const lastfm = ordered.find(track => track.lastfmListeners !== undefined);
    const lb = ordered.find(track => track.popularity !== undefined);
    return {
      ...base,
      relevance: Math.max(...group.map(track => track.relevance)),
      credits: mergeCredits(group),
      lastfmListeners: lastfm?.lastfmListeners,
      popularity: lb?.popularity,
      obscurity: lastfm?.obscurity ?? lb?.obscurity ?? base.obscurity,
      obscurityKnown: lastfm || lb ? true : base.obscurityKnown,
      feedbackIds: [
        ...new Set(group.flatMap(track => [track.id, ...(track.feedbackIds || [])])),
      ],
      ...(editorial
        ? {
          discogs: editorial.discogs,
          origin: editorial.origin,
          reason: editorial.reason,
          discoveryPath: editorial.discoveryPath || base.discoveryPath,
          label: base.label || editorial.label,
          album: base.album || editorial.album,
          externalIds: { ...editorial.externalIds, ...base.externalIds },
        }
        : {}),
    };
  });
}

export function selectDiverseRecommendations(
  ranked: RankedCandidate[],
  seedArtist: string,
  limit = 10,
) {
  ranked = [...ranked].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
  const selected: RankedCandidate[] = [];
  const artistCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  const originCounts = new Map<CandidateOrigin, number>();
  const seedArtistName = normalized(seedArtist);

  // Editions of the same performance need not occupy multiple discovery slots.
  // Keep named remixes distinct: they can be musically different interpretations.
  const editionKey = (track: Track) =>
    trackIdentity({
      ...track,
      title: track.title.replace(
        /\s*(?:[-–—]|\()\s*(?:radio edit|extended mix|original mix|mixed|(?:[a-z]+\s+)?instrumental)\)?\s*$/i,
        "",
      ),
    });

  const tryAdd = (
    track: RankedCandidate,
    relaxed: boolean,
    newArtists = false,
  ) => {
    if (
      selected.some(
        item => item.id === track.id || editionKey(item) === editionKey(track),
      )
    )
      return false;

    const artist = normalized(track.artist);
    const labels = [
      ...new Set(
        [
          normalized(track.label || ""),
          ...(track.discogs?.labels.flatMap(label => [
            `discogs:${label.id}`,
            normalized(label.name),
          ]) || []),
        ].filter(Boolean),
      ),
    ];

    const structuredKeys = track.discogs
      ? []
      : (track.credits || [])
        .filter(
          credit => credit.role === "primary" || credit.role === "featured",
        )
        .flatMap(credit => [
          normalized(credit.name),
          ...(credit.sourceId
            ? [`${credit.source}:${credit.sourceId}`]
            : []),
        ]);

    const artistKeys = [
      ...new Set([
        artist,
        ...structuredKeys,
        ...(track.discogs?.trackArtists.flatMap(item => [
          `discogs:${item.id}`,
          normalized(item.name.replace(/\s*\(\d+\)$/, "")),
        ]) || []),
      ]),
    ];

    const artistCount = Math.max(
      ...artistKeys.map(key => artistCounts.get(key) || 0),
    );
    const originCount = originCounts.get(track.origin) || 0;

    if (artist === seedArtistName && artistCount >= 1) return false;
    if (artistCount >= (relaxed ? 2 : 1)) return false;
    if (
      labels.some(
        label => (labelCounts.get(label) || 0) >= (relaxed ? 3 : 2),
      )
    )
      return false;
    if (originCount >= (relaxed || newArtists ? 6 : 4)) return false;

    selected.push(track);
    for (const key of artistKeys) {
      artistCounts.set(key, (artistCounts.get(key) || 0) + 1);
    }
    for (const label of labels) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    }
    originCounts.set(track.origin, originCount + 1);
    return true;
  };

  for (const track of ranked) {
    tryAdd(track, false);
    if (selected.length >= limit) return selected;
  }
  for (const track of ranked) {
    tryAdd(track, false, true);
    if (selected.length >= limit) return selected;
  }
  for (const track of ranked) {
    tryAdd(track, true);
    if (selected.length >= limit) break;
  }
  return selected;
}
