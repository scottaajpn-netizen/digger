import type { ArtistCredit, DigRequest, Recommendation, Track } from "../types";
import { normalizeMusicTags } from "../music/taxonomy";
import { discogsJson, type DiscogsGet } from "./discogs-http";

export type DiscogsOrigin = "discogs-label" | "discogs-compilation" | "discogs-scene" | "discogs-deep";
export interface DiscogsArtist { id: number; name: string; join?: string }
export interface DiscogsReleaseEvidence {
  releaseId: number; masterId?: number; title: string;
  artists: DiscogsArtist[];
  labels: { id: number; name: string; catalogNumber?: string }[];
  genres: string[]; styles: string[]; country?: string; year?: number;
  compilation: boolean; sourceUrl: string; fetchedAt: string;
}
export interface DiscogsPathNode {
  kind: "release" | "label" | "artist" | "context";
  id?: number; name: string; url: string;
}
export interface DiscogsEvidence extends DiscogsReleaseEvidence {
  position: string;
  trackArtists: DiscogsArtist[];
  role: "compilation-track" | "release-track";
  path: DiscogsPathNode[];
  audience: "unknown";
}
export type DiscogsCandidate = Recommendation & { origin: DiscogsOrigin; relevance: number; discogs: DiscogsEvidence };
interface RawExtraArtist { id?: number; name?: string; role?: string }
interface RawTrack { title?: string; position?: string; type_?: string; artists?: DiscogsArtist[]; extraartists?: RawExtraArtist[] }
interface RawRelease {
  id?: number; master_id?: number; title?: string; artists?: DiscogsArtist[];
  labels?: { id: number; name: string; catno?: string }[];
  genres?: string[]; styles?: string[]; country?: string; year?: number;
  formats?: { descriptions?: string[] }[]; tracklist?: RawTrack[];
}
interface Release extends DiscogsReleaseEvidence { tracks: { title: string; position: string; artists: DiscogsArtist[]; credits: ArtistCredit[] }[] }
interface Row { id: number; type?: string; main_release?: number; role?: string; title?: string }
interface Listing { results?: Row[]; releases?: Row[]; pagination?: { pages?: number } }
const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const artistName = (s: string) => s.replace(/\s*\(\d+\)$/, "").replace(/, The$/, "").trim();
const artistKey = (s: string) => norm(artistName(s)).replace(/^the /, "");
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((s): s is string => typeof s === "string" && !!s.trim()) : [];
const artists = (value: unknown): DiscogsArtist[] => Array.isArray(value) ? value.filter(a => a && validId(a.id) && typeof a.name === "string" && a.name.trim()).map(a => ({ id: a.id, name: a.name, join: typeof a.join === "string" ? a.join : undefined })) : [];
const realArtist = (a: DiscogsArtist) => !["various", "various artists", "unknown", "unknown artist", "no artist"].includes(norm(a.name));
const credit = (a: DiscogsArtist[]) => a.map((item, i) => artistName(item.name) + (i < a.length - 1 ? ` ${item.join || "&"} ` : "")).join("");
const discogsCredits = (main: DiscogsArtist[], extra: RawExtraArtist[] | undefined): ArtistCredit[] => {
  const primary: ArtistCredit[] = main.map(a => ({
    name: artistName(a.name),
    role: "primary",
    source: "discogs",
    sourceId: String(a.id),
    joinPhrase: a.join,
  }));
  const secondary = (Array.isArray(extra) ? extra : []).flatMap<ArtistCredit>(row => {
    if (!row || !validId(row.id) || typeof row.name !== "string" || !row.name.trim() || typeof row.role !== "string") return [];
    const roleText = norm(row.role);
    const role = /\bremix(?:ed|er)?\b/.test(roleText) ? "remixer" : /\bproduc(?:ed|er|tion)\b/.test(roleText) ? "producer" : null;
    if (!role) return [];
    return [{ name: artistName(row.name), role, source: "discogs" as const, sourceId: String(row.id) }];
  });
  return [...primary, ...secondary];
};
const releaseNode = (r: DiscogsReleaseEvidence): DiscogsPathNode => ({ kind: "release", id: r.releaseId, name: r.title, url: r.sourceUrl });
const labelNode = (l: { id: number; name: string }): DiscogsPathNode => ({ kind: "label", ...l, url: `https://www.discogs.com/label/${l.id}` });
const artistNode = (a: DiscogsArtist): DiscogsPathNode => ({ kind: "artist", id: a.id, name: a.name, url: `https://www.discogs.com/artist/${a.id}` });
const ordered = <T>(rows: T[], session: number, key: (r: T) => string) => [...rows].sort((a, b) => hash(`${session}:${key(a)}`) - hash(`${session}:${key(b)}`));

