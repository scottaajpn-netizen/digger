import { buildMusicalProfile, compareMusicalProfiles, type MusicalProfile } from "../music/profile";
import { profileFromDiscogsRelease } from "../providers/discogs";
import type { DigRequest, DiscoveryPath, Direction, Track } from "../types";
import { assessCandidateEvidence } from "./evidence";
import { discoveryPathPreferenceKey } from "./paths";
import { containsArtistParticipant } from "./artist-anchors";
import {
  deduplicate,
  normalized,
  trackIdentity,
  type Candidate,
  type RankedCandidate,
} from "./ranking";

const hash = (value: string) =>
  [...value].reduce((number, character) => (number * 31 + character.charCodeAt(0)) >>> 0, 7);

export function discoveryPathScoreAdjustment(
  path: DiscoveryPath | undefined,
  direction: Direction,
): number {
  if (!path) return 0;

  const evidenceBase: Record<DiscoveryPath["evidence"], number> = {
    editorial: 6,
    catalogue: 4,
    listening: 3,
    release: 4,
    tag: -3,
  };
  let adjustment = evidenceBase[path.evidence];
  const distance = Math.max(0, path.distance);
  const hasLabel = path.nodes.some(node => node.kind === "label");
  const hasContext = path.nodes.some(node => node.kind === "context");

  if (direction === "Même vibe") {
    if (path.evidence === "listening") adjustment += 3;
    if (distance > 2) adjustment -= Math.min(4, distance - 2);
  }

  if (direction === "Même scène") {
    if (hasContext) adjustment += 8;
    if (path.evidence === "editorial") adjustment += 3;
  }

  if (direction === "Labels") {
    if (hasLabel) adjustment += 12;
    if (path.evidence === "editorial") adjustment += 4;
  }

  if (direction === "Rabbit hole") {
    adjustment += Math.min(3, Math.max(0, distance - 1)) * 5;
    if (path.evidence === "tag") adjustment -= 6;
    if (path.evidence === "editorial" || path.evidence === "catalogue")
      adjustment += 4;
  }

  if (direction === "Surprends-moi") {
    adjustment += Math.min(3, Math.max(0, distance - 1)) * 4;
    if (path.evidence === "tag") adjustment -= 4;
    if (path.evidence === "editorial" || path.evidence === "catalogue")
      adjustment += 4;
  }

  return adjustment;
}

type RankDiscoveryInput = {
  pool: Candidate[];
  seed: Track;
  seedProfile: MusicalProfile;
  input: DigRequest;
  seedParticipantKeys: Set<string>;
};

export type CandidateEligibilityFailure =
  | "seed-id"
  | "seed-track"
  | "seed-artist"
  | "seed-participant"
  | "known-track"
  | "feedback-excluded";

export function candidateEligibilityFailure(
  track: Candidate,
  seed: Track,
  input: DigRequest,
  seedParticipantKeys: Set<string>,
): CandidateEligibilityFailure | undefined {
  if (track.id === seed.id) return "seed-id";
  if (trackIdentity(track) === trackIdentity(seed)) return "seed-track";
  if (normalized(track.artist) === normalized(seed.artist)) return "seed-artist";
  if (containsArtistParticipant(track.artist, track.credits, seedParticipantKeys)) {
    return "seed-participant";
  }
  if ((input.memory?.knownTracks || []).includes(trackIdentity(track))) {
    return "known-track";
  }
  if (
    [track.id, ...(track.feedbackIds || [])].some(id =>
      ["known", "neutral"].includes(input.feedback[id]),
    )
  ) {
    return "feedback-excluded";
  }
  return undefined;
}

/**
 * Pure discovery scoring/ranking.
 *
 * This intentionally preserves the coefficients and ordering that previously
 * lived inline in providers/live.ts. Network access and candidate generation
 * stay outside this module.
 */
