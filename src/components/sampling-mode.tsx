"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MAX_SAMPLING_CHOICES, type SamplingFilters, type SamplingVideo } from "@/lib/sampling/youtube";
import { samplingPlaybackAction } from "@/lib/sampling/playback";
import { SamplingYouTubePlayer } from "@/components/sampling-youtube-player";

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
  genres: [],
  excludeGenres: [],
  countries: [],
  keywords: "",
  instrument: "",
  minDurationSeconds: 90,
  maxDurationSeconds: 480,
  excludeShorts: true,
  excludeAI: true,
  excludeCompilations: true,
  archiveFocus: true,
  minViews: 0,
  maxViews: 50000,
  duration: "any",
};

const genres = [
  "soul",
  "funk",
  "jazz",
  "jazz funk",
  "jazz fusion",
  "blues",
  "neo soul",
  "boogie",
  "disco",
  "house",
  "deep house",
  "garage",
  "breakbeat",
  "ambient",
  "lo-fi",
  "trap",
  "hip hop",
  "r&b",
  "gospel",
  "rock",
  "metal",
  "classical",
  "brazilian",
  "afrobeat",
  "reggae dub",
  "soundtrack",
  "library music",
  "psychedelic",
  "folk",
  "electronic",
  "synthwave",
  "world music",
] as const;


