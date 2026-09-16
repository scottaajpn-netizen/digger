import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { discoveryPathPreferenceKey } from "./paths";
import { normalized, trackIdentity } from "./ranking";
import type {
  Direction,
  DiscoveryMemorySnapshot,
  Feedback,
  Recommendation,
} from "../types";

type PathMemoryRow = {
  direction: Direction;
  source: NonNullable<Recommendation["discoveryPath"]>["source"];
  evidence: NonNullable<Recommendation["discoveryPath"]>["evidence"];
  shape: string;
  distance: number;
  love: number;
  curious: number;
  neutral: number;
  known: number;
  lastSeenAt: string;
};

type TrackMemoryRow = {
  artist: string;
  title: string;
  feedback: Feedback;
  pathKey?: string;
  lastSeenAt: string;
};

type DiscoveryMemoryStore = {
  version: 1;
  updatedAt: string;
  paths: Record<string, PathMemoryRow>;
  tracks: Record<string, TrackMemoryRow>;
};

const emptyStore = (): DiscoveryMemoryStore => ({
  version: 1,
  updatedAt: new Date(0).toISOString(),
  paths: {},
  tracks: {},
});

export const discoveryMemoryFile = () =>
  process.env.DIGGER_MEMORY_FILE?.trim() ||
  path.join(process.cwd(), ".digger", "discovery-memory.json");

const safeCount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

const parseStore = (value: unknown): DiscoveryMemoryStore => {
  if (!value || typeof value !== "object") return emptyStore();
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return emptyStore();

  const store = emptyStore();
  if (typeof raw.updatedAt === "string") store.updatedAt = raw.updatedAt;

  if (raw.paths && typeof raw.paths === "object" && !Array.isArray(raw.paths)) {
    for (const [key, item] of Object.entries(raw.paths as Record<string, unknown>).slice(0, 500)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.direction !== "string" ||
        typeof row.source !== "string" ||
        typeof row.evidence !== "string" ||
        typeof row.shape !== "string"
      ) continue;
      store.paths[key] = {
        direction: row.direction as Direction,
        source: row.source as PathMemoryRow["source"],
        evidence: row.evidence as PathMemoryRow["evidence"],
        shape: row.shape.slice(0, 200),
        distance: safeCount(row.distance),
        love: safeCount(row.love),
        curious: safeCount(row.curious),
        neutral: safeCount(row.neutral),
        known: safeCount(row.known),
        lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : store.updatedAt,
      };
    }
  }

  if (raw.tracks && typeof raw.tracks === "object" && !Array.isArray(raw.tracks)) {
    for (const [key, item] of Object.entries(raw.tracks as Record<string, unknown>).slice(0, 1000)) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.artist !== "string" ||
        typeof row.title !== "string" ||
        !["love", "curious", "neutral", "known"].includes(String(row.feedback))
      ) continue;
      store.tracks[key] = {
        artist: row.artist.slice(0, 300),
        title: row.title.slice(0, 300),
        feedback: row.feedback as Feedback,
        pathKey: typeof row.pathKey === "string" ? row.pathKey.slice(0, 300) : undefined,
        lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : store.updatedAt,
      };
    }
  }

  return store;
};

async function readStore(file = discoveryMemoryFile()): Promise<DiscoveryMemoryStore> {
  try {
    return parseStore(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    if (error instanceof SyntaxError) {
      const backup = `${file}.corrupt-${Date.now()}`;
      await rename(file, backup).catch(() => undefined);
      return emptyStore();
    }
    throw error;
  }
}

async function writeStore(store: DiscoveryMemoryStore, file = discoveryMemoryFile()) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), "utf8");
  await rename(temp, file);
}

const adjust = (row: PathMemoryRow | undefined, feedback: Feedback, amount: 1 | -1) => {
  if (!row) return;
  row[feedback] = Math.max(0, row[feedback] + amount);
};

let writeQueue: Promise<void> = Promise.resolve();

export async function recordDiscoveryFeedback(
  track: Pick<Recommendation, "artist" | "title" | "discoveryPath">,
  feedback: Feedback | null,
  direction: Direction,
  file = discoveryMemoryFile(),
): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const store = await readStore(file);
    const now = new Date().toISOString();
    const identity = trackIdentity({
      artist: track.artist.slice(0, 300),
      title: track.title.slice(0, 300),
    });
    const previous = store.tracks[identity];
    if (previous?.pathKey && store.paths[previous.pathKey]) {
      adjust(store.paths[previous.pathKey], previous.feedback, -1);
    }

    if (!feedback) {
      delete store.tracks[identity];
    } else {
      const pathKey = discoveryPathPreferenceKey(track.discoveryPath, direction) || undefined;
      if (pathKey && track.discoveryPath) {
        const existing = store.paths[pathKey];
        const row = existing || {
          direction,
          source: track.discoveryPath.source,
          evidence: track.discoveryPath.evidence,
          shape: track.discoveryPath.nodes.map(node => node.kind).join(">"),
          distance: track.discoveryPath.distance,
          love: 0,
          curious: 0,
          neutral: 0,
          known: 0,
          lastSeenAt: now,
        };
        row.lastSeenAt = now;
        adjust(row, feedback, 1);
        store.paths[pathKey] = row;
      }
      store.tracks[identity] = {
        artist: track.artist.slice(0, 300),
        title: track.title.slice(0, 300),
        feedback,
        pathKey,
        lastSeenAt: now,
      };
    }

    store.updatedAt = now;

    const pathEntries = Object.entries(store.paths)
      .sort((a, b) => b[1].lastSeenAt.localeCompare(a[1].lastSeenAt))
      .slice(0, 500);
    store.paths = Object.fromEntries(pathEntries);

    const trackEntries = Object.entries(store.tracks)
      .sort((a, b) => b[1].lastSeenAt.localeCompare(a[1].lastSeenAt))
      .slice(0, 1000);
    store.tracks = Object.fromEntries(trackEntries);

    await writeStore(store, file);
  });
  return writeQueue;
}

export function pathMemoryScore(row: Pick<PathMemoryRow, "love" | "curious" | "neutral">) {
  const weighted = row.love * 1 + row.curious * 0.45 - row.neutral * 0.8;
  const observations = row.love + row.curious + row.neutral;
  if (!observations) return 0;
  const confidence = Math.min(1, observations / 6);
  return Math.max(-10, Math.min(10, weighted * 2.2 * confidence));
}

export async function loadDiscoveryMemorySnapshot(
  file = discoveryMemoryFile(),
): Promise<DiscoveryMemorySnapshot> {
  await writeQueue;
  const store = await readStore(file);
  const pathScores: Record<string, number> = {};
  for (const [key, row] of Object.entries(store.paths)) {
    pathScores[key] = pathMemoryScore(row);
  }
  const knownTracks = Object.entries(store.tracks)
    .filter(([, row]) => row.feedback === "known")
    .map(([identity]) => identity);

  return {
    pathScores,
    knownTracks,
    updatedAt: store.updatedAt,
  };
}

export function memoryTrackIdentity(artist: string, title: string) {
  return `${normalized(artist)}\u0000${normalized(title)}`;
}
