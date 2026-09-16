import { buildMusicalProfile, compareMusicalProfiles, type MusicalProfile } from "../music/profile";
import { profileFromDiscogsRelease } from "../providers/discogs";
import type { DigRequest, Track } from "../types";
import {
  deduplicate,
  normalized,
  trackIdentity,
  type Candidate,
  type RankedCandidate,
} from "./ranking";

const hash = (value: string) =>
  [...value].reduce((number, character) => (number * 31 + character.charCodeAt(0)) >>> 0, 7);

type RankDiscoveryInput = {
  pool: Candidate[];
  seed: Track;
  seedProfile: MusicalProfile;
  input: DigRequest;
  seedParticipantKeys: Set<string>;
};

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
        track.id !== seed.id &&
        trackIdentity(track) !== trackIdentity(seed) &&
        normalized(track.artist) !== normalized(seed.artist) &&
        !seedParticipantKeys.has(normalized(track.artist)) &&
        ![track.id, ...(track.feedbackIds || [])].some(id =>
          ["known", "neutral"].includes(input.feedback[id]),
        ),
    )
    .map(track => {
      const candidateProfile = buildMusicalProfile(track);
      const comparison = compareMusicalProfiles(seedProfile, candidateProfile);
      const shared = track.tags.filter(tag => seed.tags.includes(tag)).length;

      let score =
        track.relevance +
        comparison.musicalSimilarity * 55 +
        shared * 3 +
        track.tags.filter(tag => preferred.has(tag)).length * 4;

      if (track.popularity !== undefined) {
        score -= Math.abs(track.obscurity - input.obscurity) * 0.45;
        if (input.obscurity >= 80 && track.popularity > 35)
          score -= (track.popularity - 35) * 1.25;
        if (input.obscurity >= 95 && track.popularity > 20)
          score -= (track.popularity - 20) * 1.5;
      }

      if (
        input.obscurity >= 80 &&
        track.listenCount !== undefined &&
        track.listenCount > 0
      ) {
        score -= Math.max(0, Math.log10(track.listenCount + 1) - 3) * 8;
      }

      if (input.obscurity >= 75 && track.lastfmListeners !== undefined) {
        const audiencePenalty = Math.max(
          0,
          Math.log10(track.lastfmListeners + 1) - 3.2,
        );
        score -= audiencePenalty * (input.obscurity >= 95 ? 18 : 11);
        score -= Math.abs(track.obscurity - input.obscurity) * 0.65;
      }

      if (input.obscurity >= 80 && track.origin === "lastfm-tag") score -= 35;
      if (input.obscurity >= 90 && track.origin === "lastfm-deep") score += 26;
      if (input.obscurity >= 80 && track.origin === "lastfm-crate") score += 24;

      if (track.discogs) {
        // Editorial metadata is release-scoped, separate from track similarity.
        const releaseProfile = profileFromDiscogsRelease(track.discogs);
        const styleOverlap = releaseProfile.subgenres.filter(style =>
          seedProfile.subgenres.includes(style),
        ).length;
        const styleWeight = track.discogs.compilation ? 2 : 5;
        score += Math.min(2, styleOverlap) * styleWeight;

        if (input.direction === "Labels" && track.origin === "discogs-label")
          score += 45;
        if (input.direction === "Même scène" && track.origin === "discogs-scene")
          score += 25;
        if (input.direction === "Rabbit hole" && track.origin === "discogs-deep")
          score += 45;
        if (
          input.direction === "Surprends-moi" &&
          input.obscurity >= 80 &&
          track.origin === "discogs-deep"
        )
          score += 35;
      }

      if (input.direction === "Même vibe") {
        score += comparison.musicalSimilarity * 35;
        if (track.origin === "tag" || track.origin === "lastfm-tag") score += 10;
        if (track.origin === "lastfm-similar") score += 14;
      }

      if (input.direction === "Même scène") {
        if (comparison.country) score += 22;
        score += comparison.subgenre * 16 + comparison.rawTags * 10;
      }

      if (input.direction === "Labels") {
        if (
          seed.label &&
          track.label &&
          normalized(seed.label) === normalized(track.label)
        )
          score += 34;
        score += comparison.subgenre * 12;
      }

      if (input.direction === "Rabbit hole") {
        score += 18;
        if (track.origin === "lastfm-deep") score += 22;
        if (track.origin === "lastfm-crate") score += 28;
        if (track.origin === "lastfm-tag") score -= 12;
        score +=
          (1 - comparison.musicalSimilarity) * 8 +
          comparison.genre * 12 +
          comparison.traits * 12;
      }

      const jitter = hash(`${track.id}:${input.session}`) % 31;
      if (input.direction === "Surprends-moi") {
        score += jitter * 2.2 + (1 - comparison.musicalSimilarity) * 14;
        if (input.obscurity >= 80 && track.origin === "lastfm-deep") score += 30;
        if (input.obscurity >= 80 && track.origin === "lastfm-similar") score += 8;
        if (input.obscurity >= 80 && track.origin === "release") score += 10;
        if (
          comparison.genre === 0 &&
          comparison.subgenre === 0 &&
          comparison.traits === 0 &&
          comparison.rawTags === 0
        )
          score -= 20;
      } else {
        score += jitter * 0.12;
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
