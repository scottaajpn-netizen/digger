"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { HOLDOUT_SEEDS, type HoldoutSeed } from "@/lib/evaluation/holdout";
import { normalize, similarity } from "@/lib/search/matching";
import type { DigResponse, Recommendation, SeedReference, Track } from "@/lib/types";

type Vote =
  | "love"
  | "ok"
  | "relevant_not_for_me"
  | "off_topic"
  | "known"
  | "too_popular"
  | "unavailable";

type SeedRunStatus = "ready" | "done" | "resolution-failed" | "no-results" | "error";

type ResolutionCandidate = {
  id: string;
  artist: string;
  title: string;
  matchScore?: number;
};

type SeedRun = {
  seedId: string;
  status: SeedRunStatus;
  resolvedSeed?: Track;
  tracks: Recommendation[];
  notes?: string[];
  resolutionCandidates?: ResolutionCandidate[];
  error?: string;
  startedAt: string;
  completedAt?: string;
};

type Rating = {
  seedId: string;
  seedIndex: number;
  recommendationIndex: number;
  vote: Vote;
  ratedAt: string;
  track: Recommendation;
  technical: {
    score?: number;
    scoreBreakdown?: Recommendation["scoreBreakdown"];
    evidence?: Recommendation["evidence"];
    discoveryPath?: Recommendation["discoveryPath"];
    lastfmListeners?: number;
    lastfmArtistListeners?: number;
    obscurity: number;
    obscurityKnown?: boolean;
    popularity?: number;
  };
};

type EvaluationSession = {
  version: 1;
  seedIndex: number;
  trackIndex: number;
  runs: Record<string, SeedRun>;
  ratings: Rating[];
  completed: boolean;
  startedAt: string;
};

type SearchSuggestion = Track & { matchScore?: number };

const STORAGE_KEY = "digger.holdout.v1";

const VOTES: Array<{ value: Vote; key: string; icon: string; label: string }> = [
  { value: "love", key: "1", icon: "❤️", label: "J’aime" },
  { value: "ok", key: "2", icon: "😐", label: "OK / moyen" },
  { value: "relevant_not_for_me", key: "3", icon: "🎯", label: "Pertinent, pas ma came" },
  { value: "off_topic", key: "4", icon: "❌", label: "Hors sujet" },
  { value: "known", key: "5", icon: "✓", label: "Déjà connu" },
  { value: "too_popular", key: "6", icon: "⚠", label: "Trop populaire" },
  { value: "unavailable", key: "7", icon: "?", label: "Introuvable" },
];

function freshSession(): EvaluationSession {
  return {
    version: 1,
    seedIndex: 0,
    trackIndex: 0,
    runs: {},
    ratings: [],
    completed: false,
    startedAt: new Date().toISOString(),
  };
}

function seedSource(track: Track): SeedReference["source"] {
  if (track.externalIds?.musicbrainz) return "musicbrainz";
  if (track.externalIds?.lastfm) return "lastfm";
  if (track.externalIds?.discogs) return "discogs";
  return "mixed";
}

function toSeedReference(track: Track): SeedReference {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    scene: track.scene,
    label: track.label,
    tags: track.tags,
    year: track.year,
    artistId: track.artistId,
    releaseId: track.releaseId,
    country: track.country,
    album: track.album,
    externalIds: track.externalIds,
    credits: track.credits,
    source: seedSource(track),
  };
}

function pickCredibleSeed(seed: HoldoutSeed, suggestions: SearchSuggestion[]) {
  const exact = suggestions.find(
    track =>
      normalize(track.title) === normalize(seed.title) &&
      normalize(track.artist) === normalize(seed.artist),
  );
  if (exact) return exact;

  return suggestions.find(track => {
    const titleScore = similarity(seed.title, track.title);
    const artistScore = similarity(seed.artist, track.artist);
    const searchScore = track.matchScore ?? 0;
    return titleScore >= 0.9 && artistScore >= 0.82 && searchScore >= 0.82;
  });
}

