import { normalized, trackIdentity, type Candidate } from "./ranking";
import type {
  BranchDiagnostics,
  BranchOverlapDiagnostics,
} from "../types";

type DiagnosticCandidate = Pick<
  Candidate,
  "artist" | "title" | "origin" | "discoveryPath" | "retrieval"
>;

const jaccard = (left: Set<string>, right: Set<string>) => {
  const shared = [...left].filter(value => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return {
    shared,
    union,
    value: union === 0 ? 0 : shared / union,
  };
};

function topologyKey(track: DiagnosticCandidate) {
  const path = track.discoveryPath;
  if (!path) return "none";
  const shape = path.nodes.map(node => node.kind).join(">");
  return `${path.source}:${path.evidence}:${shape || "empty"}`;
}

function providerKey(track: DiagnosticCandidate) {
  return (
    track.discoveryPath?.source ||
    track.retrieval?.provider ||
    "unknown"
  );
}

function uniqueSetsByOrigin(candidates: DiagnosticCandidate[]) {
  const tracks = new Map<string, Set<string>>();
  const artists = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    const origin = candidate.origin;
    const trackSet = tracks.get(origin) || new Set<string>();
    trackSet.add(trackIdentity(candidate));
    tracks.set(origin, trackSet);

    const artistSet = artists.get(origin) || new Set<string>();
    const artist = normalized(candidate.artist);
    if (artist) artistSet.add(artist);
    artists.set(origin, artistSet);
  }

  return { tracks, artists };
}

export function analyzeBranchDiagnostics(
  generated: DiagnosticCandidate[],
  kept: DiagnosticCandidate[],
): BranchDiagnostics {
  const generatedSets = uniqueSetsByOrigin(generated);
  const keptTrackIds = new Set(kept.map(trackIdentity));
  const origins = [...generatedSets.tracks.keys()].sort();

  const survival = origins.map(origin => {
    const generatedTracks = generatedSets.tracks.get(origin) || new Set<string>();
    const keptCount = [...generatedTracks].filter(id => keptTrackIds.has(id)).length;
    return {
      origin,
      generated: generatedTracks.size,
      kept: keptCount,
      survivalRate:
        generatedTracks.size === 0 ? 0 : keptCount / generatedTracks.size,
    };
  });

  const overlaps: BranchOverlapDiagnostics[] = [];
  for (let leftIndex = 0; leftIndex < origins.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < origins.length; rightIndex += 1) {
      const left = origins[leftIndex];
      const right = origins[rightIndex];
      const trackOverlap = jaccard(
        generatedSets.tracks.get(left) || new Set<string>(),
        generatedSets.tracks.get(right) || new Set<string>(),
      );
      const artistOverlap = jaccard(
        generatedSets.artists.get(left) || new Set<string>(),
        generatedSets.artists.get(right) || new Set<string>(),
      );
      overlaps.push({
        left,
        right,
        sharedTracks: trackOverlap.shared,
        unionTracks: trackOverlap.union,
        trackJaccard: trackOverlap.value,
        sharedArtists: artistOverlap.shared,
        unionArtists: artistOverlap.union,
        artistJaccard: artistOverlap.value,
      });
    }
  }

  const providerTracks = new Map<string, Set<string>>();
  const topologyTracks = new Map<string, Set<string>>();
  for (const candidate of generated) {
    const identity = trackIdentity(candidate);
    const provider = providerKey(candidate);
    const providerSet = providerTracks.get(provider) || new Set<string>();
    providerSet.add(identity);
    providerTracks.set(provider, providerSet);

    const topology = topologyKey(candidate);
    const topologySet = topologyTracks.get(topology) || new Set<string>();
    topologySet.add(identity);
    topologyTracks.set(topology, topologySet);
  }

  const providerCounts = Object.fromEntries(
    [...providerTracks.entries()].map(([provider, tracks]) => [
      provider,
      tracks.size,
    ]),
  );
  const topologyCounts = Object.fromEntries(
    [...topologyTracks.entries()].map(([topology, tracks]) => [
      topology,
      tracks.size,
    ]),
  );

  return {
    survival,
    overlaps,
    maxTrackJaccard: Math.max(0, ...overlaps.map(row => row.trackJaccard)),
    maxArtistJaccard: Math.max(0, ...overlaps.map(row => row.artistJaccard)),
    diversity: {
      providerCounts,
      topologyCounts,
      providerCount: Object.keys(providerCounts).length,
      topologyCount: Object.keys(topologyCounts).length,
    },
  };
}
