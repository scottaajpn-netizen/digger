import { fromRecording, mbidPattern } from "../providers/live";
import { musicJson, lastFmJson, discogsJson } from "../providers/http";
import { parseDiscogsRelease } from "../providers/discogs";
import { fuzzyQuery, mergeSuggestions, normalize, typoQueries, type SearchResult, type Suggestion } from "./matching";
type Recording=Parameters<typeof fromRecording>[0];
type SearchTrack={name?:string;artist?:string;mbid?:string;url?:string};
const basic=(title:string,artist:string,id:string):Suggestion=>({id,title,artist,tags:[],scene:"",label:"",year:0,obscurity:50,colors:["#74968c","#25383c"],sources:[],matchScore:0});
export const providers={
  async mb(q:string,signal:AbortSignal):Promise<Suggestion[]> {
    const result=await musicJson<{recordings?:Recording[]}>("mb","recording/",{query:fuzzyQuery(q),limit:"60"},signal);
    return (result.recordings||[]).flatMap(r=>{const t=fromRecording(r);return t?[{...t,sources:["MusicBrainz"],matchScore:0}]:[];});
  },
  async lastfm(q:string,signal:AbortSignal):Promise<Suggestion[]> {
    if(!process.env.LASTFM_API_KEY)return [];
    const words=normalize(q).split(" "), n=Math.ceil(words.length/2);
    const terms=[q,words.slice(0,n).join(" "),words.slice(-n).join(" "),...typoQueries(q)];
    const pool:Suggestion[]=[];
    for(const [index,term] of [...new Set(terms)].slice(0,5).entries()) {
      if(index>=3 && (mergeSuggestions(q,pool)[0]?.matchScore||0)>.85)break;
      const data=await lastFmJson<{results?:{trackmatches?:{track?:SearchTrack[]}}}>("track.search",{track:term,limit:index>=3?"100":"30"},signal);
      for(const t of data?.results?.trackmatches?.track||[]) {
        if(!t.name||!t.artist)continue;
        const mbid=t.mbid&&mbidPattern.test(t.mbid)?t.mbid:undefined;
        const url=t.url&&/^https?:\/\/(www\.)?last\.fm\//.test(t.url)?t.url:undefined;
        pool.push({...basic(t.name,t.artist,mbid||`lastfm:${encodeURIComponent(t.artist)}:${encodeURIComponent(t.name)}`),externalIds:{musicbrainz:mbid,lastfm:url},sources:["Last.fm"]});
      }
      if((mergeSuggestions(q,pool)[0]?.matchScore||0)>.94)break;
    }
    return pool;
  },
  async discogs(q:string,signal:AbortSignal):Promise<Suggestion[]> {
    if(!process.env.DISCOGS_TOKEN)return [];
    const result=await discogsJson<{results?:{id:number}[]}>("database/search",{q,type:"release",per_page:"2"},signal);
    const pool:Suggestion[]=[];
    for(const hit of result?.results?.slice(0,2)||[]) {
      if(!Number.isSafeInteger(hit.id)||hit.id<1)continue;
      const raw=await discogsJson<Parameters<typeof parseDiscogsRelease>[0]>(`releases/${hit.id}`,{},signal);
      const release=raw?parseDiscogsRelease(raw):null;
      for(const [index,t] of (release?.tracks||[]).entries()) {
        const artist=t.artists.map(a=>a.name.replace(/\s*\(\d+\)$/,"")).join(" & ");
        pool.push({...basic(t.title,artist,`discogs:${hit.id}:${index}`),album:release?.title,year:release?.year||0,externalIds:{discogs:release?.sourceUrl},sources:["Discogs"]});
      }
    }
    return pool;
  }
};
const cache=new Map<string,{value:SearchResult;expires:number}>();
export async function suggest(q:string,signal:AbortSignal,deps=providers):Promise<SearchResult> {
  signal.throwIfAborted(); if(normalize(q).length<3)return {suggestions:[],warnings:[]};
  const key=normalize(q)+`|${!!process.env.LASTFM_API_KEY}|${!!process.env.DISCOGS_TOKEN}`;
  const hit=deps===providers?cache.get(key):undefined;
  if(hit&&hit.expires>Date.now())return hit.value;
  const pool:Suggestion[]=[],warnings:string[]=[];
  for(const [name,provider] of [["MusicBrainz",deps.mb],["Last.fm",deps.lastfm],["Discogs",deps.discogs]] as const) {
    signal.throwIfAborted();
    try {pool.push(...await provider(q,AbortSignal.any([signal,AbortSignal.timeout(name==="MusicBrainz"?3500:6000)])));}
    catch {signal.throwIfAborted();warnings.push(`${name} est momentanément indisponible.`);}
    const best=mergeSuggestions(q,pool);
    if((best[0]?.matchScore||0)>.94||best.filter(t=>t.matchScore>.85).length>=5)break;
  }
  const value={suggestions:mergeSuggestions(q,pool),warnings};
  if(deps===providers&&!warnings.length) {
    if(cache.size>=150)cache.delete(cache.keys().next().value!);
    cache.set(key,{value,expires:Date.now()+(value.suggestions.length?300000:15000)});
  }
  return value;
}
