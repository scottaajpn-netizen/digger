import type { Direction, MusicalOverlapScope } from "../types";

export type VibeEvidenceAdjustment = {
  origin: number;
  discoveryPath: number;
  direction: number;
};

const noAdjustment = (): VibeEvidenceAdjustment => ({
  origin: 0, discoveryPath: 0, direction: 0,
});

const boundedArtistScore = (similarity: number | undefined) =>
  typeof similarity === "number" && Number.isFinite(similarity)
    ? Math.max(0, Math.min(1, similarity)) * 6
    : 0;

/**
 * Experimental (shadow-only) correction for inflated artist-neighbour scores.
 *
 * A Last.fm artist.getSimilar number measures the neighbourhood of *artists*,
 * not the sonic similarity of the selected recordings.
 *
 * Instead of an arbitrary blanket -20 penalty, reverse positive bonuses
 * granted solely for Last.fm catalogue origin and artist-neighbour match.
 * A small 8-point traversal caution applies to two-artist-hop paths, whose
 * pool relevance also rewards neighbour ranks. Tag -> artist -> top track
 * remains contextual and receives a limited 12-point caution.
 *
 * Never remove a candidate, Discogs relationship, direct track similarity,
 * artist/label feedback, or source material. Explicit recording-scoped
 * overlap exempts the route, even if its origin is artist-level.
 *
 * These numbers are hypotheses, not calibrated musical accuracy.
 */
export function calibrateIndirectVibe(
  direction: Direction,
  origin: string,
  overlapScope: MusicalOverlapScope,
  obscurity: number,
  artistSimilarity: number | undefined,
): VibeEvidenceAdjustment {
  if (direction !== "Même vibe" || overlapScope === "recording")
    return noAdjustment();

  const artistBonus = boundedArtistScore(artistSimilarity);

  if (origin === "lastfm-crate") {
    return {
      // Mirrors the exact +24 origin boost at obscurity >=80 in scoring.ts.
      origin: obscurity >= 80 ? -24 : 0,
      discoveryPath: -artistBonus,
      direction: obscurity >= 80 ? 0 : -8,
    };
  }
  if (origin === "lastfm-artist-hop") {
    return { origin: 0, discoveryPath: -artistBonus, direction: -8 };
  }
  if (origin === "lastfm-tag-crate") {
    return { origin: 0, discoveryPath: 0, direction: -12 };
  }
  return noAdjustment();
}
