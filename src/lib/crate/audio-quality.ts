/**
 * Verification gate for future playable audio candidates, independent from Discogs.
 * This is an explicit-metadata filter, not an AI-music classifier or a copyright check.
 * Only candidates with enough metadata are marked playable.
 */
export interface AudioCandidate {
  id: string;
  title: string;
  artist?: string;
  uploader?: string;
  description?: string;
  durationSeconds?: number;
  viewCount?: number;
  isLive?: boolean;
}

export interface AudioQualityPolicy {
  minDurationSeconds?: number; // default: 60 seconds
  maxDurationSeconds?: number; // default: 10 minutes
  maxViews?: number;
  excludeAiLabeled?: boolean; // true by default
  excludeCompilations?: boolean; // true by default
}

export type AudioRejectReason =
  | "missing-duration"
  | "too-short"
  | "too-long"
  | "live-stream"
  | "ai-labeled"
  | "compilation"
  | "missing-views"
  | "too-popular"
  | "missing-title";

export interface AudioEligibility {
  accepted: boolean;
  reasons: AudioRejectReason[];
}

const aiTitleSignals = [
  /\bAI[ -]generated\b/i,
  /\bAI[ -](?:music|song|cover|vocals?|voice)\b/i,
  /\b(?:generated|created|made|composed)\s+(?:with|by|using)\s+(?:suno|udio)\b/i,
  /\b(?:suno|udio)[ -](?:ai|generated|creation|track)\b/i,
  /#(?:aimusic|aigeneratedmusic|aisong|sunoai|udioai)\b/i,
];
const aiDescriptionSignals = [
  /\bAI[ -]generated\s+(?:music|song|track|audio|vocals?)\b/i,
  /\b(?:created|made|generated|composed)\s+(?:with|by|using)\s+(?:suno|udio)\b/i,
  /\b(?:suno\.com|udio\.com)\b/i,
  /#(?:aimusic|aigeneratedmusic|aisong|sunoai|udioai)\b/i,
];
const knownAiUploader = /^(?:suno|udio)(?:\s+(?:ai|music|official|creations))?$/i;
const compilationTitleSignals = [
  /\bfull\s+album\b/i,
  /\bcomplete\s+album\b/i,
  /\bentire\s+album\b/i,
  /\b(?:music|song|track)\s+compilation\b/i,
  /\bcompilation\b/i,
  /\b(?:dj\s+set|nonstop\s+mix|continuous\s+mix|mega\s*mix)\b/i,
  /\b(?:best\s+of|greatest\s+hits)\b/i,
  /\b(?:full\s+mixtape|full\s+mix|full\s+playlist)\b/i,
  /\b(?:1\s+hour|2\s+hours|3\s+hours)\s+(?:of\s+)?(?:music|mix|jazz|soul|funk|beats)\b/i,
];

export function inspectAudioCandidate(
  candidate: AudioCandidate,
  policy: AudioQualityPolicy = {},
): AudioEligibility {
  const reasons: AudioRejectReason[] = [];
  const min = policy.minDurationSeconds ?? 60;
  const max = policy.maxDurationSeconds ?? 600;

  if (!candidate.title?.trim()) reasons.push("missing-title");
  if (candidate.isLive === true) reasons.push("live-stream");

  const seconds = candidate.durationSeconds;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    reasons.push("missing-duration");
  } else {
    if (seconds < min) reasons.push("too-short");
    if (seconds > max) reasons.push("too-long");
  }

  if (policy.excludeAiLabeled !== false) {
    const titleMatch = aiTitleSignals.some(pattern => pattern.test(candidate.title || ""));
    const description = candidate.description || "";
    // 'not AI-generated' is affirmative evidence of a human-made claim, not a signal of AI generation.
    const negatedAiClaim = /\b(?:not|no|without)\s+AI[ -]generated\b/i.test(description);
    const descriptionMatch = !negatedAiClaim && aiDescriptionSignals.some(pattern => pattern.test(description));
    const uploaderMatch = knownAiUploader.test(candidate.uploader || "");
    if (titleMatch || descriptionMatch || uploaderMatch) reasons.push("ai-labeled");
  }

  if (policy.excludeCompilations !== false &&
      compilationTitleSignals.some(pattern => pattern.test(candidate.title || ""))) {
    reasons.push("compilation");
  }

  if (policy.maxViews !== undefined) {
    if (candidate.viewCount === undefined || !Number.isFinite(candidate.viewCount)) {
      reasons.push("missing-views");
    } else if (candidate.viewCount > policy.maxViews) {
      reasons.push("too-popular");
    }
  }
  return { accepted: reasons.length === 0, reasons };
}

export function selectPlayableCandidates(
  candidates: AudioCandidate[],
  policy: AudioQualityPolicy = {},
): { accepted: AudioCandidate[]; rejected: { candidate: AudioCandidate; reasons: AudioRejectReason[] }[] } {
  const accepted: AudioCandidate[] = [];
  const rejected: { candidate: AudioCandidate; reasons: AudioRejectReason[] }[] = [];
  for (const candidate of candidates) {
    const result = inspectAudioCandidate(candidate, policy);
    if (result.accepted) accepted.push(candidate);
    else rejected.push({ candidate, reasons: result.reasons });
  }
  return { accepted, rejected };
}
