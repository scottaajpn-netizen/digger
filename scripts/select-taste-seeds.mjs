// Offline selection of varied test seeds from the private YouTube taste import.
// Run: node scripts/select-taste-seeds.mjs
import { readFileSync } from "node:fs";
const file = process.env.DIGGER_TASTE_IMPORT_FILE || ".digger/youtube-music-taste.v1.json";
const data = JSON.parse(readFileSync(file, "utf8"));
const targets = [
  ["Electronic", "ELECTRONIC"],
  ["Funk / disco", "FUNK - Disco"],
  ["Jazz-funk", "JAZZ - Jazz Funk"],
  ["Neo-soul", "R&B - Neo Soul"],
  ["Soul", "SOUL"],
  ["Rap français", "RAP FR"],
  ["Hip-hop US", "HIP-HOP US"],
  ["Trap / drill", "HIP-HOP - Trap / Drill"],
  ["Boom bap", "HIP-HOP - Boom Bap"],
  ["Jazz rap", "HIP-HOP - Jazz Rap"],
  ["Instrumental beats", "BEATS - Instrumental"],
  ["Latin / Brazil", "LATIN / BRAZIL"],
  ["African / world", "AFRO / WORLD"],
  ["Afrobeats", "AFROBEATS"],
  ["Amapiano / SA house", "AMAPIANO / SOUTH AFRICAN HOUSE"],
  ["City pop / J-pop", "J-POP / CITY POP"],
  ["Reggae / dub", "REGGAE - Dub"],
  ["Indie / pop", "POP / INDIE"],
  ["Rock", "ROCK"],
  ["Library / OST", "OST - Library"],
];
function hash(s) { let h=2166136261; for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; }
const used = new Set();
console.log("# Digger — 20 seeds multi-univers depuis les likes YouTube");
console.log("Sélection stable parmi les AUTO, sans doublon d'identité, hors mixes. Les tags proviennent du classement importé, pas d'une expertise indépendante.\n");
console.log("| # | Univers (tag importé) | Morceau de départ | Vidéo |");
console.log("|---:|---|---|---|");
let count=0;
for(const [label,tag] of targets){
 const rows=data.tracks.filter(t=>t.status==="AUTO" && t.playlists?.includes(tag) && t.artist && t.title && t.videoId)
  .sort((a,b)=>hash(a.videoId)-hash(b.videoId));
 const t=rows.find(t=>!used.has((t.artist+"::"+t.title).toLowerCase()));
 if(!t){console.log(`| – | ${label} | Aucun AUTO éligible | – |`);continue;}
 used.add((t.artist+"::"+t.title).toLowerCase());count++;
 const safe = x=>String(x).replaceAll("|","/").replaceAll("\n"," ");
 console.log(`| ${count} | ${label} | ${safe(t.artist)} — ${safe(t.title)} | https://www.youtube.com/watch?v=${encodeURIComponent(t.videoId)} |`);
}
console.log(`\n${count} seeds sélectionnés. Pour chaque seed, évalue ensuite les recommandations produites par Digger (pas le like de départ) : goût / pertinence / nouveauté / diversité.`);
