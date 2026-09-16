import { discoverDiscogs, profileFromDiscogsRelease, type DiscogsOrigin } from "./discogs";
import type { ArtistCredit, DigRequest, DigResponse, Recommendation, Track } from "../types";
import { lastFmJson, musicJson, MusicServiceError } from "./http";
import { buildMusicalProfile, compareMusicalProfiles, discoveryTags } from "../music/profile";

export const mbidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Credit = { name?: string; joinphrase?: string; artist?: { id?: string; name?: string; country?: string } };
interface Recording { id: string; title: string; score?: number; disambiguation?: string; "artist-credit"?: Credit[]; tags?: { name: string; count?: number }[]; "first-release-date"?: string; releases?: Release[] }
interface Release { id: string; title: string; date?: string; "label-info"?: { label?: { id: string; name: string } }[]; media?: { tracks?: { recording?: Recording }[] }[] }
interface Metadata { artist?: { name?: string; artists?: { name: string; artist_mbid: string; area?: string }[] }; recording?: { name?: string; first_release_date?: string }; release?: { name?: string; mbid?: string; year?: number }; tag?: Record<string, { tag?: string; count?: number }[]> }
type Radio = { recording_mbid: string; similar_artist_name?: string; similar_artist_mbid?: string; total_listen_count?: number; percent?: number };
type LastFmArtist = { name?: string; mbid?: string; url?: string };
type LastFmTrack = { name?: string; mbid?: string; url?: string; match?: number | string; listeners?: number | string; artist?: LastFmArtist | { name?: string } };
type LastFmSimilarResponse = { similartracks?: { track?: LastFmTrack[] } };
type LastFmTagsResponse = { toptags?: { tag?: { name?: string; count?: number | string }[] } };
type LastFmTopTracksResponse = { tracks?: { track?: LastFmTrack[] }; toptracks?: { track?: LastFmTrack[] } };
type LastFmSimilarArtistsResponse = { similarartists?: { artist?: { name?: string; match?: number | string }[] } };
type LastFmTrackInfoResponse = { track?: { name?: string; artist?: { name?: string }; listeners?: string; playcount?: string; url?: string } };
type LastFmSearchTrack = { name?: string; artist?: string; mbid?: string; url?: string };
type LastFmSearchResponse = { results?: { trackmatches?: { track?: LastFmSearchTrack[] } } };
type CandidateOrigin = DiscogsOrigin | "artist-radio" | "tag" | "release" | "label" | "lastfm-similar" | "lastfm-tag" | "lastfm-deep" | "lastfm-crate";
type Candidate = Recommendation & { relevance: number; origin: CandidateOrigin; feedbackIds?: string[] };
type RankedCandidate = Candidate & { score: number };
const colors: Track["colors"][] = [["#ca673c", "#392824"], ["#b6b56d", "#34382c"], ["#9fafd2", "#303148"], ["#dcab6f", "#803f34"], ["#74968c", "#25383c"], ["#bd7784", "#522f42"]];
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
export function obscurityFromLastFmListeners(listeners: number) {
  if (!Number.isFinite(listeners) || listeners <= 0) return 90;
  const log = Math.log10(listeners + 1);
  return Math.max(5, Math.min(98, Math.round(102 - log * 17)));
}

// Product thresholds, not a universal definition of underground music.
// Unknown audience must never become a shortcut around strict digging.
export function passesDeepAudienceGate(track: Pick<Track, "lastfmListeners" | "popularity">, obscurity: number) {
  if (obscurity < 90) return true;
  const listenerCap = obscurity >= 95 ? 10000 : 30000;
  const popularityCap = obscurity >= 95 ? 20 : 35;
  const listeners = track.lastfmListeners;
  const popularity = track.popularity;
  const hasListeners = listeners !== undefined && Number.isFinite(listeners) && listeners >= 0;
  const hasPopularity = popularity !== undefined && Number.isFinite(popularity) && popularity >= 0 && popularity <= 100;
  if (hasListeners && listeners > listenerCap) return false;
  if (hasPopularity && popularity > popularityCap) return false;
  return hasListeners || hasPopularity;
}

