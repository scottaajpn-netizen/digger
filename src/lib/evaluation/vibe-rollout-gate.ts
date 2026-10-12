import { normalized } from "../discovery/ranking";
import { comparePairedHumanOrdering, type HumanCoherence, type HumanRatedTrack } from "./paired-human-ordering";

/**
 * Read-only activation gate for the opt-in "Même vibe" ranking experiment.
 * It consumes a *captured* discovery benchmark. No provider requests, model
 * judgments or new listening labels are produced here.
 *
 * A small historical corpus can diagnose failure, but cannot certify an
 * improvement: unknown replacements and ambiguous artist-only reviews
 * must never count as wins. Results are always limited to "candidate for
 * listening", never auto-enable a ranking strategy.
 */

export type VibeDecisionStatus =
  | "insufficient-evidence"
  | "regression-risk"
  | "candidate-for-listening";

export interface VibeReviewTrack {
  artist: string;
  title: string;
  humanVerdict?: {
    match?: "track" | "artist";
    coherence?: HumanCoherence;
    taste?: string;
  };
}

export interface VibeReviewRun {
  caseId: string;
  direction: string;
  tracks: VibeReviewTrack[];
  vibeShadow?: { tracks: VibeReviewTrack[] };
}

export interface VibeBenchmarkSnapshot {
  sourceAvailability?: { lastfm?: boolean; discogs?: boolean };
  errorCount?: number;
  errors?: unknown[];
  runs?: VibeReviewRun[];
}

export interface VibePerSeedDecision {
  caseId: string;
  baselineReviewed: number;
  experimentalReviewed: number;
  sharedReviewed: number;
  comparedPairs: number;
  correctedPairs: number;
  regressedPairs: number;
  missingCoherentTracks: string[];
}

export interface VibeRolloutDecision {
  status: VibeDecisionStatus;
  canAutoEnable: false;
  reasons: string[];
  examinedRuns: number;
  comparedRuns: number;
  distinctReviewedSeeds: number;
  baselineReviewed: number;
  experimentalReviewed: number;
  sharedReviewed: number;
  comparablePairs: number;
  improvedPairs: number;
  regressedPairs: number;
  lostCoherentTracks: number;
  sharedReviewRetention: number | null;
  cases: VibePerSeedDecision[];
}

const levels = new Set<HumanCoherence>(["none", "weak", "moderate", "strong"]);

function trackKey(row: Pick<VibeReviewTrack, "artist" | "title">) {
  return normalized(row.artist) + "\u0000" + normalized(row.title);
}
function exactReview(row: VibeReviewTrack): HumanCoherence | undefined {
  const coherence = row.humanVerdict?.coherence;
  return row.humanVerdict?.match === "track" && coherence && levels.has(coherence)
    ? coherence : undefined;
}
function ratedTracks(rows: readonly VibeReviewTrack[]) {
  const distinct = new Map<string, HumanRatedTrack>();
  for (const row of rows) {
    const key = trackKey(row);
    if (!key || distinct.has(key)) continue;
    const coherence = exactReview(row);
    distinct.set(key, { key, ...(coherence ? { coherence } : {}) });
  }
  return [...distinct.values()];
}

