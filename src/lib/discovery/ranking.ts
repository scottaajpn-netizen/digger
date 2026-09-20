import type { DiscogsOrigin } from "../providers/discogs";
import type { ArtistCredit, CandidateEvidence, Direction, Recommendation, Track } from "../types";

export type CandidateOrigin =
  | DiscogsOrigin
  | "artist-radio"
  | "tag"
  | "release"
  | "label"
  | "lastfm-similar"
  | "lastfm-tag"
  | "lastfm-deep"
  | "lastfm-crate"
  | "lastfm-artist-hop"
  | "lastfm-tag-crate";

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
  artistAudience: number;
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
  track: Pick<Track, "lastfmListeners" | "lastfmArtistListeners" | "popularity">,
  obscurity: number,
) {
  if (obscurity < 90) return true;
  const listenerCap = obscurity >= 95 ? 10000 : 30000;
  const popularityCap = obscurity >= 95 ? 20 : 35;
  const listeners = track.lastfmListeners;
  const artistListeners = track.lastfmArtistListeners;
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
  const hasArtistListeners = artistListeners !== undefined && Number.isFinite(artistListeners) && artistListeners >= 0;
  const artistListenerCap = obscurity >= 95 ? 3000000 : 8000000;
  if (hasArtistListeners && artistListeners > artistListenerCap) return false;
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
      artistId: group.find(track => track.artistId)?.artistId ?? base.artistId,
      credits: mergeCredits(group),
      lastfmListeners: lastfm?.lastfmListeners,
      lastfmArtistListeners: ordered.find(track => track.lastfmArtistListeners !== undefined)?.lastfmArtistListeners,
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

type SelectionOptions = {
  allowArtistRepeats?: boolean;
  scoreAdjustment?: (track: RankedCandidate) => number;
  originLimit?: number;
  strictOriginLimit?: boolean;
  knownArtistKeys?: ReadonlySet<string>;
  preferNovelArtists?: boolean;
};

export function modeSelectionAdjustment(
  track: RankedCandidate,
  direction: Direction,
) {
  const distance = Math.max(0, track.discoveryPath?.distance || 0);
  const evidence = track.evidence;
  const structured = evidence?.path === "structured";
  const behavioral = evidence?.path === "behavioral";
  const catalogue = evidence?.path === "catalogue";
  const musical = evidence?.musical === true;
  const strong = evidence?.tier === "strong";

  if (direction === "Même vibe") {
    let adjustment = distance <= 1 ? 14 : -Math.min(18, (distance - 1) * 5);
    if (musical) adjustment += 10;
    if (strong) adjustment += 4;
    if (behavioral) adjustment += 4;
    return adjustment;
  }

  if (direction === "Rabbit hole") {
    let adjustment = Math.min(6, distance) * 4;
    if (distance <= 1) adjustment -= 10;
    if (structured) adjustment += 12;
    else if (catalogue) adjustment += 6;
    if (distance >= 3) adjustment += 8;
    return adjustment;
  }

  if (direction === "Surprends-moi") {
    let adjustment = 0;
    if (structured) adjustment += 10;
    if (distance >= 2) adjustment += 6;
    if (distance >= 4) adjustment += 6;
    if (evidence?.tier === "strong" || evidence?.tier === "credible") {
      adjustment += 4;
    }
    if (behavioral && distance <= 1) adjustment -= 4;
    return adjustment;
  }

  return 0;
}

export function selectDiverseRecommendations(
  ranked: RankedCandidate[],
  seedArtist: string,
  limit = 10,
  options: SelectionOptions = {},
) {
  const selectionScore = (track: RankedCandidate) =>
    track.score + (options.scoreAdjustment?.(track) || 0);
  ranked = [...ranked].sort(
    (a, b) =>
      selectionScore(b) - selectionScore(a) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
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
        ...(track.artistId ? [`musicbrainz:${track.artistId}`] : []),
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
    const artistLimit = relaxed && options.allowArtistRepeats !== false ? 2 : 1;
    if (artistCount >= artistLimit) return false;
    if (
      labels.some(
        label => (labelCounts.get(label) || 0) >= (relaxed ? 3 : 2),
      )
    )
      return false;
    const maxOriginCount =
      options.originLimit === undefined
        ? relaxed || newArtists
          ? 6
          : 4
        : options.strictOriginLimit
          ? options.originLimit
          : relaxed
            ? options.originLimit + 2
            : newArtists
              ? options.originLimit + 1
              : options.originLimit;
    if (originCount >= maxOriginCount) return false;

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

  const isKnownArtist = (track: RankedCandidate) => {
    const knownArtistKeys = options.knownArtistKeys;
    if (!knownArtistKeys?.size) return false;

    const direct = normalized(track.artist);
    if (knownArtistKeys.has(direct)) return true;

    return (track.credits || [])
      .filter(
        credit => credit.role === "primary" || credit.role === "featured",
      )
      .some(credit => knownArtistKeys.has(normalized(credit.name)));
  };

  const passes = options.preferNovelArtists
    ? [
        { known: false, relaxed: false, newArtists: false },
        { known: false, relaxed: false, newArtists: true },
        { known: false, relaxed: true, newArtists: false },
        { known: true, relaxed: false, newArtists: false },
        { known: true, relaxed: false, newArtists: true },
        { known: true, relaxed: true, newArtists: false },
      ]
    : [
        { known: undefined, relaxed: false, newArtists: false },
        { known: undefined, relaxed: false, newArtists: true },
        { known: undefined, relaxed: true, newArtists: false },
      ];

  for (const pass of passes) {
    for (const track of ranked) {
      if (
        pass.known !== undefined &&
        isKnownArtist(track) !== pass.known
      ) {
        continue;
      }

      tryAdd(track, pass.relaxed, pass.newArtists);
      if (selected.length >= limit) return selected;
    }
  }

  return selected;
}

const setJaccard = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) => {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) {
    if (right.has(value)) shared += 1;
  }
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
};

