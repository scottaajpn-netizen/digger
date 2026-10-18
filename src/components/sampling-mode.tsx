"use client";

import { useEffect, useMemo, useState } from "react";

import type { SamplingFilters, SamplingVideo } from "@/lib/sampling/youtube";

type SamplingVote = "keep" | "pass";

type SamplingFeedback = {
  video: SamplingVideo;
  vote: SamplingVote;
  at: string;
  filters: SamplingFilters;
};

type SamplingProfile = {
  version: 1;
  historyIds: string[];
  saved: SamplingVideo[];
  feedback: SamplingFeedback[];
};

const STORAGE_KEY = "digger.sampling.v1";

const DEFAULT_FILTERS: SamplingFilters = {
  genre: "",
  keywords: "",
  minViews: 0,
  maxViews: 50000,
  duration: "any",
};

const genres = [
  "",
  "soul",
  "funk",
  "jazz",
  "jazz funk",
  "boogie",
  "disco",
  "house",
  "hip hop",
  "r&b",
  "gospel",
  "brazilian",
  "afrobeat",
  "reggae dub",
  "soundtrack",
  "library music",
  "psychedelic",
  "folk",
  "electronic",
] as const;

const emptyProfile = (): SamplingProfile => ({
  version: 1,
  historyIds: [],
  saved: [],
  feedback: [],
});

