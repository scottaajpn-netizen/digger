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

function artistParts(value: string) {
  return value
    .split(/\s+(?:feat(?:uring)?|ft)\.?\s+|\s*(?:&|,|\/|\bx\b|\bvs\.?\b)\s*/giu)
    .map(part => part.trim())
    .filter(Boolean);
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
  const seedPartKeys = new Set(artistParts(seedArtist).map(normalized));
  const matchesStructuredAnchor = anchors.some(
    anchor => normalized(anchor.name) === reportedKey,
  );

  if (reportedKey === seedKey) {
    const parts = artistParts(seedArtist);
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