export function rankDiscoveryCandidates({
  pool,
  seed,
  seedProfile,
  input,
  seedParticipantKeys,
}: RankDiscoveryInput): RankedCandidate[] {
  const preferred = new Set(
    pool
      .filter(track => ["love", "curious"].includes(input.feedback[track.id]))
      .flatMap(track => track.tags),
  );
  return deduplicate([...pool].sort((a, b) => b.relevance - a.relevance))
    .filter(
      track =>
        candidateEligibilityFailure(
          track,
          seed,
          input,
          seedParticipantKeys,
        ) === undefined,
    )
    .map(track => {
      const candidateProfile = track.discogs
        ? buildMusicalProfile({
          ...track,
          tags: [
            ...track.tags,
            ...track.discogs.styles,
            ...track.discogs.genres,
          ],
        })
        : buildMusicalProfile(track);
      const contextualTags = [
        ...(track.retrieval?.artistRelation?.tags || []),
        ...(track.retrieval?.contextTags || []),
      ];
      const contextualProfile =
        !track.discogs && contextualTags.length
          ? buildMusicalProfile({
              ...track,
              tags: [...track.tags, ...contextualTags],
            })
          : candidateProfile;
      const comparison = compareMusicalProfiles(seedProfile, candidateProfile);
      const evidenceComparison =
        compareMusicalProfiles(seedProfile, contextualProfile);
      const evidence = assessCandidateEvidence(track, evidenceComparison);
      const shared = track.tags.filter(tag => seed.tags.includes(tag)).length;

      const scoreBreakdown = {
        relevance:
          input.direction === "Surprends-moi"
            ? track.relevance * 0.2
            : track.relevance,
        musicalSimilarity: comparison.musicalSimilarity * 55,
        sharedTags: shared * 3,
        preferredTags:
          track.tags.filter(tag => preferred.has(tag)).length * 4,
        popularityObscurity: 0,
        audience: 0,
        artistAudience: 0,
        origin: 0,
        discoveryPath: 0,
        memory: 0,
        discogs: 0,
        direction: 0,
        jitter: 0,
      };

      let score =
        scoreBreakdown.relevance +
        scoreBreakdown.musicalSimilarity +
        scoreBreakdown.sharedTags +
        scoreBreakdown.preferredTags;

      if (track.popularity !== undefined) {
        const obscurityPenalty =
          -Math.abs(track.obscurity - input.obscurity) * 0.45;

        score += obscurityPenalty;
        scoreBreakdown.popularityObscurity += obscurityPenalty;

        if (input.obscurity >= 80 && track.popularity > 35) {
          const popularityPenalty = -(track.popularity - 35) * 1.25;
          score += popularityPenalty;
          scoreBreakdown.popularityObscurity += popularityPenalty;
        }

        if (input.obscurity >= 95 && track.popularity > 20) {
          const strictPopularityPenalty = -(track.popularity - 20) * 1.5;
          score += strictPopularityPenalty;
          scoreBreakdown.popularityObscurity += strictPopularityPenalty;
        }
      }

      if (
        input.obscurity >= 80 &&
        track.listenCount !== undefined &&
        track.listenCount > 0
      ) {
        const listenCountPenalty =
          -Math.max(0, Math.log10(track.listenCount + 1) - 3) * 8;

        score += listenCountPenalty;
        scoreBreakdown.audience += listenCountPenalty;
      }

      if (input.obscurity >= 75 && track.lastfmListeners !== undefined) {
        const audiencePenalty =
          -Math.max(
            0,
            Math.log10(track.lastfmListeners + 1) - 3.2,
          ) * (input.obscurity >= 95 ? 18 : 11);

        const audienceObscurityPenalty =
          -Math.abs(track.obscurity - input.obscurity) * 0.65;

        score += audiencePenalty;
        score += audienceObscurityPenalty;

        scoreBreakdown.audience += audiencePenalty;
        scoreBreakdown.audience += audienceObscurityPenalty;
      }

      if (
        input.obscurity >= 95 &&
        track.lastfmArtistListeners !== undefined
      ) {
        const artistAudiencePenalty =
          -Math.max(0, Math.log10(track.lastfmArtistListeners + 1) - 5.5) * 6;
        score += artistAudiencePenalty;
        scoreBreakdown.artistAudience += artistAudiencePenalty;
      }

      if (input.obscurity >= 80 && track.origin === "lastfm-tag") {
        score -= 35;
        scoreBreakdown.origin -= 35;
      }

      if (
        input.direction !== "Surprends-moi" &&
        input.obscurity >= 90 &&
        track.origin === "lastfm-deep"
      ) {
        score += 26;
        scoreBreakdown.origin += 26;
      }

      if (
        input.direction !== "Surprends-moi" &&
        input.obscurity >= 80 &&
        track.origin === "lastfm-crate"
      ) {
        score += 24;
        scoreBreakdown.origin += 24;
      }

      const discoveryPathAdjustment =
        discoveryPathScoreAdjustment(track.discoveryPath, input.direction);
      const artistRelationAdjustment =
        track.retrieval?.provider === "lastfm" &&
        track.retrieval.artistRelation?.similarity !== undefined
          ? Math.max(
              0,
              Math.min(1, track.retrieval.artistRelation.similarity),
            ) * 6
          : 0;

      score += discoveryPathAdjustment + artistRelationAdjustment;
      scoreBreakdown.discoveryPath +=
        discoveryPathAdjustment + artistRelationAdjustment;

      const memoryKey = discoveryPathPreferenceKey(
        track.discoveryPath,
        input.direction,
      );

      if (memoryKey) {
        const memoryAdjustment = input.memory?.pathScores[memoryKey] || 0;
        score += memoryAdjustment;
        scoreBreakdown.memory += memoryAdjustment;
      }

      if (track.discogs) {
        // Editorial metadata is release-scoped, separate from track similarity.
        const releaseProfile = profileFromDiscogsRelease(track.discogs);
        const styleOverlap = releaseProfile.subgenres.filter(style =>
          seedProfile.subgenres.includes(style),
        ).length;
        const styleWeight = track.discogs.compilation ? 2 : 5;

        const styleBonus = Math.min(2, styleOverlap) * styleWeight;
        score += styleBonus;
        scoreBreakdown.discogs += styleBonus;

        if (input.direction === "Labels" && track.origin === "discogs-label") {
          score += 45;
          scoreBreakdown.discogs += 45;
        }

        if (
          input.direction === "Même scène" &&
          track.origin === "discogs-scene"
        ) {
          score += 25;
          scoreBreakdown.discogs += 25;
        }

        if (
          input.direction === "Rabbit hole" &&
          track.origin === "discogs-deep"
        ) {
          score += 45;
          scoreBreakdown.discogs += 45;
        }

      }

      if (input.direction === "Même vibe") {
        const vibeSimilarityBonus = comparison.musicalSimilarity * 35;
        score += vibeSimilarityBonus;
        scoreBreakdown.direction += vibeSimilarityBonus;

        if (track.origin === "tag" || track.origin === "lastfm-tag") {
          score += 10;
          scoreBreakdown.direction += 10;
        }

        if (track.origin === "lastfm-similar") {
          score += 14;
          scoreBreakdown.direction += 14;
        }
      }

      if (input.direction === "Même scène") {
        if (comparison.country) {
          score += 22;
          scoreBreakdown.direction += 22;
        }

        const sceneSimilarityBonus =
          comparison.subgenre * 16 + comparison.rawTags * 10;

        score += sceneSimilarityBonus;
        scoreBreakdown.direction += sceneSimilarityBonus;
      }

      if (input.direction === "Labels") {
        if (
          seed.label &&
          track.label &&
          normalized(seed.label) === normalized(track.label)
        ) {
          score += 34;
          scoreBreakdown.direction += 34;
        }

        const labelSimilarityBonus = comparison.subgenre * 12;
        score += labelSimilarityBonus;
        scoreBreakdown.direction += labelSimilarityBonus;
      }

      if (input.direction === "Rabbit hole") {
        score += 18;
        scoreBreakdown.direction += 18;

        if (track.origin === "lastfm-deep" || track.origin === "lastfm-artist-hop") {
          score += 22;
          scoreBreakdown.direction += 22;
        }

        if (track.origin === "lastfm-crate") {
          score += 28;
          scoreBreakdown.direction += 28;
        }

        if (track.origin === "lastfm-tag-crate") {
          score += 12;
          scoreBreakdown.direction += 12;
        }

        if (track.origin === "lastfm-tag") {
          score -= 12;
          scoreBreakdown.direction -= 12;
        }

        const rabbitHoleBonus =
          (1 - comparison.musicalSimilarity) * 8 +
          comparison.genre * 12 +
          comparison.traits * 12;

        score += rabbitHoleBonus;
        scoreBreakdown.direction += rabbitHoleBonus;
      }

      const jitter = hash(`${track.id}:${input.session}`) % 31;

      if (input.direction === "Surprends-moi") {
        // Surprise controls exploration depth upstream. Randomness only breaks
        // near ties here; it must never rescue an unsupported candidate.
        const jitterBonus = (jitter - 15) * 0.25;
        score += jitterBonus;
        scoreBreakdown.jitter += jitterBonus;
      } else {
        const jitterBonus = jitter * 0.12;
        score += jitterBonus;
        scoreBreakdown.jitter += jitterBonus;
      }

      const sharedSubgenres = candidateProfile.subgenres.filter(value =>
        seedProfile.subgenres.includes(value),
      );
      const sharedTraits = candidateProfile.traits.filter(value =>
        seedProfile.traits.includes(value),
      );

      let reason = track.reason;
      if (sharedSubgenres.length)
        reason = `Sous-genre commun : ${sharedSubgenres.slice(0, 2).join(" / ")}. ${reason}`;
      else if (sharedTraits.length)
        reason = `Traits musicaux communs : ${sharedTraits.slice(0, 2).join(" / ")}. ${reason}`;

      return {
        ...track,
        reason,
        score,
        scoreBreakdown,
        evidence,
        analysis: {
          genres: candidateProfile.genres,
          subgenres: candidateProfile.subgenres,
          traits: candidateProfile.traits,
          similarity: Math.round(comparison.musicalSimilarity * 100),
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}
