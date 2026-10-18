import { normalized, trackIdentity, discoverySeedAnchor } from "./ranking";
import type { Candidate } from "./ranking";
export { discoverySeedAnchor } from "./ranking";

export type BridgeArtist = {
  anchor: string;
  name: string;
  match?: number | string;
};

/**
 * Give each VERIFIED anchor an opportunity among the fixed three Last.fm
 * second-circle bridge requests. Keeps the request budget unchanged, rotates
 * which branch goes first across exploration sessions, and never creates
 * nonexistent artist links.
 */
export function selectBalancedBridges<T extends BridgeArtist>(
  rows: readonly T[],
  session: number,
  limit = 3,
): T[] {
  if (limit <= 0 || !rows.length) return [];
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const anchor = normalized(row.anchor);
    const name = normalized(row.name);
    if (!anchor || !name) continue;
    const group = groups.get(anchor) || [];
    if (!group.some(other => normalized(other.name) === name))
      group.push(row);
    groups.set(anchor, group);
  }
  const anchors = [...groups.keys()];
  if (!anchors.length) return [];
  const offset = Math.abs(Math.trunc(session || 0));
  const rotated = [...anchors.slice(offset % anchors.length),
    ...anchors.slice(0, offset % anchors.length)];
  const result:T[] = [];
  const seen = new Set<string>();
  let depth = Math.floor(offset / anchors.length);
  for(let rounds=0;rounds<rows.length && result.length<limit;rounds++){
    for(const anchor of rotated){
      const group = groups.get(anchor)!;
      const choice = group[depth % group.length];
      const key = normalized(choice.name);
      if(seen.has(key))continue;
      seen.add(key);
      result.push(choice);
      if(result.length>=limit)break;
    }
    depth++;
  }
  return result;
}

export type HopNeighbour = {
  anchor:string;
  bridge:string;
  name:string;
  firstHopMatch:number;
  match:number;
};

/**
 * Round-robin the second-circle discoveries by first seed anchor.
 * Preserve the bridge identity; don't conflate two Last.fm paths to the
 * same artist, and don't select a name already present in the first circle.
 */
export function selectBalancedSecondHopArtists<T extends HopNeighbour>(
  candidates:readonly T[],
  excludedNames:readonly string[],
  limit=6,
):T[] {
  if(limit<=0) return [];
  const exclude=new Set(excludedNames.map(normalized));
  const groups=new Map<string,T[]>();
  for(const candidate of candidates){
    const key=normalized(candidate.name);
    const anchor=normalized(candidate.anchor);
    if(!key||!anchor||exclude.has(key))continue;
    const group=groups.get(anchor)||[];
    if(!group.some(row=>normalized(row.name)===key))group.push(candidate);
    groups.set(anchor,group);
  }
  const result:T[]=[];
  const seen=new Set<string>();
  const ordered=[...groups.values()];
  const maxLength=Math.max(0,...ordered.map(rows=>rows.length));
  for(let index=0;index<maxLength&&result.length<limit;index++){
    for(const group of ordered){
      const candidate=group[index];
      if(!candidate)continue;
      const key=normalized(candidate.name);
      if(seen.has(key))continue;
      seen.add(key);
      result.push(candidate);
      if(result.length>=limit)break;
    }
  }
  return result;
}

type AnchorCandidate=Pick<Candidate,"id"|"artist"|"title"|"origin"|"retrieval">;
export type SeedAnchorCoverage={
  anchor:string;
  verified:boolean;
  generated:number;
  eligible:number;
  selected:number;
};

/**
 * Compare actual candidate survival by APPROVED seed anchor. An unverified
 * artist mentioned in the displayed seed gets a zero row, not a speculative
 * Last.fm search or an invented association.
 */
export function analyzeSeedAnchorCoverage(
  expectedParticipants:readonly string[],
  approvedAnchors:readonly string[],
  generated:readonly AnchorCandidate[],
  eligible:readonly AnchorCandidate[],
  selected:readonly AnchorCandidate[],
):SeedAnchorCoverage[]{
  const approved = new Map(approvedAnchors.map(name=>[normalized(name),name]));
  const names=new Map<string,string>();
  for(const name of [...expectedParticipants,...approvedAnchors]){
    const key=normalized(name);
    if(key&&!names.has(key))names.set(key,name);
  }
  const identities=(tracks:readonly AnchorCandidate[],anchor:string)=>{
    const seen=new Set<string>();
    for(const track of tracks){
      if(normalized(discoverySeedAnchor(track)||"")===anchor)
        seen.add(trackIdentity(track));
    }
    return seen.size;
  };
  return [...names.entries()].map(([key,name])=>({
    anchor:name,
    verified:approved.has(key),
    generated:identities(generated,key),
    eligible:identities(eligible,key),
    selected:identities(selected,key),
  }));
}
