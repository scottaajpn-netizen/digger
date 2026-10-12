import type { DigRequest, Recommendation, ScopeShadowComparison, Track } from "../types";
import type { MusicalProfile } from "../music/profile";
import { passesDeepAudienceGate, selectModeRecommendations, type Candidate, type RankedCandidate } from "./ranking";
import { rankDiscoveryCandidates } from "./scoring";

export type ShadowInput = {
  pool: Candidate[];
  seed: Track;
  seedProfile: MusicalProfile;
  input: DigRequest;
  seedParticipantKeys: Set<string>;
  // Pass the already finalized production selection, including its gates
  // and artist-diversity policy. No second data-retrieval pass is permitted.
  baselineRanked: RankedCandidate[];
  baselineSelected: RankedCandidate[];
};

/**
 * Deterministic A/B comparison against the *same* enriched candidate pool.
 * No network access, no additional audience lookups, no writes and no impact
 * on the baseline selection. Only the experimental rank is recomputed.
 *
 * Limitation: the original audience-enrichment shortlist was determined by
 * the baseline; an experiment-only candidate may therefore lack audience
 * metadata. That limitation is visible in the benchmark's metrics.
 */
function compareShadow(input: ShadowInput, strategy: ScopeShadowComparison["strategy"]): ScopeShadowComparison {
  const experimentalRanked = rankDiscoveryCandidates({
    pool: input.pool,
    seed: input.seed,
    seedProfile: input.seedProfile,
    input: input.input,
    seedParticipantKeys: input.seedParticipantKeys,
    strategy,
  });
  const eligible = (tracks: RankedCandidate[]) => input.input.obscurity >= 90
    ? tracks.filter(track => track.origin !== "lastfm-tag" &&
        passesDeepAudienceGate(track, input.input.obscurity))
    : tracks;
  const experimentEligible = eligible(experimentalRanked);
  const baselineEligible = eligible(input.baselineRanked);
  const knownArtistKeys = new Set(
    (input.input.memory?.knownTracks || [])
      .map(identity => identity.split("\u0000")[0]).filter(Boolean),
  );
  const experimental = selectModeRecommendations(
    experimentEligible, input.seed.artist, input.input.direction, 10, knownArtistKeys,
  );
  const baseline = input.baselineSelected;
  const summarize = (track: RankedCandidate, index: number) => ({
    id: track.id, artist: track.artist, title: track.title, position: index + 1,
    score: track.score, overlapScope: track.analysis?.overlapScope,
  });
  const baselineMap = new Map(baseline.map((track,index) => [track.id, summarize(track,index)]));
  const experimentMap = new Map(experimental.map((track,index) => [track.id, summarize(track,index)]));
  const entered = experimental.flatMap((track,index) =>
    baselineMap.has(track.id) ? [] : [summarize(track,index)]);
  const dropped = baseline.flatMap((track,index) =>
    experimentMap.has(track.id) ? [] : [summarize(track,index)]);
  const moved = experimental.flatMap((track,index) => {
    const old=baselineMap.get(track.id);
    if (!old || old.position===index+1) return [];
    return [{
      id:track.id,artist:track.artist,title:track.title,
      baselinePosition:old.position,experimentPosition:index+1,
      baselineScore:old.score,experimentScore:track.score,
      overlapScope:track.analysis?.overlapScope,
    }];
  });
  return {
    strategy,
    rankedCandidateCount: experimentalRanked.length,
    baselineEligibleCount: baselineEligible.length,
    experimentEligibleCount: experimentEligible.length,
    baselineCount: baseline.length,
    experimentCount: experimental.length,
    sharedCount: baseline.length - dropped.length,
    entered, dropped, moved,
    experimentTracks: experimental.map(({ relevance: _relevance, feedbackIds: _feedbackIds, ...track }) => track),
  };
}

export function compareScopeShadow(input: ShadowInput): ScopeShadowComparison {
  return compareShadow(input,"scope-aware");
}
export function comparePathShadow(input: ShadowInput): ScopeShadowComparison {
  return compareShadow(input,"path-aware");
}
