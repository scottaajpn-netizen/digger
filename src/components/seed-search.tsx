"use client";
import {useEffect,useId,useRef,useState} from "react";
import {SearchController,moveSelection,type SearchState} from "@/lib/search/controller";
import type {Suggestion} from "@/lib/search/matching";
export function SeedSearch({value,disabled,onChange,onSelect}:{value:string;disabled:boolean;onChange:(value:string)=>void;onSelect:(track:Suggestion)=>void}) {
  const id=useId(),controller=useRef<SearchController|null>(null);
  const [state,setState]=useState<SearchState>({status:"idle",suggestions:[],warnings:[]});
  const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
  useEffect(()=>{const search=new SearchController(setState,async(q,signal)=>{
    const response=await fetch(`/api/search?q=${encodeURIComponent(q)}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(19000)])});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Recherche indisponible.");return data;
  });controller.current=search;return()=>{search.cancel();controller.current=null;};},[]);
  useEffect(()=>{if(active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:"nearest"});},[active,id]);
  const visible=open&&!disabled;
  const select=(track:Suggestion)=>{controller.current?.cancel();setOpen(false);setActive(-1);onSelect(track);};
  return <div className="seed-autocomplete"><div className="input-wrap"><span aria-hidden="true">⌕</span><input id="seed" role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible?id:undefined} aria-activedescendant={visible&&active>=0?`${id}-${active}`:undefined} autoComplete="off" value={value} disabled={disabled} required maxLength={160} placeholder="Un titre, un artiste… même sans tiret" onFocus={()=>{setOpen(true);setActive(-1);controller.current?.search(value);}} onBlur={()=>{controller.current?.cancel();setOpen(false);setActive(-1);}} onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1);controller.current?.search(e.target.value);}} onKeyDown={e=>{
    if(e.nativeEvent.isComposing)return;
    if(e.key==="Escape"){e.preventDefault();controller.current?.cancel();setOpen(false);setActive(-1);}
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(moveSelection(e.key,active,state.suggestions.length));}
    if(e.key==="Enter"&&visible&&state.suggestions.length){e.preventDefault();select(state.suggestions[Math.max(0,active)]);}
  }}/></div>{visible&&<div className="suggestion-panel"><ul id={id} role="listbox" aria-label="Suggestions de morceaux">{state.suggestions.map((track,i)=><li key={track.id} id={`${id}-${i}`} role="option" aria-selected={i===active} onMouseDown={e=>e.preventDefault()} onClick={()=>select(track)}><strong>{track.title}</strong><span>{track.artist}{track.album?` · ${track.album}`:""}{track.year?` · ${track.year}`:""}</span><small>{track.sources.join(" + ")}</small></li>)}</ul><p role="status">{state.status==="loading"?"Recherche…":state.status==="idle"?"Saisis au moins 3 caractères.":state.status==="error"?state.error:state.suggestions.length?`${state.suggestions.length} résultat${state.suggestions.length>1?"s":""} · ↑ ↓ puis Entrée pour explorer`:"Aucun morceau trouvé. Essaie d’autres mots."}{state.warnings.length?` ${state.warnings.join(" ")}`:""}</p></div>}</div>;
}
