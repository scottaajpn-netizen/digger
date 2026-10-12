"use client";

import { useEffect, useRef, useState } from "react";

import { advanceInfiniteQueue, appendInfiniteQueue, startInfiniteQueue } from "@/lib/discovery/infinite-queue";
import type { DigResponse, Feedback, FeedbackMap, Recommendation, Track } from "@/lib/types";

type Props = {
  initial: DigResponse;
  feedback: FeedbackMap;
  onFeedback: (track: Recommendation, value: Feedback) => void;
  onSoulseek: (track: Recommendation) => void;
  onExplore: (track: Recommendation) => void;
};

const votes: { value: Feedback; label: string; symbol: string }[] = [
  { value: "love", label: "J’aime", symbol: "♥" },
  { value: "curious", label: "À écouter", symbol: "◉" },
  { value: "neutral", label: "Pas pour moi", symbol: "−" },
  { value: "known", label: "Déjà connu", symbol: "✓" },
];
const isMbid = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

function seedReference(track: Track) {
  return {
    id: track.id, title: track.title, artist: track.artist,
    scene: track.scene, label: track.label, tags: track.tags.slice(0, 8),
    year: track.year, artistId: track.artistId, releaseId: track.releaseId,
    album: track.album, country: track.country,
    externalIds: track.externalIds, credits: track.credits,
    source: track.externalIds?.musicbrainz ? "musicbrainz" :
      track.externalIds?.lastfm ? "lastfm" :
      track.externalIds?.discogs ? "discogs" : "mixed",
  };
}

