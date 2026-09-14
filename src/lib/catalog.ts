import type { Track } from "./types";

// Demo fixtures: scene, label, year and obscurity are editorial mock metadata, not verified discography.
const rows: [string, string, string, string, string[], number][] = [
  ["Ttabla", "Taxi Kebab", "Maghreb électronique", "Disques Bongo Joe", ["transe", "électronique", "psyché"], 64],
  ["Bania", "Acid Arab", "Maghreb électronique", "Crammed Discs", ["transe", "électronique", "club"], 28],
  ["Sidi H'Bibi", "Fadoul", "Funk du Maghreb", "Habibi Funk", ["funk", "psyché", "groove"], 66],
  ["Aksak", "Altın Gün", "Psyché anatolienne", "Glitterbeat", ["psyché", "groove", "folk"], 25],
  ["Dounia", "Bab L' Bluz", "Maghreb électronique", "Real World", ["transe", "psyché", "folk"], 49],
  ["Bismillah", "A-WA", "Voix du Levant", "Crammed Discs", ["voix", "électronique", "club"], 35],
  ["Darb El Hawa", "Praed", "Levant expérimental", "Disques Bongo Joe", ["transe", "expérimental", "électronique"], 89],
  ["Alech", "Ammar 808", "Maghreb électronique", "Glitterbeat", ["basses", "transe", "électronique"], 62],
  ["Ya Watan", "TootArd", "Psyché du Levant", "Glitterbeat", ["psyché", "groove", "électronique"], 57],
  ["Sahra", "Ghoula", "Maghreb électronique", "Shouka", ["samples", "électronique", "groove"], 80],
  ["Tarha", "Imarhan", "Blues du désert", "City Slang", ["guitare", "transe", "folk"], 37],
  ["Sastanàqqàm", "Tinariwen", "Blues du désert", "Wedge", ["guitare", "transe", "folk"], 18],
  ["Ilâ mata", "Ifriqiyya Electrique", "Maghreb électronique", "Glitterbeat", ["transe", "industriel", "électronique"], 84],
  ["Muslims and Christians", "Kamal Keila", "Funk du Soudan", "Habibi Funk", ["funk", "groove", "voix"], 74],
  ["Ayonha", "Hamid Al Shaeri", "Pop du Maghreb", "Habibi Funk", ["pop", "synthé", "groove"], 41],
  ["Maktoub", "Derya Yıldırım", "Psyché anatolienne", "Disques Bongo Joe", ["folk", "psyché", "voix"], 52],
  ["Yekte", "Lalalar", "Psyché anatolienne", "Disques Bongo Joe", ["basses", "psyché", "électronique"], 59],
  ["En En Tien", "Dengue Dengue Dengue", "Club tropical", "On the Corner", ["club", "transe", "basses"], 72],
  ["Niafounke", "African Head Charge", "Dub expérimental", "On-U Sound", ["dub", "transe", "expérimental"], 70],
  ["Kidal", "Tamikrest", "Blues du désert", "Glitterbeat", ["guitare", "folk", "psyché"], 46],
  ["Es Samra", "Yīn Yīn", "Psyché globale", "Glitterbeat", ["psyché", "groove", "funk"], 32],
  ["Hal", "Liraz", "Voix du Levant", "Glitterbeat", ["voix", "club", "électronique"], 43],
  ["Nakhla", "Sofiane Saidi & Mazalda", "Maghreb électronique", "Buda Musique", ["voix", "transe", "synthé"], 77],
  ["Saluf", "Batu", "Club expérimental", "Timedance", ["club", "basses", "expérimental"], 82],
  ["Dazion", "Confront the Future", "Dub expérimental", "Music From Memory", ["dub", "synthé", "expérimental"], 95],
  ["Le jardin", "Bégayer", "Folk expérimental", "Disques Bongo Joe", ["folk", "transe", "expérimental"], 97],
  ["Space Song", "Beach House", "Dream pop", "Sub Pop", ["pop", "synthé", "psyché"], 8],
  ["Kerala", "Bonobo", "Électronique", "Ninja Tune", ["électronique", "samples", "groove"], 12],
  ["Cirrus", "Bonobo", "Électronique", "Ninja Tune", ["électronique", "samples", "groove"], 20],
  ["Two Thousand and Seventeen", "Four Tet", "Électronique", "Text", ["électronique", "samples", "folk"], 22],
  ["LesAlpx", "Floating Points", "Électronique", "Ninja Tune", ["électronique", "club", "synthé"], 34],
  ["Avril 14th", "Aphex Twin", "Électronique", "Warp", ["expérimental", "synthé", "électronique"], 15]
];
const palettes: [string, string][] = [["#ca673c", "#392824"], ["#b6b56d", "#34382c"], ["#9fafd2", "#303148"], ["#dcab6f", "#803f34"], ["#74968c", "#25383c"], ["#bd7784", "#522f42"]];
export const catalog: Track[] = rows.map(([title, artist, scene, label, tags, obscurity], i) => ({ id: `mock-${i}`, title, artist, scene, label, tags, obscurity, year: 2015 + i % 9, colors: palettes[i % palettes.length] }));
