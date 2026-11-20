// Pure, dependency-free selection engine used by the MPC crate discovery API.
// No network requests and no audio downloading occur in this module.

export interface CrateFilters {
  genre?: string;
  style?: string;
  country?: string;
  yearFrom?: number;
  yearTo?: number;
  instrument?: string;
  maxViews?: number;
  surprise?: boolean;
  count?: number;
  seenKeys?: string[];
}

export interface CrateRelease {
  id: string;
  masterId?: string;
  title: string;
  artist: string;
  year?: number;
  country?: string;
  genres: string[];
  styles: string[];
  instruments?: string[];
  views?: number;
  discogsUrl?: string;
}

export interface CrateSelection {
  releases: CrateRelease[];
  eligibleCount: number;
  warnings: string[];
}

const normalize = (value: string) => value.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

export const workKey = (r: CrateRelease) => `work:${normalize(r.artist)}|${normalize(r.title)}`;
export const masterKey = (r: CrateRelease) => r.masterId ? `master:${r.masterId}` : undefined;
export const releaseKeys = (r: CrateRelease) => [workKey(r), masterKey(r)].filter((x): x is string => !!x);

// Mulberry32: reproducible shuffling for tests, sessions and BACK navigation.
const randomGenerator = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const matches = (value: string | undefined, filter: string | undefined) =>
  !filter || (typeof value === "string" && normalize(value) === normalize(filter));

export function selectCrate(
  candidates: CrateRelease[],
  filters: CrateFilters = {},
  seed = Date.now(),
): CrateSelection {
  const count = Math.max(1, Math.min(12, Math.trunc(filters.count ?? 8)));
  const random = randomGenerator(seed);
  const surprise = filters.surprise === true;
  const warnings: string[] = [];
  const seen = new Set((filters.seenKeys || []).slice(0, 200));
  const unknownInstruments = !surprise && !!filters.instrument && !candidates.some(r => Array.isArray(r.instruments) && r.instruments.length > 0);
  const unknownViews = !surprise && filters.maxViews !== undefined && !candidates.some(r => Number.isFinite(r.views));

  if (unknownInstruments) warnings.push("Instrument indisponible : aucune source ne fournit de crédit fiable pour cette sélection.");
  if (unknownViews) warnings.push("Vues indisponibles : aucune statistique vérifiée pour cette sélection.");

  // Keep original input order irrelevant and avoid common duplicate editions.
  const shuffled = candidates.map(release => ({ release, order: random() }))
    .sort((a, b) => a.order - b.order);
  const unique = new Set<string>();
  const filtered: typeof shuffled = [];

  for (const entry of shuffled) {
    const r = entry.release;
    if (!r.id || !r.title || !r.artist) continue;
    const keys = releaseKeys(r);
    if (keys.some(key => seen.has(key) || unique.has(key))) continue;
    if (!surprise) {
      if (filters.yearFrom !== undefined && (r.year === undefined || r.year < filters.yearFrom)) continue;
      if (filters.yearTo !== undefined && (r.year === undefined || r.year > filters.yearTo)) continue;
      if (!matches(r.country, filters.country)) continue;
      if (filters.genre && !r.genres.some(g => matches(g, filters.genre))) continue;
      if (filters.style && !r.styles.some(s => matches(s, filters.style))) continue;
      if (filters.instrument && !r.instruments?.some(i => matches(i, filters.instrument))) continue;
      if (filters.maxViews !== undefined && (r.views === undefined || r.views > filters.maxViews)) continue;
    }
    keys.forEach(key => unique.add(key));
    filtered.push(entry);
  }

  // Maximise variety before reusing an artist or country, keeping randomness.
  const remaining = [...filtered];
  const picked: CrateRelease[] = [];
  const artistCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const decadeCounts = new Map<number, number>();

  while (remaining.length && picked.length < count) {
    let bestIndex = 0;
    let lowestPenalty = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i].release;
      const artist = normalize(r.artist);
      const country = normalize(r.country || "");
      const decade = r.year ? Math.floor(r.year / 10) : 0;
      const penalty = (artistCounts.get(artist) || 0) * 30
        + (country ? (countryCounts.get(country) || 0) * 4 : 0)
        + (decade ? (decadeCounts.get(decade) || 0) * 2 : 0)
        + remaining[i].order;
      if (penalty < lowestPenalty) { lowestPenalty = penalty; bestIndex = i; }
    }
    const next = remaining.splice(bestIndex, 1)[0].release;
    picked.push(next);
    const artist = normalize(next.artist);
    const country = normalize(next.country || "");
    const decade = next.year ? Math.floor(next.year / 10) : 0;
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    if (country) countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    if (decade) decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  }
  if (!picked.length) warnings.push("Aucun disque ne correspond aux filtres et exclusions actuels.");
  return { releases: picked, eligibleCount: filtered.length, warnings };
}