export const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const trackIdentity = (t: Pick<Track, "artist" | "title">) => `${normalized(t.artist)}\u0000${normalized(t.title)}`;
const quote = (s: string) => `"${s.replace(/[\\"+\-!(){}\[\]^~*?:/|&]/g, " ").trim()}"`;
export function musicBrainzQuery(query: string) {
  const parts = query.split(/\s+[—–-]\s+/);
  if (parts.length === 2) return `(recording:${quote(parts[0])} AND artist:${quote(parts[1])}) OR (recording:${quote(parts[1])} AND artist:${quote(parts[0])})`;
  return query.split(/\s+/).filter(Boolean).map(quote).join(" AND ");
}
export function musicBrainzCredits(rows: Credit[]): ArtistCredit[] {
  return rows.flatMap((row, index) => {
    const name = (row.name || row.artist?.name || "").trim();
    if (!name) return [];
    const previousJoin = index > 0 ? rows[index - 1]?.joinphrase || "" : "";
    const role = /\b(?:feat(?:uring)?|ft)\.?\b/i.test(previousJoin) ? "featured" : "primary";
    return [{
      name,
      role,
      source: "musicbrainz" as const,
      sourceId: row.artist?.id,
      joinPhrase: row.joinphrase || undefined,
    }];
  });
}
export function fromRecording(r: Recording): Track | null {
  if (!r || !mbidPattern.test(r.id) || typeof r.title !== "string") return null;
  const rows = Array.isArray(r["artist-credit"]) ? r["artist-credit"] : [];
  const artist = rows.map(c => (c.name || c.artist?.name || "") + (c.joinphrase || "")).join("");
  if (!artist) return null;
  const credits = musicBrainzCredits(rows);
  const release = r.releases?.find(item => !normalized(item.title).startsWith(normalized(r.title))) || r.releases?.[0];
  const tags = (r.tags || []).filter(t => typeof t.name === "string").sort((a,b) => (b.count || 0) - (a.count || 0)).map(t => t.name).slice(0, 6);
  return { id: r.id, title: r.title, artist, artistId: credits.find(c => c.role === "primary")?.sourceId, credits, country: rows[0]?.artist?.country, releaseId: release?.id, album: release?.title, scene: tags[0] || "MusicBrainz", label: "", tags, year: Number(r["first-release-date"]?.slice(0, 4)) || 0, obscurity: 50, colors: colors[hash(r.id) % colors.length], externalIds: { musicbrainz: r.id } };
}
export function deduplicate<T extends Track>(tracks: T[]): T[] {
  const ids = new Set<string>(), names = new Set<string>();
  return tracks.filter(t => { const name = trackIdentity(t); if (ids.has(t.id) || names.has(name)) return false; ids.add(t.id); names.add(name); return true; });
}

/** Merge only exact artist/title identities; preserve existing track-scoped facts. */
export function mergeDiscoveryCandidates(pool: Candidate[]): Candidate[] {
  const groups = new Map<string, Candidate[]>();
  for (const track of pool) {
    const key = trackIdentity(track);
    groups.set(key, [...(groups.get(key) || []), track]);
  }
  return [...groups.values()].map(group => {
    const ordered = [...group].sort((a, b) => b.relevance - a.relevance);
    const base = ordered.find(t => !t.discogs && t.externalIds?.musicbrainz) || ordered.find(t => !t.discogs) || ordered[0];
    const editorial = ordered.find(t => t.discogs);
    const lastfm = ordered.find(t => t.lastfmListeners !== undefined);
    const lb = ordered.find(t => t.popularity !== undefined);
    return { ...base, relevance: Math.max(...group.map(t => t.relevance)),
      lastfmListeners: lastfm?.lastfmListeners, popularity: lb?.popularity,
      obscurity: lastfm?.obscurity ?? lb?.obscurity ?? base.obscurity,
      obscurityKnown: lastfm || lb ? true : base.obscurityKnown,
      feedbackIds: [...new Set(group.flatMap(t => [t.id, ...(t.feedbackIds || [])]))],
      ...(editorial ? { discogs: editorial.discogs, origin: editorial.origin,
        reason: editorial.reason, label: base.label || editorial.label, album: base.album || editorial.album,
        externalIds: { ...editorial.externalIds, ...base.externalIds } } : {}) };
  });
}