function sourceLabel(track: Recommendation) {
  return (
    track.discoveryPath?.source ??
    (track.externalIds?.discogs
      ? "discogs"
      : track.externalIds?.lastfm
        ? "lastfm"
        : track.externalIds?.musicbrainz
          ? "musicbrainz"
          : "unknown")
  );
}

function average(values: Array<number | undefined>) {
  const known = values.filter((value): value is number => Number.isFinite(value));
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

export function EvaluationMode() {
  const [session, setSession] = useState<EvaluationSession>(freshSession);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const loadingSeed = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as EvaluationSession;
        if (parsed?.version === 1 && Array.isArray(parsed.ratings) && parsed.runs) {
          setSession(parsed);
        }
      }
    } catch {
      setNotice("La session sauvegardée n’a pas pu être relue. Une nouvelle session est utilisée.");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      setNotice("La sauvegarde locale est indisponible pour cette session.");
    }
  }, [ready, session]);

  const currentSeed = HOLDOUT_SEEDS[session.seedIndex];
  const currentRun = currentSeed ? session.runs[currentSeed.id] : undefined;
  const currentTrack =
    currentRun?.status === "ready" ? currentRun.tracks[session.trackIndex] : undefined;

  async function loadSeed(index: number, force = false) {
    const seed = HOLDOUT_SEEDS[index];
    if (!seed || busy) return;
    if (!force && session.runs[seed.id]) return;
    if (loadingSeed.current === seed.id) return;

    loadingSeed.current = seed.id;
    setBusy(true);
    setNotice("");

    const startedAt = new Date().toISOString();
    try {
      const searchResponse = await fetch(
        `/api/search?q=${encodeURIComponent(seed.query)}`,
        { signal: AbortSignal.timeout(20000) },
      );
      const searchData = await searchResponse.json();
      if (!searchResponse.ok) {
        throw new Error(searchData.error || "Recherche du seed impossible.");
      }

      const suggestions = (searchData.suggestions || []) as SearchSuggestion[];
      const selected = pickCredibleSeed(seed, suggestions);

      if (!selected) {
        setSession(previous => ({
          ...previous,
          runs: {
            ...previous.runs,
            [seed.id]: {
              seedId: seed.id,
              status: "resolution-failed",
              tracks: [],
              resolutionCandidates: suggestions.slice(0, 5).map(track => ({
                id: track.id,
                artist: track.artist,
                title: track.title,
                matchScore: track.matchScore,
              })),
              startedAt,
            },
          },
        }));
        return;
      }

      const seedId = selected.externalIds?.musicbrainz &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected.externalIds.musicbrainz)
        ? selected.externalIds.musicbrainz
        : undefined;

      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: seed.query,
          seedId,
          seedTrack: toSeedReference(selected),
          direction: "Surprends-moi",
          obscurity: 100,
          feedback: {},
          session: index + 1,
        }),
        signal: AbortSignal.timeout(55000),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Exploration impossible.");
      }

      const dig = data as DigResponse;
      const tracks = Array.isArray(dig.tracks) ? dig.tracks : [];
      setSession(previous => ({
        ...previous,
        trackIndex: 0,
        runs: {
          ...previous.runs,
          [seed.id]: {
            seedId: seed.id,
            status: tracks.length ? "ready" : "no-results",
            resolvedSeed: dig.seed || selected,
            tracks,
            notes: dig.notes,
            startedAt,
          },
        },
      }));
    } catch (error) {
      const message =
        error instanceof Error && error.name === "TimeoutError"
          ? "Le chargement a dépassé le délai prévu."
          : error instanceof Error
            ? error.message
            : "Erreur inattendue.";
      setSession(previous => ({
        ...previous,
        runs: {
          ...previous.runs,
          [seed.id]: {
            seedId: seed.id,
            status: "error",
            tracks: [],
            error: message,
            startedAt,
          },
        },
      }));
    } finally {
      loadingSeed.current = null;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ready || session.completed || !currentSeed || currentRun || busy) return;
    void loadSeed(session.seedIndex);
    // currentRun is the guard: each seed is fetched once unless the user explicitly retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session.seedIndex, session.completed, currentSeed?.id, currentRun?.status, busy]);

  function finishSeed() {
    if (!currentSeed) return;
    const nextIndex = session.seedIndex + 1;
    setSession(previous => ({
      ...previous,
      seedIndex: nextIndex,
      trackIndex: 0,
      completed: nextIndex >= HOLDOUT_SEEDS.length,
      runs: {
        ...previous.runs,
        [currentSeed.id]: {
          ...(previous.runs[currentSeed.id] || {
            seedId: currentSeed.id,
            tracks: [],
            startedAt: new Date().toISOString(),
          }),
          status: previous.runs[currentSeed.id]?.status === "ready" ? "done" : previous.runs[currentSeed.id]?.status || "done",
          completedAt: new Date().toISOString(),
        } as SeedRun,
      },
    }));
  }

  function rate(vote: Vote) {
    if (!currentSeed || !currentRun || !currentTrack) return;
    const rating: Rating = {
      seedId: currentSeed.id,
      seedIndex: session.seedIndex,
      recommendationIndex: session.trackIndex,
      vote,
      ratedAt: new Date().toISOString(),
      track: currentTrack,
      technical: {
        score: currentTrack.score,
        scoreBreakdown: currentTrack.scoreBreakdown,
        evidence: currentTrack.evidence,
        discoveryPath: currentTrack.discoveryPath,
        lastfmListeners: currentTrack.lastfmListeners,
        lastfmArtistListeners: currentTrack.lastfmArtistListeners,
        obscurity: currentTrack.obscurity,
        obscurityKnown: currentTrack.obscurityKnown,
        popularity: currentTrack.popularity,
      },
    };

    const hasNextTrack = session.trackIndex + 1 < currentRun.tracks.length;
    const nextSeedIndex = hasNextTrack ? session.seedIndex : session.seedIndex + 1;

    setSession(previous => ({
      ...previous,
      ratings: [
        ...previous.ratings.filter(
          item =>
            !(
              item.seedId === currentSeed.id &&
              item.recommendationIndex === session.trackIndex
            ),
        ),
        rating,
      ],
      seedIndex: nextSeedIndex,
      trackIndex: hasNextTrack ? session.trackIndex + 1 : 0,
      completed: !hasNextTrack && nextSeedIndex >= HOLDOUT_SEEDS.length,
      runs: {
        ...previous.runs,
        [currentSeed.id]: hasNextTrack
          ? previous.runs[currentSeed.id]
          : {
              ...previous.runs[currentSeed.id],
              status: "done",
              completedAt: new Date().toISOString(),
            },
      },
    }));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!currentTrack || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a")) return;
      const action = VOTES.find(item => item.key === event.key);
      if (!action) return;
      event.preventDefault();
      rate(action.value);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const report = useMemo(() => {
    const counts = Object.fromEntries(VOTES.map(item => [item.value, 0])) as Record<Vote, number>;
    session.ratings.forEach(rating => { counts[rating.vote] += 1; });

    const bySource = new Map<string, Rating[]>();
    session.ratings.forEach(rating => {
      const key = sourceLabel(rating.track);
      bySource.set(key, [...(bySource.get(key) || []), rating]);
    });

    return {
      counts,
      averageScores: Object.fromEntries(
        VOTES.map(item => [
          item.value,
          average(session.ratings.filter(rating => rating.vote === item.value).map(rating => rating.technical.score)),
        ]),
      ) as Record<Vote, number | null>,
      bySource: [...bySource.entries()]
        .map(([source, ratings]) => ({
          source,
          count: ratings.length,
          loved: ratings.filter(rating => rating.vote === "love").length,
          relevantNotForMe: ratings.filter(rating => rating.vote === "relevant_not_for_me").length,
          offTopic: ratings.filter(rating => rating.vote === "off_topic").length,
          averageScore: average(ratings.map(rating => rating.technical.score)),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [session.ratings]);

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      mode: { direction: "Surprends-moi", obscurity: 100 },
      seeds: HOLDOUT_SEEDS,
      session,
      summary: report,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `digger-holdout-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    if (!window.confirm("Recommencer le HOLDOUT depuis le début ? Les votes locaux seront effacés.")) return;
    localStorage.removeItem(STORAGE_KEY);
    setSession(freshSession());
    setNotice("Nouvelle session HOLDOUT démarrée.");
  }

  const completedSeeds = Object.values(session.runs).filter(run =>
    ["done", "resolution-failed", "no-results"].includes(run.status),
  ).length;

  return (
    <div className="evaluation-shell">
      <header className="evaluation-topbar">
        <a href="/" className="brand"><span className="brand-icon">◉</span>digger<span className="brand-dot">.</span></a>
        <div>
          <strong>HOLDOUT / MODE ÉVALUATION</strong>
          <span>Surprends-moi · obscurité 100 · ranking inchangé</span>
        </div>
        <a href="/">← Explorer</a>
      </header>

      <main className="evaluation-main">
        <section className="evaluation-progress">
          <div>
            <span>SEEDS</span>
            <strong>{Math.min(completedSeeds, HOLDOUT_SEEDS.length)} / {HOLDOUT_SEEDS.length}</strong>
          </div>
          <div>
            <span>AVIS</span>
            <strong>{session.ratings.length}</strong>
          </div>
          <div className="evaluation-progress-bar" aria-label="Progression du holdout">
            <i style={{ width: `${(Math.min(session.seedIndex, HOLDOUT_SEEDS.length) / HOLDOUT_SEEDS.length) * 100}%` }} />
          </div>
        </section>

        {notice && <p className="notice" role="status">{notice}</p>}

        {session.completed ? (
          <section className="evaluation-report">
            <p className="eyebrow">SESSION TERMINÉE</p>
            <h1>Rapport HOLDOUT</h1>
            <p>Les votes n’ont pas alimenté la mémoire de recommandation pendant le test.</p>

            <div className="evaluation-report-counts">
              {VOTES.map(item => (
                <div key={item.value}>
                  <span>{item.icon} {item.label}</span>
                  <strong>{report.counts[item.value]}</strong>
                  <small>
                    score moyen : {report.averageScores[item.value] === null ? "—" : report.averageScores[item.value]!.toFixed(1)}
                  </small>
                </div>
              ))}
            </div>

            <h2>Par source / chemin</h2>
            <div className="evaluation-table-wrap">
              <table>
                <thead><tr><th>Source</th><th>Votes</th><th>J’aime</th><th>Pertinent / pas ma came</th><th>Hors sujet</th><th>Score moyen</th></tr></thead>
                <tbody>
                  {report.bySource.map(row => (
                    <tr key={row.source}>
                      <td>{row.source}</td><td>{row.count}</td><td>{row.loved}</td>
                      <td>{row.relevantNotForMe}</td><td>{row.offTopic}</td>
                      <td>{row.averageScore === null ? "—" : row.averageScore.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2>Par seed</h2>
            <div className="evaluation-seed-report">
              {HOLDOUT_SEEDS.map(seed => {
                const run = session.runs[seed.id];
                const ratings = session.ratings.filter(rating => rating.seedId === seed.id);
                return (
                  <div key={seed.id}>
                    <strong>{seed.artist} — {seed.title}</strong>
                    <span>{run?.status || "non testé"} · {ratings.length} avis</span>
                  </div>
                );
              })}
            </div>

            <div className="evaluation-actions">
              <button onClick={exportJson}>Exporter le JSON</button>
              <button className="secondary" onClick={reset}>Recommencer</button>
            </div>
          </section>
        ) : (
          <section className="evaluation-stage">
            <div className="evaluation-seed-head">
              <div>
                <span>SEED {String(session.seedIndex + 1).padStart(2, "0")} / {HOLDOUT_SEEDS.length}</span>
                <h1>{currentSeed?.title}</h1>
                <p>{currentSeed?.artist}</p>
              </div>
              <span className="evaluation-lock">SCORES MASQUÉS AVANT VOTE</span>
            </div>

            {busy && (
              <div className="evaluation-loading" role="status">
                <span>◎</span>
                <strong>On creuse ce seed…</strong>
                <p>Résolution du morceau puis génération des recommandations.</p>
              </div>
            )}

            {!busy && currentRun?.status === "resolution-failed" && (
              <div className="evaluation-failure">
                <strong>Seed non résolu de façon suffisamment fiable.</strong>
                <p>Digger refuse de substituer silencieusement un autre morceau.</p>
                {currentRun.resolutionCandidates?.length ? (
                  <details>
                    <summary>Suggestions trouvées</summary>
                    {currentRun.resolutionCandidates.map(item => (
                      <p key={item.id}>{item.artist} — {item.title}{item.matchScore !== undefined ? ` · ${Math.round(item.matchScore * 100)}%` : ""}</p>
                    ))}
                  </details>
                ) : null}
                <button onClick={finishSeed}>Enregistrer l’échec et continuer →</button>
              </div>
            )}

            {!busy && currentRun?.status === "no-results" && (
              <div className="evaluation-failure">
                <strong>0 recommandation pour ce seed.</strong>
                <p>Le seed a été résolu, mais le pipeline n’a conservé aucune piste à obscurité 100.</p>
                {currentRun.notes?.length ? <details><summary>Détails du dig</summary>{currentRun.notes.map(note => <p key={note}>{note}</p>)}</details> : null}
                <button onClick={finishSeed}>Enregistrer et continuer →</button>
              </div>
            )}

            {!busy && currentRun?.status === "error" && (
              <div className="evaluation-failure">
                <strong>Le test de ce seed a échoué.</strong>
                <p>{currentRun.error}</p>
                <div className="evaluation-actions">
                  <button onClick={() => {
                    setSession(previous => {
                      const runs = { ...previous.runs };
                      delete runs[currentSeed.id];
                      return { ...previous, runs };
                    });
                  }}>Réessayer</button>
                  <button className="secondary" onClick={finishSeed}>Passer ce seed</button>
                </div>
              </div>
            )}

            {!busy && currentTrack && currentRun && (
              <>
                <article className="evaluation-card">
                  <div className="evaluation-card-index">
                    RECO {String(session.trackIndex + 1).padStart(2, "0")} / {String(currentRun.tracks.length).padStart(2, "0")}
                  </div>
                  <div className="evaluation-record" aria-hidden="true">
                    <span>{String(session.trackIndex + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="evaluation-card-copy">
                    <p>À ÉCOUTER</p>
                    <h2>{currentTrack.title}</h2>
                    <h3>{currentTrack.artist}</h3>
                    <div className="evaluation-listen-links">
                      <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(currentTrack.artist + " " + currentTrack.title)}`} target="_blank" rel="noreferrer">YouTube ↗</a>
                      {currentTrack.externalIds?.lastfm ? <a href={currentTrack.externalIds.lastfm} target="_blank" rel="noreferrer">Last.fm ↗</a> : null}
                      {currentTrack.externalIds?.discogs ? <a href={currentTrack.externalIds.discogs} target="_blank" rel="noreferrer">Discogs ↗</a> : null}
                    </div>
                    <small>Pas de score, chemin ou diagnostic avant ton choix.</small>
                  </div>
                </article>

                <div className="evaluation-votes" aria-label="Évaluer cette recommandation">
                  {VOTES.map(item => (
                    <button key={item.value} onClick={() => rate(item.value)}>
                      <kbd>{item.key}</kbd><span>{item.icon}</span><strong>{item.label}</strong>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="evaluation-session-actions">
              <button onClick={exportJson}>Exporter l’état actuel</button>
              <button onClick={reset}>Réinitialiser le HOLDOUT</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
