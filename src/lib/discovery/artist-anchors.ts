import type { ArtistCredit } from "../types";
import { normalized } from "./ranking";

export type VerifiedArtistAnchor = {
  name: string;
  source: "structured-credit" | "lastfm-track";
  sourceId?: string;
};

type ArtistAnchorInput = {
  seedArtist: string;
  credits?: ArtistCredit[];
  lastFmTrackArtist?: string;
};

type NeighbourRow = {
  anchor: string;
  name: string;
  match?: number | string;
};

export function artistNameParts(value: string) {
  return value
    .split(/\s+(?:feat(?:uring)?|ft)\.?\s+|\s*(?:&|,|\/|\bx\b|\bvs\.?\b)\s*/giu)
    .map(part => part.trim())
    .filter(Boolean);
}

export function containsArtistParticipant(
  artist: string,
  credits: ArtistCredit[] | undefined,
  participantKeys: Set<string>,
) {
  const credited = (credits || [])
    .filter(credit => credit.role === "primary" || credit.role === "featured")
    .map(credit => credit.name.trim())
    .filter(Boolean);
  const names = [...new Set([...credited, ...artistNameParts(artist)])];
  return names.some(name => participantKeys.has(normalized(name)));
}

export function resolveVerifiedArtistAnchors({
  seedArtist,
  credits = [],
  lastFmTrackArtist,
}: ArtistAnchorInput): VerifiedArtistAnchor[] {
  const anchors: VerifiedArtistAnchor[] = [];
  const seen = new Set<string>();

  const add = (anchor: VerifiedArtistAnchor) => {
    const key = normalized(anchor.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    anchors.push(anchor);
  };

  for (const credit of credits) {
    if (credit.role !== "primary" && credit.role !== "featured") continue;
    if (credit.source !== "musicbrainz" && credit.source !== "discogs") continue;
    const name = credit.name.trim();
    if (!name) continue;
    add({
      name,
      source: "structured-credit",
      sourceId: credit.sourceId,
    });
  }

  const reportedArtist = lastFmTrackArtist?.trim();
  if (!reportedArtist) return anchors;

  const reportedKey = normalized(reportedArtist);
  const seedKey = normalized(seedArtist);
  const seedPartKeys = new Set(artistNameParts(seedArtist).map(normalized));
  const matchesStructuredAnchor = anchors.some(
    anchor => normalized(anchor.name) === reportedKey,
  );

  if (reportedKey === seedKey) {
    const parts = artistNameParts(seedArtist);
    if (parts.length > 1) {
      for (const part of parts) {
        add({
          name: part,
          source: "lastfm-track",
        });
      }
    } else {
      add({
        name: reportedArtist,
        source: "lastfm-track",
      });
    }
    return anchors;
  }

  if (seedPartKeys.has(reportedKey) || matchesStructuredAnchor) {
    add({
      name: reportedArtist,
      source: "lastfm-track",
    });
  }

  return anchors;
}

export function shouldExpandArtistCatalogue(
  rows: Array<{
    name?: string;
    artist?: { name?: string };
    match?: number | string;
  }>,
  thresholds: {
    minimumTracks?: number;
    minimumArtists?: number;
    minimumCredibleTracks?: number;
  } = {},
) {
  const minimumTracks = thresholds.minimumTracks ?? 12;
  const minimumArtists = thresholds.minimumArtists ?? 6;
  const minimumCredibleTracks = thresholds.minimumCredibleTracks ?? 6;

  const usable = rows.filter(
    row => Boolean(row.name?.trim() && row.artist?.name?.trim()),
  );
  const artists = new Set(
    usable.map(row => normalized(row.artist?.name || "")).filter(Boolean),
  );
  const credible = usable.filter(row => {
    const match = Number(row.match ?? 0);
    return Number.isFinite(match) && match >= 0.15;
  });

  return (
    usable.length < minimumTracks ||
    artists.size < minimumArtists ||
    credible.length < minimumCredibleTracks
  );
}

export function selectBalancedArtistNeighbours(
  rows: NeighbourRow[],
  excludedNames: string[],
  limit = 10,
) {
  const excluded = new Set(excludedNames.map(normalized).filter(Boolean));
  const groups = new Map<string, NeighbourRow[]>();

  for (const row of rows) {
    const anchor = row.anchor.trim();
    const name = row.name.trim();
    const nameKey = normalized(name);
    if (!anchor || !name || !nameKey || excluded.has(nameKey)) continue;

    const group = groups.get(anchor) || [];
    if (group.some(item => normalized(item.name) === nameKey)) continue;
    group.push({ ...row, anchor, name });
    groups.set(anchor, group);
  }

  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        Number(right.match || 0) - Number(left.match || 0) ||
        left.name.localeCompare(right.name),
    );
  }

  const selected: NeighbourRow[] = [];
  const seen = new Set<string>();
  const orderedGroups = [...groups.values()];
  let index = 0;

  while (selected.length < limit) {
    let added = false;
    for (const group of orderedGroups) {
      const row = group[index];
      if (!row) continue;
      const key = normalized(row.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      selected.push(row);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added && orderedGroups.every(group => index >= group.length - 1)) break;
    index += 1;
  }

  return selected;
}


const artistMbidPattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Last.fm track.getInfo may confirm a name while meaning a different artist.
 * Short artist names require an MBID corroborated independently by MusicBrainz.
 * An explicit MBID conflict blocks any name-based artist catalogue traversal.
 */
export function assessLastFmArtistIdentity(
  anchors: readonly VerifiedArtistAnchor[],
  trustedArtistMbids: readonly string[],
  lastFmTrackArtistMbid?: string,
) {
  const trusted=new Set(trustedArtistMbids.filter(id=>artistMbidPattern.test(id)).map(id=>id.toLowerCase()));
  const reported=lastFmTrackArtistMbid && artistMbidPattern.test(lastFmTrackArtistMbid)
    ? lastFmTrackArtistMbid.toLowerCase():undefined;
  const conflictingMbid=Boolean(reported&&trusted.size&&!trusted.has(reported));
  const approved:Array<VerifiedArtistAnchor&{confirmedMbid?:string}>=[];
  const blocked:Array<{name:string;reason:"conflicting-mbid"|"ambiguous-short-name"}>=[];
  for(const anchor of anchors){
    const sourceId=anchor.sourceId&&artistMbidPattern.test(anchor.sourceId)
      ? anchor.sourceId.toLowerCase():undefined;
    const confirmedMbid=reported&&sourceId===reported&&trusted.has(reported)
      ? reported:undefined;
    const shortName=normalized(anchor.name).replace(/\s+/g,"").length<=4;
    if(conflictingMbid)blocked.push({name:anchor.name,reason:"conflicting-mbid"});
    else if(shortName&&!confirmedMbid)blocked.push({name:anchor.name,reason:"ambiguous-short-name"});
    else approved.push({...anchor,...(confirmedMbid?{confirmedMbid}:{})});
  }
  return {approved,blocked,conflictingMbid};
}


/**
 * A MusicBrainz recording's primary/featured artist MBID is independent
 * structured identity evidence. It can seed Last.fm artist.getSimilar by
 * MBID even when Last.fm has no *track* entry for the recording.
 *
 * Never infer MBIDs from the seed artist string or untrusted Last.fm name
 * autocorrection; only use trusted IDs from the verified recording credits.
 * Call this on anchors that passed assessLastFmArtistIdentity, preserving
 * its short-name and explicit conflict protections (Mia regression).
 */
export function catalogueAnchorMbid(
  anchor: VerifiedArtistAnchor & {confirmedMbid?:string},
  trustedArtistMbids: readonly string[],
):string | undefined {
  const trusted=new Set(
    trustedArtistMbids.filter(id=>artistMbidPattern.test(id))
      .map(id=>id.toLowerCase()),
  );
  if(anchor.confirmedMbid && trusted.has(anchor.confirmedMbid.toLowerCase()))
    return anchor.confirmedMbid.toLowerCase();
  if(anchor.source==="structured-credit" && anchor.sourceId &&
    artistMbidPattern.test(anchor.sourceId) &&
    trusted.has(anchor.sourceId.toLowerCase()))
    return anchor.sourceId.toLowerCase();
  return undefined;
}

/** Live track verification OR an independently trusted MusicBrainz artist ID. */
export function canExpandVerifiedArtistCatalogue(
  approvedAnchors: readonly (VerifiedArtistAnchor & {confirmedMbid?:string})[],
  trustedArtistMbids: readonly string[],
):boolean {
  return approvedAnchors.some(anchor=>
    anchor.source==="lastfm-track" ||
    Boolean(catalogueAnchorMbid(anchor,trustedArtistMbids)),
  );
}
