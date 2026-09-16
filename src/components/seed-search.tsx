"use client";
import { useEffect, useId, useRef, useState } from "react";
import { SearchController, moveSelection, type SearchState } from "@/lib/search/controller";
import type { Suggestion } from "@/lib/search/matching";

export function SeedSearch({ value, disabled, onChange, onSelect }: {
  value: string; disabled: boolean; onChange: (value: string) => void; onSelect: (track: Suggestion) => void;
}) {
  const id = useId();
  const controller = useRef<SearchController | null>(null);
  const composing = useRef(false);
  const typedValue = useRef(value);
  const [state, setState] = useState<SearchState>({ status: "idle", suggestions: [], warnings: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const search = new SearchController(setState, async (q, signal) => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(19000)]),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Recherche indisponible.");
      return data;
    });
    controller.current = search;
    return () => { search.cancel(); controller.current = null; };
  }, []);

  useEffect(() => {
    // A selected card or a started exploration invalidates the open search.
    if (disabled || value !== typedValue.current) {
      controller.current?.cancel();
      setOpen(false);
      setActive(-1);
      setState({ status: "idle", suggestions: [], warnings: [] });
    }
    typedValue.current = value;
  }, [value, disabled]);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  const visible = open && !disabled;
  const select = (track: Suggestion) => {
    controller.current?.cancel(); setOpen(false); setActive(-1); onSelect(track);
  };
  const start = (query: string) => {
    setOpen(true); setActive(-1); controller.current?.search(query);
  };

  return <div className="seed-autocomplete">
    <div className="input-wrap">
      <span aria-hidden="true">⌕</span>
      <input id="seed" role="combobox" aria-autocomplete="list" aria-expanded={visible}
        aria-controls={visible ? id : undefined} aria-describedby={`${id}-help`}
        aria-activedescendant={visible && active >= 0 && active < state.suggestions.length ? `${id}-${active}` : undefined}
        autoComplete="off" value={value} disabled={disabled} required maxLength={160}
        placeholder="Un titre, un artiste… même quelques mots"
        onFocus={() => start(value)}
        onBlur={() => { controller.current?.cancel(); setOpen(false); setActive(-1); }}
        onCompositionStart={() => { composing.current = true; controller.current?.cancel(); setOpen(false); }}
        onCompositionEnd={e => { composing.current = false; start(e.currentTarget.value); }}
        onChange={e => {
          typedValue.current = e.target.value;
          onChange(e.target.value);
          if (!composing.current) start(e.target.value);
        }}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing || composing.current) return;
          if (e.key === "Escape") {
            e.preventDefault(); controller.current?.cancel(); setOpen(false); setActive(-1);
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!visible) { start(value); return; }
            setActive(moveSelection(e.key, active, state.suggestions.length));
          }
          if (e.key === "Enter" && visible && state.suggestions.length) {
            e.preventDefault(); select(state.suggestions[Math.max(0, active)]);
          }
        }} />
    </div>
    <p id={`${id}-help`} className="search-help">Titre ou artiste, dans l’ordre que tu veux. Suggestions dès 3 caractères.</p>
    {visible && <div className="suggestion-panel">
      <ul id={id} role="listbox" aria-label="Suggestions de morceaux" aria-busy={state.status === "loading"}>
        {state.suggestions.map((track, i) => <li key={track.id} id={`${id}-${i}`} role="option"
          aria-selected={i === active} onMouseDown={e => e.preventDefault()}
          onClick={() => select(track)}>
          <strong>{track.title}</strong>
          <span>{track.artist}{track.album ? ` · ${track.album}` : ""}{track.year ? ` · ${track.year}` : ""}</span>
          <small>{track.sources.join(" + ")}</small>
        </li>)}
      </ul>
      <p role="status">{state.status === "loading" ? "Recherche…"
        : state.status === "idle" ? "Saisis au moins 3 caractères."
        : state.status === "error" ? state.error
        : state.suggestions.length ? `${state.suggestions.length} résultat${state.suggestions.length > 1 ? "s" : ""} · ↑ ↓ puis Entrée pour explorer`
        : "Aucun morceau trouvé. Essaie un titre ou un artiste plus précis."}
        {state.warnings.length ? ` ${state.warnings.join(" ")}` : ""}</p>
    </div>}
  </div>;
}