const meaningfulValue = (value: string | undefined) => {
  const key = normalized(value || "");
  if (!key || ["lastfm", "musicbrainz", "unknown"].includes(key)) return "";
  return key;
};

const mmrArtistKeys = (track: RankedCandidate) =>
  new Set(
    [
      normalized(track.artist),
      ...(track.artistId ? [`musicbrainz:${track.artistId}`] : []),
      ...(track.credits || [])
        .filter(
          credit => credit.role === "primary" || credit.role === "featured",
        )
        .flatMap(credit => [
          normalized(credit.name),
          ...(credit.sourceId
            ? [`${credit.source}:${credit.sourceId}`]
            : []),
        ]),
      ...(track.discogs?.trackArtists || []).flatMap(item => [
        normalized(item.name.replace(/\s*\(\d+\)$/, "")),
        `discogs:${item.id}`,
      ]),
    ].filter(Boolean),
  );

const mmrLabelKeys = (track: RankedCandidate) =>
  new Set(
    [
      meaningfulValue(track.label),
      ...(track.discogs?.labels || []).flatMap(label => [
        normalized(label.name),
        `discogs:${label.id}`,
      ]),
    ].filter(Boolean),
  );

const mmrContextKeys = (track: RankedCandidate) =>
  new Set(
    [
      ...track.tags.map(normalized),
      ...(track.retrieval?.artistRelation?.tags || []).map(normalized),
      ...(track.retrieval?.contextTags || []).map(normalized),
      ...(track.discogs?.styles || []).map(normalized),
      ...(track.discogs?.genres || []).map(normalized),
    ].filter(Boolean),
  );

const mmrProvider = (track: RankedCandidate) =>
  track.retrieval?.provider || track.discoveryPath?.source || "";

