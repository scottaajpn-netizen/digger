import type { Track } from "../types";
import { normalizeMusicTags } from "./taxonomy";

export type MusicalProfile = {
  genres: string[];
  subgenres: string[];
  traits: string[];
  rawTags: string[];
  unknownTags: string[];
  year?: number;
  country?: string;
  labels: string[];
};

export function buildMusicalProfile(track: Pick<Track, "tags" | "year" | "country" | "label">): MusicalProfile {
  const normalized = normalizeMusicTags(track.tags ?? []);
  return {
    ...normalized,
    rawTags: track.tags ?? [],
    year: track.year || undefined,
    country: track.country || undefined,
    labels: track.label ? [track.label] : [],
  };
}

/** Broad tag charts are not evidence of a useful digging connection. */
export function discoveryTags(tags: string[]): string[] {
  return [...new Set(normalizeMusicTags(tags).subgenres)].slice(0, 3);
}

const overlap = (a: string[], b: string[]) => {
  if (!a.length || !b.length) return 0;
  const left = new Set(a.map(v => v.toLowerCase()));
  const right = new Set(b.map(v => v.toLowerCase()));
  let common = 0;
  for (const value of left) if (right.has(value)) common++;
  return common / Math.max(left.size, right.size);
};

export function compareMusicalProfiles(seed: MusicalProfile, candidate: MusicalProfile) {
  const genre = overlap(seed.genres, candidate.genres);
  const subgenre = overlap(seed.subgenres, candidate.subgenres);
  const traits = overlap(seed.traits, candidate.traits);
  const rawTags = overlap(seed.rawTags, candidate.rawTags);
  const labels = overlap(seed.labels, candidate.labels);
  const country = seed.country && candidate.country && seed.country.toLowerCase() === candidate.country.toLowerCase() ? 1 : 0;
  const year = seed.year && candidate.year ? Math.max(0, 1 - Math.abs(seed.year - candidate.year) / 12) : 0;

  // Broad genre labels (e.g. "hip hop") are weak evidence on their own.
  // Fine-grained subgenres and musical traits carry most of the similarity score.
  const musicalSimilarity =
    subgenre * 0.42 +
    genre * 0.03 +
    traits * 0.27 +
    rawTags * 0.01 +
    year * 0.12 +
    country * 0.07 +
    labels * 0.08;

  return { genre, subgenre, traits, rawTags, labels, country, year, musicalSimilarity };
}
