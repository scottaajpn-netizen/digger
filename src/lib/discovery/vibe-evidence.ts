import type { Direction, MusicalOverlapScope } from "../types";

/**
 * Shadow-only calibration: a documented *artist catalogue link* does not
 * demonstrate similarity between the two recordings. Discount some of its
 * positive retrieval weight when the recordings have no separately scoped
 * fine-grained metadata in common.
 *
 * This is an experiment, not a verified estimate of listening similarity.
 * A path through a label/compilation is intentionally untouched, because
 * genuinely useful obscure discoveries may have sparse track metadata.
 */
export function indirectVibeAdjustment(
  direction: Direction,
  origin: string,
  overlapScope: MusicalOverlapScope,
): number {
  if (direction !== "Même vibe" || overlapScope === "recording") return 0;
  if (origin === "lastfm-crate" || origin === "lastfm-artist-hop") return -20;
  if (origin === "lastfm-tag-crate") return -16;
  return 0;
}
