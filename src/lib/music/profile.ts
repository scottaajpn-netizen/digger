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

  const musicalSimilarity =
    subgenre * 0.34 +
    genre * 0.20 +
    traits * 0.18 +
    rawTags * 0.12 +
    year * 0.08 +
    country * 0.05 +
    labels * 0.03;

  return { genre, subgenre, traits, rawTags, labels, country, year, musicalSimilarity };
}