export function parseDiscogsRelease(raw: RawRelease): Release | null {
  if (!raw || !validId(raw.id) || typeof raw.title !== "string" || !raw.title.trim()) return null;
  const releaseArtists = artists(raw.artists);
  const descriptions = (Array.isArray(raw.formats) ? raw.formats : []).flatMap(f => strings(f?.descriptions));
  const compilation = descriptions.some(d => norm(d) === "compilation");
  const mixed = descriptions.some(d => norm(d) === "mixed");
  const tracks = (Array.isArray(raw.tracklist) ? raw.tracklist : []).flatMap(t => {
    if (!t || typeof t.title !== "string" || !t.title.trim() || t.type_ && t.type_ !== "track") return [];
    const explicit = artists(t.artists);
    // Never attribute an uncredited compilation/DJ-mix track to its curator.
    const trackArtists = explicit.length ? explicit : !compilation && !mixed && releaseArtists.length === 1 && realArtist(releaseArtists[0]) ? releaseArtists : [];
    if (!trackArtists.length || trackArtists.some(a => !realArtist(a))) return [];
    return [{ title: t.title.trim(), position: typeof t.position === "string" ? t.position : "", artists: trackArtists, credits: discogsCredits(trackArtists, t.extraartists) }];
  });
  return { releaseId: raw.id, masterId: validId(raw.master_id) ? raw.master_id : undefined, title: raw.title,
    artists: releaseArtists, labels: (Array.isArray(raw.labels) ? raw.labels : []).filter(l => l && validId(l.id) && typeof l.name === "string" && l.name.trim() && !norm(l.name).startsWith("not on label"))
      .map(l => ({ id: l.id, name: l.name, catalogNumber: typeof l.catno === "string" ? l.catno : undefined })),
    genres: strings(raw.genres), styles: strings(raw.styles), country: typeof raw.country === "string" && raw.country ? raw.country : undefined,
    year: Number.isInteger(raw.year) && raw.year! > 0 ? raw.year : undefined, compilation,
    sourceUrl: `https://www.discogs.com/release/${raw.id}`, fetchedAt: new Date().toISOString(), tracks };
}
export function profileFromDiscogsRelease(release: DiscogsReleaseEvidence) {
  return { ...normalizeMusicTags([...release.styles, ...release.genres]), scope: "release" as const };
}

