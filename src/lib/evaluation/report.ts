export const holdoutVotes = [
  "love",
  "ok",
  "relevant_not_for_me",
  "off_topic",
  "known",
  "too_popular",
  "unavailable",
] as const;

export type HoldoutVote = (typeof holdoutVotes)[number];

export type HoldoutRunStatus =
  | "ready"
  | "done"
  | "resolution-failed"
  | "no-results"
  | "error";

export type HoldoutExport = {
  exportedAt?: string;
  mode?: { direction?: string; obscurity?: number };
  seeds?: Array<{ id: string; artist?: string; title?: string; query?: string }>;
  session?: {
    completed?: boolean;
    runs?: Record<string, {
      seedId?: string;
      status?: HoldoutRunStatus | string;
      resolvedSeed?: unknown;
      tracks?: unknown[];
      error?: string;
    }>;
    ratings?: Array<{
      seedId?: string;
      vote?: string;
      technical?: { score?: number; discoveryPath?: { source?: string; evidence?: string } };
      track?: {
        score?: number;
        origin?: string;
        discoveryPath?: { source?: string; evidence?: string };
        evidence?: { tier?: string; path?: string; musical?: boolean; retrievalDepth?: number };
      };
    }>;
  };
};

export type CountMap = Record<string, number>;

export type NumericSummary = {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
};

export type HoldoutSourceSummary = {
  source: string;
  count: number;
  voteCounts: CountMap;
  offTopicRate: number;
  averageScore: number | null;
};

export type HoldoutPathSummary = {
  path: string;
  count: number;
  voteCounts: CountMap;
  offTopicRate: number;
  averageScore: number | null;
};

export type HoldoutSeedSummary = {
  seedId: string;
  artist?: string;
  title?: string;
  status: string;
  resolved: boolean;
  recommendationCount: number;
  ratingCount: number;
  voteCounts: CountMap;
  sourceCounts: CountMap;
  averageScore: number | null;
};

export type HoldoutReport = {
  mode: { direction?: string; obscurity?: number };
  complete: boolean;
  seedCount: number;
  runCount: number;
  resolvedSeedCount: number;
  resolutionFailedCount: number;
  noResultsCount: number;
  errorCount: number;
  seedsWithRecommendations: number;
  resolutionRate: number;
  recommendationCoverageRate: number;
  ratingCount: number;
  voteCounts: Record<HoldoutVote, number>;
  offTopicRate: number;
  tooPopularRate: number;
  unavailableRate: number;
  scoresByVote: Record<HoldoutVote, NumericSummary>;
  bySource: HoldoutSourceSummary[];
  byDiscoveryPath: HoldoutPathSummary[];
  byEvidencePath: HoldoutPathSummary[];
  byOrigin: HoldoutPathSummary[];
  bySeed: HoldoutSeedSummary[];
};

function emptyVoteCounts(): Record<HoldoutVote, number> {
  return Object.fromEntries(holdoutVotes.map(vote => [vote, 0])) as Record<HoldoutVote, number>;
}