const mmrTopology = (track: RankedCandidate) =>
  track.discoveryPath
    ? `${track.discoveryPath.source}:${track.discoveryPath.evidence}:${track.discoveryPath.nodes
        .map(node => node.kind)
        .join(">")}`
    : "";

export function recommendationRedundancy(
  left: RankedCandidate,
  right: RankedCandidate,
) {
  let similarity = 0;

  if (setJaccard(mmrArtistKeys(left), mmrArtistKeys(right)) > 0) {
    similarity += 0.65;
  }

  similarity +=
    setJaccard(mmrContextKeys(left), mmrContextKeys(right)) * 0.25;
  similarity += setJaccard(mmrLabelKeys(left), mmrLabelKeys(right)) * 0.18;

  const leftScene = meaningfulValue(left.scene);
  const rightScene = meaningfulValue(right.scene);
  if (leftScene && leftScene === rightScene) similarity += 0.08;
  if (left.origin === right.origin) similarity += 0.12;

  const leftProvider = mmrProvider(left);
  const rightProvider = mmrProvider(right);
  if (leftProvider && leftProvider === rightProvider) similarity += 0.04;

  const leftTopology = mmrTopology(left);
  const rightTopology = mmrTopology(right);
  if (leftTopology && leftTopology === rightTopology) similarity += 0.08;

  const leftHop = left.retrieval?.artistHop;
  const rightHop = right.retrieval?.artistHop;
  if (
    leftHop &&
    rightHop &&
    normalized(leftHop.bridgeArtist) === normalized(rightHop.bridgeArtist)
  ) {
    similarity += 0.15;
  }

  return Math.min(1, similarity);
}

type MmrSelectionOptions = Pick<
  SelectionOptions,
  "scoreAdjustment" | "knownArtistKeys" | "preferNovelArtists"
> & {
  lambda?: number;
};

export function selectMmrRecommendations(
  ranked: RankedCandidate[],
  seedArtist: string,
  limit = 10,
  options: MmrSelectionOptions = {},
) {
  if (!ranked.length || limit <= 0) return [];

  const selectionScore = (track: RankedCandidate) =>
    track.score + (options.scoreAdjustment?.(track) || 0);
  const ordered = [...ranked].sort(
    (a, b) =>
      selectionScore(b) - selectionScore(a) ||
      b.score - a.score ||
      a.id.localeCompare(b.id),
  );
  const quality = new Map<string, number>();
  ordered.forEach((track, index) => {
    quality.set(
      track.id,
      ordered.length === 1 ? 1 : 1 - index / (ordered.length - 1),
    );
  });

  const seedArtistKey = normalized(seedArtist);
  const knownArtistKeys = options.knownArtistKeys;
  const isKnownArtist = (track: RankedCandidate) => {
    if (!knownArtistKeys?.size) return false;
    for (const key of mmrArtistKeys(track)) {
      if (knownArtistKeys.has(key)) return true;
    }
    return false;
  };

  const editionKey = (track: Track) =>
    trackIdentity({
      ...track,
      title: track.title.replace(
        /\s*(?:[-–—]|\()\s*(?:radio edit|extended mix|original mix|mixed|(?:[a-z]+\s+)?instrumental)\)?\s*$/i,
        "",
      ),
    });

  const selected: RankedCandidate[] = [];
  const lambda = Math.max(0, Math.min(1, options.lambda ?? 0.68));

  while (selected.length < limit) {
    let available = ordered.filter(track => {
      if (normalized(track.artist) === seedArtistKey) return false;
      if (
        selected.some(
          chosen =>
            chosen.id === track.id ||
            editionKey(chosen) === editionKey(track) ||
            setJaccard(mmrArtistKeys(chosen), mmrArtistKeys(track)) > 0,
        )
      ) {
        return false;
      }
      return true;
    });

    if (!available.length) break;

    if (options.preferNovelArtists && knownArtistKeys?.size) {
      const novel = available.filter(track => !isKnownArtist(track));
      if (novel.length) available = novel;
    }

    const next = [...available].sort((a, b) => {
      const redundancyA = selected.length
        ? Math.max(
            ...selected.map(chosen => recommendationRedundancy(a, chosen)),
          )
        : 0;
      const redundancyB = selected.length
        ? Math.max(
            ...selected.map(chosen => recommendationRedundancy(b, chosen)),
          )
        : 0;
      const mmrA =
        lambda * (quality.get(a.id) ?? 0) - (1 - lambda) * redundancyA;
      const mmrB =
        lambda * (quality.get(b.id) ?? 0) - (1 - lambda) * redundancyB;

      return (
        mmrB - mmrA ||
        selectionScore(b) - selectionScore(a) ||
        b.score - a.score ||
        a.id.localeCompare(b.id)
      );
    })[0];

    if (!next) break;
    selected.push(next);
  }

  return selected;
}

