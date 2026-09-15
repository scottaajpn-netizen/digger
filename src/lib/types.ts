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
export interface Track {
  id: string; title: string; artist: string; scene: string; label: string;
  tags: string[]; obscurity: number; year: number; colors: [string, string];
  artistId?: string; releaseId?: string; country?: string; album?: string;
  popularity?: number; listenCount?: number; lastfmListeners?: number;
  analysis?: MusicalAnalysis;
  obscurityKnown?: boolean;
  discogs?: DiscogsEvidence;
  externalIds?: { musicbrainz?: string; listenbrainz?: string; lastfm?: string; discogs?: string };
}
export interface Recommendation extends Track { reason: string }
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
  source?: SeedSource;
}
export interface DigRequest { seed: string; seedId?: string; seedTrack?: SeedReference; direction: Direction; obscurity: number; feedback: FeedbackMap; session: number }
export interface DigResponse { tracks: Recommendation[]; seed: Track; fallback: boolean; source: "mock" | "live"; direction: Direction; obscurity: number; notes?: string[] }
export interface MusicProvider { id: string; search(query: string): Promise<Track[]>; candidates(seed: Track): Promise<Track[]> }
