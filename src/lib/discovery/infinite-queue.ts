import type { Recommendation, Track } from "../types";

export type InfiniteQueue = {
  current: Recommendation | null;
  upcoming: Recommendation[];
  seen: string[];
  explored: number;
};

// Stable within a discovery session even when different providers use
// different IDs for the same named recording.
export function infiniteTrackKeys(track: Pick<Track, "id" | "title" | "artist" | "externalIds">): string[] {
  const clean = (value: string) => value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [
    "name:" + clean(track.artist) + "\0" + clean(track.title),
    ...(track.externalIds?.musicbrainz ? ["mbid:" + track.externalIds.musicbrainz.toLowerCase()] : []),
    ...(track.id ? ["id:" + track.id] : []),
  ];
}

export function appendInfiniteQueue(
  queue: InfiniteQueue,
  tracks: readonly Recommendation[],
  seed?: Track,
): InfiniteQueue {
  const seen = new Set(queue.seen);
  if (seed) for (const key of infiniteTrackKeys(seed)) seen.add(key);
  const upcoming = [...queue.upcoming];
  let current = queue.current;
  for (const track of tracks) {
    if (!track?.id || !track.title || !track.artist) continue;
    const keys = infiniteTrackKeys(track);
    if (keys.some(key => seen.has(key))) continue;
    keys.forEach(key => seen.add(key));
    if (!current) current = track;
    else upcoming.push(track);
  }
  return { ...queue, current, upcoming, seen: [...seen] };
}

export function startInfiniteQueue(tracks: readonly Recommendation[], seed: Track): InfiniteQueue {
  return appendInfiniteQueue({ current: null, upcoming: [], seen: [], explored: 0 }, tracks, seed);
}

// Never discard the last available song while an API request is pending
// or has failed. Advancing is a no-op until a next song exists.
export function advanceInfiniteQueue(queue: InfiniteQueue): InfiniteQueue {
  if (!queue.upcoming.length) return queue;
  return {
    ...queue,
    current: queue.upcoming[0],
    upcoming: queue.upcoming.slice(1),
    explored: queue.explored + 1,
  };
}
