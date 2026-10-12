import type {
  CandidateEvidence,
  CandidateEvidencePath,
  DiscoveryPath,
  Track,
} from "../types";

type MusicalComparisonForEvidence = {
  genre: number;
  subgenre: number;
  traits: number;
  rawTags: number;
  labels: number;
  country: number;
  year: number;
};

function evidencePathKind(
  track: Pick<Track, "discoveryPath" | "discogs">,
): CandidateEvidencePath {
  const path: DiscoveryPath | undefined = track.discoveryPath;

  if (track.discogs && !path) return "structured";
  if (!path) return "none";

  if (
    path.source === "discogs" &&
    (path.evidence === "editorial" || path.evidence === "release")
  ) {
    return "structured";
  }
  if (path.source === "discogs" && path.evidence === "catalogue") {
    return "catalogue";
  }

  if (path.evidence === "editorial" || path.evidence === "release") {
    return "structured";
  }
  // Last.fm two-hop artist.getSimilar relationships lead to a top-track
  // catalogue, NOT a recording-level listening association. Handle legacy
  // paths previously mislabeled listening as well.
  if (path.source === "lastfm" &&
      path.nodes.filter(node => node.kind === "artist").length >= 3 &&
      path.nodes[0]?.kind === "track" &&
      path.nodes.at(-1)?.kind === "track") {
    return "artist-link";
  }
  if (path.evidence === "listening") return "behavioral";
  if (path.evidence === "catalogue") return "catalogue";
  if (path.evidence === "tag") return "tag";
  return "none";
}

/**
 * Evidence is deliberately qualitative: retrieval rank is not proof that a
 * recommendation is musically useful. A candidate can still be credible with
 * weak metadata when it has a structured editorial or behavioral path.
 */
export function assessCandidateEvidence(
  track: Pick<Track, "discoveryPath" | "discogs">,
  comparison: MusicalComparisonForEvidence,
): CandidateEvidence {
  const fineMusicalEvidence =
    comparison.subgenre > 0 ||
    comparison.traits > 0 ||
    comparison.labels > 0 ||
    comparison.rawTags >= 0.25;

  const contextualMusicalEvidence =
    comparison.genre > 0 &&
    (comparison.country > 0 || comparison.year >= 0.5 || comparison.rawTags > 0);

  const musical = fineMusicalEvidence || contextualMusicalEvidence;
  const path = evidencePathKind(track);
  // A documented artist-link is credible for exploring music, but does
  // not claim the recordings were listened to together.
  const crediblePath = path === "structured" || path === "behavioral" ||
    path === "artist-link";

  const tier: CandidateEvidence["tier"] =
    musical && crediblePath
      ? "strong"
      : musical || crediblePath
        ? "credible"
        : "exploratory";

  return {
    tier,
    musical,
    path,
    retrievalDepth: Math.max(0, track.discoveryPath?.distance || 0),
  };
}
