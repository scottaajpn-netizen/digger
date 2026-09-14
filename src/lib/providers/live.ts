import type { DigRequest, DigResponse, Recommendation, Track } from "../types";
import { lastFmJson, musicJson, MusicServiceError } from "./http";
import { buildMusicalProfile, compareMusicalProfiles } from "../music/profile";

export const mbidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Credit = { name?: string; joinphrase?: string; artist?: { id?: string; name?: string; country?: string } };
interface Recording { id: string; title: string; score?: number; disambiguation?: string; "artist-credit"?: Credit[]; tags?: { name: string; count?: number }[]; "first-release-date"?: string; releases?: Release[] }
interface Release { id: string; title: string; date?: string; "label-info"?: { label?: { id: string; name: string } }[]; media?: { tracks?: { recording?: Recording }[] }[] }
interface Metadata { artist?: { name?: string; artists?: { name: string; artist_mbid: string; area?: string }[] }; recording?: { name?: string; first_release_date?: string }; release?: { name?: string; mbid?: string; year?: number }; tag?: Record<string, { tag?: string; count?: number }[]> }
type Radio = { recording_mbid: string; similar_artist_name?: string; similar_artist_mbid?: string; total_listen_count?: number; percent?: number };
type LastFmArtist = { name?: string; mbid?: string; url?: string };
type LastFmTrack = { name?: string; mbid?: string; url?: string; match?: number | string; artist?: LastFmArtist | { name?: string } };
type LastFmSimilarResponse = { similartracks?: { track?: LastFmTrack[] } };
type LastFmTagsResponse = { toptags?: { tag?: { name?: string; count?: number | string }[] } };
type LastFmTopTracksResponse = { tracks?: { track?: LastFmTrack[] } };
type CandidateOrigin = "artist-radio" | "tag" | "release" | "label" | "lastfm-similar" | "lastfm-tag";
type Candidate = Recommendation & { relevance: number; origin: CandidateOrigin };
type RankedCandidate = Candidate & { score: number };
const colors: Track["colors"][] = [["#ca673c", "#392824"], ["#b6b56d", "#34382c"], ["#9fafd2", "#303148"], ["#dcab6f", "#803f34"], ["#74968c", "#25383c"], ["#bd7784", "#522f42"]];
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
export const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const quote = (s: string) => `"${s.replace(/[\\"+\-!(){}\[\]^~*?:/|&]/g, " ").trim()}"`;
export function musicBrainzQuery(query: string) {
  const parts = query.split(/\s+[—–-]\s+/);
  if (parts.length === 2) return `(recording:${quote(parts[0])} AND artist:${quote(parts[1])}) OR (recording:${quote(parts[1])} AND artist:${quote(parts[0])})`;
  return query.split(/\s+/).filter(Boolean).map(quote).join(" AND ");
}
export function fromRecording(r: Recording): Track | null {
  if (!r || !mbidPattern.test(r.id) || typeof r.title !== "string") return null;
  const credits = Array.isArray(r["artist-credit"]) ? r["artist-credit"] : [];
  const artist = credits.map(c => (c.name || c.artist?.name || "") + (c.joinphrase || "")).join("");
  if (!artist) return null;
  const release = r.releases?.find(item => !normalized(item.title).startsWith(normalized(r.title))) || r.releases?.[0];
  const tags = (r.tags || []).filter(t => typeof t.name === "string").sort((a,b) => (b.count || 0) - (a.count || 0)).map(t => t.name).slice(0, 6);
  return { id: r.id, title: r.title, artist, artistId: credits[0]?.artist?.id, country: credits[0]?.artist?.country, releaseId: release?.id, album: release?.title, scene: tags[0] || "MusicBrainz", label: "", tags, year: Number(r["first-release-date"]?.slice(0, 4)) || 0, obscurity: 50, colors: colors[hash(r.id) % colors.length], externalIds: { musicbrainz: r.id } };
}
export function deduplicate<T extends Track>(tracks: T[]): T[] {
  const ids = new Set<string>(), names = new Set<string>();
  return tracks.filter(t => { const name = normalized(`${t.artist} ${t.title}`); if (ids.has(t.id) || names.has(name)) return false; ids.add(t.id); names.add(name); return true; });
}

