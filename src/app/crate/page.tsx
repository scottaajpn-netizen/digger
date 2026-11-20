"use client";

import { useEffect, useRef, useState } from "react";
import type { CrateRelease } from "@/lib/crate/select";
import type { DiscogsTrackPick } from "@/lib/crate/tracklist";
import type { OfficialVideoEmbed } from "@/lib/crate/video-preview";
import { workKey } from "@/lib/crate/select";
import { buildSeenKeys, pushViewed, validateFeedback, validateHistory, rejectionReasons, rejectionLabels, type RejectionReason, type CrateFeedback } from "@/lib/crate/session";
import "./crate.css";

type Filters = { genre: string; style: string; country: string; from: string; to: string };
type CrateReply = { releases?: CrateRelease[]; error?: string; warnings?: string[]; source?: string; note?: string; seed?: number };
type TrackReply = { track?: DiscogsTrackPick; preview?: OfficialVideoEmbed | null; error?: string; eligibleCount?: number };
type FavoriteRecord = { release: CrateRelease; track: DiscogsTrackPick; preview?: OfficialVideoEmbed | null };
type VisibleRecord = { release: CrateRelease; track?: DiscogsTrackPick | null; preview?: OfficialVideoEmbed | null };
const storage = "sukotto.crate.v1";
const initialFilters: Filters = { genre: "", style: "", country: "", from: "1960", to: "1989" };
const genres = ["", "Funk / Soul", "Jazz", "Electronic", "Rock", "Reggae", "Latin", "Blues", "Hip Hop", "Pop", "Classical"];
const countries = ["", "France", "Brazil", "Japan", "Nigeria", "Ethiopia", "Turkey", "Poland", "South Africa", "United Kingdom", "United States"];
const normalize = (s: string) => s.trim();

