import { catalog } from "../catalog";
import type { MusicProvider } from "../types";
export const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const mockProvider: MusicProvider = {
  id: "mock",
  async search(query) {
    const terms = normalize(query).split(" ").filter(Boolean);
    return catalog.filter(track => terms.every(term => normalize(`${track.title} ${track.artist}`).includes(term)));
  },
  async candidates() { return catalog; }
};
