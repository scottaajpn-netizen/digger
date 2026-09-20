import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Track } from "../types";
import { normalized, trackIdentity } from "./ranking";

export const CATALOGUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CATALOGUE_ENTRIES = 1500;

export type CatalogueEntry = {
  anchorArtist: string;
  neighbourArtist: string;
  savedAt: string;
  neighbourRank: number;
  trackRank: number;
  similarity?: number;
  track: Pick<
    Track,
    "id" | "title" | "artist" | "lastfmListeners" | "externalIds"
  >;
};

export type CatalogueEntryInput = Omit<CatalogueEntry, "savedAt">;

type CatalogueFile = {
  schemaVersion: 1;
  entries: CatalogueEntry[];
};

type CatalogueOptions = {
  filePath?: string;
  now?: number;
  ttlMs?: number;
};

let writeQueue: Promise<unknown> = Promise.resolve();

function defaultCataloguePath() {
  return (
    process.env.DIGGER_CATALOGUE_PATH ||
    join(process.cwd(), ".digger", "discovery-catalogue.json")
  );
}

function entryKey(entry: Pick<CatalogueEntry, "anchorArtist" | "neighbourArtist" | "track">) {
  return [
    normalized(entry.anchorArtist),
    normalized(entry.neighbourArtist),
    trackIdentity(entry.track),
  ].join("\u0000");
}

function validEntry(value: unknown): value is CatalogueEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CatalogueEntry>;
  return Boolean(
    typeof entry.anchorArtist === "string" &&
      typeof entry.neighbourArtist === "string" &&
      typeof entry.savedAt === "string" &&
      Number.isFinite(entry.neighbourRank) &&
      Number.isFinite(entry.trackRank) &&
      entry.track &&
      typeof entry.track.id === "string" &&
      typeof entry.track.title === "string" &&
      typeof entry.track.artist === "string",
  );
}

async function readCatalogueFile(filePath: string): Promise<CatalogueFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, entries: [] };
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CatalogueFile>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
      return { schemaVersion: 1, entries: [] };
    }
    return {
      schemaVersion: 1,
      entries: parsed.entries.filter(validEntry),
    };
  } catch {
    return { schemaVersion: 1, entries: [] };
  }
}

function activeEntries(
  entries: CatalogueEntry[],
  now: number,
  ttlMs: number,
) {
  return entries.filter(entry => {
    const savedAt = Date.parse(entry.savedAt);
    return (
      Number.isFinite(savedAt) &&
      savedAt <= now &&
      now - savedAt <= ttlMs
    );
  });
}

export async function loadCatalogueEntries(
  anchorArtists: string[],
  options: CatalogueOptions = {},
) {
  const filePath = options.filePath || defaultCataloguePath();
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? CATALOGUE_TTL_MS;
  const anchorKeys = new Set(anchorArtists.map(normalized).filter(Boolean));
  if (!anchorKeys.size) return [];

  const file = await readCatalogueFile(filePath);
  return activeEntries(file.entries, now, ttlMs)
    .filter(entry => anchorKeys.has(normalized(entry.anchorArtist)))
    .sort(
      (left, right) =>
        Date.parse(right.savedAt) - Date.parse(left.savedAt) ||
        left.neighbourRank - right.neighbourRank ||
        left.trackRank - right.trackRank,
    );
}

async function writeCatalogueEntries(
  inputs: CatalogueEntryInput[],
  options: CatalogueOptions,
) {
  if (!inputs.length) return 0;

  const filePath = options.filePath || defaultCataloguePath();
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? CATALOGUE_TTL_MS;
  const file = await readCatalogueFile(filePath);
  const merged = new Map<string, CatalogueEntry>();

  for (const entry of activeEntries(file.entries, now, ttlMs)) {
    merged.set(entryKey(entry), entry);
  }

  const savedAt = new Date(now).toISOString();
  for (const input of inputs) {
    const entry: CatalogueEntry = { ...input, savedAt };
    merged.set(entryKey(entry), entry);
  }

  const entries = [...merged.values()]
    .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
    .slice(0, MAX_CATALOGUE_ENTRIES);

  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    JSON.stringify({ schemaVersion: 1, entries }, null, 2),
    "utf8",
  );
  await rename(temporaryPath, filePath);
  return inputs.length;
}

export function rememberCatalogueEntries(
  entries: CatalogueEntryInput[],
  options: CatalogueOptions = {},
) {
  const operation = writeQueue
    .catch(() => undefined)
    .then(() => writeCatalogueEntries(entries, options));
  writeQueue = operation;
  return operation;
}