export function selectDiverseRecommendations(ranked: RankedCandidate[], seedArtist: string, limit = 10) {
  ranked = [...ranked].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected: RankedCandidate[] = [];
  const artistCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  const originCounts = new Map<CandidateOrigin, number>();
  const seedArtistName = normalized(seedArtist);
  // Editions of the same performance need not occupy multiple discovery slots.
  // Keep named remixes distinct: they can be musically different interpretations.
  const editionKey = (track: Track) => trackIdentity({...track,title:track.title.replace(/\s*(?:[-–—]|\()\s*(?:radio edit|extended mix|original mix|mixed)\)?\s*$/i, "")});

  const tryAdd = (track: RankedCandidate, relaxed: boolean, newArtists = false) => {
    if (selected.some(item => item.id === track.id || editionKey(item) === editionKey(track))) return false;
    const artist = normalized(track.artist);
    const labels = [...new Set([normalized(track.label || ""), ...(track.discogs?.labels.flatMap(l => [`discogs:${l.id}`, normalized(l.name)]) || [])].filter(Boolean))];
    const artistKeys = [...new Set([artist, ...(track.discogs?.trackArtists.flatMap(a => [`discogs:${a.id}`, normalized(a.name.replace(/\s*\(\d+\)$/, ""))]) || [])])];
    const artistCount = Math.max(...artistKeys.map(key => artistCounts.get(key) || 0));

    const originCount = originCounts.get(track.origin) || 0;
    if (artist === seedArtistName && artistCount >= 1) return false;
    if (artistCount >= (relaxed ? 2 : 1)) return false;
    if (labels.some(label => (labelCounts.get(label) || 0) >= (relaxed ? 3 : 2))) return false;
    if (originCount >= (relaxed || newArtists ? 6 : 4)) return false;
    selected.push(track);
    for (const key of artistKeys) artistCounts.set(key, (artistCounts.get(key) || 0) + 1);
    for (const label of labels) labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
    originCounts.set(track.origin, originCount + 1);
    return true;
  };

  for (const track of ranked) {
    tryAdd(track, false);
    if (selected.length >= limit) return selected;
  }
  for (const track of ranked) {
    tryAdd(track, false, true);
    if (selected.length >= limit) return selected;
  }
  for (const track of ranked) {
    tryAdd(track, true);
    if (selected.length >= limit) break;
  }
  return selected;
}
export async function searchLive(query: string, signal: AbortSignal): Promise<Track[]> {
  let mbTracks: Track[] = [];
  try {
    const data = await musicJson<{ recordings?: Recording[] }>("mb", "recording/", { query: musicBrainzQuery(query), limit: "25" }, signal);
    const records = (data.recordings || []).filter(r => (r.score ?? 0) >= 55).sort((a,b) => (b.score || 0) - (a.score || 0) || (b.releases?.length || 0) - (a.releases?.length || 0));
    const seen = new Set<string>();
    mbTracks = records.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }).map(fromRecording).filter((t): t is Track => t !== null).slice(0, 8);
  } catch (error) {
    if (!(error instanceof MusicServiceError) || ![429, 502, 503, 504].includes(error.status)) throw error;
  }

  if (mbTracks.length >= 4 || !process.env.LASTFM_API_KEY) return mbTracks;
  const parts = query.split(/\s+[—–-]\s+/).map(part => part.trim()).filter(Boolean);
  const primary = parts[0] || query.trim();
  const artist = parts.length === 2 ? parts[1] : "";
  let lastFm: LastFmSearchResponse | null = null;
  try {
    lastFm = await lastFmJson<LastFmSearchResponse>("track.search", {
      track: primary,
      ...(artist ? { artist } : {}),
      limit: "10",
    }, signal);
  } catch {
    return mbTracks;
  }

  const external = (lastFm?.results?.trackmatches?.track || []).flatMap(item => {
    const title = item.name?.trim();
    const artistName = item.artist?.trim();
    if (!title || !artistName) return [];
    const mbid = item.mbid && mbidPattern.test(item.mbid) ? item.mbid : undefined;
    const id = mbid || `lastfm:${hash(`${artistName}:${title}`)}`;
    return [{
      id,
      title,
      artist: artistName,
      scene: "Last.fm",
      label: "",
      tags: [],
      year: 0,
      obscurity: 50,
      colors: colors[hash(id) % colors.length],
      externalIds: { musicbrainz: mbid, lastfm: item.url },
    } satisfies Track];
  });
  return deduplicate([...mbTracks, ...external]).slice(0, 8);
}
export async function recommendLive(input: DigRequest, signal: AbortSignal): Promise<DigResponse> {
  const notes: string[] = [];
  async function optional<T>(job: Promise<T>, message: string): Promise<T | null> { try { return await job; } catch { notes.push(message); return null; } }

  const reference = input.seedTrack;
  const referenceMbid = reference?.externalIds?.musicbrainz;
  const requestedMbid = input.seedId && mbidPattern.test(input.seedId)
    ? input.seedId
    : referenceMbid && mbidPattern.test(referenceMbid)
      ? referenceMbid
      : undefined;

  let seed: Track | null = null;
  if (requestedMbid) {
    try {
      const recording = await musicJson<Recording>("mb", `recording/${requestedMbid}`, { inc: "artists+releases+tags" }, signal);
      seed = fromRecording(recording);
    } catch (error) {
      if (!reference) throw error;
      notes.push("MusicBrainz n’a pas pu confirmer ce morceau ; l’exploration continue avec les autres sources.");
    }
  }

  if (!seed && reference?.title?.trim() && reference.artist?.trim()) {
    const id = reference.id?.trim() || `seed:${hash(`${reference.artist}:${reference.title}`)}`;
    seed = {
      id,
      title: reference.title.trim(),
      artist: reference.artist.trim(),
      scene: reference.scene?.trim() || reference.source || "Sources musicales",
      label: reference.label?.trim() || "",
      tags: Array.isArray(reference.tags) ? reference.tags.filter(tag => typeof tag === "string").slice(0, 8) : [],
      obscurity: 50,
      year: Number.isFinite(reference.year) ? Number(reference.year) : 0,
      colors: colors[hash(id) % colors.length],
      artistId: reference.artistId,
      releaseId: reference.releaseId,
      country: reference.country,
      album: reference.album,
      externalIds: reference.externalIds,
      credits: reference.credits,
    };
    notes.push("Exploration multi-source : aucun identifiant MusicBrainz n’est requis pour ce morceau.");
  }

  if (!seed) throw new MusicServiceError("Choisis d’abord un morceau identifié dans les résultats de recherche.", 400);

  const seedParticipants = (seed.credits || [])
    .filter(credit => credit.role === "primary" || credit.role === "featured");
  const seedParticipantNames = [...new Set(seedParticipants.map(credit => credit.name.trim()).filter(Boolean))];
  const seedParticipantKeys = new Set(seedParticipantNames.map(normalized));
  const seedArtistIds = [...new Set([
    ...seedParticipants.filter(credit => credit.source === "musicbrainz" && credit.sourceId && mbidPattern.test(credit.sourceId)).map(credit => credit.sourceId!),
    ...(seed.artistId && mbidPattern.test(seed.artistId) ? [seed.artistId] : []),
  ])].slice(0, 3);

  // Start the bounded editorial graph alongside the existing providers.
  const discogsJob = discoverDiscogs({ ...seed }, input, signal).catch(() => ({ candidates: [], notes: ["Discogs indisponible ; les autres sources restent actives."] }));
  const lastFmSeedJob = Promise.all([
    optional(
      lastFmJson<LastFmTagsResponse>("track.getTopTags", {
        artist: seed.artist,
        track: seed.title,
        autocorrect: "1",
      }, signal),
      "Les tags Last.fm sont indisponibles ; l’analyse continue avec les autres sources."
    ),
    optional(
      lastFmJson<LastFmTrackInfoResponse>("track.getInfo", {
        artist: seed.artist,
        track: seed.title,
        autocorrect: "1",
      }, signal),
      "La fiche Last.fm du morceau de départ est indisponible."
    ),
  ]);
  const [artistRows, release] = await Promise.all([
    Promise.all(seedArtistIds.map(id => optional(
      musicJson<{ tags?: { name: string; count?: number }[]; area?: { name: string }; country?: string }>("mb", `artist/${id}`, { inc: "tags" }, signal),
      "Les informations d’un artiste crédité sont temporairement indisponibles."
    ))),
    seed.releaseId ? optional(musicJson<Release>("mb", `release/${seed.releaseId}`, { inc: "labels+recordings+artist-credits" }, signal), "Les informations de label sont temporairement indisponibles.") : null,
  ]);
  const artistTags = artistRows.flatMap(row => row?.tags || []).sort((a,b)=>(b.count||0)-(a.count||0)).map(t => t.name);
  seed.tags = [...new Set([...seed.tags, ...artistTags])].slice(0, 8);
  seed.country = artistRows.find(row => row?.country)?.country || seed.country;
  seed.scene = artistRows.find(row => row?.area?.name)?.area?.name || seed.tags[0] || seed.scene || "Sources musicales";
  seed.label = release?.["label-info"]?.find(l => l.label?.name)?.label?.name || seed.label || "";
  const [lastFmSeedTags, lastFmSeedInfo] = await lastFmSeedJob;
  if (lastFmSeedInfo?.track?.url) seed.externalIds = { ...(seed.externalIds || {}), lastfm: lastFmSeedInfo.track.url };
  const seedListeners = Number(lastFmSeedInfo?.track?.listeners || 0);
  if (Number.isFinite(seedListeners) && seedListeners > 0) seed.lastfmListeners = seedListeners;
  const extraLastFmTags = (lastFmSeedTags?.toptags?.tag || [])
    .filter(tag => typeof tag.name === "string")
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
    .map(tag => tag.name!)
    .slice(0, 6);
  if (extraLastFmTags.length) seed.tags = [...new Set([...seed.tags, ...extraLastFmTags])].slice(0, 8);

  const seedProfile = buildMusicalProfile(seed);
  seed.analysis = {
    genres: seedProfile.genres,
    subgenres: seedProfile.subgenres,
    traits: seedProfile.traits,
  };
  const pool: Candidate[] = [];
  function addRelease(r: Release, label: string, relevance: number, origin: CandidateOrigin = "release") {
    for (const media of r.media || []) for (const item of media.tracks || []) {
      const track = item.recording ? fromRecording(item.recording) : null;
      if (track) pool.push({ ...track, releaseId: r.id, album: r.title, label, reason: label ? `Paru chez ${label}, comme une édition de « ${seed!.title} » (MusicBrainz).` : `Présent sur « ${r.title} », une sortie qui contient aussi ton morceau de départ (MusicBrainz).`, relevance, origin });
    }
  }
  if (release) addRelease(release, seed.label, input.direction === "Labels" ? 80 : 52, "release");
  const radioMode = input.direction === "Rabbit hole" || input.obscurity > 75 ? "hard" : input.obscurity < 30 ? "easy" : "medium";
  const popEnd = input.obscurity > 75 ? 35 : input.obscurity > 40 ? 70 : 100;
  const popBegin = input.obscurity < 25 ? 25 : 0;
  const tagQueries = discoveryTags(seed.tags);
  const [radioResults, labelResult, lastFmSimilar, ...tagResults] = await Promise.all([
    Promise.all(seedArtistIds.map(id => optional(
      musicJson<Record<string, Radio[]>>("lb", `lb-radio/artist/${id}`, { mode: radioMode, max_similar_artists: "18", max_recordings_per_artist: "3", pop_begin: String(popBegin), pop_end: String(popEnd) }, signal),
      "La radio d’un artiste crédité ListenBrainz est indisponible ; les autres pistes restent actives."
    ))),
    input.direction === "Labels" && release?.["label-info"]?.some(l=>l.label?.id) ? optional(musicJson<{ releases?: Release[] }>("mb", "release", { label: release["label-info"]!.find(l=>l.label?.id)!.label!.id, inc: "recordings+artist-credits", limit: "6" }, signal), "Le catalogue du label n’a pas pu être chargé ; les autres pistes sont proposées.") : null,
    optional(lastFmJson<LastFmSimilarResponse>("track.getSimilar", {
      artist: seed.artist,
      track: seed.title,
      autocorrect: "1",
      limit: "40",
    }, signal), "Les morceaux similaires Last.fm sont indisponibles ; les autres sources restent actives."),
    ...tagQueries.map(tag => optional(
      musicJson<Radio[]>("lb", "lb-radio/tags", { tag, pop_begin: String(popBegin), pop_end: String(popEnd), count: "35" }, signal),
      `La recherche ListenBrainz pour le genre « ${tag} » est indisponible.`
    )),
  ]);
  const radio = radioResults.flatMap(result => result ? Object.values(result).flat() : []).filter(r => mbidPattern.test(r.recording_mbid));
  const tagSourceById = new Map<string, string>();
  const byTag = tagResults.flatMap((result, index) => {
    if (!Array.isArray(result)) return [];
    const tag = tagQueries[index];
    return result.filter(r => mbidPattern.test(r.recording_mbid)).map(row => {
      if (!tagSourceById.has(row.recording_mbid)) tagSourceById.set(row.recording_mbid, tag);
      return row;
    });
  });
  const allLastFmSimilarTracks = lastFmSimilar?.similartracks?.track || [];
  const directLastFmOffset = input.obscurity >= 90 ? 12 : input.obscurity >= 75 ? 6 : 0;
  const lastFmSimilarTracks = allLastFmSimilarTracks.slice(directLastFmOffset);

  // Catalogue fallback for deep digging: if track-level similarity is empty,
  // walk through neighbouring artists, then inspect several cuts from each catalogue.
  // This keeps the path explainable while avoiding tag charts.
  if (allLastFmSimilarTracks.length === 0) {
    const artistAnchors = seedParticipantNames.length ? seedParticipantNames.slice(0, 3) : [seed.artist];
    const similarArtistRows = await Promise.all(artistAnchors.map(anchor => optional(
      lastFmJson<LastFmSimilarArtistsResponse>("artist.getSimilar", {
        artist: anchor,
        limit: "8",
        autocorrect: "1",
      }, signal),
      `Les artistes voisins Last.fm autour de ${anchor} sont indisponibles.`
    )));
    const neighbours = similarArtistRows
      .flatMap((result, anchorIndex) => (result?.similarartists?.artist || []).map(row => ({...row, anchor: artistAnchors[anchorIndex]})))
      .filter(row => typeof row.name === "string" && row.name.trim() && !seedParticipantKeys.has(normalized(row.name)) && normalized(row.name) !== normalized(seed.artist))
      .filter((row, index, all) => all.findIndex(other => normalized(other.name || "") === normalized(row.name || "")) === index)
      .slice(0, 5);

    const catalogues = await Promise.all(neighbours.map(row => optional(
      lastFmJson<LastFmTopTracksResponse>("artist.getTopTracks", {
        artist: row.name!,
        limit: "12",
        autocorrect: "1",
      }, signal),
      `Le catalogue Last.fm de ${row.name} est indisponible.`
    )));

    catalogues.forEach((result, artistIndex) => {
      const neighbour = neighbours[artistIndex];
      const neighbourName = neighbour?.name?.trim() || "";
      for (const [index, item] of (result?.toptracks?.track || []).entries()) {
        const title = item.name?.trim();
        const artistName = item.artist?.name?.trim() || neighbourName;
        if (!title || !artistName || normalized(artistName) === normalized(seed.artist)) continue;
        const mbid = item.mbid && mbidPattern.test(item.mbid) ? item.mbid : undefined;
        const id = mbid || `lastfm-crate:${hash(`${artistName}:${title}`)}`;
        const listeners = Number(item.listeners);
        pool.push({
          id,
          title,
          artist: artistName,
          scene: seedProfile.subgenres[0] || seedProfile.genres[0] || "Last.fm catalogue",
          label: "",
          tags: [],
          year: 0,
          obscurity: Number.isFinite(listeners) && listeners > 0 ? obscurityFromLastFmListeners(listeners) : 50,
          obscurityKnown: Number.isFinite(listeners) && listeners > 0,
          lastfmListeners: Number.isFinite(listeners) && listeners > 0 ? listeners : undefined,
          colors: colors[hash(id) % colors.length],
          externalIds: { musicbrainz: mbid, lastfm: item.url },
          reason: `Catalogue : ${neighbour?.anchor || seed.artist} → artiste voisin ${artistName} → « ${title} ».`,
          relevance: 66 + Math.max(0, 14 - index * 0.6) + Math.max(0, 8 - artistIndex),
          origin: "lastfm-crate",
        });
      }
    });
  }
  for (const [index, item] of lastFmSimilarTracks.entries()) {
    const title = item.name?.trim();
    const artistName = item.artist?.name?.trim();
    if (!title || !artistName) continue;
    const mbid = item.mbid && mbidPattern.test(item.mbid) ? item.mbid : undefined;
    const similarity = Math.max(0, Math.min(1, Number(item.match || 0)));
    const id = mbid || `lastfm:${hash(`${artistName}:${title}`)}`;
    pool.push({
      id,
      title,
      artist: artistName,
      scene: seedProfile.subgenres[0] || seedProfile.genres[0] || "Last.fm",
      label: "",
      tags: [],
      year: 0,
      obscurity: 50,
      colors: colors[hash(id) % colors.length],
      externalIds: {
        musicbrainz: mbid,
        lastfm: item.url,
      },
      reason: `Last.fm rapproche ce morceau de « ${seed.title} » à partir des habitudes d’écoute.`,
      relevance: 58 + similarity * 30 - index * 0.25 - directLastFmOffset * 0.35,
      origin: "lastfm-similar",
    });
  }

  const deepMode = input.obscurity >= 80 || input.direction === "Rabbit hole";
  const lastFmGenreTags = tagQueries.slice(0, 2);

  // Last.fm tag.getTopTracks is intentionally disabled in deep mode:
  // it tends to return canonical/mainstream tracks, which works against digging.
  const lastFmTagResults = deepMode ? [] : await Promise.all(lastFmGenreTags.map(tag => optional(
    lastFmJson<LastFmTopTracksResponse>("tag.getTopTracks", { tag, limit: "25", page: "1" }, signal),
    `La piste Last.fm pour le genre « ${tag} » est indisponible.`
  )));
  lastFmTagResults.forEach((result, resultIndex) => {
    const sourceTag = lastFmGenreTags[resultIndex];
    for (const [index, item] of (result?.tracks?.track || []).entries()) {
      const title = item.name?.trim();
      const artistName = item.artist?.name?.trim();
      if (!title || !artistName) continue;
      const mbid = item.mbid && mbidPattern.test(item.mbid) ? item.mbid : undefined;
      const id = mbid || `lastfm:${hash(`${artistName}:${title}`)}`;
      pool.push({
        id,
        title,
        artist: artistName,
        scene: sourceTag || "Last.fm",
        label: "",
        tags: sourceTag ? [sourceTag] : [],
        year: 0,
        obscurity: 50,
        colors: colors[hash(id) % colors.length],
        externalIds: {
          musicbrainz: mbid,
          lastfm: item.url,
        },
        reason: `Repéré dans les morceaux associés au tag « ${sourceTag} » sur Last.fm.`,
        relevance: 48 + Math.max(0, 18 - index * 0.5),
        origin: "lastfm-tag",
      });
    }
  });

  // Second-circle digging: use mid-list similar tracks as bridges, then ask
  // Last.fm for neighbours of those tracks. This deliberately moves away
  // from the obvious first-hop recommendations while preserving a musical path.
  if (deepMode && allLastFmSimilarTracks.length) {
    const bridgeIndexes = input.obscurity >= 95 ? [12, 20, 28] : [8, 16, 24];
    const bridges = bridgeIndexes
      .map(index => allLastFmSimilarTracks[index])
      .filter((track): track is LastFmTrack => Boolean(track?.name && track.artist?.name))
      .slice(0, 3);

    const secondCircle = await Promise.all(bridges.map(bridge => optional(
      lastFmJson<LastFmSimilarResponse>("track.getSimilar", {
        artist: bridge.artist!.name!,
        track: bridge.name!,
        autocorrect: "1",
        limit: "20",
      }, signal),
      `Le deuxième cercle Last.fm autour de « ${bridge.name} » est indisponible.`
    )));

    secondCircle.forEach((result, bridgeIndex) => {
      const bridge = bridges[bridgeIndex];
      const bridgeArtist = bridge.artist?.name || "";
      const bridgeTitle = bridge.name || "";
      for (const [index, item] of (result?.similartracks?.track || []).entries()) {
        const title = item.name?.trim();
        const artistName = item.artist?.name?.trim();
        if (!title || !artistName) continue;
        if (normalized(artistName) === normalized(seed.artist)) continue;
        const mbid = item.mbid && mbidPattern.test(item.mbid) ? item.mbid : undefined;
        const id = mbid || `lastfm:${hash(`${artistName}:${title}`)}`;
        const match = Math.max(0, Math.min(1, Number(item.match || 0)));
        pool.push({
          id,
          title,
          artist: artistName,
          scene: seedProfile.subgenres[0] || seedProfile.genres[0] || "Last.fm deep",
          label: "",
          tags: [],
          year: 0,
          obscurity: 50,
          colors: colors[hash(id) % colors.length],
          externalIds: {
            musicbrainz: mbid,
            lastfm: item.url,
          },
          reason: `Deuxième cercle : « ${seed.title} » → « ${bridgeTitle} » par ${bridgeArtist} → ce morceau.`,
          relevance: 60 + match * 18 - index * 0.45,
          origin: "lastfm-deep",
        });
      }
    });
  }

  if (!radio.some(r => !r.similar_artist_mbid || !seedArtistIds.includes(r.similar_artist_mbid))) notes.push(`Peu de liens d’écoute disponibles pour ${seed.artist}. La sélection s’élargit aux genres et aux sorties associés.`);
  if (labelResult?.releases) for (const r of labelResult.releases) addRelease(r, seed.label, 85, "label");
  if (input.direction === "Labels" && !seed.label) notes.push("Aucun label renseigné pour cette édition. Sélection élargie aux artistes et aux genres.");
  if (input.direction === "Même scène") notes.push("« Même scène » privilégie ici les artistes associés, les genres et, lorsqu’elle est connue, la zone géographique ; ce n’est pas une scène musicale certifiée.");

  const rows = [...radio, ...byTag];
  const ids = [...new Set(rows.map(r => r.recording_mbid))].slice(0, 100);
  const metadata = ids.length ? await optional(musicJson<Record<string, Metadata>>("lb", "metadata/recording/", { recording_mbids: ids.join(","), inc: "artist tag release" }, signal), "Certaines fiches ListenBrainz n’ont pas pu être chargées.") : null;
  for (const id of ids) {
    const m = metadata?.[id];
    if (!m?.recording?.name || !m.artist?.name) continue;
    const related = radio.find(r => r.recording_mbid === id);
    const tagRow = byTag.find(r => r.recording_mbid === id);
    const popularity = typeof tagRow?.percent === "number" && Number.isFinite(tagRow.percent) ? Math.max(0,Math.min(100,tagRow.percent)) : undefined;
    const tags = [...new Set(Object.values(m.tag || {}).flat().sort((a,b)=>(b.count||0)-(a.count||0)).map(t => t.tag).filter((t): t is string => typeof t === "string"))].slice(0, 6);
    const sameArtist = Boolean(m.artist.artists?.[0]?.artist_mbid && seedArtistIds.includes(m.artist.artists[0].artist_mbid));
    const matchedTag = tagSourceById.get(id);
    const reason = related ? sameArtist ? `Un autre morceau de ${seed.artist}, présent dans les écoutes ListenBrainz.` : `ListenBrainz rapproche ${m.artist.name} de ${seed.artist} à partir des habitudes d’écoute.` : `Trouvé via le genre / sous-genre « ${matchedTag || seed.tags[0] || "musique associée"} » dans ListenBrainz.`;
    pool.push({ id, title: m.recording.name, artist: m.artist.name, artistId: m.artist.artists?.[0]?.artist_mbid, country: m.artist.artists?.[0]?.area, album: m.release?.name, releaseId: m.release?.mbid, scene: tags[0] || m.artist.artists?.[0]?.area || "ListenBrainz", label: "", tags, year: m.release?.year || 0, obscurity: popularity === undefined ? 50 : Math.round(100 - popularity), popularity, listenCount: related?.total_listen_count, colors: colors[hash(id) % colors.length], externalIds: { musicbrainz: id, listenbrainz: id }, reason, relevance: related ? sameArtist ? 32 : 72 : 46, origin: related ? "artist-radio" : "tag" });
  }
  const discogsResult = await discogsJob;
  pool.push(...discogsResult.candidates);
  notes.push(...discogsResult.notes);
  const merged = mergeDiscoveryCandidates(pool);
  pool.splice(0, pool.length, ...merged);
  if (input.obscurity >= 75 && process.env.LASTFM_API_KEY) {
    const enrichmentTargets = deduplicate(
      [...pool]
        .filter(track => track.id !== seed.id && normalized(track.artist) !== normalized(seed.artist) && track.lastfmListeners === undefined)
        .sort((a, b) => b.relevance - a.relevance)
    ).slice(0, 60);

    const audienceRows: (LastFmTrackInfoResponse | null)[] = [];
    // Bound outbound concurrency; abort still propagates through each HTTP request.
    for (let offset = 0; offset < enrichmentTargets.length; offset += 6) {
      signal.throwIfAborted();
      audienceRows.push(...await Promise.all(enrichmentTargets.slice(offset, offset + 6).map(track => optional(
      lastFmJson<LastFmTrackInfoResponse>("track.getInfo", {
        artist: track.artist,
        track: track.title,
        autocorrect: "0",
      }, signal),
      `Audience Last.fm indisponible pour « ${track.title} ».`
      ))));
    }

    const audienceByName = new Map<string, { listeners: number; url?: string }>();
    enrichmentTargets.forEach((track, index) => {
      const info = audienceRows[index]?.track;
      if (track.discogs && (!info?.name || !info.artist?.name || normalized(info.name) !== normalized(track.title) || normalized(info.artist.name) !== normalized(track.artist))) return;
      const listeners = Number(info?.listeners || 0);
      if (!Number.isFinite(listeners) || listeners <= 0) return;
      audienceByName.set(trackIdentity(track), { listeners, url: info?.url });
    });

    for (const track of pool) {
      const audience = audienceByName.get(trackIdentity(track));
      if (!audience) continue;
      track.lastfmListeners = audience.listeners;
      track.obscurityKnown = true;
      track.obscurity = obscurityFromLastFmListeners(audience.listeners);
      if (audience.url) track.externalIds = { ...(track.externalIds || {}), lastfm: audience.url };
    }
  }

  const preferred = new Set(pool.filter(t => ["love", "curious"].includes(input.feedback[t.id])).flatMap(t=>t.tags));
  const ranked: RankedCandidate[] = deduplicate(pool.sort((a,b)=>b.relevance-a.relevance))
    .filter(t => t.id !== seed.id && trackIdentity(t) !== trackIdentity(seed) && normalized(t.artist) !== normalized(seed.artist) && !seedParticipantKeys.has(normalized(t.artist)) && ![t.id, ...(t.feedbackIds || [])].some(id => ["known", "neutral"].includes(input.feedback[id])))
    .map(t => {
      const candidateProfile = buildMusicalProfile(t);
      const comparison = compareMusicalProfiles(seedProfile, candidateProfile);
      const shared = t.tags.filter(tag => seed.tags.includes(tag)).length;

      let score = t.relevance + comparison.musicalSimilarity * 55 + shared * 3 + t.tags.filter(tag => preferred.has(tag)).length * 4;
      if (t.popularity !== undefined) {
        score -= Math.abs(t.obscurity - input.obscurity) * .45;
        if (input.obscurity >= 80 && t.popularity > 35) score -= (t.popularity - 35) * 1.25;
        if (input.obscurity >= 95 && t.popularity > 20) score -= (t.popularity - 20) * 1.5;
      }
      if (input.obscurity >= 80 && t.listenCount !== undefined && t.listenCount > 0) {
        score -= Math.max(0, Math.log10(t.listenCount + 1) - 3) * 8;
      }
      if (input.obscurity >= 75 && t.lastfmListeners !== undefined) {
        const audiencePenalty = Math.max(0, Math.log10(t.lastfmListeners + 1) - 3.2);
        score -= audiencePenalty * (input.obscurity >= 95 ? 18 : 11);
        score -= Math.abs(t.obscurity - input.obscurity) * 0.65;
      }
      if (input.obscurity >= 80 && t.origin === "lastfm-tag") score -= 35;
      if (input.obscurity >= 90 && t.origin === "lastfm-deep") score += 26;
      if (input.obscurity >= 80 && t.origin === "lastfm-crate") score += 24;

      if (t.discogs) {
        // Editorial metadata is release-scoped, separate from track similarity.
        const releaseProfile = profileFromDiscogsRelease(t.discogs);
        const styleOverlap = releaseProfile.subgenres.filter(s => seedProfile.subgenres.includes(s)).length;
        const styleWeight = t.discogs.compilation ? 2 : 5;
        score += Math.min(2, styleOverlap) * styleWeight;
        if (input.direction === "Labels" && t.origin === "discogs-label") score += 45;
        if (input.direction === "Même scène" && t.origin === "discogs-scene") score += 25;
        if (input.direction === "Rabbit hole" && t.origin === "discogs-deep") score += 45;
        if (input.direction === "Surprends-moi" && input.obscurity >= 80 && t.origin === "discogs-deep") score += 35;
      }

      if (input.direction === "Même vibe") {
        score += comparison.musicalSimilarity * 35;
        if (t.origin === "tag" || t.origin === "lastfm-tag") score += 10;
        if (t.origin === "lastfm-similar") score += 14;
      }
      if (input.direction === "Même scène") {
        if (comparison.country) score += 22;
        score += comparison.subgenre * 16 + comparison.rawTags * 10;
      }
      if (input.direction === "Labels") {
        if (seed.label && t.label && normalized(seed.label) === normalized(t.label)) score += 34;
        score += comparison.subgenre * 12;
      }
      if (input.direction === "Rabbit hole") {
        score += 18;
        if (t.origin === "lastfm-deep") score += 22;
        if (t.origin === "lastfm-crate") score += 28;
        if (t.origin === "lastfm-tag") score -= 12;
        score += (1 - comparison.musicalSimilarity) * 8 + comparison.genre * 12 + comparison.traits * 12;
      }

      const jitter = hash(`${t.id}:${input.session}`) % 31;
      if (input.direction === "Surprends-moi") {
        score += jitter * 2.2 + (1 - comparison.musicalSimilarity) * 14;
        if (input.obscurity >= 80 && t.origin === "lastfm-deep") score += 30;
        if (input.obscurity >= 80 && t.origin === "lastfm-similar") score += 8;
        if (input.obscurity >= 80 && t.origin === "release") score += 10;
        if (comparison.genre === 0 && comparison.subgenre === 0 && comparison.traits === 0 && comparison.rawTags === 0) score -= 20;
      } else {
        score += jitter * .12;
      }

      const sharedSubgenres = candidateProfile.subgenres.filter(value => seedProfile.subgenres.includes(value));
      const sharedTraits = candidateProfile.traits.filter(value => seedProfile.traits.includes(value));
      let reason = t.reason;
      if (sharedSubgenres.length) reason = `Sous-genre commun : ${sharedSubgenres.slice(0, 2).join(" / ")}. ${reason}`;
      else if (sharedTraits.length) reason = `Traits musicaux communs : ${sharedTraits.slice(0, 2).join(" / ")}. ${reason}`;
      return {
        ...t,
        reason,
        score,
        analysis: {
          genres: candidateProfile.genres,
          subgenres: candidateProfile.subgenres,
          traits: candidateProfile.traits,
          similarity: Math.round(comparison.musicalSimilarity * 100),
        },
      };
    })
    .sort((a,b)=>b.score-a.score);

  const deepRanked = input.obscurity >= 90
    ? ranked.filter(track => track.origin !== "lastfm-tag" && passesDeepAudienceGate(track, input.obscurity))
    : ranked;
  const selected = selectDiverseRecommendations(deepRanked, seed.artist, 10);
  if (selected.length < 10) notes.push(`Seulement ${selected.length} pistes exploitables avec ces données et tes exclusions. Aucun morceau inventé n’a été ajouté.`);
  if (input.obscurity >= 90) notes.push("Digging strict : les audiences trop élevées ou non vérifiées sont écartées, même si cela réduit la sélection. Les auditeurs Last.fm mesurent le morceau, pas la notoriété globale de l’artiste.");
  if (!selected.some(t=>t.popularity !== undefined || t.lastfmListeners !== undefined)) notes.push("Popularité indisponible pour cette sélection : le curseur agit sur l’ouverture de la radio, sans indice d’obscurité individuel.");
  return { tracks: selected.map(({ relevance: _, score: __, feedbackIds: ___, ...track })=>track), seed, source: "live", fallback: false, direction: input.direction, obscurity: input.obscurity, notes: [...new Set(notes)] };
}
