import type {
  DiscoveryPath,
  DiscoveryPathEvidence,
  DiscoveryPathNode,
  DiscoveryPathSource,
  Track,
} from "../types";

const compact = (nodes: DiscoveryPathNode[]) =>
  nodes.filter((node, index) => {
    if (!node.name.trim()) return false;
    const previous = nodes[index - 1];
    return !previous ||
      previous.kind !== node.kind ||
      previous.source !== node.source ||
      previous.id !== node.id ||
      previous.name !== node.name;
  });

export function pathNode(
  kind: DiscoveryPathNode["kind"],
  name: string,
  source: DiscoveryPathSource,
  options: { id?: string | number; url?: string } = {},
): DiscoveryPathNode {
  return {
    kind,
    name: name.trim(),
    source,
    id: options.id === undefined ? undefined : String(options.id),
    url: options.url,
  };
}

export function trackNode(
  track: Pick<Track, "id" | "title" | "artist" | "externalIds">,
  source: DiscoveryPathSource,
): DiscoveryPathNode {
  const id =
    track.externalIds?.musicbrainz ||
    track.externalIds?.listenbrainz ||
    track.externalIds?.discogs ||
    track.id;
  return pathNode("track", `${track.artist} — ${track.title}`, source, { id });
}

export function discoveryPath(
  source: DiscoveryPathSource,
  evidence: DiscoveryPathEvidence,
  nodes: DiscoveryPathNode[],
): DiscoveryPath {
  const cleaned = compact(nodes);
  return {
    source,
    evidence,
    nodes: cleaned,
    distance: Math.max(0, cleaned.length - 1),
  };
}

export function lastFmSimilarityPath(
  seed: Track,
  candidate: Pick<Track, "id" | "title" | "artist" | "externalIds">,
): DiscoveryPath {
  return discoveryPath("lastfm", "listening", [
    trackNode(seed, "lastfm"),
    trackNode(candidate, "lastfm"),
  ]);
}

export function lastFmDeepPath(
  seed: Track,
  bridge: { artist: string; title: string },
  candidate: Pick<Track, "id" | "title" | "artist" | "externalIds">,
): DiscoveryPath {
  return discoveryPath("lastfm", "listening", [
    trackNode(seed, "lastfm"),
    pathNode("track", `${bridge.artist} — ${bridge.title}`, "lastfm"),
    trackNode(candidate, "lastfm"),
  ]);
}

export function lastFmCataloguePath(
  seed: Track,
  anchorArtist: string,
  neighbourArtist: string,
  candidate: Pick<Track, "id" | "title" | "artist" | "externalIds">,
): DiscoveryPath {
  return discoveryPath("lastfm", "catalogue", [
    trackNode(seed, "lastfm"),
    pathNode("artist", anchorArtist, "lastfm"),
    pathNode("artist", neighbourArtist, "lastfm"),
    trackNode(candidate, "lastfm"),
  ]);
}

export function listenBrainzPath(
  seed: Track,
  candidate: Pick<Track, "id" | "title" | "artist" | "externalIds">,
  evidence: "listening" | "tag",
  context?: string,
): DiscoveryPath {
  const nodes = [trackNode(seed, "listenbrainz")];
  if (context) nodes.push(pathNode("context", context, "listenbrainz"));
  nodes.push(trackNode(candidate, "listenbrainz"));
  return discoveryPath("listenbrainz", evidence, nodes);
}

export function discogsPath(
  seed: Track,
  evidence:
    | "editorial"
    | "catalogue"
    | "release",
  providerNodes: Array<{
    kind: "release" | "label" | "artist" | "context";
    name: string;
    id?: number;
    url: string;
  }>,
  candidate: Pick<Track, "id" | "title" | "artist" | "externalIds">,
): DiscoveryPath {
  return discoveryPath("discogs", evidence, [
    trackNode(seed, "discogs"),
    ...providerNodes.map(node =>
      pathNode(node.kind, node.name, "discogs", {
        id: node.id,
        url: node.url,
      }),
    ),
    trackNode(candidate, "discogs"),
  ]);
}