function count(values: string[]): CountMap {
  const result: CountMap = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function summary(values: Array<number | undefined>): NumericSummary {
  const known = values.filter((value): value is number => Number.isFinite(value));
  if (!known.length) return { count: 0, average: null, min: null, max: null };
  const total = known.reduce((sum, value) => sum + value, 0);
  return {
    count: known.length,
    average: total / known.length,
    min: Math.min(...known),
    max: Math.max(...known),
  };
}

function ratingScore(rating: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>[number]) {
  const direct = rating.technical?.score;
  if (Number.isFinite(direct)) return direct;
  const trackScore = rating.track?.score;
  return Number.isFinite(trackScore) ? trackScore : undefined;
}

function ratingSource(rating: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>[number]) {
  return (
    rating.technical?.discoveryPath?.source ||
    rating.track?.discoveryPath?.source ||
    "unknown"
  );
}

function discoveryPathKey(rating: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>[number]) {
  const path = rating.technical?.discoveryPath || rating.track?.discoveryPath;
  if (!path) return "unknown";
  return `${path.source || "unknown"}:${path.evidence || "unknown"}`;
}

function evidencePathKey(rating: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>[number]) {
  const evidence = rating.track?.evidence;
  if (!evidence) return "unknown";
  return `${evidence.tier || "unknown"}:${evidence.path || "unknown"}`;
}

function originKey(rating: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>[number]) {
  return rating.track?.origin || "unknown";
}

function normalizedVote(value: string | undefined): HoldoutVote | undefined {
  return holdoutVotes.includes(value as HoldoutVote) ? (value as HoldoutVote) : undefined;
}

function groupRatings(
  ratings: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>,
  keyOf: (rating: NonNullable<NonNullable<HoldoutExport["session"]>["ratings"]>[number]) => string,
): HoldoutPathSummary[] {
  const groups = new Map<string, typeof ratings>();
  for (const rating of ratings) {
    const key = keyOf(rating);
    groups.set(key, [...(groups.get(key) || []), rating]);
  }

  return [...groups.entries()]
    .map(([path, rows]) => {
      const votes = rows.flatMap(row => {
        const vote = normalizedVote(row.vote);
        return vote ? [vote] : [];
      });
      const voteCounts = count(votes);
      return {
        path,
        count: rows.length,
        voteCounts,
        offTopicRate: rows.length ? (voteCounts.off_topic ?? 0) / rows.length : 0,
        averageScore: summary(rows.map(ratingScore)).average,
      };
    })
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

export function analyzeHoldoutExport(input: HoldoutExport): HoldoutReport {
  const seeds = Array.isArray(input.seeds) ? input.seeds : [];
  const session = input.session || {};
  const runs = session.runs || {};
  const ratings = Array.isArray(session.ratings) ? session.ratings : [];

  const voteCounts = emptyVoteCounts();
  for (const rating of ratings) {
    const vote = normalizedVote(rating.vote);
    if (vote) voteCounts[vote] += 1;
  }

  const scoresByVote = Object.fromEntries(
    holdoutVotes.map(vote => [
      vote,
      summary(
        ratings
          .filter(rating => rating.vote === vote)
          .map(ratingScore),
      ),
    ]),
  ) as Record<HoldoutVote, NumericSummary>;

  const runRows = Object.values(runs);
  const resolvedSeedCount = runRows.filter(run => Boolean(run.resolvedSeed)).length;
  const resolutionFailedCount = runRows.filter(run => run.status === "resolution-failed").length;
  const noResultsCount = runRows.filter(run => run.status === "no-results").length;
  const errorCount = runRows.filter(run => run.status === "error").length;
  const seedsWithRecommendations = runRows.filter(run => (run.tracks?.length || 0) > 0).length;

  const sourceGroups = groupRatings(ratings, ratingSource).map(row => ({
    source: row.path,
    count: row.count,
    voteCounts: row.voteCounts,
    offTopicRate: row.offTopicRate,
    averageScore: row.averageScore,
  }));

  const bySeed = seeds.map(seed => {
    const run = runs[seed.id];
    const seedRatings = ratings.filter(rating => rating.seedId === seed.id);
    const votes = seedRatings.flatMap(rating => {
      const vote = normalizedVote(rating.vote);
      return vote ? [vote] : [];
    });
    return {
      seedId: seed.id,
      artist: seed.artist,
      title: seed.title,
      status: run?.status || "missing",
      resolved: Boolean(run?.resolvedSeed),
      recommendationCount: run?.tracks?.length || 0,
      ratingCount: seedRatings.length,
      voteCounts: count(votes),
      sourceCounts: count(seedRatings.map(ratingSource)),
      averageScore: summary(seedRatings.map(ratingScore)).average,
    };
  });

  const seedCount = seeds.length || runRows.length;
  return {
    mode: {
      direction: input.mode?.direction,
      obscurity: input.mode?.obscurity,
    },
    complete: Boolean(session.completed),
    seedCount,
    runCount: runRows.length,
    resolvedSeedCount,
    resolutionFailedCount,
    noResultsCount,
    errorCount,
    seedsWithRecommendations,
    resolutionRate: seedCount ? resolvedSeedCount / seedCount : 0,
    recommendationCoverageRate: seedCount ? seedsWithRecommendations / seedCount : 0,
    ratingCount: ratings.length,
    voteCounts,
    offTopicRate: ratings.length ? voteCounts.off_topic / ratings.length : 0,
    tooPopularRate: ratings.length ? voteCounts.too_popular / ratings.length : 0,
    unavailableRate: ratings.length ? voteCounts.unavailable / ratings.length : 0,
    scoresByVote,
    bySource: sourceGroups,
    byDiscoveryPath: groupRatings(ratings, discoveryPathKey),
    byEvidencePath: groupRatings(ratings, evidencePathKey),
    byOrigin: groupRatings(ratings, originKey),
    bySeed,
  };
}
