import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildTasteImport, tasteImportFile, writeTasteImport } from "../src/lib/discovery/taste-import";

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Usage: npm run import:youtube-music -- <resultat_classement_v6_4.csv>");
  const store = buildTasteImport(await readFile(path.resolve(source), "utf8"));
  await writeTasteImport(store);
  console.log(JSON.stringify({ output: tasteImportFile(), fingerprint: store.sourceFingerprint, ...store.report }, null, 2));
}

void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
