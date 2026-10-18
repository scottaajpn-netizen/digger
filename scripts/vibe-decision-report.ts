import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assessVibeRollout,
  formatVibeDecisionMarkdown,
  type VibeBenchmarkSnapshot,
} from "../src/lib/evaluation/vibe-rollout-gate";

function arg(name: string) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) return args[i + 1];
    if (args[i].startsWith(name + "=")) return args[i].slice(name.length + 1);
  }
  return undefined;
}

async function main() {
  const input = arg("--input") || join("benchmark-results", "latest.json");
  const output = arg("--out") || join("benchmark-results", "latest-vibe-decision.md");
  const json = JSON.parse(await readFile(input, "utf8")) as VibeBenchmarkSnapshot;
  if (!json || typeof json !== "object" || !Array.isArray(json.runs))
    throw Error("Snapshot invalide : tableau 'runs' introuvable.");

  const report = assessVibeRollout(json);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, formatVibeDecisionMarkdown(report), "utf8");
  console.log("[vibe-decision] " + report.status +
    " | seeds évaluées=" + report.distinctReviewedSeeds +
    " | paires=" + report.comparablePairs +
    " | améliorées=" + report.improvedPairs +
    " | dégradées=" + report.regressedPairs);
  for (const reason of report.reasons) console.log("  - " + reason);
  console.log("[vibe-decision] Rapport : " + output);
  console.log("[vibe-decision] Aucune activation automatique.");
}

main().catch(error => {
  console.error("[vibe-decision] Erreur :",
    error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
