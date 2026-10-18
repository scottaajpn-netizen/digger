import { lastFmJson } from "../providers/http";
import { normalized, trackIdentity, passesDeepAudienceGate, selectModeRecommendations } from "./ranking";
import { rankDiscoveryCandidates } from "./scoring";
import { assessLastFmRecordingIdentity } from "./recording-identity";
import type { ShadowInput } from "./shadow-comparison";

type Info = { track?: { name?: string; mbid?: string; artist?: {name?:string;mbid?:string};
  toptags?: { tag?: Array<{name?:string}> } } };

/** Offline benchmark only. Spend unused track.getInfo slots; never displace audience checks.
 * Baseline is frozen. Reuse the real scorer and selector on a copied pool.
 */
export async function compareRecordingEnrichment(input: ShadowInput, audienceLookups: number, signal: AbortSignal) {
  const hasRecordingTags = (t: ShadowInput["pool"][number]) =>
    Boolean(t.tagEvidence?.some(e => e.scope === "recording" && e.tags.length));
  const unusedBudget = Math.max(0, 60 - audienceLookups);
  const seen = new Set<string>();
  const targets = input.input.direction !== "Surprends-moi" ? [] : input.baselineSelected.filter(t => {
    const identity=trackIdentity(t);
    if (t.evidence?.tier !== "exploratory" || hasRecordingTags(t) || seen.has(identity) ||
        !Number.isFinite(t.lastfmListeners) || t.lastfmListeners! <= 0 ||
        !passesDeepAudienceGate(t,input.input.obscurity)) return false;
    seen.add(identity);
    return true;
  }).slice(0,Math.min(10,unusedBudget));
  const pool=structuredClone(input.pool);
  let requests=0,cacheHits=0;
  const outcomes:Array<{id:string;artist:string;title:string;status:string;tags:string[]}> = [];
  for(const target of targets){
    signal.throwIfAborted();
    let info:Info|null;
    try {
      info=await lastFmJson<Info>("track.getInfo",{artist:target.artist,track:target.title,autocorrect:"0"},signal,
        event=>{if(event==="request")requests++;else cacheHits++;});
    } catch {
      signal.throwIfAborted();
      outcomes.push({id:target.id,artist:target.artist,title:target.title,status:"provider-error",tags:[]});continue;
    }
    const row=info?.track;
    const artistConflict=Boolean(target.artistId && row?.artist?.mbid && target.artistId.toLowerCase()!==row.artist.mbid.toLowerCase());
    const guard=assessLastFmRecordingIdentity({seedArtist:target.artist,
      expectedRecordingMbid:target.externalIds?.musicbrainz,returnedRecordingMbid:row?.mbid,
      artistMbidConflicts:artistConflict,
      confirmedArtistMbid:Boolean(target.artistId && row?.artist?.mbid && target.artistId.toLowerCase()===row.artist.mbid.toLowerCase())});
    // Exact normalized title preserves remix/version qualifiers. No artist-neighbour fallback.
    const identity=Boolean(row?.name && row.artist?.name &&
      normalized(row.name)===normalized(target.title) && normalized(row.artist.name)===normalized(target.artist) && guard.allowSeedMetadata);
    const tags=identity ? [...new Set((row?.toptags?.tag||[]).map(t=>t.name?.trim()).filter((t):t is string=>Boolean(t)))] : [];
    outcomes.push({id:target.id,artist:target.artist,title:target.title,
      status:!row?"unavailable":!identity?"identity-rejected":tags.length?"enriched":"no-tags",tags});
    if(!tags.length)continue;
    const candidate=pool.find(t=>t.id===target.id);
    if(!candidate)continue;
    candidate.tags=[...new Set([...candidate.tags,...tags])];
    candidate.tagEvidence=[...(candidate.tagEvidence||[]),{source:"lastfm",scope:"recording",tags}];
  }
  const ranked=rankDiscoveryCandidates({pool,seed:input.seed,seedProfile:input.seedProfile,input:input.input,seedParticipantKeys:input.seedParticipantKeys});
  const gated=ranked.filter(t=>input.input.obscurity<90 || (t.origin!=="lastfm-tag" && passesDeepAudienceGate(t,input.input.obscurity)));
  const known=new Set((input.input.memory?.knownTracks||[]).map(k=>k.split("\u0000")[0]).filter(Boolean));
  const selected=selectModeRecommendations(gated,input.seed.artist,input.input.direction,10,known);
  const before=input.baselineSelected;
  return {
    audienceLookups,unusedBudget,lookups:targets.length,requests,cacheHits,
    // Existing lastFmJson retry policy allows at most 3 wire requests per lookup.
    maxCombinedWireRequests:60*3,
    enriched:outcomes.filter(o=>o.status==="enriched").length,outcomes,
    recordingCoverageBefore:before.filter(hasRecordingTags).length,
    recordingCoverageAfter:selected.filter(hasRecordingTags).length,
    baselineCount:before.length,experimentCount:selected.length,
    entered:selected.filter(t=>!before.some(b=>b.id===t.id)).map(t=>t.id),
    dropped:before.filter(t=>!selected.some(b=>b.id===t.id)).map(t=>t.id),
    changed:selected.flatMap((t,i)=>{
      const old=before.find(b=>b.id===t.id);if(!old)return [];
      return old.score===t.score && before.indexOf(old)===i && old.evidence?.tier===t.evidence?.tier?[]:[{
        id:t.id,artist:t.artist,title:t.title,beforePosition:before.indexOf(old)+1,afterPosition:i+1,
        beforeScore:old.score,afterScore:t.score,beforeTier:old.evidence?.tier,afterTier:t.evidence?.tier}];
    }),
    // Retain the enriched pool for exact offline replay; no credentials or raw HTTP response.
    replay:{pool,baselinePool:input.pool,baselineTracks:before,seed:input.seed,seedProfile:input.seedProfile,input:input.input,seedParticipantKeys:[...input.seedParticipantKeys]},
    experimentTracks:selected,
  };
}