/**
 * Surprise mode is intentionally conservative about evidence quality.
 * Credible/strong candidates get the main list; unsupported retrievals may
 * appear only as a small wildcard quota. Repeated artists never fill slots.
 */
export function selectSurpriseRecommendations(
  ranked: RankedCandidate[],
  seedArtist: string,
  limit = 10,
  options: Pick<
    SelectionOptions,
    "scoreAdjustment" | "knownArtistKeys" | "preferNovelArtists"
  > = {},
) {
  const supported = ranked.filter(
    track => track.evidence?.tier !== "exploratory",
  );
  const primary = selectMmrRecommendations(
    supported,
    seedArtist,
    limit,
    options,
  );

  if (primary.length >= limit) return primary;

  const usedIds = new Set(primary.map(track => track.id));
  const usedArtistKeys = new Set(
    primary.flatMap(track => [...mmrArtistKeys(track)]),
  );
  const wildcardLimit = Math.min(2, limit - primary.length);

  const exploratory = ranked.filter(
    track =>
      track.evidence?.tier === "exploratory" &&
      !usedIds.has(track.id) &&
      ![...mmrArtistKeys(track)].some(key => usedArtistKeys.has(key)),
  );

  const wildcards = selectMmrRecommendations(
    exploratory,
    seedArtist,
    wildcardLimit,
    options,
  );

  return [...primary, ...wildcards];
}

export function selectModeAwareArtistCandidates(
  ranked: RankedCandidate[],
  direction: Direction,
  limit = 30,
) {
  const ordered = [...ranked].sort((a, b) => {
    const aScore = a.score + modeSelectionAdjustment(a, direction);
    const bScore = b.score + modeSelectionAdjustment(b, direction);
    return bScore - aScore || b.score - a.score || a.id.localeCompare(b.id);
  });
  const seenArtists = new Set<string>();
  const selected: RankedCandidate[] = [];

  for (const track of ordered) {
    const artistKey = track.artistId
      ? `musicbrainz:${track.artistId}`
      : normalized(track.artist);
    if (!artistKey || seenArtists.has(artistKey)) continue;
    seenArtists.add(artistKey);
    selected.push(track);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function selectModeRecommendations(
  ranked: RankedCandidate[],
  seedArtist: string,
  direction: Direction,
  limit = 10,
  knownArtistKeys?: ReadonlySet<string>,
) {
  const scoreAdjustment = (track: RankedCandidate) =>
    modeSelectionAdjustment(track, direction);

  if (direction === "Surprends-moi") {
    return selectSurpriseRecommendations(
      ranked,
      seedArtist,
      limit,
      {
        scoreAdjustment,
        knownArtistKeys,
        preferNovelArtists: Boolean(knownArtistKeys?.size),
      },
    );
  }

  return selectDiverseRecommendations(
    ranked,
    seedArtist,
    limit,
    {
      scoreAdjustment,
      allowArtistRepeats: false,
      ...(direction === "Rabbit hole"
        ? {
            originLimit: 3,
            knownArtistKeys,
            preferNovelArtists: Boolean(knownArtistKeys?.size),
          }
        : {}),
    },
  );
}