function formatViews(value: number) {
  return new Intl.NumberFormat("fr-FR", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function formatDuration(seconds?: number) {
  if (!seconds) return "durée inconnue";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function numericInput(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

export function SamplingMode() {
  const [filters, setFilters] = useState<SamplingFilters>(DEFAULT_FILTERS);
  const [draft, setDraft] = useState<SamplingFilters>(DEFAULT_FILTERS);
  const [profile, setProfile] = useState<SamplingProfile>(emptyProfile);
  const [pool, setPool] = useState<SamplingVideo[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [relaxed, setRelaxed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SamplingProfile;
        if (parsed?.version === 1 && Array.isArray(parsed.historyIds) && Array.isArray(parsed.saved) && Array.isArray(parsed.feedback)) {
          setProfile(parsed);
        }
      }
    } catch {
      // A corrupted local profile should never block the sampler.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Keep the current browser session usable even if storage is unavailable.
    }
  }, [profile, ready]);

  const current = pool[index];

  const excludeIds = useMemo(
    () => [...new Set([...profile.historyIds, ...pool.slice(0, index + 1).map(video => video.id)])].slice(-300),
    [profile.historyIds, pool, index],
  );

  async function loadPool(nextFilters = filters, reset = true) {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/sampling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: nextFilters,
          excludeIds: reset ? profile.historyIds.slice(-300) : excludeIds,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de charger la caisse YouTube.");

      const videos = (data.videos || []) as SamplingVideo[];
      if (!videos.length) {
        setPool([]);
        setIndex(0);
        setQuery(data.query || "");
        setRelaxed(Boolean(data.relaxed));
        setError("Aucun morceau ne passe ces filtres. Élargis un peu la recherche.");
        return;
      }

      setPool(videos);
      setIndex(0);
      setQuery(data.query || "");
      setRelaxed(Boolean(data.relaxed));
    } catch (caught) {
      setError(
        caught instanceof Error && caught.name === "TimeoutError"
          ? "YouTube met trop de temps à répondre. Réessaie."
          : caught instanceof Error
            ? caught.message
            : "Impossible de charger la caisse YouTube.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || pool.length || busy || error) return;
    void loadPool(DEFAULT_FILTERS);
    // Initial fetch only; later refreshes are explicit or triggered by next().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function next() {
    if (busy) return;
    if (current) {
      setProfile(previous => ({
        ...previous,
        historyIds: [...new Set([...previous.historyIds, current.id])].slice(-500),
      }));
    }

    if (index + 1 < pool.length) {
      setIndex(previous => previous + 1);
      return;
    }

    await loadPool(filters, false);
  }

  function vote(value: SamplingVote) {
    if (!current || busy) return;

    setProfile(previous => {
      const saved = value === "keep"
        ? [current, ...previous.saved.filter(video => video.id !== current.id)].slice(0, 200)
        : previous.saved;
      return {
        ...previous,
        saved,
        historyIds: [...new Set([...previous.historyIds, current.id])].slice(-500),
        feedback: [
          ...previous.feedback.filter(item => item.video.id !== current.id),
          { video: current, vote: value, at: new Date().toISOString(), filters },
        ].slice(-1000),
      };
    });

    void next();
  }

  function applyFilters() {
    const nextFilters: SamplingFilters = {
      ...draft,
      genre: draft.genre?.trim() || undefined,
      keywords: draft.keywords?.trim() || undefined,
      minViews: draft.minViews === undefined ? undefined : Math.max(0, draft.minViews),
      maxViews: draft.maxViews === undefined ? undefined : Math.max(0, draft.maxViews),
      yearMin: draft.yearMin || undefined,
      yearMax: draft.yearMax || undefined,
    };
    setFilters(nextFilters);
    void loadPool(nextFilters);
  }

  function anything() {
    const nextFilters: SamplingFilters = { duration: "any" };
    setDraft(nextFilters);
    setFilters(nextFilters);
    void loadPool(nextFilters);
  }

  function revisit(video: SamplingVideo) {
    setPool([video]);
    setIndex(0);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!current || busy || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, button, a, iframe")) return;

      if (event.key === "1") {
        event.preventDefault();
        vote("keep");
      } else if (event.key === "2") {
        event.preventDefault();
        vote("pass");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void next();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="sampling-shell">
      <header className="sampling-topbar">
        <a className="brand" href="/" aria-label="Digger accueil">
          <span className="brand-icon">◉</span>digger<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Navigation Sampling">
          <a href="/">Explorer</a>
          <a className="active-link" href="/sampling">Sampling</a>
          <a href="/evaluate">Évaluer</a>
        </nav>
        <span className="local-status"><i /> RANDOM CRATE</span>
      </header>

      <main className="sampling-main">
        <section className="sampling-heading">
          <div>
            <p className="eyebrow">YOUTUBE RANDOM CRATE · MVP</p>
            <h1><span>SAMPLE</span><br /><em>HUNTING</em></h1>
            <p>Un son. Un avis. Puis on replonge dans la caisse.</p>
          </div>
          <div className="sampling-stats">
            <span><b>{profile.saved.length}</b> à sampler</span>
            <span><b>{profile.feedback.length}</b> avis</span>
            <span><b>{profile.historyIds.length}</b> écoutés</span>
          </div>
        </section>

        <details className="sampling-filters">
          <summary>Filtres de digging <span>{filters.maxViews ? `≤ ${formatViews(filters.maxViews)} vues` : "sans limite de vues"}</span></summary>
          <div className="sampling-filter-grid">
            <label>
              <span>Genre / terrain</span>
              <select
                value={draft.genre || ""}
                onChange={event => setDraft(previous => ({ ...previous, genre: event.target.value }))}
              >
                {genres.map(value => <option key={value || "all"} value={value}>{value || "Tous les genres"}</option>)}
              </select>
            </label>
            <label>
              <span>Mots-clés</span>
              <input
                value={draft.keywords || ""}
                maxLength={120}
                placeholder="private press, female vocal, Rhodes…"
                onChange={event => setDraft(previous => ({ ...previous, keywords: event.target.value }))}
              />
            </label>
            <label>
              <span>Vues min.</span>
              <input
                type="number"
                min="0"
                value={numericInput(draft.minViews)}
                onChange={event => setDraft(previous => ({ ...previous, minViews: event.target.value ? Number(event.target.value) : undefined }))}
              />
            </label>
            <label>
              <span>Vues max.</span>
              <input
                type="number"
                min="0"
                value={numericInput(draft.maxViews)}
                onChange={event => setDraft(previous => ({ ...previous, maxViews: event.target.value ? Number(event.target.value) : undefined }))}
              />
            </label>
            <label>
              <span>Année min. (approx.)</span>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                value={numericInput(draft.yearMin)}
                onChange={event => setDraft(previous => ({ ...previous, yearMin: event.target.value ? Number(event.target.value) : undefined }))}
              />
            </label>
            <label>
              <span>Année max. (approx.)</span>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear()}
                value={numericInput(draft.yearMax)}
                onChange={event => setDraft(previous => ({ ...previous, yearMax: event.target.value ? Number(event.target.value) : undefined }))}
              />
            </label>
            <label>
              <span>Durée YouTube</span>
              <select
                value={draft.duration || "any"}
                onChange={event => setDraft(previous => ({ ...previous, duration: event.target.value as SamplingFilters["duration"] }))}
              >
                <option value="any">Toutes</option>
                <option value="short">Moins de 4 min</option>
                <option value="medium">4 à 20 min</option>
                <option value="long">Plus de 20 min</option>
              </select>
            </label>
          </div>
          <div className="sampling-filter-actions">
            <button onClick={applyFilters} disabled={busy}>Appliquer les filtres</button>
            <button className="secondary" onClick={anything} disabled={busy}>🎲 Donne-moi n’importe quoi</button>
          </div>
          <p className="sampling-filter-note">
            YouTube ne fournit pas l’année originale d’un disque : le filtre d’année sert ici de terme de recherche approximatif.
            Les vues, elles, viennent des statistiques réelles de la vidéo.
          </p>
        </details>

        {error && (
          <section className="sampling-error" role="alert">
            <strong>{error}</strong>
            {error.includes("YOUTUBE_API_KEY") || error.includes("clé YouTube") ? (
              <p>Ajoute <code>YOUTUBE_API_KEY=…</code> dans <code>.env.local</code>, puis redémarre Digger.</p>
            ) : null}
            <button onClick={() => void loadPool(filters)} disabled={busy}>Réessayer</button>
          </section>
        )}

        {busy && !current && (
          <section className="sampling-loading" role="status">
            <span>◎</span>
            <strong>Je fouille YouTube…</strong>
            <p>Création d’une nouvelle caisse selon tes filtres.</p>
          </section>
        )}

        {current && (
          <section className="sampling-player-stage" aria-busy={busy}>
            <div className="sampling-video-wrap">
              <iframe
                key={current.id}
                src={`https://www.youtube-nocookie.com/embed/${current.id}?autoplay=1&rel=0&playsinline=1`}
                title={`${current.title} — ${current.channel}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>

            <div className="sampling-track-info">
              <p className="eyebrow">NOW DIGGING</p>
              <h2>{current.title}</h2>
              <h3>{current.channel}</h3>
              <div className="sampling-meta">
                <span>{formatViews(current.views)} vues</span>
                <span>{formatDuration(current.durationSeconds)}</span>
                <span>upload {new Date(current.publishedAt).getFullYear()}</span>
              </div>
              <a href={`https://www.youtube.com/watch?v=${current.id}`} target="_blank" rel="noreferrer">Ouvrir sur YouTube ↗</a>
              <small>Recherche utilisée : {query || current.query}{relaxed ? " · recherche élargie" : ""}</small>
            </div>

            <div className="sampling-feedback">
              <button className="keep" onClick={() => vote("keep")} disabled={busy}>
                <kbd>1</kbd><span>❤️</span><strong>À sampler</strong>
              </button>
              <button className="pass" onClick={() => vote("pass")} disabled={busy}>
                <kbd>2</kbd><span>👎</span><strong>Pas pour moi</strong>
              </button>
              <button className="next" onClick={() => void next()} disabled={busy}>
                <kbd>→</kbd><span>🎲</span><strong>Suivant</strong>
              </button>
            </div>
          </section>
        )}

        <section className="sampling-library">
          <details open={profile.saved.length > 0}>
            <summary>À sampler <span>{profile.saved.length}</span></summary>
            {!profile.saved.length ? <p>Les morceaux ❤️ apparaîtront ici.</p> : (
              <div className="sampling-saved-grid">
                {profile.saved.map(video => (
                  <button key={video.id} onClick={() => revisit(video)}>
                    {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" /> : <span className="sampling-thumb-placeholder">◎</span>}
                    <strong>{video.title}</strong>
                    <small>{video.channel} · {formatViews(video.views)} vues</small>
                  </button>
                ))}
              </div>
            )}
          </details>
        </section>

        <footer className="sampling-footer">
          <span>Sampling garde sa propre mémoire locale pour ne pas contaminer le HOLDOUT.</span>
          <button onClick={() => {
            if (!window.confirm("Effacer l’historique et les morceaux gardés du mode Sampling ?")) return;
            localStorage.removeItem(STORAGE_KEY);
            setProfile(emptyProfile());
            setPool([]);
            setIndex(0);
            setError("");
            void loadPool(filters);
          }}>Réinitialiser Sampling</button>
        </footer>
      </main>
    </div>
  );
}
