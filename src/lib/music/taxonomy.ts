export type GenreNode = {
  genre?: string;
  subgenre?: string;
  traits?: string[];
};

const MAP: Record<string, GenreNode> = {
  "electronic": { genre: "Electronic" },
  "electronica": { genre: "Electronic", subgenre: "Electronica" },
  "ambient": { genre: "Electronic", subgenre: "Ambient", traits: ["atmospheric"] },
  "uk bass": { genre: "Electronic", subgenre: "UK Bass" },
  "dubstep": { genre: "Electronic", subgenre: "Dubstep" },
  "broken beat": { genre: "Electronic", subgenre: "Broken Beat", traits: ["syncopated"] },
  "uk funky": { genre: "Electronic", subgenre: "UK Funky" },
  "electro": { genre: "Electronic", subgenre: "Electro" },
  "trip hop": { genre: "Electronic", subgenre: "Trip-Hop" },
  "downtempo": { genre: "Electronic", subgenre: "Downtempo" },
  "reggae": { genre: "Reggae" },
  "dub": { genre: "Reggae", subgenre: "Dub", traits: ["dub"] },
  "afrobeat": { genre: "Afrobeat" },
  "afrobeats": { genre: "Afrobeats" },
  "highlife": { genre: "Highlife" },
  "gnawa": { genre: "Gnawa" },
  "raï": { genre: "Raï" },
  "psychedelic rock": { genre: "Rock", subgenre: "Psychedelic Rock" },
  "rock": { genre: "Rock" },
  "r&b": { genre: "R&B" },
  "rhythm and blues": { genre: "R&B" },
  "uk garage": { genre: "Electronic", subgenre: "UK Garage" },
  "ukg": { genre: "Electronic", subgenre: "UK Garage" },
  "2-step": { genre: "Electronic", subgenre: "2-Step", traits: ["syncopated"] },
  "2 step": { genre: "Electronic", subgenre: "2-Step", traits: ["syncopated"] },
  "2step": { genre: "Electronic", subgenre: "2-Step", traits: ["syncopated"] },
  "speed garage": { genre: "Electronic", subgenre: "Speed Garage" },
  "future garage": { genre: "Electronic", subgenre: "Future Garage", traits: ["atmospheric"] },
  "bassline": { genre: "Electronic", subgenre: "Bassline" },
  "house": { genre: "Electronic", subgenre: "House" },
  "deep house": { genre: "Electronic", subgenre: "Deep House" },
  "minimal house": { genre: "Electronic", subgenre: "Minimal House" },
  "microhouse": { genre: "Electronic", subgenre: "Microhouse" },
  "acid house": { genre: "Electronic", subgenre: "Acid House" },
  "techno": { genre: "Electronic", subgenre: "Techno" },
  "dub techno": { genre: "Electronic", subgenre: "Dub Techno", traits: ["dub", "hypnotic"] },
  "minimal techno": { genre: "Electronic", subgenre: "Minimal Techno" },
  "breakbeat": { genre: "Electronic", subgenre: "Breakbeat", traits: ["breaks"] },
  "breaks": { genre: "Electronic", subgenre: "Breakbeat", traits: ["breaks"] },
  "jungle": { genre: "Electronic", subgenre: "Jungle", traits: ["breaks"] },
  "drum and bass": { genre: "Electronic", subgenre: "Drum & Bass", traits: ["breaks"] },
  "drum & bass": { genre: "Electronic", subgenre: "Drum & Bass", traits: ["breaks"] },
  "hip hop": { genre: "Hip-Hop" },
  "hip-hop": { genre: "Hip-Hop" },
  "rap": { genre: "Hip-Hop" },
  "boom bap": { genre: "Hip-Hop", subgenre: "Boom Bap" },
  "boom-bap": { genre: "Hip-Hop", subgenre: "Boom Bap" },
  "jazz rap": { genre: "Hip-Hop", subgenre: "Jazz Rap", traits: ["jazzy"] },
  "abstract hip hop": { genre: "Hip-Hop", subgenre: "Abstract Hip-Hop" },
  "alternative hip hop": { genre: "Hip-Hop", subgenre: "Alternative Hip-Hop" },
  "cloud rap": { genre: "Hip-Hop", subgenre: "Cloud Rap", traits: ["atmospheric"] },
  "trap": { genre: "Hip-Hop", subgenre: "Trap" },
  "soul": { genre: "Soul" },
  "neo soul": { genre: "Soul", subgenre: "Neo Soul" },
  "neo-soul": { genre: "Soul", subgenre: "Neo Soul" },
  "funk": { genre: "Funk" },
  "boogie": { genre: "Funk", subgenre: "Boogie", traits: ["groovy"] },
  "disco": { genre: "Disco" },
  "italo disco": { genre: "Disco", subgenre: "Italo Disco" },
  "jazz": { genre: "Jazz" },
  "spiritual jazz": { genre: "Jazz", subgenre: "Spiritual Jazz" },
  "jazz funk": { genre: "Jazz", subgenre: "Jazz-Funk", traits: ["groovy"] },
  "jazz-funk": { genre: "Jazz", subgenre: "Jazz-Funk", traits: ["groovy"] },
  "jazzy": { traits: ["jazzy"] },
  "soulful": { traits: ["soulful"] },
  "groovy": { traits: ["groovy"] },
  "hypnotic": { traits: ["hypnotic"] },
  "atmospheric": { traits: ["atmospheric"] },
  "experimental": { traits: ["experimental"] },
  "lo-fi": { traits: ["lo-fi"] },
  "lofi": { traits: ["lo-fi"] },
  "instrumental": { traits: ["instrumental"] },
  "vocal": { traits: ["vocal"] },
};

export function cleanMusicTag(tag: string) {
  return tag.normalize("NFKC").trim().toLowerCase().replace(/[‐‑–—]/g, "-").replace(/_/g, " ").replace(/\s+/g, " ");
}

export function normalizeMusicTags(tags: string[]) {
  const genres = new Set<string>();
  const subgenres = new Set<string>();
  const traits = new Set<string>();
  const unknownTags = new Set<string>();

  for (const raw of tags) {
    const clean = cleanMusicTag(raw);
    if (!clean) continue;
    const alias = ({ "dnb": "drum and bass", "d&b": "drum and bass", "drum n bass": "drum and bass", "hiphop": "hip hop", "2-step garage": "2-step", "trip-hop": "trip hop", "jazz-hop": "jazz rap", "jazz hop": "jazz rap", "rai": "raï" } as Record<string, string>)[clean];
    const node = MAP[alias || clean] || MAP[clean.replace(/-/g, " ")];
    if (!node) {
      unknownTags.add(clean);
      continue;
    }
    if (node.genre) genres.add(node.genre);
    if (node.subgenre) subgenres.add(node.subgenre);
    for (const trait of node.traits ?? []) traits.add(trait);
  }

  return {
    genres: [...genres],
    subgenres: [...subgenres],
    traits: [...traits],
    unknownTags: [...unknownTags],
  };
}
