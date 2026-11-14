import type { Feedback, TasteFeatures, TasteProfile } from "../types";
import type { ImportedTasteStore } from "./taste-import";

const normalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
const rows = (v: unknown): unknown[] => Array.isArray(v) ? v.slice(0, 24) : [];
const unique = (values: string[]) => [...new Set(values)].filter(Boolean).slice(0, 24);

/** Persist only bounded musical facts. Context/artist/release tags are not
 * silently promoted to recording tags; display scene strings are not evidence. */
export function tasteFeatures(value: unknown): TasteFeatures {
  const track = object(value);
  const artists: string[] = [], tags: string[] = [], labels: string[] = [];
  if (typeof track.artistId === "string" && uuid.test(track.artistId)) artists.push(`mb:${track.artistId.toLowerCase()}`);
  for (const item of rows(track.credits)) {
    const c = object(item);
    if (c.role !== "primary" && c.role !== "featured") continue;
    if (c.source === "musicbrainz" && typeof c.sourceId === "string" && uuid.test(c.sourceId)) artists.push(`mb:${c.sourceId.toLowerCase()}`);
    if (c.source === "discogs" && typeof c.sourceId === "string" && /^\d{1,12}$/.test(c.sourceId)) artists.push(`discogs:${c.sourceId}`);
  }
  // Imported names are a weak preference only, never an identity assertion.
  if (typeof track.artist === "string" && normalize(track.artist).replace(/ /g, "").length > 5) artists.push(`name:${normalize(track.artist).slice(0, 300)}`);
  for (const item of rows(track.tagEvidence)) {
    const e = object(item);
    if (e.scope !== "recording" || !["musicbrainz", "lastfm", "listenbrainz", "discogs"].includes(String(e.source))) continue;
    for (const tag of rows(e.tags)) if (typeof tag === "string") tags.push(normalize(tag.slice(0, 100)));
  }
  for (const item of rows(object(track.discogs).labels)) {
    const label = object(item);
    if (Number.isSafeInteger(label.id) && Number(label.id) > 0) labels.push(`discogs:${label.id}`);
  }
  return { artists: unique(artists), tags: unique(tags), labels: unique(labels) };
}

export function parseTasteFeatures(value: unknown): TasteFeatures {
  const raw = object(value);
  const strings = (v: unknown) => unique(rows(v).filter((s): s is string => typeof s === "string" && s.length <= 320));
  return { artists: strings(raw.artists), tags: strings(raw.tags), labels: strings(raw.labels) };
}

export function buildTasteProfile(
  observations: Array<{ feedback: Feedback; features?: TasteFeatures }>,
  imported?: ImportedTasteStore,
): TasteProfile {
  const profile: TasteProfile = { artists: Object.create(null), tags: Object.create(null), labels: Object.create(null) };
  for (const row of observations) {
    // Curiosity, sampling utility and already-known are not listening likes.
    const weight = row.feedback === "love" ? 1 : row.feedback === "neutral" ? -0.75 : 0;
    if (!weight || !row.features) continue;
    for (const dimension of ["artists", "tags", "labels"] as const) {
      for (const key of unique(row.features[dimension])) {
        const strength = key.startsWith("name:") ? 0.25 : 1;
        profile[dimension][key] = (profile[dimension][key] || 0) + weight * strength;
      }
    }
  }
  // One contribution per resolved track; duplicates never amplify preferences.
  const seen = new Set<string>();
  for (const track of imported?.tracks || []) {
    if (track.status !== "AUTO" || track.resolverConfidence < 90 || !track.artist || !track.title) continue;
    const identity = `${normalize(track.artist)}\0${normalize(track.title)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (normalize(track.artist).replace(/ /g, "").length <= 5) continue;
    const key = `name:${normalize(track.artist)}`;
    profile.artists[key] = (profile.artists[key] || 0) + 0.15;
  }
  for (const [tag, weight] of Object.entries(imported?.tasteTags || {})) {
    if (Number.isFinite(weight) && weight > 0) profile.tags[tag] = (profile.tags[tag] || 0) + Math.min(1, weight) * 0.5;
  }
  for (const dimension of ["artists", "tags", "labels"] as const) {
    for (const key of Object.keys(profile[dimension])) profile[dimension][key] = Math.max(-1, Math.min(1, profile[dimension][key]));
  }
  return profile;
}

export function tasteScore(value: unknown, profile?: TasteProfile): number {
  if (!profile) return 0;
  const features = tasteFeatures(value);
  const mean = (dimension: keyof TasteProfile) => {
    const matches = features[dimension].map(key => profile[dimension][key]).filter((v): v is number => Number.isFinite(v));
    return matches.length ? matches.reduce((a, b) => a + b, 0) / matches.length : 0;
  };
  return Math.max(-6, Math.min(8, mean("artists") * 3 + mean("tags") * 4 + mean("labels") * 2));
}
