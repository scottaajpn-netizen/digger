import type { ArtistCredit, Track } from "../types";

// An ISRC identifies a recording, not its release. Catalogues can contain
// missing, duplicated or incorrectly reused ISRCs.
export function normalizeIsrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.trim().replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(compact) ? compact : undefined;
}

// Never arbitrarily pick one ISRC from contradictory MusicBrainz metadata.
export function singleVerifiedIsrc(values: unknown): string | undefined {
  if (!Array.isArray(values)) return undefined;
  const ids = [...new Set(values.map(normalizeIsrc).filter((id): id is string => Boolean(id)))];
  return ids.length === 1 ? ids[0] : undefined;
}

// Called after grouping by artist + title: conflicting known ISRCs must
// remain separate; unknown rows remain unverified rather than being assigned
// to either recording. The old text fallback applies otherwise.
export function partitionByRecordingIdentity<T extends Pick<Track, "externalIds">>(
  tracks: readonly T[],
): T[][] {
  if (!tracks.length) return [];
  const ids = new Set(tracks.map(track => normalizeIsrc(track.externalIds?.isrc)).filter((id): id is string => Boolean(id)));
  if (ids.size <= 1) return [[...tracks]];
  const groups = new Map<string, T[]>();
  for (const track of tracks) {
    const isrc = normalizeIsrc(track.externalIds?.isrc);
    const key = isrc ? "isrc:" + isrc : "unverified";
    const group = groups.get(key) || [];
    group.push(track);
    groups.set(key, group);
  }
  return [...groups.values()];
}


const mbidPattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const validMbid=(id:string|undefined)=>id&&mbidPattern.test(id)?id.toLowerCase():undefined;

/**
 * Last.fm's autocorrected artist+track lookup is not necessarily the
 * MusicBrainz recording requested by the user. A known recording MBID
 * allows us to detect contradictions without a new API request.
 *
 * For a MusicBrainz-identified recording by a short artist name, the
 * Last.fm track feed needs at least a matching recording MBID or a
 * corroborated artist MBID. For a niche seed without a recording MBID
 * (DÜK et al.), direct track-level Last.fm discovery remains possible,
 * although uncertain artist-level catalogues are handled separately.
 */
export function assessLastFmRecordingIdentity(input:{
  seedArtist:string;
  seedTitle?:string;
  seedCredits?:ArtistCredit[];
  returnedArtist?:string;
  returnedTitle?:string;
  expectedRecordingMbid?:string;
  returnedRecordingMbid?:string;
  artistMbidConflicts:boolean;
  confirmedArtistMbid:boolean;
}){
  const expected=validMbid(input.expectedRecordingMbid);
  const returned=validMbid(input.returnedRecordingMbid);
  const confirmedRecording=Boolean(expected&&returned&&expected===returned);
  const contradictsRecording=Boolean(expected&&returned&&expected!==returned);
  const compactArtist=input.seedArtist.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
  const shortArtist=compactArtist.length>0&&compactArtist.length<=4;
  const insufficientIdentity=Boolean(expected&&shortArtist&&!confirmedRecording&&!input.confirmedArtistMbid);
  const textKey=(value:string|undefined)=>(value||"").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const seedArtistKey=textKey(input.seedArtist);
  const seedTitleKey=textKey(input.seedTitle);
  const returnedArtistKey=textKey(input.returnedArtist);
  const returnedTitleKey=textKey(input.returnedTitle);
  const swapped=Boolean(seedArtistKey&&seedTitleKey&&returnedArtistKey&&returnedTitleKey&&
    returnedArtistKey===seedTitleKey&&returnedTitleKey===seedArtistKey);
  const sessionOrMix=/\b(session|mix|mixtape|live|freestyle|cypher|grünt|grunt)\b/i.test(input.seedTitle||"");
  const losesSessionIdentity=Boolean(sessionOrMix&&seedTitleKey&&returnedTitleKey&&seedTitleKey!==returnedTitleKey);
  const creditedArtists=(input.seedCredits||[])
    .filter(credit=>credit.role==="primary"||credit.role==="featured")
    .map(credit=>textKey(credit.name)).filter(Boolean);
  const conflictsCredits=Boolean(!confirmedRecording&&returnedArtistKey&&creditedArtists.length&&
    !creditedArtists.some(artist=>returnedArtistKey.includes(artist)||artist.includes(returnedArtistKey)));
  const reason=input.artistMbidConflicts?"artist-mbid-conflict" as const:
    contradictsRecording?"recording-mbid-conflict" as const:
    swapped?"artist-title-swapped" as const:
    losesSessionIdentity?"session-title-conflict" as const:
    conflictsCredits?"credited-artist-conflict" as const:
    insufficientIdentity?"uncorroborated-short-name" as const:
    "allowed" as const;
  return {
    reason,
    recordingConfirmed:confirmedRecording,
    allowTrackSimilarity:reason==="allowed",
    allowSeedMetadata:reason==="allowed",
  };
}
