import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalized, trackIdentity } from "./ranking";

export type ImportedTasteTrack = {
  videoId: string;
  rawArtist: string;
  rawTitle: string;
  artist: string;
  title: string;
  resolverSource: string;
  resolverConfidence: number;
  classificationConfidence: number;
  status: "AUTO" | "REVIEW" | "UNCLASSIFIED" | "MIX";
  playlists: string[];
  reason?: string;
  region?: string;
  sources: string[];
  duplicateGroup?: string;
};

export type ImportedTasteStore = {
  version: 1;
  source: "youtube-music-auto-sorter";
  sourceVersion: "6.4";
  importedAt: string;
  sourceFingerprint: string;
  tracks: ImportedTasteTrack[];
  tasteTags: Record<string, number>;
  report: { rows: number; auto: number; review: number; unclassified: number; mix: number; duplicateGroups: number };
};

export const tasteImportFile = () =>
  process.env.DIGGER_TASTE_IMPORT_FILE?.trim() ||
  path.join(process.cwd(), ".digger", "youtube-music-taste.v1.json");

const playlistTags: Record<string, string[]> = {
  "ELECTRONIC": ["electronic"], "HIP-HOP AUTRE": ["hip hop"], "HIP-HOP US": ["hip hop"],
  "RAP FR": ["hip hop", "french rap"], "HIP-HOP - Trap / Drill": ["trap", "drill"],
  "HIP-HOP - Boom Bap": ["boom bap"], "HIP-HOP - Jazz Rap": ["jazz rap"],
  "HIP-HOP - Experimental": ["experimental hip hop"], "JAZZ - Jazz Funk": ["jazz-funk"],
  "FUNK - Disco": ["funk", "disco"], "R&B - Neo Soul": ["neo-soul", "r&b"], "SOUL": ["soul"],
  "POP / INDIE": ["indie pop"], "LATIN / BRAZIL": ["latin", "brazilian"],
  "LATIN URBAN - Dembow / Reggaeton": ["reggaeton", "dembow"], "AFRO / WORLD": ["african", "world"],
  "AFROBEATS": ["afrobeats"], "AMAPIANO / SOUTH AFRICAN HOUSE": ["amapiano"],
  "BEATS - Instrumental": ["instrumental hip hop"], "REGGAE - Dub": ["reggae", "dub"],
  "ROCK": ["rock"], "FOLK / COUNTRY": ["folk", "country"], "CLASSICAL": ["classical"],
  "BLUES": ["blues"], "GOSPEL": ["gospel"], "J-POP / CITY POP": ["city pop", "j-pop"],
  "OST - Library": ["soundtrack", "library music"],
};

const splitValues = (value: string) => [...new Set(value.split("|").map(item => item.trim()).filter(Boolean))];
const numeric = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** RFC-4180 CSV parser kept local so importing does not add a runtime dependency. */
export function parseCsv(input: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift()?.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value) || [];
  return rows.filter(values => values.some(Boolean)).map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

export function buildTasteImport(csv: string, importedAt = new Date().toISOString()): ImportedTasteStore {
  const rows = parseCsv(csv);
  const required = ["video_id", "raw_artist", "raw_title", "resolved_artist", "resolved_title", "safe_sync_status", "safe_sync_playlists"];
  if (!rows.length || required.some(field => !(field in rows[0]))) throw new Error(`CSV incompatible: colonnes requises manquantes (${required.join(", ")})`);
  const ids = new Set<string>(), identities = new Map<string, number>();
  for (const row of rows) {
    if (!row.video_id || ids.has(row.video_id)) throw new Error(`video_id absent ou dupliqué: ${row.video_id || "(vide)"}`);
    ids.add(row.video_id);
    const identity = trackIdentity({ artist: row.resolved_artist, title: row.resolved_title });
    identities.set(identity, (identities.get(identity) || 0) + 1);
  }
  const duplicateIds = new Map<string, string>();
  let duplicateGroups = 0;
  for (const [identity, count] of identities) if (count > 1) duplicateIds.set(identity, `ytmas:${++duplicateGroups}`);
  const tracks = rows.map(row => {
    const status = (["AUTO", "REVIEW", "UNCLASSIFIED", "MIX"].includes(row.safe_sync_status) ? row.safe_sync_status : "REVIEW") as ImportedTasteTrack["status"];
    const identity = trackIdentity({ artist: row.resolved_artist, title: row.resolved_title });
    return {
      videoId: row.video_id, rawArtist: row.raw_artist.slice(0, 300), rawTitle: row.raw_title.slice(0, 300),
      artist: row.resolved_artist.slice(0, 300), title: row.resolved_title.slice(0, 300),
      resolverSource: row.resolver_source || "unknown", resolverConfidence: numeric(row.resolver_confidence),
      classificationConfidence: numeric(row.confidence), status,
      playlists: splitValues(row.safe_sync_playlists).filter(label => !["A VERIFIER", "A CLASSER"].includes(label)),
      ...(row.safe_sync_reason ? { reason: row.safe_sync_reason } : {}),
      ...(row.region ? { region: row.region } : {}),
      sources: splitValues(row.sources), duplicateGroup: duplicateIds.get(identity),
    };
  });
  const counts = new Map<string, number>();
  for (const track of tracks.filter(track => track.status === "AUTO")) for (const playlist of track.playlists) {
    for (const tag of playlistTags[playlist] || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const peak = Math.max(1, ...counts.values());
  const tasteTags = Object.fromEntries([...counts].map(([tag, count]) => [normalized(tag), Number((count / peak).toFixed(4))]));
  const statusCount = (status: ImportedTasteTrack["status"]) => tracks.filter(track => track.status === status).length;
  let hash = 2166136261;
  for (const char of csv) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return {
    version: 1, source: "youtube-music-auto-sorter", sourceVersion: "6.4", importedAt,
    sourceFingerprint: `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`,
    tracks, tasteTags,
    report: { rows: tracks.length, auto: statusCount("AUTO"), review: statusCount("REVIEW"), unclassified: statusCount("UNCLASSIFIED"), mix: statusCount("MIX"), duplicateGroups },
  };
}

export async function writeTasteImport(store: ImportedTasteStore, file = tasteImportFile()) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
  await rename(temporary, file);
}

export async function loadTasteImport(file = tasteImportFile()): Promise<ImportedTasteStore | undefined> {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as ImportedTasteStore;
    if (value.version !== 1 || value.source !== "youtube-music-auto-sorter" || !Array.isArray(value.tracks)) return undefined;
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}
