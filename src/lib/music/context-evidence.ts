import type { MusicalContextAudit, MusicalTagEvidence, Track } from "../types";
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
