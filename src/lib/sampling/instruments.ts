/**
 * YouTube has no searchable instrument field. These hints use video metadata,
 * not audio analysis. A match is evidence in text, never sonic verification.
 */
export type InstrumentEvidence = "title" | "description";

export type InstrumentPreset = {
  id: string;
  label: string;
  search: readonly string[];
  evidence: readonly string[];
  aliases?: readonly string[];
};

export const INSTRUMENT_PRESETS: readonly InstrumentPreset[] = [
  { id: "rhodes", label: "Rhodes / piano électrique", search: ["fender rhodes", "electric piano"], evidence: ["fender rhodes", "rhodes piano", "rhodes keyboard", "rhodes keys", "electric piano", "e-piano", "piano electrique", "rhodes"], aliases: ["piano électrique", "piano electrique", "fender rhodes", "electric piano"] },
  { id: "piano", label: "Piano acoustique", search: ["piano", "acoustic piano"], evidence: ["piano", "acoustic piano", "piano acoustique"] },
  { id: "organ", label: "Orgue / Hammond", search: ["hammond organ", "organ solo"], evidence: ["hammond organ", "hammond b3", "organ solo", "organ", "orgue"], aliases: ["orgue", "hammond"] },
  { id: "synth", label: "Synthétiseur", search: ["synthesizer", "analog synth"], evidence: ["synthesizer", "synthesiser", "synthétiseur", "synthetiseur", "analog synth", "synth"], aliases: ["synthétiseur", "synthetiseur"] },
  { id: "bass", label: "Basse électrique", search: ["bass guitar", "electric bass"], evidence: ["bass guitar", "electric bass", "basse electrique", "basse électrique", "bass solo"], aliases: ["basse", "basse electrique", "basse électrique"] },
  { id: "double-bass", label: "Contrebasse", search: ["double bass", "upright bass"], evidence: ["double bass", "upright bass", "contrabass", "contrebasse"], aliases: ["contrebasse", "upright bass"] },
  { id: "drums", label: "Batterie / drum break", search: ["drum break", "drum solo"], evidence: ["drum break", "drum solo", "drums", "drum kit", "batterie"], aliases: ["batterie", "drum", "drum break"] },
  { id: "percussion", label: "Percussions", search: ["percussion", "percussion groove"], evidence: ["percussion", "percussions", "percussao", "percussão", "percusión"], aliases: ["percussions"] },
  { id: "congas", label: "Congas", search: ["conga drums", "conga percussion"], evidence: ["congas", "conga drums", "conga percussion", "tumbadora"], aliases: ["conga"] },
  { id: "tabla", label: "Tabla", search: ["tabla", "tabla solo"], evidence: ["tabla", "tablas"] },
  { id: "guitar", label: "Guitare", search: ["guitar", "guitar groove"], evidence: ["guitar", "guitare", "guitarra", "guitars"], aliases: ["guitare"] },
  { id: "flute", label: "Flûte", search: ["flute", "flute solo"], evidence: ["flute", "flûte", "flauta", "flauto"], aliases: ["flûte", "flauta"] },
  { id: "sax", label: "Saxophone", search: ["saxophone", "sax solo"], evidence: ["saxophone", "sax solo", "saxofon", "saxofón", "sax"], aliases: ["saxophone"] },
  { id: "trumpet", label: "Trompette", search: ["trumpet", "trumpet solo"], evidence: ["trumpet", "trompette", "trompeta"], aliases: ["trompette"] },
  { id: "trombone", label: "Trombone", search: ["trombone", "trombone solo"], evidence: ["trombone"] },
  { id: "clarinet", label: "Clarinette", search: ["clarinet", "clarinet solo"], evidence: ["clarinet", "clarinette", "clarinete"], aliases: ["clarinette"] },
  { id: "violin", label: "Violon", search: ["violin", "violin solo"], evidence: ["violin", "violon", "violino"], aliases: ["violon"] },
  { id: "cello", label: "Violoncelle", search: ["cello", "cello solo"], evidence: ["cello", "violoncelle"], aliases: ["violoncelle"] },
  { id: "harp", label: "Harpe", search: ["harp", "harp solo"], evidence: ["harp", "harpe"], aliases: ["harpe"] },
  { id: "vibraphone", label: "Vibraphone", search: ["vibraphone", "vibes solo"], evidence: ["vibraphone", "vibraharp", "vibes solo", "vibes"], aliases: ["vibes"] },
  { id: "marimba", label: "Marimba", search: ["marimba", "marimba solo"], evidence: ["marimba"] },
  { id: "sitar", label: "Sitar", search: ["sitar", "sitar solo"], evidence: ["sitar"] },
  { id: "oud", label: "Oud", search: ["oud instrument", "oud solo"], evidence: ["oud instrument", "oud solo", "oud"], aliases: ["luth arabe"] },
  { id: "kora", label: "Kora", search: ["kora instrument", "kora solo"], evidence: ["kora instrument", "kora solo", "kora"] },
  { id: "kalimba", label: "Kalimba", search: ["kalimba", "thumb piano"], evidence: ["kalimba", "thumb piano"] },
  { id: "balafon", label: "Balafon", search: ["balafon", "balafon solo"], evidence: ["balafon"] },
  { id: "mbira", label: "Mbira", search: ["mbira", "mbira solo"], evidence: ["mbira"] },
] as const;

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchesPhrase(text: string, phrase: string): boolean {
  // Padding with spaces avoids treating "flute" as part of a longer word.
  const target = fold(phrase);
  const source = fold(text);
  if (!target) return false;
  const token = target.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^\\p{L}\\p{N}])" + token + "(?=$|[^\\p{L}\\p{N}])", "iu").test(source);
}

function cleanInstrument(value: string): string {
  return value.replace(/[|"\r\n\\]/g, " ").trim().slice(0, 60);
}

export function resolveInstrument(value?: string): InstrumentPreset | undefined {
  if (!value) return undefined;
  const term = fold(value);
  return INSTRUMENT_PRESETS.find(preset =>
    term === fold(preset.id) ||
    term === fold(preset.label) ||
    preset.aliases?.some(alias => term === fold(alias)) ||
    preset.evidence.some(alias => term === fold(alias)),
  );
}

export function instrumentSearchPhrase(value: string, relaxed = false): string {
  const preset = resolveInstrument(value);
  const phrase = preset
    ? preset.search[relaxed ? Math.min(1, preset.search.length - 1) : 0]
    : cleanInstrument(value);
  return phrase.includes(" ") ? '"' + phrase + '"' : phrase;
}

export function instrumentMetadataEvidence(
  video: { title: string; description?: string },
  instrument: string,
): InstrumentEvidence | null {
  const preset = resolveInstrument(instrument);
  const words = preset?.evidence || [cleanInstrument(instrument)];
  const title = video.title;
  const description = (video.description || "").slice(0, 2500);
  const negated = words.some(word =>
    [title, description].some(text =>
      matchesPhrase(text, "no " + word) ||
      matchesPhrase(text, "without " + word) ||
      matchesPhrase(text, "sans " + word),
    ),
  );
  if (negated) return null;

  // Rhodes is also a performer name. "Rhodes - Song Title" alone is not
  // instrument evidence; a qualified piano reference must corroborate it.
  const terms = preset?.id === "rhodes" && /^rhodes\s*[-–—|:]/i.test(fold(title))
    ? words.filter(word => fold(word) !== "rhodes")
    : words;

  if (terms.some(word => matchesPhrase(title, word))) return "title";
  if (terms.some(word => matchesPhrase(description, word))) return "description";
  return null;
}
