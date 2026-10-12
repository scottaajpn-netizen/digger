import type { Recommendation } from "../types";
import { inspectPathEdges, type PathEdge } from "./path-edges";

/**
 * An audit of what a discovery path actually demonstrates. The path can be
 * correct as a catalogue graph while remaining weak as a musical claim.
 * Categories are qualitative, NOT calibrated probabilities or user ratings.
 *
 * This module is intentionally read-only: no scoring changes or API calls.
 */
type AuditedTrack = Pick<
  Recommendation,
  "discoveryPath" | "retrieval" | "discogs" | "analysis" | "evidence"
> & { origin?: string };

export type PathRelationKind =
  | "track-similarity"
  | "artist-listening"
  | "artist-similarity-chain"
  | "catalogue-link"
  | "editorial-context"
  | "tag-context"
  | "unknown";

export type PathReliabilityFlag =
  | "artist-chain-mislabeled-listening"
  | "release-tags-used-as-musical-proof"
  | "discogs-link-labeled-editorial"
  | "scene-context-is-not-musical-proof"
  | "long-path-no-recording-match"
  | "unscoped-tags-used-as-proof"
  | "discogs-structured-without-path"
  | "unclassified-path-step";

export type PathReliabilityAudit = {
  relation: PathRelationKind;
  pathLength: number;
  flags: PathReliabilityFlag[];
  edges: PathEdge[];
  directTrackAssociations: number;
  contextualSteps: number;
  unclassifiedSteps: number;
};

export function auditDiscoveryPath(track: AuditedTrack): PathReliabilityAudit {
  const path = track.discoveryPath;
  const origin = track.origin || "";
  let relation: PathRelationKind = "unknown";
  if (origin === "lastfm-similar" && path?.source === "lastfm" && path.evidence === "listening") {
    relation = "track-similarity";
  } else if (origin === "artist-radio" && path?.source === "listenbrainz" && path.evidence === "listening") {
    relation = "artist-listening";
  } else if (origin === "lastfm-artist-hop" && path?.source === "lastfm") {
    relation = "artist-similarity-chain";
  } else if (path?.source === "discogs") {
    relation = origin === "discogs-scene" ? "editorial-context" : "catalogue-link";
  } else if (path?.evidence === "tag" || origin === "lastfm-tag-crate" || origin === "lastfm-tag") {
    relation = "tag-context";
  } else if (path?.evidence === "catalogue" || origin === "lastfm-crate") {
    relation = "catalogue-link";
  } else if (path?.evidence === "listening") {
    relation = "track-similarity";
  }

  const edges = inspectPathEdges(path, origin);
  const flags: PathReliabilityFlag[] = [];
  if (edges.some(edge=>edge.support==="unclassified")) {
    flags.push("unclassified-path-step");
  }
  if (origin === "lastfm-artist-hop" && path?.evidence === "listening") {
    // Two artist.getSimilar traversals + artist.getTopTracks are not evidence
    // that the seed and result tracks were directly listened to together.
    flags.push("artist-chain-mislabeled-listening");
  }
  if (track.analysis?.overlapScope === "release-context" && track.evidence?.musical) {
    flags.push("release-tags-used-as-musical-proof");
  }
  if (path?.source === "discogs" && path.evidence === "editorial" &&
      ["discogs-label", "discogs-deep", "discogs-compilation"].includes(origin)) {
    // This is a confirmed Discogs graph connection, not an editorial review
    // or a curator's declaration that the two recordings sound alike.
    flags.push("discogs-link-labeled-editorial");
  }
  if (origin === "discogs-scene" && track.evidence?.musical) {
    flags.push("scene-context-is-not-musical-proof");
  }
  const pathLength = Math.max(0, path?.distance || 0);
  if (pathLength >= 3 &&
      track.analysis?.overlapScope !== "recording" && track.evidence?.tier !== "exploratory") {
    flags.push("long-path-no-recording-match");
  }
  if (track.analysis?.overlapScope === "unscoped" && track.evidence?.musical) {
    flags.push("unscoped-tags-used-as-proof");
  }
  if (track.discogs && !path && track.evidence?.path === "structured") {
    flags.push("discogs-structured-without-path");
  }
  return {
    relation,pathLength,flags,edges,
    directTrackAssociations: edges.filter(edge=>
      edge.relation==="track-similarity" || edge.relation==="radio-association"
    ).length,
    contextualSteps: edges.filter(edge=>edge.support==="contextual").length,
    unclassifiedSteps: edges.filter(edge=>edge.support==="unclassified").length,
  };
}