export function selectDiverseRecommendations(ranked: RankedCandidate[], seedArtist: string, limit = 10) {
  const selected: RankedCandidate[] = [];
  const artistCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  const originCounts = new Map<CandidateOrigin, number>();
  const seedArtistName = normalized(seedArtist);

  const tryAdd = (track: RankedCandidate, relaxed: boolean) => {
    if (selected.some(item => item.id === track.id)) return false;
    const artist = normalized(track.artist);
    const label = normalized(track.label || "");
    const artistCount = artistCounts.get(artist) || 0;
    const labelCount = label ? (labelCounts.get(label) || 0) : 0;
    const originCount = originCounts.get(track.origin) || 0;
    if (artist === seedArtistName && artistCount >= 1) return false;
    if (artistCount >= (relaxed ? 2 : 1)) return false;
    if (label && labelCount >= (relaxed ? 3 : 2)) return false;
    if (originCount >= (relaxed ? 6 : 4)) return false;
    selected.push(track);
    artistCounts.set(artist, artistCount + 1);
    if (label) labelCounts.set(label, labelCount + 1);
    originCounts.set(track.origin, originCount + 1);
    return true;
  };

  for (const track of ranked) {
    tryAdd(track, false);
    if (selected.length >= limit) return selected;
  }
  for (const track of ranked) {
    tryAdd(track, true);
    if (selected.length >= limit) break;
  }
  return selected;
}
export async function searchLive(query: string, signal: AbortSignal): Promise<Track[]> {
  const data = await musicJson<{ recordings?: Recording[] }>("mb", "recording/", { query: musicBrainzQuery(query), limit: "25" }, signal);
  // Keep distinct recordings of the same title so the listener can choose a version.
  // Prefer well-documented releases over a lone DJ-mix occurrence at equal search score.
  const records = (data.recordings || []).filter(r => (r.score ?? 0) >= 55).sort((a,b) => (b.score || 0) - (a.score || 0) || (b.releases?.length || 0) - (a.releases?.length || 0));
  const seen = new Set<string>();
  return records.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; }).map(fromRecording).filter((t): t is Track => t !== null).slice(0, 8);
}
export async function recommendLive(input: DigRequest, signal: AbortSignal): Promise<DigResponse> {
  if (!input.seedId || !mbidPattern.test(input.seedId)) throw new MusicServiceError("Choisis d’abord le morceau de départ.", 400);
  const recording = await musicJson<Recording>("mb", `recording/${input.seedId}`, { inc: "artists+releases+tags" }, signal);
  const parsed = fromRecording(recording);
  if (!parsed) throw new MusicServiceError("Ce morceau n’a pas de métadonnées exploitables.", 404);
  const seed: Track = parsed;
  const notes: string[] = [];
  async function optional<T>(job: Promise<T>, message: string): Promise<T | null> { try { return await job; } catch { notes.push(message); return null; } }
  const [artist, release] = await Promise.all([
    seed.artistId ? optional(musicJson<{ tags?: { name: string; count?: number }[]; area?: { name: string }; country?: string }>("mb", `artist/${seed.artistId}`, { inc: "tags" }, signal), "Les informations de l’artiste sont temporairement indisponibles.") : null,
    seed.releaseId ? optional(musicJson<Release>("mb", `release/${seed.releaseId}`, { inc: "labels+recordings+artist-credits" }, signal), "Les informations de label sont temporairement indisponibles.") : null,
  ]);
  seed.tags = [...new Set([...seed.tags, ...(artist?.tags || []).sort((a,b)=>(b.count||0)-(a.count||0)).map(t => t.name)])].slice(0, 5);
  seed.country = artist?.country || seed.country;
  seed.scene = artist?.area?.name || seed.tags[0] || "MusicBrainz";
  seed.label = release?.["label-info"]?.find(l => l.label?.name)?.label?.name || "";
  const lastFmSeedTags = await optional(
    lastFmJson<LastFmTagsResponse>("track.getTopTags", {
      artist: seed.artist,
      track: seed.title,
      autocorrect: "1",
    }, signal),
    "Les tags Last.fm sont indisponibles ; l’analyse continue avec MusicBrainz et ListenBrainz."
  );
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
      if (track) pool.push({ ...track, releaseId: r.id, album: r.title, label, reason: label ? `Paru chez ${label}, comme une édition de « ${seed.title} » (MusicBrainz).` : `Présent sur « ${r.title} », une sortie qui contient aussi ton morceau de départ (MusicBrainz).`, relevance, origin });
    }
  }
  if (release) addRelease(release, seed.label, input.direction === "Labels" ? 80 : 52, "release");
  const radioMode = input.direction === "Rabbit hole" || input.obscurity > 75 ? "hard" : input.obscurity < 30 ? "easy" : "medium";
  const popEnd = input.obscurity > 75 ? 35 : input.obscurity > 40 ? 70 : 100;
  const popBegin = input.obscurity < 25 ? 25 : 0;
  const tagQueries = [...new Set([...seedProfile.subgenres, ...seed.tags])]
    .filter(Boolean)
    .slice(0, 3);
  const [radioResult, labelResult, lastFmSimilar, ...tagResults] = await Promise.all([
    seed.artistId ? optional(musicJson<Record<string, Radio[]>>("lb", `lb-radio/artist/${seed.artistId}`, { mode: radioMode, max_similar_artists: "18", max_recordings_per_artist: "3", pop_begin: "0", pop_end: "100" }, signal), "La radio d’artistes ListenBrainz est indisponible ; les autres pistes restent actives.") : null,
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
  const radio = radioResult ? Object.values(radioResult).flat().filter(r => mbidPattern.test(r.recording_mbid)) : [];
  const tagSourceById = new Map<string, string>();
  const byTag = tagResults.flatMap((result, index) => {
    if (!Array.isArray(result)) return [];
    const tag = tagQueries[index];
    return result.filter(r => mbidPattern.test(r.recording_mbid)).map(row => {
      if (!tagSourceById.has(row.recording_mbid)) tagSourceById.set(row.recording_mbid, tag);
      return row;
    });
  });
  const lastFmSimilarTracks = lastFmSimilar?.similartracks?.track || [];
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
      relevance: 58 + similarity * 30 - index * 0.25,
      origin: "lastfm-similar",
    });
  }

  const lastFmGenreTags = [...new Set([...seedProfile.subgenres, ...seed.tags])].filter(Boolean).slice(0, 2);
  const lastFmTagResults = await Promise.all(lastFmGenreTags.map(tag => optional(
    lastFmJson<LastFmTopTracksResponse>("tag.getTopTracks", { tag, limit: "25", page: input.obscurity > 70 ? "2" : "1" }, signal),
    `La piste Last.fm pour le genre « ${tag} » est indisponible.`
  )));
  lastFmTagResults.forEach((result, resultIndex) => {
    const sourceTag = lastFmGenreTags[resultIndex];
    for (const [index, item] of (result?.tracks?.track || []).entries()) {
      const title = item.name?.trim();
      const artistName = item.artist?.name?.trim();
      if (!title || !artistName) continue;
      const mbid = item.mbid && mbidPattern.test(item.mbid) ? item.mbid : undefined;
      const id = mbid || `lastfm:${hash(`${artistName}:${title}:${sourceTag}`)}`;
      pool.push({
        id,
        title,
        artist: artistName,
        scene: sourceTag || "Last.fm",
        label: "",
        tags: sourceTag ? [sourceTag] : [],
        year: 0,
        obscurity: Math.min(95, 45 + input.obscurity * 0.35 + index * 0.6),
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

  if (!radio.some(r => r.similar_artist_mbid !== seed.artistId)) notes.push(`Peu de liens d’écoute disponibles pour ${seed.artist}. La sélection s’élargit aux genres et aux sorties associés.`);
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
    const sameArtist = m.artist.artists?.[0]?.artist_mbid === seed.artistId;
    const matchedTag = tagSourceById.get(id);
    const reason = related ? sameArtist ? `Un autre morceau de ${seed.artist}, présent dans les écoutes ListenBrainz.` : `ListenBrainz rapproche ${m.artist.name} de ${seed.artist} à partir des habitudes d’écoute.` : `Trouvé via le genre / sous-genre « ${matchedTag || seed.tags[0] || "musique associée"} » dans ListenBrainz.`;
    pool.push({ id, title: m.recording.name, artist: m.artist.name, artistId: m.artist.artists?.[0]?.artist_mbid, country: m.artist.artists?.[0]?.area, album: m.release?.name, releaseId: m.release?.mbid, scene: tags[0] || m.artist.artists?.[0]?.area || "ListenBrainz", label: "", tags, year: m.release?.year || 0, obscurity: popularity === undefined ? 50 : Math.round(100 - popularity), popularity, listenCount: related?.total_listen_count, colors: colors[hash(id) % colors.length], externalIds: { musicbrainz: id, listenbrainz: id }, reason, relevance: related ? sameArtist ? 32 : 72 : 46, origin: related ? "artist-radio" : "tag" });
  }
  const preferred = new Set(pool.filter(t => ["love", "curious"].includes(input.feedback[t.id])).flatMap(t=>t.tags));
  const ranked: RankedCandidate[] = deduplicate(pool.sort((a,b)=>b.relevance-a.relevance))
    .filter(t => t.id !== seed.id && normalized(`${t.artist} ${t.title}`) !== normalized(`${seed.artist} ${seed.title}`) && !["known", "neutral"].includes(input.feedback[t.id]))
    .map(t => {
      const candidateProfile = buildMusicalProfile(t);
      const comparison = compareMusicalProfiles(seedProfile, candidateProfile);
      const shared = t.tags.filter(tag => seed.tags.includes(tag)).length;
      const sameSeedArtist = normalized(t.artist) === normalized(seed.artist);
      let score = t.relevance + comparison.musicalSimilarity * 55 + shared * 3 + t.tags.filter(tag => preferred.has(tag)).length * 4;

      if (sameSeedArtist) score -= 55;
      if (t.popularity !== undefined) score -= Math.abs(t.obscurity - input.obscurity) * .45;

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
        score += sameSeedArtist ? -35 : 18;
        if (t.origin === "lastfm-tag") score += 10;
        score += (1 - comparison.musicalSimilarity) * 8 + comparison.genre * 12 + comparison.traits * 12;
      }

      const jitter = hash(`${t.id}:${input.session}`) % 31;
      if (input.direction === "Surprends-moi") {
        score += jitter * 2.2 + (1 - comparison.musicalSimilarity) * 14;
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

  const selected = selectDiverseRecommendations(ranked, seed.artist, 10);
  if (selected.length < 10) notes.push(`Seulement ${selected.length} pistes exploitables avec ces données et tes exclusions. Aucun morceau inventé n’a été ajouté.`);
  if (!selected.some(t=>t.popularity !== undefined)) notes.push("Popularité indisponible pour cette sélection : le curseur agit sur l’ouverture de la radio, sans indice d’obscurité individuel.");
  return { tracks: selected.map(({ relevance: _, score: __, ...track })=>track), seed, source: "live", fallback: false, direction: input.direction, obscurity: input.obscurity, notes: [...new Set(notes)] };
}