export function InfiniteDig({ initial, feedback, onFeedback, onSoulseek, onExplore }: Props) {
  const [queue, setQueue] = useState(() => startInfiniteQueue(initial.tracks, initial.seed));
  const queueRef = useRef(queue);
  const [loading, setLoading] = useState(false);
  const fetching = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [exhausted, setExhausted] = useState(false);
  const exhaustedRef = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);
  const likedSeed = useRef<Track>(initial.seed);
  const feedbackRef = useRef(feedback);
  const voted = useRef<FeedbackMap>({});
  const sequence = useRef(0);
  const prefetchAt = useRef(-1);
  feedbackRef.current = feedback;

  function publish(next: typeof queue) {
    queueRef.current = next;
    setQueue(next);
  }

  async function refill() {
    if (fetching.current || exhaustedRef.current) return;
    fetching.current = true;
    setLoading(true);
    setError("");
    const active = new AbortController();
    controller.current = active;
    const source = likedSeed.current;
    const session = ++sequence.current;
    const seedId = source.externalIds?.musicbrainz && isMbid(source.externalIds.musicbrainz)
      ? source.externalIds.musicbrainz : isMbid(source.id) ? source.id : undefined;
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: source.title + " — " + source.artist,
          seedId,
          seedTrack: seedReference(source),
          direction: initial.direction,
          obscurity: initial.obscurity,
          feedback: Object.fromEntries(Object.entries({ ...feedbackRef.current, ...voted.current }).slice(-200)),
          session,
        }),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(55000)]),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data
          ? (data as { error?: unknown }).error : undefined;
        throw Error(typeof message === "string" ? message : "Le prochain dig est indisponible.");
      }
      if (!data || typeof data !== "object" || !("tracks" in data) || !Array.isArray(data.tracks)) {
        throw Error("La sélection reçue est invalide.");
      }
      if (active.signal.aborted) return;
      const next = appendInfiniteQueue(queueRef.current, data.tracks as Recommendation[], initial.seed);
      const added = (next.upcoming.length + Number(Boolean(next.current))) -
        (queueRef.current.upcoming.length + Number(Boolean(queueRef.current.current)));
      if (!added) {
        exhaustedRef.current = true;
        setExhausted(true);
      }
      if (waitingRef.current && next.upcoming.length) {
        publish(advanceInfiniteQueue(next));
        waitingRef.current = false;
        setWaiting(false);
      } else {
        publish(next);
      }
    } catch (cause) {
      if (!active.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Impossible de compléter la sélection.");
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        fetching.current = false;
        setLoading(false);
        if (exhaustedRef.current) {
          waitingRef.current = false;
          setWaiting(false);
        }
      }
    }
  }

  useEffect(() => () => controller.current?.abort(), []);

  // Prefetch at most once per position in the listening journey.
  // A tiny refill must not trigger an immediate chain of network requests.
  useEffect(() => {
    if (queue.upcoming.length <= 2 && !loading && !error && !exhausted &&
        prefetchAt.current !== queue.explored) {
      prefetchAt.current = queue.explored;
      void refill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.explored, queue.upcoming.length, loading, error, exhausted]);

  function next(value?: Feedback) {
    const track = queueRef.current.current;
    if (!track || waitingRef.current) return;
    if (value) {
      voted.current[track.id] = value;
      onFeedback(track, value);
      if (value === "love" || value === "curious") likedSeed.current = track;
    }
    const advanced = advanceInfiniteQueue(queueRef.current);
    if (advanced !== queueRef.current) {
      publish(advanced);
      return;
    }
    waitingRef.current = true;
    setWaiting(true);
    if (!fetching.current && !exhaustedRef.current) void refill();
    else if (exhaustedRef.current) {
      waitingRef.current = false;
      setWaiting(false);
    }
  }

  function retry() {
    exhaustedRef.current = false;
    prefetchAt.current = queueRef.current.explored;
    setExhausted(false);
    setError("");
    void refill();
  }

  const track = queue.current;
  return <section className="infinite-dig" aria-label="Dig infini">
    <div className="infinite-heading">
      <div><p className="eyebrow">UNE PÉPITE À LA FOIS</p><h3>Dig infini</h3></div>
      <span>{queue.explored} exploré{queue.explored > 1 ? "s" : ""} · {queue.upcoming.length} en réserve</span>
    </div>
    {track ? <div className="infinite-record">
      <div className="infinite-cover" style={{background: track.colors?.[0] || "#4b604e",color: track.colors?.[1] || "#141615"}}>
        <span>D / RECORDS · DIG INFINI</span>
        <strong>{track.title}</strong><small>{track.artist}</small>
      </div>
      <div className="infinite-details">
        <p className="infinite-caption">{initial.direction} · Obscurité {initial.obscurity}% · {track.year || "Date inconnue"}</p>
        <h4>{track.title}</h4><p className="infinite-artist">{track.artist}</p>
        <p>{track.reason}</p>
        {track.discoveryPath?.nodes?.length ? <p className="infinite-path">Chemin : {track.discoveryPath.nodes.map(node => node.name).join(" → ")}</p> : null}
        <div className="infinite-links">
          <a href={"https://www.youtube.com/results?search_query="+encodeURIComponent(track.artist+" "+track.title)} target="_blank" rel="noreferrer">Écouter sur YouTube ↗</a>
          <button onClick={() => onSoulseek(track)}>Chercher sur Soulseek ↓</button>
          <button onClick={() => onExplore(track)}>Explorer ce morceau ↳</button>
        </div>
        <p className="infinite-question">Qu’en penses-tu ?</p>
        <div className="infinite-votes">
          {votes.map(vote => <button key={vote.value} disabled={waiting} aria-label={vote.label+": "+track.title}
            onClick={() => next(vote.value)}><span aria-hidden="true">{vote.symbol}</span>{vote.label}</button>)}
        </div>
        <button className="infinite-skip" disabled={waiting} onClick={() => next()}>Passer sans noter →</button>
        <p role="status" className="infinite-status">{waiting
          ? "Sélection en cours : ce morceau reste visible."
          : loading ? "Préparation de la suite en arrière-plan…"
          : exhausted ? "Plus de nouvelle piste pour l’instant. Tu peux relancer la recherche."
          : "La suite est préparée à partir des sources musicales."}</p>
      </div>
    </div> : <p>Aucune recommandation disponible pour ce morceau de départ.</p>}
    {error ? <p role="alert" className="error">{error} La sélection actuelle reste disponible.</p> : null}
    {(error || exhausted) && <button className="infinite-retry" disabled={loading} onClick={retry}>Rechercher d’autres morceaux ↗</button>}
    <p className="infinite-disclaimer">Dig infini propose des morceaux successivement ; la lecture audio reste sur YouTube ou ton lecteur. Les avis alimentent la mémoire de Digger.</p>
  </section>;
}
