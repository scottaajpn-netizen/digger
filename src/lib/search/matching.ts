import type { Track } from "../types";
export type Suggestion = Track & { sources: string[]; matchScore: number };
export type SearchResult = { suggestions: Suggestion[]; warnings: string[] };
export const normalize = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function similarity(a: string, b: string): number {
  a = normalize(a).replace(/ /g, ""); b = normalize(b).replace(/ /g, "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 3 && b.startsWith(a)) return .94;
  const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j=0;j<=b.length;j++) d[0][j]=j;
  for (let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(a[i-1]!==b[j-1]));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]) d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  const whole=1-d[a.length][b.length]/Math.max(a.length,b.length);
  const prefix=a.length>=5&&b.length>a.length?(1-d[a.length][a.length]/a.length)*.94:0;
  return Math.max(whole,prefix);
}
export function typoQueries(query:string):string[] {
  const words=normalize(query).split(" ");
  const index=words.findIndex(w=>w.length>=4); if(index<0)return [];
  const word=words[index], variants:string[]=[];
  for(const offset of [word.length-2,Math.floor(word.length/2)-1]) {
    const letters=[...word];[letters[offset],letters[offset+1]]=[letters[offset+1],letters[offset]];
    const copy=[...words];copy[index]=letters.join("");variants.push(copy.join(" "));
  }
  return [...new Set(variants)].filter(q=>q!==normalize(query));
}
export function partitions(query: string): [string,string][] {
  const words=normalize(query).split(" ").slice(0,12), pairs:[string,string][]=[];
  for(let i=1;i<words.length;i++) {
    const a=words.slice(0,i).join(" "),b=words.slice(i).join(" ");
    pairs.push([a,b],[b,a]);
  }
  return pairs;
}
export function matchScore(query: string, track: Pick<Track,"title"|"artist">) {
  const scores=partitions(query).map(([title,artist])=>{
    const a=similarity(title,track.title),b=similarity(artist,track.artist);
    return Math.min(a,b)*.6+(a+b)*.2;
  });
  const last=normalize(query).split(" ").at(-1)||"";
  const completion=last.length>=3&&normalize(track.title).split(" ").some(word=>word.startsWith(last))?.025:0;
  // Accept omitted words and free token order, but require every supplied word
  // to match: one familiar word must not hide an unrelated artist/title.
  const words=normalize(query).split(" ").filter(Boolean);
  const candidateWords=normalize(`${track.title} ${track.artist}`).split(" ");
  const coverage=words.map(word=>Math.max(0,...candidateWords.map(target=>
    word.length<3 ? Number(word===target) : similarity(word,target))));
  const partial=words.length>=2 && coverage.every(score=>score>=.72)
    ? coverage.reduce((sum,score)=>sum+score,0)/words.length*.9 : 0;
  return Math.min(1,Math.max(similarity(query,track.title)*.93,similarity(query,track.artist)*.85,partial,...scores)+completion);
}
export function fuzzyQuery(query:string) {
  const term=(s:string)=>normalize(s).split(" ").map(t=>t.length>=4?`(${t}~1 OR ${t}*)`:t.length===3?`${t}*`:t).join(" AND ");
  const clauses=partitions(query).slice(0,16).map(([title,artist])=>`(recording:(${term(title)}) AND artist:(${term(artist)} OR ${normalize(artist).replace(/ /g,"")}))`);
  const words=normalize(query).split(" ").filter(Boolean).slice(0,12);
  if(!words.length)return "";
  const mixed=words.map(word=>`(recording:(${term(word)}) OR artist:(${term(word)}))`).join(" AND ");
  return [...clauses,mixed,`recording:(${term(query)})`,`artist:(${term(query)})`].join(" OR ");
}
export function mergeSuggestions(query:string, pool:Suggestion[]) {
  const groups=new Map<string,Suggestion>();
  for(const track of pool) {
    const score=matchScore(query,track); if(score<.66)continue;
    const key=normalize(track.artist).replace(/ /g,"")+"|"+normalize(track.title).replace(/ /g,"");
    const old=groups.get(key), main=old?.externalIds?.musicbrainz?old:track;
    groups.set(key,{...main,externalIds:{...old?.externalIds,...Object.fromEntries(Object.entries(track.externalIds||{}).filter(([,v])=>v))},sources:[...new Set([...(old?.sources||[]),...track.sources])],matchScore:Math.max(score,old?.matchScore||0)});
  }
  return [...groups.values()].sort((a,b)=>b.matchScore-a.matchScore||Number(!!b.externalIds?.musicbrainz)-Number(!!a.externalIds?.musicbrainz)).slice(0,8);
}
