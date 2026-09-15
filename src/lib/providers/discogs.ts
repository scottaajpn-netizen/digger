import { normalizeMusicTags } from "../music/taxonomy";

/** Internal contract for a future server-side adapter; no network calls yet. */
export interface DiscogsReleaseEvidence {
  releaseId: number;
  masterId?: number;
  title: string;
  artists: { id: number; name: string }[];
  labels: { id: number; name: string; catalogNumber?: string }[];
  genres: string[];
  styles: string[];
  country?: string;
  year?: number;
  compilation: boolean;
  sourceUrl: string;
  fetchedAt: string;
}

export interface DiscogsConnection {
  kind: "shared-label" | "shared-compilation" | "shared-credit";
  seedReleaseId: number;
  candidateReleaseId: number;
  via: { id: number; name: string };
  evidenceUrls: string[];
}

export interface DiscogsProvider {
  /** Search results require identity/version confirmation before expansion. */
  searchReleases(artist: string, title: string, signal: AbortSignal): Promise<DiscogsReleaseEvidence[]>;
  getRelease(id: number, signal: AbortSignal): Promise<DiscogsReleaseEvidence>;
  connections(release: DiscogsReleaseEvidence, signal: AbortSignal): Promise<DiscogsConnection[]>;
}

export function profileFromDiscogsRelease(release: DiscogsReleaseEvidence) {
  // Styles are more specific; keep raw evidence separate from normalized taxonomy.
  // Release-level metadata must not silently become verified track-level metadata.
  return { ...normalizeMusicTags([...release.styles, ...release.genres]), scope: "release" as const };
}
