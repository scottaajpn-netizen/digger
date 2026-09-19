import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

import { normalized } from "../src/lib/discovery/ranking";
import { recommendLive, searchLive } from "../src/lib/providers/live";
import {
  directions,
  type DigRequest,
  type Direction,
  type Recommendation,
  type SeedReference,
  type Track,
} from "../src/lib/types";
import {
  discoveryBenchmark,
  type DiscoveryBenchmarkCase,
} from "../tests/fixtures/discovery-benchmark";

type RuntimeRecommendation = Recommendation & {
  origin?: string;
};

type NumericSummary = {
  count: number;
  min?: number;
  max?: number;
  average?: number;
};

const defaultCaseIds = [
  "mia-love-me-right",
  "midland-final-credits",
  "anri-remember-summer-days",
];

const defaultDirections: Direction[] = [
  "Même vibe",
  "Rabbit hole",
  "Surprends-moi",
];

function loadLocalEnvironment() {
  for (const envFile of [".env.local", ".env"]) {
    if (!existsSync(envFile)) continue;
    try {
      loadEnvFile(envFile);
    } catch (error) {
      console.warn(
        `[benchmark] Impossible de charger ${envFile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function optionValues(flag: string) {
  const args = process.argv.slice(2);
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === flag && args[index + 1]) {
      values.push(...args[index + 1].split(","));
      index += 1;
      continue;
    }
    if (argument.startsWith(`${flag}=`)) {
      values.push(...argument.slice(flag.length + 1).split(","));
    }
  }

  return values.map(value => value.trim()).filter(Boolean);
}

function summarizeNumbers(values: Array<number | undefined>): NumericSummary {
  const known = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );

  if (!known.length) return { count: 0 };

  const total = known.reduce((sum, value) => sum + value, 0);
  return {
    count: known.length,
    min: Math.min(...known),
    max: Math.max(...known),
    average: total / known.length,
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function branchKey(track: RuntimeRecommendation) {
  if (track.origin) return track.origin;
  if (track.discoveryPath) {
    return `${track.discoveryPath.source}:${track.discoveryPath.evidence}`;
  }
  return "unknown";
}

function hasExplicitEvidence(track: RuntimeRecommendation) {
  return Boolean(
    track.evidence &&
      (track.evidence.musical || track.evidence.path !== "none"),
  );
}

function measureTracks(tracks: RuntimeRecommendation[]) {
  const artistCounts = countBy(
    tracks.map(track => normalized(track.artist) || track.artist),
  );
  const uniqueArtistCount = Object.keys(artistCounts).length;
  const branchCounts = countBy(tracks.map(branchKey));
  const dominantBranchCount = Math.max(0, ...Object.values(branchCounts));
  const repeatedArtistSlots = Object.values(artistCounts).reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const evidenceCount = tracks.filter(hasExplicitEvidence).length;
  const strongEvidenceCount = tracks.filter(
    track => track.evidence?.tier === "strong",
  ).length;
  const unknownAudienceCount = tracks.filter(
    track =>
      track.lastfmListeners === undefined &&
      track.lastfmArtistListeners === undefined &&
      track.popularity === undefined,
  ).length;

  return {
    trackCount: tracks.length,
    uniqueArtistCount,
    artistCoverageRatio:
      tracks.length === 0 ? 0 : uniqueArtistCount / tracks.length,
    repeatedArtistSlots,
    branchCounts,
    branchCount: Object.keys(branchCounts).length,
    dominantBranchRatio:
      tracks.length === 0 ? 0 : dominantBranchCount / tracks.length,
    evidenceCoverageRatio:
      tracks.length === 0 ? 0 : evidenceCount / tracks.length,
    strongEvidenceRatio:
      tracks.length === 0 ? 0 : strongEvidenceCount / tracks.length,
    unknownAudienceCount,
    scores: summarizeNumbers(tracks.map(track => track.score)),
    obscurity: summarizeNumbers(tracks.map(track => track.obscurity)),
    trackListeners: summarizeNumbers(
      tracks.map(track => track.lastfmListeners),
    ),
    artistListeners: summarizeNumbers(
      tracks.map(track => track.lastfmArtistListeners),
    ),
    popularity: summarizeNumbers(tracks.map(track => track.popularity)),
  };
}

function seedReference(track: Track): SeedReference {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    scene: track.scene,
    label: track.label,
    tags: track.tags,
    year: track.year,
    artistId: track.artistId,
    releaseId: track.releaseId,
    country: track.country,
    album: track.album,
    externalIds: track.externalIds,
    credits: track.credits,
    source: track.externalIds?.musicbrainz
      ? "musicbrainz"
      : track.externalIds?.lastfm
        ? "lastfm"
        : "mixed",
  };
}

async function resolveSeed(benchmarkCase: DiscoveryBenchmarkCase) {
  const query = `${benchmarkCase.seed.title} — ${benchmarkCase.seed.artist}`;
  const matches = await searchLive(query, AbortSignal.timeout(20_000));
  const exact = matches.find(
    track =>
      normalized(track.title) === normalized(benchmarkCase.seed.title) &&
      normalized(track.artist) === normalized(benchmarkCase.seed.artist),
  );
  const selected = exact ?? matches[0];

  if (!selected) {
    throw new Error(`Aucun seed résolu pour « ${query} ».`);
  }

  return {
    query,
    exact: Boolean(exact),
    selected,
    alternatives: matches.slice(0, 5).map(track => ({
      id: track.id,
      artist: track.artist,
      title: track.title,
    })),
  };
}

function compactTrack(track: RuntimeRecommendation) {
  return {
    id: track.id,
    artist: track.artist,
    title: track.title,
    score: track.score,
    scoreBreakdown: track.scoreBreakdown,
    origin: track.origin,
    evidence: track.evidence,
    discoveryPath: track.discoveryPath,
    obscurity: track.obscurity,
    obscurityKnown: track.obscurityKnown,
    popularity: track.popularity,
    lastfmListeners: track.lastfmListeners,
    lastfmArtistListeners: track.lastfmArtistListeners,
    tags: track.tags,
    genres: track.analysis?.genres,
    subgenres: track.analysis?.subgenres,
    traits: track.analysis?.traits,
    discogsGenres: track.discogs?.genres,
    discogsStyles: track.discogs?.styles,
    label: track.label,
    scene: track.scene,
    country: track.country,
    year: track.year,
    reason: track.reason,
  };
}

function formatNumber(value: number | undefined) {
  return value === undefined
    ? "?"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
}

function printRun(
  benchmarkCase: DiscoveryBenchmarkCase,
  direction: Direction,
  tracks: RuntimeRecommendation[],
  metrics: ReturnType<typeof measureTracks>,
) {
  console.log(
    `\n=== ${benchmarkCase.id} | ${benchmarkCase.seed.artist} — ${benchmarkCase.seed.title} | ${direction} | obscurité ${benchmarkCase.obscurity} ===`,
  );
  console.log(
    `tracks=${metrics.trackCount} | artistes=${metrics.uniqueArtistCount} | répétitions=${metrics.repeatedArtistSlots} | branches=${metrics.branchCount} | branche dominante=${(metrics.dominantBranchRatio * 100).toFixed(0)}% | preuve=${(metrics.evidenceCoverageRatio * 100).toFixed(0)}%`,
  );

  tracks.forEach((track, index) => {
    const evidence = track.evidence
      ? `${track.evidence.tier}/${track.evidence.path}${track.evidence.musical ? "+musical" : ""}`
      : "none";
    const path = track.discoveryPath
      ? `${track.discoveryPath.source}/${track.discoveryPath.evidence}/d${track.discoveryPath.distance}`
      : "none";

    console.log(
      `${String(index + 1).padStart(2, " ")}. ${track.artist} — ${track.title} | score=${formatNumber(track.score)} | branch=${branchKey(track)} | evidence=${evidence} | path=${path} | obsc=${formatNumber(track.obscurity)}`,
    );

    if (track.scoreBreakdown) {
      const score = track.scoreBreakdown;
      console.log(
        `    score: rel=${formatNumber(score.relevance)} sim=${formatNumber(score.musicalSimilarity)} tags=${formatNumber(score.sharedTags)} origin=${formatNumber(score.origin)} path=${formatNumber(score.discoveryPath)} dir=${formatNumber(score.direction)} jitter=${formatNumber(score.jitter)}`,
      );
    }
  });
}

async function main() {
  loadLocalEnvironment();

  const full = process.argv.includes("--full");
  const requestedCaseIds = optionValues("--case");
  const requestedDirections = optionValues("--direction");

  const selectedCases = full
    ? discoveryBenchmark
    : discoveryBenchmark.filter(benchmarkCase =>
        (requestedCaseIds.length ? requestedCaseIds : defaultCaseIds).includes(
          benchmarkCase.id,
        ),
      );

  const selectedDirections: Direction[] = full
    ? [...directions]
    : requestedDirections.length
      ? requestedDirections.map(value => {
          if (!directions.includes(value as Direction)) {
            throw new Error(
              `Direction inconnue « ${value} ». Valeurs: ${directions.join(", ")}`,
            );
          }
          return value as Direction;
        })
      : defaultDirections;

  if (!selectedCases.length) {
    throw new Error(
      `Aucun cas sélectionné. IDs disponibles: ${discoveryBenchmark.map(item => item.id).join(", ")}`,
    );
  }

  console.log("[benchmark] Digger discovery benchmark");
  console.log(
    `[benchmark] ${selectedCases.length} seed(s) × ${selectedDirections.length} mode(s) = ${selectedCases.length * selectedDirections.length} run(s)`,
  );
  console.log(
    `[benchmark] Last.fm=${process.env.LASTFM_API_KEY ? "on" : "off"} | Discogs=${process.env.DISCOGS_TOKEN ? "on" : "off"}`,
  );
  if (!full) {
    console.log(
      "[benchmark] Profil par défaut: Mia + Midland + Anri × Même vibe / Rabbit hole / Surprends-moi. Utilise --full pour le corpus 10 × 5.",
    );
  }

  const generatedAt = new Date().toISOString();
  const runs: unknown[] = [];
  const errors: Array<{
    caseId: string;
    direction?: Direction;
    message: string;
  }> = [];

  for (const benchmarkCase of selectedCases) {
    let resolution: Awaited<ReturnType<typeof resolveSeed>>;

    try {
      resolution = await resolveSeed(benchmarkCase);
      console.log(
        `\n[seed] ${benchmarkCase.id}: ${resolution.selected.artist} — ${resolution.selected.title} (${resolution.exact ? "exact" : "fallback"})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[seed] ${benchmarkCase.id}: ${message}`);
      errors.push({ caseId: benchmarkCase.id, message });
      continue;
    }

    for (
      let directionIndex = 0;
      directionIndex < selectedDirections.length;
      directionIndex += 1
    ) {
      const direction = selectedDirections[directionIndex];
      const input: DigRequest = {
        seed: resolution.query,
        seedId: resolution.selected.externalIds?.musicbrainz,
        seedTrack: seedReference(resolution.selected),
        direction,
        obscurity: benchmarkCase.obscurity,
        feedback: {},
        session: directionIndex,
      };

      try {
        const response = await recommendLive(
          input,
          AbortSignal.timeout(50_000),
        );
        const tracks = response.tracks as RuntimeRecommendation[];
        const metrics = measureTracks(tracks);

        printRun(benchmarkCase, direction, tracks, metrics);

        runs.push({
          caseId: benchmarkCase.id,
          historicalOverall: benchmarkCase.overall,
          historicalObservations: benchmarkCase.observations,
          seed: benchmarkCase.seed,
          seedResolution: {
            query: resolution.query,
            exact: resolution.exact,
            selected: {
              id: resolution.selected.id,
              artist: resolution.selected.artist,
              title: resolution.selected.title,
              externalIds: resolution.selected.externalIds,
            },
            alternatives: resolution.alternatives,
          },
          direction,
          obscurity: benchmarkCase.obscurity,
          notes: response.notes,
          metrics,
          tracks: tracks.map(compactTrack),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[run] ${benchmarkCase.id} / ${direction}: ${message}`,
        );
        errors.push({
          caseId: benchmarkCase.id,
          direction,
          message,
        });
      }
    }
  }

  const output = {
    generatedAt,
    profile: full ? "full" : "focused",
    sourceAvailability: {
      lastfm: Boolean(process.env.LASTFM_API_KEY),
      discogs: Boolean(process.env.DISCOGS_TOKEN),
    },
    selectedCases: selectedCases.map(item => item.id),
    selectedDirections,
    runCount: runs.length,
    errorCount: errors.length,
    errors,
    runs,
  };

  await mkdir("benchmark-results", { recursive: true });
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const timestampedPath = join(
    "benchmark-results",
    `discovery-${stamp}.json`,
  );
  const latestPath = join("benchmark-results", "latest.json");
  const json = JSON.stringify(output, null, 2);

  await Promise.all([
    writeFile(timestampedPath, json, "utf8"),
    writeFile(latestPath, json, "utf8"),
  ]);

  console.log(
    `\n[benchmark] ${runs.length} run(s) terminé(s), ${errors.length} erreur(s).`,
  );
  console.log(`[benchmark] JSON: ${timestampedPath}`);
  console.log(`[benchmark] Dernier run: ${latestPath}`);

  if (!runs.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(
    `[benchmark] Échec: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