export async function discoverDiscogs(seed: Track, input: DigRequest, parentSignal: AbortSignal,
  options: { get?: DiscogsGet; enabled?: boolean } = {}): Promise<{ candidates: DiscogsCandidate[]; notes: string[] }> {
  if (!(options.enabled ?? !!process.env.DISCOGS_TOKEN?.trim())) return { candidates: [], notes: [] };
  const get = options.get ?? discogsJson;
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(22000)]);
  const candidates: DiscogsCandidate[] = [], notes = new Set<string>();
  const releases = new Map<number, Release>();
  let calls = 0;
  async function read<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    if (calls >= 18 || signal.aborted) { notes.add("Exploration Discogs partielle : budget de recherche atteint."); return null; }
    calls++;
    try { return await get<T>(path, params, signal); }
    catch { notes.add("Discogs est partiellement indisponible ; les autres sources restent actives."); return null; }
  }
  async function release(id: number) {
    if (!validId(id)) return null;
    if (releases.has(id)) return releases.get(id)!;
    const raw = await read<RawRelease>(`releases/${id}`);
    const parsed = raw ? parseDiscogsRelease(raw) : null;
    if (parsed) releases.set(id, parsed);
    return parsed;
  }
  async function fromRow(row: Row) {
    if (!row || !validId(row.id)) return null;
    if (row.type !== "master") return release(row.id);
    if (validId(row.main_release)) return release(row.main_release);
    const master = await read<{ main_release?: number }>(`masters/${row.id}`);
    return master && validId(master.main_release) ? release(master.main_release) : null;
  }
  async function listing(path: string, params: Record<string, string> = {}) {
    const first = await read<Listing>(path, { ...params, per_page: "30", page: "1" });
    const getRows = (data: Listing | null): Row[] => Array.isArray(data?.releases) ? data.releases : Array.isArray(data?.results) ? data.results : [];
    let rows = getRows(first);
    const pages = Math.min(100, first?.pagination?.pages || 1);
    // Rotate through catalog pages, never sort by most collected/wanted.
    if (pages > 1 && calls < 15) {
      const page = 2 + hash(`${seed.id}:${input.session}:${path}`) % (pages - 1);
      const next = await read<Listing>(path, { ...params, per_page: "30", page: String(page) });
      rows = [...rows, ...getRows(next)];
    }
    return ordered(rows.filter(r => r && validId(r.id)), input.session, r => String(r.id));
  }
  let seedCreditKeys = new Set<string>();
  let matchingArtistIds = new Set<number>();
  function add(r: Release, origin: DiscogsOrigin, path: DiscogsPathNode[], requiredArtist?: number) {
    const seenArtists = new Set<number>();
    const tracks = ordered(r.tracks, input.session, t => `${r.releaseId}:${t.position}:${t.title}`);
    for (const t of tracks) {
      if (requiredArtist && !t.artists.some(a => a.id === requiredArtist)) continue;
      if (t.artists.some(a => matchingArtistIds.has(a.id) || seedCreditKeys.has(artistKey(a.name)) || artistKey(a.name) === artistKey(seed.artist))) continue;
      if (t.artists.some(a => seenArtists.has(a.id))) continue;
      if (seenArtists.size >= 4) break;
      for (const a of t.artists) seenArtists.add(a.id);
      const { tracks: _, ...evidence } = r;
      const name = credit(t.artists);
      candidates.push({ id: `discogs-track:${hash(`${norm(name)}:${norm(t.title)}`)}`, title: t.title, artist: name,
        scene: "Connexion Discogs", label: r.labels[0]?.name || "", tags: [], year: 0, album: r.title,
        obscurity: 50, obscurityKnown: false, colors: ["#b6b56d", "#34382c"],
        externalIds: { discogs: r.sourceUrl },
        credits: t.credits,
        discogs: { ...evidence, position: t.position, trackArtists: t.artists, role: r.compilation ? "compilation-track" : "release-track", path, audience: "unknown" },
        reason: `Discogs : « ${seed.title} » → ${path.map(n => n.name).join(" → ")} → « ${t.title} » par ${name}.${origin === "discogs-scene" ? " Voisinage éditorial, pas une scène certifiée." : ""}`,
        origin, relevance: origin === "discogs-deep" ? 80 : origin === "discogs-label" && input.direction === "Labels" ? 90 : 65 });
    }
  }
  const search = await read<Listing>("database/search", { type: "release", artist: seed.artist, track: seed.title, per_page: "8", page: "1" });
  const matches: Release[] = [];
  const searchRows = Array.isArray(search?.results) ? search.results.filter(r => r && validId(r.id)) : [];
  // Album agreement is useful, but full track credits still have to match.
  const sorted = [...searchRows].sort((a, b) => Number(!!seed.album && norm(b.title || "").includes(norm(seed.album))) - Number(!!seed.album && norm(a.title || "").includes(norm(seed.album))));
  seedCreditKeys = new Set((seed.credits || [])
    .filter(c => c.role === "primary" || c.role === "featured")
    .map(c => artistKey(c.name)));
  const sameArtists = (trackArtists: DiscogsArtist[]) => {
    if (!seedCreditKeys.size) return artistKey(credit(trackArtists)) === artistKey(seed.artist);
    const keys = new Set(trackArtists.map(a => artistKey(a.name)));
    return keys.size === seedCreditKeys.size && [...keys].every(key => seedCreditKeys.has(key));
  };
  for (const row of sorted.slice(0, 3)) {
    const r = await fromRow(row);
    if (r?.tracks.some(t => norm(t.title) === norm(seed.title) && sameArtists(t.artists))) matches.push(r);
  }
  const matchedTracks = matches.flatMap(r => r.tracks.filter(t => norm(t.title) === norm(seed.title) && sameArtists(t.artists)));
  const signatures = new Set(matchedTracks.map(t => t.artists.map(a => a.id).sort((a,b)=>a-b).join(",")));
  matchingArtistIds = new Set(matchedTracks.flatMap(t => t.artists.map(a => a.id)));
  if (!matches.length || !matchingArtistIds.size || signatures.size !== 1) return { candidates: [], notes: [...notes, "Discogs : identité du morceau insuffisamment confirmée ; aucune connexion ajoutée."] };
  const root = matches.find(r => seed.album && norm(r.title) === norm(seed.album)) || matches[0];
  const roots = [root, ...matches.filter(r => r.releaseId !== root.releaseId)];
  const deep = input.direction === "Rabbit hole" || input.direction === "Surprends-moi" && input.obscurity >= 80;
  const rootPath = [releaseNode(root)];

  // Exact compilation membership, including compilations among alternate search hits.
  for (const r of roots) if (r.compilation || new Set(r.tracks.flatMap(t => t.artists.map(a => a.id))).size > 1) add(r, "discogs-compilation", [releaseNode(r)]);

  async function expandLabel(label: { id: number; name: string }, path: DiscogsPathNode[], origin: DiscogsOrigin, take: number) {
    const rows = await listing(`labels/${label.id}/releases`);
    let added = 0;
    const masters = new Set<number>();
    for (const row of rows.slice(0, 5)) {
      if (roots.some(r => r.releaseId === row.id)) continue;
      const r = await fromRow(row);
      if (!r || !r.labels.some(l => l.id === label.id) || r.masterId && masters.has(r.masterId)) continue;
      if (r.masterId) masters.add(r.masterId);
      add(r, origin, [...path, labelNode(label), releaseNode(r)]);
      if (++added >= take) break;
    }
  }
  // Label priority; depth comes from actual graph edges, never an invented hop.
  for (const label of root.labels.slice(0, deep ? 1 : 2)) await expandLabel(label, rootPath, "discogs-label", deep ? 1 : 2);

  if (deep) {
    // Compilation -> another credited artist -> that artist's other release.
    const compilation = roots.find(r => r.compilation || new Set(r.tracks.flatMap(t => t.artists.map(a => a.id))).size > 1);
    const peers = compilation ? ordered(compilation.tracks.flatMap(t => t.artists).filter(a => !matchingArtistIds.has(a.id)), input.session, a => String(a.id)) : [];
    const seen = new Set<number>();
    for (const peer of peers) {
      if (seen.has(peer.id)) continue;
      seen.add(peer.id);
      const rows = await listing(`artists/${peer.id}/releases`, { sort: "year", sort_order: "asc" });
      for (const row of rows.filter(r => r.role === "Main").slice(0, 2)) {
        const r = await fromRow(row);
        if (!r || roots.some(root => root.releaseId === r.releaseId || root.masterId && root.masterId === r.masterId)) continue;
        add(r, "discogs-deep", [releaseNode(compilation!), artistNode(peer), releaseNode(r)], peer.id);
        break;
      }
      if (seen.size >= 2 || calls >= 14) break;
    }
    // Non-compilation fallback: label release -> credited artist -> other release.
    if (!peers.length) {
      const bridge = candidates.find(c => c.origin === "discogs-label");
      const peer = bridge?.discogs.trackArtists[0];
      if (bridge && peer) {
        const rows = await listing(`artists/${peer.id}/releases`, { sort: "year", sort_order: "asc" });
        for (const row of rows.filter(r => r.role === "Main").slice(0, 2)) {
          const r = await fromRow(row);
          if (!r || r.releaseId === bridge.discogs.releaseId || r.masterId && r.masterId === bridge.discogs.masterId) continue;
          add(r, "discogs-deep", [...bridge.discogs.path, artistNode(peer), releaseNode(r)], peer.id);
          break;
        }
      }
    }
  }
  if ((input.direction === "Même scène" || deep) && root.styles[0] && root.country && root.year && calls < 16) {
    const context = { type: "release", style: root.styles[0], country: root.country, year: String(root.year) };
    const rows = await listing("database/search", context);
    for (const row of rows.slice(0, 2)) {
      const r = await fromRow(row);
      if (!r || roots.some(root => root.releaseId === r.releaseId) || r.country !== root.country || r.year !== root.year || !r.styles.some(s => norm(s) === norm(root.styles[0]))) continue;
      const url = `https://www.discogs.com/search/?${new URLSearchParams(context)}`;
      add(r, "discogs-scene", [...rootPath, { kind: "context", name: `${root.styles[0]} · ${root.country} · ${root.year}`, url }, releaseNode(r)]);
    }
  }
  return { candidates, notes: [...notes] };
}
