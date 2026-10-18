import { normalize, type SearchResult } from "./matching";
export type SearchState=SearchResult & {status:"idle"|"loading"|"done"|"error";error?:string};
export class SearchController {
  private timer:ReturnType<typeof setTimeout>|undefined;
  private abort:AbortController|undefined;
  private generation=0;
  private cache=new Map<string,{value:SearchResult;expires:number}>();
  constructor(private publish:(state:SearchState)=>void,private request:(q:string,signal:AbortSignal,onProgress:(value:SearchResult)=>void)=>Promise<SearchResult>){}
  cancel(){++this.generation;clearTimeout(this.timer);this.abort?.abort();}
  search(q:string){
    this.cancel();const generation=this.generation,key=normalize(q);
    if(key.length<3){this.publish({status:"idle",suggestions:[],warnings:[]});return;}
    const hit=this.cache.get(key);
    if(hit&&hit.expires>Date.now()){this.publish({...hit.value,status:"done"});return;}
    this.publish({status:"loading",suggestions:[],warnings:[]});
    this.timer=setTimeout(async()=>{
      this.abort=new AbortController();
      let latest:SearchResult|undefined;
      const signal=this.abort.signal;
      try {
        const value=await this.request(q,signal,partial=>{
          // Old requests can still resolve after cancellation; never publish them.
          if(generation!==this.generation||signal.aborted)return;
          latest=partial;
          this.publish({...partial,status:"loading"});
        });
        if(generation!==this.generation||signal.aborted)return;
        if(!value.warnings.length){if(this.cache.size>=40)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{value,expires:Date.now()+120000});}
        this.publish({...value,status:"done"});
      }catch(e){
        if(generation!==this.generation||signal.aborted)return;
        const error=e instanceof Error?e.message:"Recherche indisponible.";
        // Keep usable partial results on a late network failure.
        if(latest?.suggestions.length)this.publish({...latest,status:"done",warnings:[...latest.warnings,error]});
        else this.publish({status:"error",suggestions:[],warnings:latest?.warnings||[],error});
      }
    },300);
  }
}
export const moveSelection=(key:string,index:number,count:number)=>count?(key==="ArrowDown"?(index+1)%count:index<=0?count-1:index-1):-1;
