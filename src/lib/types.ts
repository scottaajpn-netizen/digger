import type { DiscogsEvidence } from "./providers/discogs";
export const directions = ["Même vibe", "Même scène", "Labels", "Rabbit hole", "Surprends-moi"] as const;
export type Direction = typeof directions[number];
export const feedbackValues = ["love", "curious", "neutral", "known"] as const;
export type Feedback = typeof feedbackValues[number];
export type FeedbackMap = Record<string, Feedback>;
export interface MusicalAnalysis {
  genres: string[];
  subgenres: string[];
  traits: string[];
  similarity?: number;
}
export type CandidateEvidenceTier = "strong" | "credible" | "exploratory";
export type CandidateEvidencePath = "structured" | "behavioral" | "catalogue" | "tag" | "none";
export interface CandidateEvidence {
  tier: CandidateEvidenceTier;
  musical: boolean;
  path: CandidateEvidencePath;
  retrievalDepth: number;
}
export type DiscoveryPathSource = "discogs" | "lastfm" | "listenbrainz" | "musicbrainz";
export type DiscoveryPathEvidence =
  | "editorial"
  | "listening"
  | "catalogue"
  | "tag"
  | "release";
export interface DiscoveryPathNode {
  kind: "track" | "artist" | "release" | "label" | "context";
  name: string;
  source: DiscoveryPathSource;
  id?: string;
  url?: string;
}
export interface DiscoveryPath {
  source: DiscoveryPathSource;
  evidence: DiscoveryPathEvidence;
  nodes: DiscoveryPathNode[];
  distance: number;
}
export type ArtistRole = "primary" | "featured" | "remixer" | "producer";
export type ArtistSource = "musicbrainz" | "discogs" | "lastfm";
export interface ArtistCredit {
  name: string;
  role: ArtistRole;
  source: ArtistSource;
  sourceId?: string;
  joinPhrase?: string;
}
export interface Track {
  id: string; title: string; artist: string; scene: string; label: string;
  tags: string[]; obscurity: number; year: number; colors: [string, string];
  artistId?: string; releaseId?: string; country?: string; album?: string;
  popularity?: number; listenCount?: number; lastfmListeners?: number;
  lastfmArtistListeners?: number;
  analysis?: MusicalAnalysis;
  discoveryPath?: DiscoveryPath;
  credits?: ArtistCredit[];
  obscurityKnown?: boolean;
  discogs?: DiscogsEvidence;
  externalIds?: { musicbrainz?: string; listenbrainz?: string; lastfm?: string; discogs?: string };
}
export interface Recommendation extends Track {
  reason: string;
  score?: number;
  evidence?: CandidateEvidence;
  scoreBreakdown?: {
    relevance: number;
    musicalSimilarity: number;
    sharedTags: number;
    preferredTags: number;
    popularityObscurity: number;
    audience: number;
    artistAudience: number;
    origin: number;
    discoveryPath: number;
    memory: number;
    discogs: number;
    direction: number;
    jitter: number;
  };
}
export type SeedSource = "musicbrainz" | "lastfm" | "discogs" | "mixed";
export interface SeedReference {
  id: string;
  title: string;
  artist: string;
  scene?: string;
  label?: string;
  tags?: string[];
  year?: number;
  artistId?: string;
  releaseId?: string;
  country?: string;
  album?: string;
  externalIds?: Track["externalIds"];
  credits?: ArtistCredit[];
  source?: SeedSource;
}
export interface DiscoveryMemorySnapshot {
  pathScores: Record<string, number>;
  knownTracks: string[];
  updatedAt?: string;
}
export interface DigRequest { seed: string; seedId?: string; seedTrack?: SeedReference; direction: Direction; obscurity: number; feedback: FeedbackMap; session: number; memory?: DiscoveryMemorySnapshot }
export interface DigResponse { tracks: Recommendation[]; seed: Track; fallback: boolean; source: "mock" | "live"; direction: Direction; obscurity: number; notes?: string[] }
export interface MusicProvider { id: string; search(query: string): Promise<Track[]>; candidates(seed: Track): Promise<Track[]> }
