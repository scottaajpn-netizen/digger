import { releaseKeys, type CrateRelease } from "./select";

export const rejectionReasons = [
  "already-heard", "not-interested", "ai-suspected",
  "compilation", "wrong-track", "preview-broken",
] as const;
export type RejectionReason = typeof rejectionReasons[number];

export const rejectionLabels: Record<RejectionReason, string> = {
  "already-heard": "Déjà entendu",
  "not-interested": "Pas intéressant",
  "ai-suspected": "IA suspectée",
  compilation: "Compilation",
  "wrong-track": "Mauvais morceau",
  "preview-broken": "Aperçu indisponible",
};

export interface CrateFeedbackEntry { reason: RejectionReason; at: number }
export type CrateFeedback = Record<string, CrateFeedbackEntry>;

export function isRejectionReason(value: unknown): value is RejectionReason {
  return typeof value === "string" && (rejectionReasons as readonly string[]).includes(value);
}

export function validateFeedback(raw: unknown): CrateFeedback {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: CrateFeedback = {};
  for (const [key, entry] of Object.entries(raw).slice(-250)) {
    const item = entry as Partial<CrateFeedbackEntry> | null;
    if (!/^discogs:\d+$/.test(key) || !item || !isRejectionReason(item.reason)) continue;
    result[key] = { reason: item.reason, at: Number.isSafeInteger(item.at) ? Number(item.at) : 0 };
  }
  return result;
}

/** Stable bounded history of actual release/master/work identities. */
export function pushViewed(
  history: string[],
  release: CrateRelease,
  maxKeys = 160,
): string[] {
  const valid = new Set(history.filter(k => /^(?:work:.+|master:\d+)$/.test(k)));
  for (const key of releaseKeys(release)) valid.add(key);
  return [...valid].slice(-maxKeys);
}

export function validateHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const key of raw.slice(-300)) {
    if (typeof key === "string" && key.length < 180 &&
      /^(?:work:.+|master:\d+)$/.test(key)) seen.add(key);
  }
  return [...seen].slice(-160);
}

/** Include already viewed songs and explicit rejections even across new sessions. */
export function buildSeenKeys(
  history: string[],
  releases: CrateRelease[],
  feedback: CrateFeedback,
  maxKeys = 60,
): string[] {
  const keys = new Set(history);
  for (const release of releases) {
    if (feedback[release.id]) for (const key of releaseKeys(release)) keys.add(key);
  }
  const ordered = [...keys].filter(k => k.length < 180).slice(-maxKeys);
  // Never exceed the API's URL limit after percent-encoding accented work names.
  const picked: string[] = [];
  let encodedLength = 0;
  for (const key of ordered.reverse()) {
    const cost = encodeURIComponent(key).length + 1;
    if (cost + encodedLength > 1900) continue;
    picked.unshift(key);
    encodedLength += cost;
  }
  return picked;
}
