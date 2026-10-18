import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";

export class DiscogsError extends Error {
  constructor(public status: number) { super(`Discogs indisponible (${status}).`); }
}
export type DiscogsGet = <T>(path: string, params: Record<string, string>, signal: AbortSignal) => Promise<T>;

/** One shared instance per server process. Inject clock/transport for deterministic tests. */
export function createDiscogsClient(options: {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  token?: () => string | undefined;
} = {}): DiscogsGet {
  const request = options.fetch ?? ((...args) => fetch(...args));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (async (ms, signal) => { await wait(ms, undefined, { signal }); });
  const token = options.token ?? (() => process.env.DISCOGS_TOKEN);
  const cache = new Map<string, { data: unknown; expires: number }>();
  let next = 0;
  let spacing = 1100;
  let queue = Promise.resolve();

  return async <T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted();
    const secret = token()?.trim();
    if (!secret) throw new DiscogsError(401);
    // No user-supplied URL, no marketplace/account methods, no secret in URL/cache key.
    if (!/^(database\/search|(?:releases|masters|labels|artists)\/[1-9]\d*(?:\/releases)?)$/.test(path)) throw new DiscogsError(400);
    const url = new URL(path, "https://api.discogs.com/");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const key = `${createHash("sha256").update(secret).digest("hex")}:${url}`;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.data as T;

    // Serialize starts AND response headers, so a 429 blocks the next queued call.
    const previous = queue;
    let unlock!: () => void;
    queue = new Promise<void>(resolve => { unlock = resolve; });
    let acquired = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        previous.then(() => { signal.removeEventListener("abort", abort); resolve(); });
        if (signal.aborted) abort();
      });
      acquired = true;
      signal.throwIfAborted();
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return cached.data as T;
      for (let attempt = 0; attempt < 2; attempt++) {
        const delay = Math.max(0, next - now());
        if (delay > 5000) throw new DiscogsError(429); // Leave room for other providers.
        if (delay) await sleep(delay, signal);
        signal.throwIfAborted();
        next = now() + spacing;
        let response: Response;
        try {
          response = await request(url, {
            headers: { Accept: "application/json", Authorization: `Discogs token=${secret}`,
              "User-Agent": process.env.DISCOGS_USER_AGENT || "Digger/0.3 +https://github.com/scottaajpn-netizen/digger" },
            signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), cache: "no-store", redirect: "error",
          });
        } catch { signal.throwIfAborted(); throw new DiscogsError(503); }
        const limit = Number(response.headers.get("x-discogs-ratelimit"));
        if (limit > 0 && Number.isFinite(limit)) spacing = Math.max(1100, Math.ceil(60000 / limit) + 100);
        if (response.headers.get("x-discogs-ratelimit-remaining") === "0") next = Math.max(next, now() + 60000);
        if (response.status === 429 || response.status >= 500) {
          const header = response.headers.get("retry-after");
          const seconds = header === null ? NaN : Number(header);
          const retry = Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
            : header && Number.isFinite(Date.parse(header)) ? Math.max(0, Date.parse(header) - now())
            : response.status === 429 ? 60000 : 1500;
          next = Math.max(next, now() + retry); // Never shorten Retry-After.
          if (attempt === 0 && next - now() <= 5000) continue;
        }
        if (!response.ok) throw new DiscogsError(response.status);
        let data: unknown;
        try { data = await response.json(); } catch { throw new DiscogsError(502); }
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new DiscogsError(502);
        if (cache.size >= 200) cache.delete(cache.keys().next().value!);
        cache.set(key, { data, expires: now() + 15 * 60 * 1000 });
        return data as T;
      }
      throw new DiscogsError(503);
    } finally {
      if (acquired) unlock();
      else void previous.then(unlock); // Cancellation must not let later calls overtake the lock.
    }
  };
}
export const discogsJson = createDiscogsClient();