export function assessVibeRollout(
  snapshot: VibeBenchmarkSnapshot,
): VibeRolloutDecision {
  const runs = (snapshot.runs || []).filter(
    run => run.direction === "Même vibe" && Array.isArray(run.tracks),
  );
  const reports: VibePerSeedDecision[] = [];
  const reviewedSeeds = new Set<string>();
  let baselineReviewed = 0;
  let experimentalReviewed = 0;
  let sharedReviewed = 0;
  let comparablePairs = 0;
  let improvedPairs = 0;
  let regressedPairs = 0;
  let lostCoherentTracks = 0;

  for (const run of runs) {
    if (!run.vibeShadow || !Array.isArray(run.vibeShadow.tracks)) continue;
    const baseline = ratedTracks(run.tracks);
    const experiment = ratedTracks(run.vibeShadow.tracks);
    const comparison = comparePairedHumanOrdering(baseline, experiment);
    const bReviewed = baseline.filter(track => track.coherence !== undefined);
    const eReviewed = experiment.filter(track => track.coherence !== undefined);
    const eKeys = new Set(experiment.map(track => track.key));
    const dropped = bReviewed
      .filter(row => (row.coherence === "strong" || row.coherence === "moderate")
        && !eKeys.has(row.key))
      .map(row => row.key.replace("\u0000", " — "));
    const shared = comparison.sharedCoherenceCount;

    if (bReviewed.length) reviewedSeeds.add(run.caseId);
    baselineReviewed += bReviewed.length;
    experimentalReviewed += eReviewed.length;
    sharedReviewed += shared;
    comparablePairs += comparison.comparablePairs;
    improvedPairs += comparison.improvedPairs;
    regressedPairs += comparison.regressedPairs;
    lostCoherentTracks += dropped.length;
    reports.push({
      caseId: run.caseId,
      baselineReviewed: bReviewed.length,
      experimentalReviewed: eReviewed.length,
      sharedReviewed: shared,
      comparedPairs: comparison.comparablePairs,
      correctedPairs: comparison.improvedPairs,
      regressedPairs: comparison.regressedPairs,
      missingCoherentTracks: dropped,
    });
  }

  const reasons: string[] = [];
  const comparedRuns = reports.length;
  const sharedReviewRetention = baselineReviewed
    ? sharedReviewed / baselineReviewed : null;
  const missingSource = !snapshot.sourceAvailability?.lastfm ||
    !snapshot.sourceAvailability?.discogs;
  const errors = Math.max(snapshot.errorCount ?? 0, snapshot.errors?.length ?? 0);

  if (!comparedRuns)
    reasons.push("Aucun benchmark Même vibe avec comparaison vibe-aware enregistrée.");
  if (missingSource)
    reasons.push("Sources musicales incomplètes : Last.fm et Discogs sont nécessaires pour cet arbitrage.");
  if (errors)
    reasons.push(errors + " erreur(s) de benchmark : comparaison incomplète.");
  if (reviewedSeeds.size < 4)
    reasons.push("Seulement " + reviewedSeeds.size +
      " seed(s) avec des avis de cohérence ; minimum prudent : 4.");
  if (baselineReviewed < 12)
    reasons.push("Seulement " + baselineReviewed +
      " morceaux annotés précisément ; minimum prudent : 12.");
  if (comparablePairs < 8)
    reasons.push("Seulement " + comparablePairs +
      " paires de cohérence comparables ; minimum prudent : 8.");
  if (sharedReviewRetention === null || sharedReviewRetention < 0.75)
    reasons.push("Trop peu d'avis communs aux classements (rétention requise : 75 %).");
  if (improvedPairs === 0)
    reasons.push("Aucune inversion de cohérence corrigée démontrée sur les titres évalués.");
  if (regressedPairs)
    reasons.push(regressedPairs + " paire(s) auparavant correctes sont désormais mal ordonnées.");
  if (lostCoherentTracks)
    reasons.push(lostCoherentTracks +
      " titre(s) de cohérence forte/modérée sortent du classement, sans jugement sur leurs remplaçants.");

  let status: VibeDecisionStatus = "insufficient-evidence";
  if (regressedPairs > 0 || lostCoherentTracks > 0) {
    status = "regression-risk";
  } else if (reasons.length === 0) {
    status = "candidate-for-listening";
    reasons.push("Signal hors ligne positif : effectuer plusieurs écoutes avant toute activation.");
  }
  return {
    status,
    canAutoEnable: false,
    reasons,
    examinedRuns: runs.length,
    comparedRuns,
    distinctReviewedSeeds: reviewedSeeds.size,
    baselineReviewed,
    experimentalReviewed,
    sharedReviewed,
    comparablePairs,
    improvedPairs,
    regressedPairs,
    lostCoherentTracks,
    sharedReviewRetention,
    cases: reports,
  };
}

export function formatVibeDecisionMarkdown(decision: VibeRolloutDecision) {
  const pct = decision.sharedReviewRetention === null ? "indéterminé"
    : (decision.sharedReviewRetention * 100).toFixed(1) + " %";
  const rows = [
    "# Digger — décision expérimentale « Même vibe »",
    "",
    "**Verdict :** \`" + decision.status + "\`",
    "",
    "La variante n'est **jamais activée automatiquement**. Les avis de goût",
    "ne sont pas des avis de cohérence ; les remplacements non évalués restent inconnus.",
    "",
    "| Mesure | Résultat |",
    "| --- | ---: |",
    "| Runs Même vibe / runs comparés | " + decision.examinedRuns + " / " + decision.comparedRuns + " |",
    "| Seeds avec avis humains exacts | " + decision.distinctReviewedSeeds + " |",
    "| Titres évalués baseline / variante | " + decision.baselineReviewed + " / " + decision.experimentalReviewed + " |",
    "| Titres évalués communs | " + decision.sharedReviewed + " |",
    "| Rétention des avis communs | " + pct + " |",
    "| Paires de cohérence comparables | " + decision.comparablePairs + " |",
    "| Ordres corrigés / dégradés | " + decision.improvedPairs + " / " + decision.regressedPairs + " |",
    "| Titres cohérents disparus | " + decision.lostCoherentTracks + " |",
    "",
    "## Pourquoi",
    "",
    ...decision.reasons.map(reason => "- " + reason),
    "",
    "## Couverture par cas",
    "",
    "| Cas | Évalués baseline | Évalués variante | En commun | Paires | Corrigées | Régressions |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...decision.cases.map(row =>
      "| " + row.caseId.replace(/[|\r\n]/g, " ") + " | " +
      [row.baselineReviewed, row.experimentalReviewed, row.sharedReviewed,
        row.comparedPairs, row.correctedPairs, row.regressedPairs].join(" | ") + " |",
    ),
    "",
    "Ce rapport est un garde-fou, pas un substitut à l'écoute humaine.",
    "",
  ];
  return rows.join("\n");
}
