import type { MusicalContextAudit, MusicalOverlapScope, Track } from "../types";
import { normalizeMusicTags } from "./taxonomy";

type AuditableTrack = Pick<Track,"tags"|"tagEvidence"|"discogs"|"retrieval">;
type Scope = keyof MusicalContextAudit;

/** Provenance concerns the provider's scope, not perceived sound similarity. */
export function auditMusicalContext(track: AuditableTrack): MusicalContextAudit {
  const buckets: Record<Scope,string[]> = {recording:[],artist:[],release:[],context:[],unscoped:[]};
  const scoped = new Set<string>();
  for (const observation of track.tagEvidence || []) {
    for (const tag of observation.tags) {
      if (typeof tag !== "string" || !tag.trim()) continue;
      buckets[observation.scope].push(tag);
      scoped.add(tag.trim().toLowerCase());
    }
  }
  for (const tag of track.tags || []) {
    if (typeof tag === "string" && tag.trim() && !scoped.has(tag.trim().toLowerCase()))
      buckets.unscoped.push(tag);
  }
  if (track.discogs) buckets.release.push(...track.discogs.styles,...track.discogs.genres);
  buckets.artist.push(...(track.retrieval?.artistRelation?.tags || []));
  buckets.context.push(...(track.retrieval?.contextTags || []));
  const classify = (tags: string[]) => {
    const normalized = normalizeMusicTags(tags);
    return [...new Set([...normalized.subgenres, ...normalized.traits])];
  };
  return {
    recording: classify(buckets.recording),
    artist: classify(buckets.artist),
    release: classify(buckets.release),
    context: classify(buckets.context),
    unscoped: classify(buckets.unscoped),
  };
}

/** Explanations only: scoring is intentionally unchanged in this first pass. */
export function describeMusicalOverlap(
  kind: "subgenre"|"traits",
  shared: string[],
  seed: MusicalContextAudit,
  candidate: MusicalContextAudit,
): string | undefined {
  if (!shared.length) return undefined;
  const trackMatches = shared.filter(tag=>seed.recording.includes(tag)&&candidate.recording.includes(tag));
  if (trackMatches.length) {
    const joined=trackMatches.slice(0,2).join(" / ");
    return kind==="subgenre"
      ? "Sous-genre partagé dans les tags des deux enregistrements : "+joined+"."
      : "Traits partagés dans les tags des deux enregistrements : "+joined+".";
  }
  const releaseMatches = shared.filter(tag=>seed.release.includes(tag)||candidate.release.includes(tag));
  if (releaseMatches.length)
    return "Style associé à une sortie/compilation (indice, non confirmé sur les deux morceaux) : "+releaseMatches.slice(0,2).join(" / ")+".";
  return "Contexte musical commun dans les métadonnées (indice, pas analyse audio) : "+shared.slice(0,2).join(" / ")+".";
}


/**
 * Mutually exclusive overlap categories for evaluating the provenance of
 * shared fine musical tags. A release style is a clue, not a track fact.
 * Unknown / unscoped tags cannot establish a recording-level match.
 */
export function classifyMusicalOverlap(
  shared: readonly string[],
  seed: MusicalContextAudit,
  candidate: MusicalContextAudit,
): MusicalOverlapScope {
  if (!shared.length) return "none";
  if (shared.some(tag => seed.recording.includes(tag) && candidate.recording.includes(tag)))
    return "recording";
  if (shared.some(tag => seed.release.includes(tag) || candidate.release.includes(tag)))
    return "release-context";
  if (shared.some(tag => seed.artist.includes(tag) || candidate.artist.includes(tag) ||
    seed.context.includes(tag) || candidate.context.includes(tag)))
    return "artist-context";
  return "unscoped";
}

/**
 * Optional scoring experiment; not enabled in production.
 * Only discount the fine-tag share of the similarity when it relies on
 * release context. Leave year/country/labels and all graph evidence alone.
 */
export function cautiousReleaseSimilarity(
  comparison: { musicalSimilarity:number; subgenre:number; traits:number },
  scope: MusicalOverlapScope,
): number {
  if (scope !== "release-context") return comparison.musicalSimilarity;
  const releaseFineShare = comparison.subgenre * 0.42 + comparison.traits * 0.27;
  return Math.max(0, comparison.musicalSimilarity - 0.5 * releaseFineShare);
}