export default function CratePage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [records, setRecords] = useState<CrateRelease[]>([]);
  const [position, setPosition] = useState(0);
  const [favorites, setFavorites] = useState<Record<string, FavoriteRecord>>({});
  const [trackPicks, setTrackPicks] = useState<Record<string, DiscogsTrackPick | null>>({});
  const [trackErrors, setTrackErrors] = useState<Record<string, string>>({});
  const [videoPreviews, setVideoPreviews] = useState<Record<string, OfficialVideoEmbed | null>>({});
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const pendingRef = useRef<Map<string, AbortController>>(new Map());
  const [viewed, setViewed] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<CrateFeedback>({});
  const [view, setView] = useState<"dig" | "favorites">("dig");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Choisis tes filtres puis lance une découverte.");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const item = localStorage.getItem(storage);
      if (item) {
        const saved = JSON.parse(item) as { filters?: Filters; favorites?: Record<string, FavoriteRecord>; viewed?: string[]; feedback?: CrateFeedback };
        if (saved.filters && typeof saved.filters.genre === "string") setFilters({ ...initialFilters, ...saved.filters });
        setViewed(validateHistory(saved.viewed));
        setFeedback(validateFeedback(saved.feedback));
        if (saved.favorites && typeof saved.favorites === "object") {
          const verified = Object.entries(saved.favorites).filter((entry): entry is [string, FavoriteRecord] => {
            const value = entry[1] as FavoriteRecord | undefined;
            return typeof entry[0] === "string" && !!value?.release?.id && !!value?.track?.title;
          });
          setFavorites(Object.fromEntries(verified.slice(0, 150)));
        }
      }
    } catch { /* Corrupt local profile: start safely with defaults. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storage, JSON.stringify({ filters, favorites, viewed, feedback })); } catch { /* Full or disabled storage. */ }
  }, [filters, favorites, viewed, feedback, ready]);

  const current = records[position] ?? null;

  // Record only releases actually viewed, never prefetched candidates.
  useEffect(() => {
    if (ready && current) setViewed(previous => pushViewed(previous, current));
  }, [current?.id, ready]);

  // Prefetch tracklists + optional video metadata for current and next 2 records.
  // Requests offscreen are aborted to keep concurrency at most three.
  useEffect(() => {
    const wanted = records.slice(position, position + 3).filter(
      record => /^discogs:\d+$/.test(record.id),
    );
    const wantedIds = new Set(wanted.map(record => record.id));
    for (const [id, controller] of pendingRef.current) {
      if (!wantedIds.has(id)) {
        controller.abort();
        pendingRef.current.delete(id);
      }
    }
    for (const record of wanted) {
      const id = record.id;
      if (Object.prototype.hasOwnProperty.call(trackPicks, id) ||
          trackErrors[id] || pendingRef.current.has(id)) continue;
      const controller = new AbortController();
      pendingRef.current.set(id, controller);
      setLoadingIds(previous => ({ ...previous, [id]: true }));
      const params = new URLSearchParams({
        releaseId: id.slice("discogs:".length),
        seed: String(Number(id.slice("discogs:".length)) % 2147483647),
      });
      void fetch(`/api/crate/track?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
        .then(async response => {
          const result = await response.json() as TrackReply;
          if (!response.ok || !result.track) throw new Error(result.error || "Aucune piste exploitable.");
          if (controller.signal.aborted) return;
          setTrackPicks(previous => ({ ...previous, [id]: result.track! }));
          setVideoPreviews(previous => ({ ...previous, [id]: result.preview || null }));
        })
        .catch(failure => {
          if (!controller.signal.aborted) {
            setTrackErrors(previous => ({
              ...previous, [id]: failure instanceof Error ? failure.message : "Piste indisponible.",
            }));
          }
        })
        .finally(() => {
          pendingRef.current.delete(id);
          setLoadingIds(previous => { const next = { ...previous }; delete next[id]; return next; });
        });
    }
  }, [records, position, trackPicks, trackErrors]);

  useEffect(() => {
    const pending = pendingRef.current;
    return () => { for (const controller of pending.values()) controller.abort(); pending.clear(); };
  }, []);

  async function discover(surprise = false, reset = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("Exploration du catalogue Discogs…");
    const params = new URLSearchParams({ count: "8", seed: String(Math.floor(Math.random() * 2147483647)) });
    if (surprise) params.set("surprise", "1");
    else {
      if (filters.genre) params.set("genre", normalize(filters.genre));
      if (filters.style) params.set("style", normalize(filters.style));
      if (filters.country) params.set("country", normalize(filters.country));
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
    }
    const seen = buildSeenKeys(viewed, records, feedback);
    if (seen.length) params.set("seen", seen.join(","));
    try {
      const response = await fetch(`/api/crate?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as CrateReply;
      if (!response.ok) throw new Error(result.error || `Erreur HTTP ${response.status}`);
      if (!result.releases?.length) {
        setStatus("Aucun disque trouvé : élargis les filtres ou essaie Surprise totale.");
        return;
      }
      if (reset) { setRecords(result.releases); setPosition(0); }
      else {
        const existing = new Set(records.map(workKey));
        const fresh = result.releases.filter(r => !existing.has(workKey(r)));
        if (!fresh.length) {
          setStatus("Aucun nouveau disque : modifie les filtres ou démarre une nouvelle exploration.");
          return;
        }
        const next = [...records, ...fresh].slice(-100);
        setRecords(next);
        setPosition(next.length - fresh.length);
      }
      setView("dig");
      setStatus(surprise ? "Surprise totale : découverte sans filtre." : "Disques issus de Discogs • aperçu métadonnées");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible de récupérer les disques.");
      setStatus("La découverte n'a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (position + 1 < records.length) setPosition(position + 1);
    else void discover(false, records.length === 0);
  }
  function rejectCurrent(record: CrateRelease, reason: RejectionReason) {
    setFeedback(previous => ({ ...previous, [record.id]: { reason, at: Date.now() } }));
    setOpenVideoId(null);
    next();
  }

  function toggleFavorite(record: CrateRelease, track: DiscogsTrackPick, preview: OfficialVideoEmbed | null) {
    const id = track.id;
    setFavorites(previous => {
      const next = { ...previous };
      if (next[id]) delete next[id];
      else next[id] = { release: record, track, preview };
      return next;
    });
  }
  function changeFilter(name: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [name]: value }));
  }
  const favoriteRecords = Object.values(favorites);
  const displayed: VisibleRecord[] = view === "favorites"
    ? favoriteRecords
    : current ? [{ release: current, track: trackPicks[current.id], preview: videoPreviews[current.id] }] : [];

  return <main className="crate-app">
    <header className="crate-header">
      <a href="/" aria-label="Retour à Digger">← Digger</a>
      <div><span className="crate-eyebrow">SUKOTTO · MPC LAB</span><h1>CRATE <em>DIGGER</em></h1></div>
      <span className="crate-prototype">PROTOTYPE WEB · APERÇUS YOUTUBE</span>
    </header>
    <p className="crate-intro">Des disques inattendus, pas une recherche. Choisis quelques critères, puis fouille un bac virtuel.</p>

    <section className="crate-panel" aria-label="Filtres de découverte">
      <div className="crate-fields">
        <label>GENRE
          <select value={filters.genre} onChange={e => changeFilter("genre", e.target.value)}>{genres.map(g => <option key={g} value={g}>{g || "Tous les genres"}</option>)}</select>
        </label>
        <label>STYLE / SOUS-GENRE
          <input placeholder="Ex. Soul, Fusion…" maxLength={60} value={filters.style} onChange={e => changeFilter("style", e.target.value)}/>
        </label>
        <label>PAYS DE SORTIE
          <select value={filters.country} onChange={e => changeFilter("country", e.target.value)}>{countries.map(c => <option key={c} value={c}>{c || "Tous les pays"}</option>)}</select>
        </label>
        <label>ANNÉE DE
          <input inputMode="numeric" type="number" min="1900" max="2100" value={filters.from} onChange={e => changeFilter("from", e.target.value)}/>
        </label>
        <label>ANNÉE À
          <input inputMode="numeric" type="number" min="1900" max="2100" value={filters.to} onChange={e => changeFilter("to", e.target.value)}/>
        </label>
      </div>
      <p className="crate-hint">Instrument et nombre de vues : prévus après enrichissement des données. Ils ne sont pas encore opérationnels.</p>
      <div className="crate-actions">
        <button type="button" className="crate-primary" disabled={busy} onClick={() => void discover(false, true)}>{busy ? "Exploration…" : "↻ Nouvelle exploration"}</button>
        <button type="button" className="crate-surprise" disabled={busy} onClick={() => void discover(true, true)}>✳ Surprise totale</button>
      </div>
    </section>

    <div className="crate-navigation" role="group" aria-label="Affichage">
      <button aria-pressed={view === "dig"} onClick={() => setView("dig")}>Découverte</button>
      <button aria-pressed={view === "favorites"} onClick={() => setView("favorites")}>♥ Favoris ({favoriteRecords.length})</button>
      <span className="crate-session-count">Historique : {Math.floor(viewed.length / 2)} visites</span>
    </div>

    <section aria-live="polite" className="crate-results">
      {error && <p className="crate-error" role="alert">{error}</p>}
      {view === "dig" && <p className="crate-status">{status}{current ? ` · ${position + 1}/${records.length}` : ""}</p>}
      {!displayed.length && <div className="crate-empty"><div className="crate-vinyl" aria-hidden="true">◎</div><p>{view === "favorites" ? "Aucun favori pour le moment." : "Le prochain disque t'attend."}</p></div>}
      {displayed.map(({ release: record, track, preview }) => <article className="crate-record" key={track?.id || record.id}>
        <div className="crate-sleeve">
          <span>{record.genres[0] || "UNKNOWN GROOVE"}</span>
          <div className="crate-disc" aria-hidden="true"><span>33⅓</span></div>
          <strong>{record.artist}</strong>
        </div>
        <div className="crate-record-info">
          <span className="crate-eyebrow">DISCOVERY · {record.year || "ANNÉE INCONNUE"}</span>
          <h2>{track?.title || (trackErrors[record.id] ? "Piste individuelle indisponible" : "Recherche d'un morceau…")}</h2>
          <p className="crate-artist">{track?.artist || record.artist}</p>
          <p className="crate-meta">Disque source : {record.title}</p>
          <p className="crate-meta">{[record.country, record.genres.join(" / "), record.styles.join(" / "), track?.durationSeconds ? `Durée Discogs : ${Math.floor(track.durationSeconds / 60)}:${String(track.durationSeconds % 60).padStart(2, "0")}` : "Durée audio à vérifier"].filter(Boolean).join(" · ")}</p>
          {trackErrors[record.id] && <p className="crate-error">{trackErrors[record.id]} Passe au disque suivant pour chercher un autre morceau.</p>}
          {!track && !trackErrors[record.id] && loadingIds[record.id] && <p className="crate-status">Recherche du morceau et de sa préécoute…</p>}
          <p className="crate-disclaimer">{preview
            ? "Vidéo liée sur Discogs et correspondant aux métadonnées du morceau : écoute via le lecteur YouTube officiel. La disponibilité réelle de la vidéo n'est pas garantie. Pas encore de flux audio vers la MPC."
            : "Aucune vidéo de ce morceau ne passe actuellement nos filtres de correspondance et de durée. On préfère ne rien jouer plutôt que lancer une compilation ou un mauvais titre."}</p>
          {preview && <div className="crate-preview">
            <button type="button" className="crate-listen" aria-expanded={openVideoId === track?.id}
              onClick={() => setOpenVideoId(previous => previous === track?.id ? null : (track?.id || null))}>
              {openVideoId === track?.id ? "⏹ Fermer l'aperçu" : "▶ Écouter le morceau"}
            </button>
            {openVideoId === track?.id && <div className="crate-player">
              <iframe title={`Aperçu YouTube : ${preview.title}`} src={preview.embedUrl}
                allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>
              <small>Lecteur vidéo officiel · ni téléchargement ni capture audio. Certaines vidéos peuvent refuser l'intégration.</small>
            </div>}
          </div>}
          {view === "dig" && <div className="crate-rejections" role="group" aria-label="Écarter cette découverte">
            <span>Pas la bonne pépite ?</span>
            {rejectionReasons.map(reason => <button type="button" key={reason}
              onClick={() => rejectCurrent(record, reason)}
              title={`Écarter ce disque : ${rejectionLabels[reason]}`}>
              {rejectionLabels[reason]}
            </button>)}
          </div>}
          <div className="crate-record-actions">
            {record.discogsUrl && <a href={record.discogsUrl} target="_blank" rel="noreferrer">Voir la fiche Discogs ↗</a>}
            <button type="button" disabled={!track} aria-pressed={Boolean(track && favorites[track.id])} onClick={() => { if (track) toggleFavorite(record, track, preview || null); }}>{track && favorites[track.id] ? "♥ Favori" : "♡ Garder ce morceau"}</button>
          </div>
        </div>
      </article>)}
      {view === "dig" && <div className="crate-transport">
        <button disabled={!records.length || position === 0 || busy} onClick={() => setPosition(p => p - 1)}>← Précédent</button>
        <button className="crate-primary" disabled={busy} onClick={next}>{busy ? "Exploration…" : "Suivant →"}</button>
      </div>}
    </section>
    <footer className="crate-footer">Sukotto Crate Digger V0.2 · Discogs + prévisualisation YouTube officielle (selon disponibilité) · MPC One Gen1 : intégration à venir · <a href="https://github.com/scottaajpn-netizen/digger/pull/14" target="_blank" rel="noreferrer">Suivre le développement ↗</a></footer>
  </main>;
}