const countryGroups = [
  { label: "Europe", countries: [
    ["Albanie", "Albania"], ["Allemagne", "Germany"], ["Arménie", "Armenia"],
    ["Autriche", "Austria"], ["Belgique", "Belgium"], ["Bosnie-Herzégovine", "Bosnia"],
    ["Bulgarie", "Bulgaria"], ["Croatie", "Croatia"], ["Danemark", "Denmark"],
    ["Espagne", "Spain"], ["Finlande", "Finland"], ["France", "France"],
    ["Géorgie", "Georgia"], ["Grèce", "Greece"], ["Hongrie", "Hungary"],
    ["Irlande", "Ireland"], ["Islande", "Iceland"], ["Italie", "Italy"],
    ["Moldavie", "Moldova"], ["Norvège", "Norway"], ["Pays-Bas", "Netherlands"],
    ["Pologne", "Poland"], ["Portugal", "Portugal"], ["République tchèque", "Czechia"],
    ["Roumanie", "Romania"], ["Royaume-Uni", "United Kingdom"], ["Russie", "Russia"],
    ["Serbie", "Serbia"], ["Slovaquie", "Slovakia"], ["Suède", "Sweden"],
    ["Suisse", "Switzerland"], ["Turquie", "Turkey"], ["Ukraine", "Ukraine"],
  ] },
  { label: "Afrique", countries: [
    ["Afrique du Sud", "South Africa"], ["Algérie", "Algeria"], ["Angola", "Angola"],
    ["Bénin", "Benin"], ["Cameroun", "Cameroon"], ["Cap-Vert", "Cape Verde"],
    ["Congo", "Congo"], ["Côte d'Ivoire", "Ivory Coast"], ["Égypte", "Egypt"],
    ["Éthiopie", "Ethiopia"], ["Gabon", "Gabon"], ["Ghana", "Ghana"],
    ["Guinée", "Guinea"], ["Kenya", "Kenya"], ["Madagascar", "Madagascar"],
    ["Mali", "Mali"], ["Maroc", "Morocco"], ["Maurice", "Mauritius"],
    ["Mozambique", "Mozambique"], ["Nigeria", "Nigeria"], ["Ouganda", "Uganda"],
    ["République démocratique du Congo", "DR Congo"], ["Sénégal", "Senegal"],
    ["Soudan", "Sudan"], ["Tanzanie", "Tanzania"], ["Togo", "Togo"],
    ["Tunisie", "Tunisia"], ["Zambie", "Zambia"], ["Zimbabwe", "Zimbabwe"],
  ] },
  { label: "Amériques / Caraïbes", countries: [
    ["Argentine", "Argentina"], ["Barbade", "Barbados"], ["Bolivie", "Bolivia"],
    ["Brésil", "Brazil"], ["Canada", "Canada"], ["Chili", "Chile"],
    ["Colombie", "Colombia"], ["Cuba", "Cuba"], ["Équateur", "Ecuador"],
    ["États-Unis", "USA"], ["Guatemala", "Guatemala"], ["Haïti", "Haiti"],
    ["Jamaïque", "Jamaica"], ["Mexique", "Mexico"], ["Panama", "Panama"],
    ["Paraguay", "Paraguay"], ["Pérou", "Peru"], ["Porto Rico", "Puerto Rico"],
    ["République dominicaine", "Dominican Republic"],
    ["Trinité-et-Tobago", "Trinidad and Tobago"], ["Uruguay", "Uruguay"],
    ["Venezuela", "Venezuela"],
  ] },
  { label: "Asie / Moyen-Orient", countries: [
    ["Afghanistan", "Afghanistan"], ["Arabie saoudite", "Saudi Arabia"],
    ["Bangladesh", "Bangladesh"], ["Cambodge", "Cambodia"], ["Chine", "China"],
    ["Corée du Sud", "South Korea"], ["Hong Kong", "Hong Kong"],
    ["Inde", "India"], ["Indonésie", "Indonesia"], ["Irak", "Iraq"],
    ["Iran", "Iran"], ["Israël", "Israel"], ["Japon", "Japan"],
    ["Kazakhstan", "Kazakhstan"], ["Laos", "Laos"], ["Liban", "Lebanon"],
    ["Malaisie", "Malaysia"], ["Mongolie", "Mongolia"], ["Myanmar", "Myanmar"],
    ["Népal", "Nepal"], ["Ouzbékistan", "Uzbekistan"], ["Pakistan", "Pakistan"],
    ["Palestine", "Palestine"], ["Philippines", "Philippines"],
    ["Sri Lanka", "Sri Lanka"], ["Syrie", "Syria"], ["Taïwan", "Taiwan"],
    ["Thaïlande", "Thailand"], ["Vietnam", "Vietnam"], ["Yémen", "Yemen"],
  ] },
  { label: "Océanie", countries: [
    ["Australie", "Australia"], ["Fidji", "Fiji"],
    ["Nouvelle-Zélande", "New Zealand"], ["Papouasie-Nouvelle-Guinée", "Papua New Guinea"],
    ["Samoa", "Samoa"], ["Tonga", "Tonga"],
  ] },
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
  const [countrySearch, setCountrySearch] = useState("");
  const [customCountry, setCustomCountry] = useState("");
  const [profile, setProfile] = useState<SamplingProfile>(emptyProfile);
  const [pool, setPool] = useState<SamplingVideo[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [relaxed, setRelaxed] = useState(false);
  const [playerIssue, setPlayerIssue] = useState("");
  const autoSkippedVideo = useRef<string | null>(null);

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
  const selectedCountries = draft.countries || [];
  const selectedGenres = draft.genres || [];
  const excludedGenres = draft.excludeGenres || [];

  function toggleCountry(value: string) {
    setDraft(previous => {
      const selected = previous.countries || [];
      const next = selected.includes(value)
        ? selected.filter(item => item !== value)
        : selected.length < MAX_SAMPLING_CHOICES ? [...selected, value] : selected;
      return { ...previous, country: undefined, countries: next };
    });
  }

  function addCustomCountry() {
    const value = customCountry.trim().slice(0, 60);
    if (!value) return;
    setDraft(previous => {
      const selected = previous.countries || [];
      if (selected.some(item => item.toLowerCase() === value.toLowerCase()) || selected.length >= MAX_SAMPLING_CHOICES) return previous;
      return { ...previous, country: undefined, countries: [...selected, value] };
    });
    setCustomCountry("");
  }

  function toggleGenre(value: string, mode: "include" | "exclude") {
    setDraft(previous => {
      const included = previous.genres || [];
      const excluded = previous.excludeGenres || [];
      if (mode === "include") {
        const already = included.includes(value);
        if (!already && included.length >= MAX_SAMPLING_CHOICES) return previous;
        return {
          ...previous,
          genre: undefined,
          genres: already ? included.filter(item => item !== value) : [...included, value],
          excludeGenres: excluded.filter(item => item !== value),
        };
      }
      const already = excluded.includes(value);
      if (!already && excluded.length >= MAX_SAMPLING_CHOICES) return previous;
      return {
        ...previous,
        genre: undefined,
        genres: included.filter(item => item !== value),
        excludeGenres: already ? excluded.filter(item => item !== value) : [...excluded, value],
      };
    });
  }

  useEffect(() => {
    autoSkippedVideo.current = null;
    setPlayerIssue("");
  }, [current?.id]);

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

  function handlePlayerError(code: number) {
    if (!current || busy) return;
    const action = samplingPlaybackAction(code);
    if (action === "configuration") {
      setPlayerIssue("Le lecteur YouTube est bloqué par un problème d'identification du site (code 153). Essaie le lien YouTube ou vérifie les paramètres d'intégration.");
      return;
    }
    if (action === "unknown") {
      setPlayerIssue(`Impossible de confirmer la lecture (erreur YouTube ${code}). Tu peux ouvrir le morceau sur YouTube ou le passer.`);
      return;
    }
    if (autoSkippedVideo.current === current.id) return;
    autoSkippedVideo.current = current.id;
    // Do not record a musical dislike: the video simply cannot play here.
    void next();
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
      genre: undefined,
      genres: selectedGenres,
      excludeGenres: excludedGenres,
      countries: selectedCountries,
      keywords: draft.keywords?.trim() || undefined,
      country: undefined,
      instrument: draft.instrument?.trim() || undefined,
      minViews: draft.minViews === undefined ? undefined : Math.max(0, draft.minViews),
      maxViews: draft.maxViews === undefined ? undefined : Math.max(0, draft.maxViews),
      yearMin: draft.yearMin || undefined,
      yearMax: draft.yearMax || undefined,
    };
    setFilters(nextFilters);
    void loadPool(nextFilters);
  }

  function anything() {
    const nextFilters: SamplingFilters = { ...DEFAULT_FILTERS };
    setDraft(nextFilters);
    setCountrySearch("");
    setCustomCountry("");
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
              <span>Pays / scène (recherche indicative)</span>
              <select
                value={countrySelection}
                onChange={event => {
                  const choice = event.target.value;
                  setCountrySelection(choice);
                  setDraft(previous => ({ ...previous, country: choice === "__other__" ? customCountry : choice }));
                }}
              >
                <option value="">Tous les pays</option>
                {countryGroups.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.countries.map(([label, value]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </optgroup>
                ))}
                <option value="__other__">Autre pays / territoire…</option>
              </select>
              {countrySelection === "__other__" && (
                <input
                  aria-label="Autre pays ou territoire"
                  value={customCountry}
                  maxLength={60}
                  placeholder="Précise le pays ou territoire"
                  onChange={event => {
                    setCustomCountry(event.target.value);
                    setDraft(previous => ({ ...previous, country: event.target.value }));
                  }}
                />
              )}
            </label>
            <label>
              <span>Instrument (recherche indicative)</span>
              <input
                value={draft.instrument || ""}
                maxLength={60}
                placeholder="Rhodes, flûte, basse, batterie…"
                onChange={event => setDraft(previous => ({ ...previous, instrument: event.target.value }))}
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
              <span>Durée minimum (minutes)</span>
              <input
                type="number"
                min="0"
                max="120"
                step="0.5"
                value={draft.minDurationSeconds === undefined ? "" : draft.minDurationSeconds / 60}
                onChange={event => setDraft(previous => ({ ...previous, minDurationSeconds: event.target.value ? Math.round(Number(event.target.value) * 60) : undefined }))}
              />
            </label>
            <label>
              <span>Durée maximum (minutes)</span>
              <input
                type="number"
                min="0"
                max="120"
                step="0.5"
                value={draft.maxDurationSeconds === undefined ? "" : draft.maxDurationSeconds / 60}
                onChange={event => setDraft(previous => ({ ...previous, maxDurationSeconds: event.target.value ? Math.round(Number(event.target.value) * 60) : undefined }))}
              />
            </label>
            <label className="sampling-filter-toggle">
              <input
                type="checkbox"
                checked={draft.archiveFocus !== false}
                onChange={event => setDraft(previous => ({ ...previous, archiveFocus: event.target.checked }))}
              />
              <span>Mode archives / vinyles (priorité aux enregistrements anciens)</span>
            </label>
            <label className="sampling-filter-toggle">
              <input
                type="checkbox"
                checked={draft.excludeShorts !== false}
                onChange={event => setDraft(previous => ({ ...previous, excludeShorts: event.target.checked }))}
              />
              <span>Écarter les Shorts identifiables</span>
            </label>
            <label className="sampling-filter-toggle">
              <input
                type="checkbox"
                checked={draft.excludeAI !== false}
                onChange={event => setDraft(previous => ({ ...previous, excludeAI: event.target.checked }))}
              />
              <span>Écarter les contenus IA suspects</span>
            </label>
            <label className="sampling-filter-toggle">
              <input
                type="checkbox"
                checked={draft.excludeCompilations !== false}
                onChange={event => setDraft(previous => ({ ...previous, excludeCompilations: event.target.checked }))}
              />
              <span>Écarter les compilations et DJ sets</span>
            </label>
          </div>
          <div className="sampling-filter-actions">
            <button onClick={applyFilters} disabled={busy}>Appliquer les filtres</button>
            <button className="secondary" onClick={anything} disabled={busy}>🎲 Donne-moi n’importe quoi</button>
          </div>
          <p className="sampling-filter-note">
            Mode archives : recherche prioritaire de disques et enregistrements datés, plutôt que de nouveautés promotionnelles.
            Pays, instrument et année ne sont que des indices de recherche ; YouTube ne certifie pas l'origine des disques.
            Les filtres éditoriaux/IA sont heuristiques et peuvent écarter de vrais morceaux.
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
              <SamplingYouTubePlayer
                key={current.id}
                id={current.id}
                title={`${current.title} — ${current.channel}`}
                onPlaybackError={handlePlayerError}
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
              <button className="sampling-unavailable" type="button" onClick={() => void next()} disabled={busy}>
                Vidéo inaccessible ? Passer sans avis négatif
              </button>
              {playerIssue && <p className="sampling-player-issue" role="status">{playerIssue}</p>}
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
