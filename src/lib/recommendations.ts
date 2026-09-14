import { mockProvider } from "./providers/mock";
import { catalog } from "./catalog";
import type { DigRequest, DigResponse, MusicProvider } from "./types";

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
export async function recommend(input: DigRequest, provider: MusicProvider = mockProvider): Promise<DigResponse> {
  const matches = await provider.search(input.seed);
  const seed = matches[0] ?? catalog[0];
  const candidates = await provider.candidates(seed);
  const preferred = new Set(candidates.filter(t => ["love", "curious"].includes(input.feedback[t.id])).flatMap(t => t.tags));
  const tracks = candidates.filter(t => t.id !== seed.id && !["known", "neutral"].includes(input.feedback[t.id])).map(track => {
    const shared = track.tags.filter(t => seed.tags.includes(t));
    const affinity = shared.length * 13;
    const distance = Math.abs(track.obscurity - input.obscurity);
    const personal = track.tags.filter(t => preferred.has(t)).length * 3;
    const jitter = hash(`${track.id}:${input.session}:${input.seed}`) % 19;
    let score = affinity - distance * 1.15 + personal + jitter;
    let reason = shared.length ? `Un fil commun : ${shared.join(" et ")}. Une autre façon de prolonger l’univers de ${seed.artist}.` : `Une échappée vers ${track.scene.toLowerCase()} pour élargir ton terrain d’écoute.`;
    if (input.direction === "Même scène") { score += track.scene === seed.scene ? 65 : 0; reason = track.scene === seed.scene ? `Même scène de démonstration : ${seed.scene}. Un autre angle à explorer.` : `Une scène voisine à explorer : ${track.scene}.`; }
    if (input.direction === "Labels") { score += track.label === seed.label ? 75 : 0; reason = track.label === seed.label ? `Même label dans le catalogue démo : ${seed.label}.` : `Une passerelle vers le catalogue de ${track.label}.`; }
    if (input.direction === "Rabbit hole") { score += track.obscurity * .65 - affinity * .7; reason = `Une bifurcation vers ${track.scene.toLowerCase()}, avec un indice d’obscurité démo de ${track.obscurity}/100.`; }
    if (input.direction === "Surprends-moi") { score = jitter * 5 - distance * .6 + personal; reason = `Une rencontre inattendue : ${track.tags.slice(0, 2).join(" et ")}. Laisse une chance à ce détour.`; }
    return { ...track, reason, score };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 10).map(({ score: _, ...track }) => track);
  return { tracks, seed, fallback: matches.length === 0, source: "mock", direction: input.direction, obscurity: input.obscurity };
}
