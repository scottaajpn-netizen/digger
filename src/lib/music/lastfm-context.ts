export type LastFmTagRow = {
  name?: string;
  count?: number | string;
};

const noisePatterns = [
  /(?:^|[_\s-])add(?:ed)?[_\s-]+to(?:[_\s-]|$)/i,
  /(?:^|[_\s-])batch[_\s-]*\d*(?:$|[_\s-])/i,
  /^seen[ _-]?live$/i,
  /^(?:my[ _-]?)?(?:favorites?|favourites?)$/i,
  /^(?:my[ _-]?)?(?:music|library|playlist|tags?)$/i,
  /\blast\.?fm\b/i,
  /\bspotify\b/i,
  /\bscrobbles?\b/i,
  /^https?:\/\//i,
];

export function isUsefulLastFmArtistTag(value: string) {
  const tag = value.trim().replace(/\s+/g, " ");
  if (tag.length < 2 || tag.length > 48) return false;
  if (noisePatterns.some(pattern => pattern.test(tag))) return false;
  return /[\p{L}\p{N}]/u.test(tag);
}

export function cleanLastFmArtistTags(
  rows: LastFmTagRow[],
  limit = 6,
) {
  const seen = new Set<string>();
  return [...rows]
    .filter(row => typeof row.name === "string")
    .sort(
      (left, right) =>
        Number(right.count || 0) - Number(left.count || 0),
    )
    .flatMap(row => {
      const tag = row.name!.trim().replace(/\s+/g, " ");
      const key = tag.toLocaleLowerCase();
      if (!isUsefulLastFmArtistTag(tag) || seen.has(key)) return [];
      seen.add(key);
      return [tag];
    })
    .slice(0, Math.max(0, limit));
}

export function lastFmNeighbourStrength(value: number) {
  const score = Math.max(0, Math.min(1, value));
  if (score >= 0.85) return "très fort";
  if (score >= 0.65) return "fort";
  if (score >= 0.4) return "modéré";
  if (score > 0) return "faible";
  return "non mesuré";
}
