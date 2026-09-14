"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { directions, feedbackValues, type Direction, type DigResponse, type Feedback, type FeedbackMap, type Recommendation, type Track } from "@/lib/types";

const reactions: { value: Feedback; icon: string; label: string }[] = [{ value: "love", icon: "❤️", label: "J’aime" }, { value: "curious", icon: "👀", label: "À écouter" }, { value: "neutral", icon: "😐", label: "Pas pour moi" }, { value: "known", icon: "✓", label: "Déjà connu" }];
const directionIcons = ["≈", "◎", "▤", "↳", "✳"];
const storageKey = "digger.profile.v2";

function TrackCard({ track, index, feedback, onFeedback, onExplore }: { track: Recommendation; index: number; feedback?: Feedback; onFeedback: (id: string, value: Feedback) => void; onExplore: (seed: string, id: string) => void }) {
  return <article className="track-card">
    <div className={`cover cover-${index % 4}`} style={{ "--cover": track.colors[0], "--ink": track.colors[1] } as CSSProperties} aria-hidden="true"><div className="cover-top"><span>D / RECORDS</span><span>{String(index + 1).padStart(2, "0")}</span></div><div className="cover-art"><i /><i /><i /></div><div className="cover-name">{track.artist}</div><span className="cover-caption">EXPLORATIONS SONORES</span></div>
    <div className="card-body"><div className="track-meta"><span>{track.scene}</span><span>{track.analysis?.similarity !== undefined ? `Proximité musicale : ${track.analysis.similarity}%` : track.popularity !== undefined ? `Popularité LB : ${Math.round(track.popularity)}%` : "Popularité inconnue"}</span></div><h3>{track.title}</h3><p className="artist">{track.artist}</p><div className="tags">{[...(track.analysis?.subgenres ?? []), ...(track.analysis?.genres ?? []), ...(track.analysis?.traits ?? []), ...track.tags].filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}</div><p className="reason">{track.reason}</p>{track.externalIds?.musicbrainz && <a className="source-link" href={`https://musicbrainz.org/recording/${track.externalIds.musicbrainz}`} target="_blank" rel="noreferrer">Fiche MusicBrainz ↗</a>}<div className="track-links"><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(track.artist + " " + track.title)}`} target="_blank" rel="noreferrer">Chercher sur YouTube ↗</a><button title="Explorer à partir de ce morceau" aria-label={`Explorer depuis ${track.title}`} onClick={() => onExplore(`${track.title} — ${track.artist}`, track.id)}>↳</button></div><div className="feedback" aria-label={`Ton avis sur ${track.title}`}>{reactions.map(r => <button key={r.value} title={r.label} aria-label={`${r.label} : ${track.title}`} aria-pressed={feedback === r.value} onClick={() => onFeedback(track.id, r.value)}>{r.icon}</button>)}</div></div>
  </article>;
}

export function Digger({ initial }: { initial: DigResponse | null }) {
  const [seed, setSeed] = useState("Ttabla — Taxi Kebab");
  const [direction, setDirection] = useState<Direction>("Même vibe");
  const [obscurity, setObscurity] = useState(65);
  const [result, setResult] = useState(initial);
  const [choices, setChoices] = useState<Track[]>([]);
  const [selectedSeed, setSelectedSeed] = useState<{ text: string; id: string } | null>(null);
  const [feedback, setFeedback] = useState<FeedbackMap>({});
  const [saved, setSaved] = useState<Record<string, Recommendation>>({});
  const [tab, setTab] = useState<"explore" | "collection">("explore");
  const [filter, setFilter] = useState<"all" | "love" | "curious">("all");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version !== 2 || !data.feedback || typeof data.feedback !== "object" || !data.tracks || typeof data.tracks !== "object") throw new Error("Invalid profile");
        const entries = Object.entries(data.feedback).filter(([, v]) => feedbackValues.includes(v as Feedback)).slice(0, 200);
        setFeedback(Object.fromEntries(entries) as FeedbackMap);
        const tracks = Object.entries(data.tracks).filter(([, v]) => { const t = v as Recommendation; return t && typeof t.id === "string" && typeof t.title === "string" && typeof t.artist === "string" && typeof t.scene === "string" && typeof t.reason === "string" && typeof t.obscurity === "number" && Array.isArray(t.tags) && t.tags.every(x => typeof x === "string") && Array.isArray(t.colors) && t.colors.length === 2 && t.colors.every(x => typeof x === "string"); });
        setSaved(Object.fromEntries(tracks) as Record<string, Recommendation>);
      }
    } catch { setNotice("Le profil local n’a pas pu être lu. Tu peux continuer cette session."); }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 2, feedback, tracks: saved })); }
    catch { setNotice("Sauvegarde indisponible : tes avis restent actifs pour cette session uniquement."); }
  }, [feedback, saved, ready]);

  function react(id: string, value: Feedback) {
    setFeedback(previous => { const next = { ...previous }; if (next[id] === value) delete next[id]; else next[id] = value; return next; });
    const track = result?.tracks.find(t => t.id === id) ?? saved[id];
    if (track) setSaved(previous => ({ ...previous, [id]: track }));
  }

  async function explore(nextSeed = seed, seedId = selectedSeed?.text === nextSeed ? selectedSeed.id : undefined) {
    if (!nextSeed.trim() || busy) return;
    setBusy(true); setError(""); setChoices([]); setTab("explore");
    try {
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: nextSeed, seedId, direction, obscurity, feedback: Object.fromEntries(Object.entries(feedback).slice(-200)), session: session + 1 }), signal: AbortSignal.timeout(55000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Impossible de lancer l’exploration.");
      if (data.choices) { setChoices(data.choices); setResult(null); }
      else { setResult(data); setSession(previous => previous + 1); }
    } catch (e) { setError(e instanceof Error && e.name === "TimeoutError" ? "L’exploration prend trop de temps. Réessaie." : e instanceof Error ? e.message : "Une erreur est survenue. Réessaie."); }
    finally { setBusy(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void explore(); }
  const collection = Object.values(saved).filter(t => ["love", "curious"].includes(feedback[t.id]));
  const visible = tab === "explore" ? result?.tracks ?? [] : collection.filter(t => filter === "all" || feedback[t.id] === filter);
  const rated = Object.keys(feedback).length;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Digger accueil"><span className="brand-icon">◉</span>digger<span className="brand-dot">.</span></a><nav aria-label="Navigation principale"><button className={tab === "explore" ? "active" : ""} onClick={() => setTab("explore")}>Explorer</button><button className={tab === "collection" ? "active" : ""} onClick={() => setTab("collection")}>Ma collection <span>{collection.length}</span></button></nav><span className="local-status"><i /> Écoute ta curiosité</span></header>
    <main><section className="hero"><div><p className="eyebrow"><span /> LE BON MORCEAU N’EST QUE LE DÉBUT</p><h1>Suis le son.<br /><em>Creuse plus loin.</em></h1><p className="hero-copy">Pars d’un morceau que tu aimes. Trouve ceux<br className="desktop-break" /> que tu ne savais pas encore chercher.</p></div><div className="record-illustration" aria-hidden="true"><div className="record-sleeve"><span>DIGGING<br />IS A<br />LOVE<br />LANGUAGE.</span><small>VOL. 001 — SANS FRONTIÈRES</small></div><div className="vinyl"><span>dig<br />deeper<small>33⅓ RPM</small></span></div><div className="record-sticker">Moins d’algorithme.<br />Plus d’aventure. ↗</div></div></section>
    <section className="controls" aria-label="Paramètres d’exploration"><form onSubmit={submit}><div className="search-line"><div className="seed-field"><label htmlFor="seed">01 <span>TON POINT DE DÉPART</span></label><div className="input-wrap"><span aria-hidden="true">⌕</span><input id="seed" value={seed} onChange={e => { setSeed(e.target.value); setSelectedSeed(null); setChoices([]); }} required maxLength={160} placeholder="Titre — artiste" list="seed-suggestions" /><datalist id="seed-suggestions"><option value="Ttabla — Taxi Kebab" /><option value="Kerala — Bonobo" /><option value="Space Song — Beach House" /><option value="Aksak — Altın Gün" /></datalist></div></div><button className="dig-button" type="submit" disabled={busy || !seed.trim()}>{busy ? "On creuse…" : "Lancer l’exploration"}<span>{busy ? "◌" : "↗"}</span></button></div><div className="settings"><fieldset className="direction"><legend>02 <span>CHOISIS UNE DIRECTION</span></legend><div className="direction-buttons">{directions.map((d, i) => <button type="button" key={d} aria-pressed={direction === d} onClick={() => setDirection(d)}><span>{directionIcons[i]}</span>{d}</button>)}</div></fieldset><div className="range-field"><label htmlFor="obscurity">03 <span>TA SOIF DE DÉCOUVERTE</span><output>{obscurity}%</output></label><input id="obscurity" type="range" min="0" max="100" value={obscurity} onChange={e => setObscurity(Number(e.target.value))} style={{ "--progress": `${obscurity}%` } as CSSProperties} /><div className="range-captions"><span>Familier</span><span>Obscur ✧</span></div></div></div></form></section>
    <div className="demo-note"><span>DONNÉES RÉELLES</span><span>MusicBrainz + ListenBrainz · Recherche en ligne · Visuels illustratifs</span></div><details className="selection-help"><summary>Comment fonctionne la sélection ?</summary><p>Les pistes viennent des habitudes d’écoute ListenBrainz et des artistes, genres, sorties et labels renseignés dans MusicBrainz. Le curseur élargit la radio et filtre la popularité quand elle est disponible. La popularité LB reflète cette communauté, pas la notoriété mondiale. Les liens YouTube ouvrent une recherche ; les visuels sont illustratifs.</p></details>
    {choices.length > 0 && <section className="seed-choices" aria-label="Choisir le morceau"><h2>Quel morceau souhaites-tu explorer ?</h2><p>Choisis la bonne version dans MusicBrainz.</p>{choices.map(track => <button key={track.id} disabled={busy} onClick={() => { const text = `${track.title} — ${track.artist}`; setSeed(text); setSelectedSeed({ text, id: track.id }); void explore(text, track.id); }}><strong>{track.title}</strong><span>{track.artist} · {track.album || "Édition non renseignée"}{track.year ? ` · ${track.year}` : ""}</span><b>Explorer ↗</b></button>)}</section>}
    {notice && <p role="status" className="notice">{notice}</p>}{error && <p role="alert" className="error">{error} <button onClick={() => void explore()}>Réessayer</button></p>}
    <section className="results" aria-busy={busy}><div className="results-heading"><div><p className="eyebrow">{tab === "explore" ? "TA PROCHAINE OBSESSION EST PEUT-ÊTRE ICI" : "LES MORCEAUX QUE TU GARDES"}</p><h2>{tab === "explore" ? "Dans le même sillon" : "Ma collection"}<span>{visible.length.toString().padStart(2, "0")}</span></h2></div><p>{tab === "explore" ? result ? `${result.direction} · Découverte ${result.obscurity}%` : "Choisis ton point de départ" : `${collection.length} morceau${collection.length > 1 ? "x" : ""} à retrouver`}</p></div>
    {tab === "explore" && result && <><p className="result-context" role="status">À partir de <strong>{result.seed.title} — {result.seed.artist}</strong>{" · Tes avis influencent les prochaines sélections."}</p>{result.seed.analysis && <p className="result-context"><strong>Analyse :</strong> {[...result.seed.analysis.subgenres, ...result.seed.analysis.genres, ...result.seed.analysis.traits].filter((tag, index, all) => all.indexOf(tag) === index).slice(0, 6).join(" · ") || "pas assez de métadonnées pour une analyse fine"}</p>}</>}
    {tab === "collection" && <div className="collection-filters">{([['all', 'Tout'], ['love', '❤️ J’aime'], ['curious', '👀 À écouter']] as const).map(([v, label]) => <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>)}</div>}
    {tab === "explore" && result?.notes?.map(note => <p className="result-context" key={note}>{note}</p>)}
    {busy && <p className="loading-status" role="status">Recherche dans MusicBrainz et ListenBrainz… Cela peut prendre quelques secondes.</p>}
    <div className="track-grid">{visible.map((track, i) => <TrackCard key={track.id} track={track} index={i} feedback={feedback[track.id]} onFeedback={react} onExplore={(value, id) => { setSeed(value); setSelectedSeed({ text: value, id }); void explore(value, id); }} />)}</div>
    {!visible.length && !busy && !choices.length && <div className="empty"><span>◎</span><h3>{tab === "collection" ? "Ton prochain coup de cœur t’attend." : result ? "Pas encore de piste pour cette exploration." : "Un morceau. Des chemins à découvrir."}</h3><p>{tab === "collection" ? "Un ❤️ ou un 👀 sur une carte, et tu la retrouveras ici." : result ? "Essaie une autre direction, un autre morceau ou retire des exclusions avec le bouton en bas de page." : "Entre un titre et son artiste, puis lance l’exploration pour chercher dans MusicBrainz."}</p>{tab === "collection" ? <button onClick={() => setTab("explore")}>Retour à l’exploration ↗</button> : null}</div>}
    </section><footer><span className="brand">digger.</span><p>La curiosité n’a pas de fin de piste.</p><span>{rated} avis · Conservés dans ce navigateur</span>{rated > 0 && <div className="reset-actions">{resetPending ? <><button onClick={() => { setFeedback({}); setSaved({}); setResetPending(false); setNotice("Tes avis ont été réinitialisés."); }}>Confirmer la remise à zéro</button><button onClick={() => setResetPending(false)}>Annuler</button></> : <button onClick={() => setResetPending(true)}>Réinitialiser mes avis</button>}</div>}</footer></main>
  </div>;
}
