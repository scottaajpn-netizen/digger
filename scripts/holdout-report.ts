import { existsSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { gunzipSync } from "node:zlib";

import { analyzeHoldoutExport, type HoldoutExport } from "../src/lib/evaluation/report";

function optionValue(flag: string) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === flag && args[index + 1]) return args[index + 1];
    if (current.startsWith(`${flag}=`)) return current.slice(flag.length + 1);
  }
  return undefined;
}

async function loadExport(path: string): Promise<HoldoutExport> {
  const bytes = await readFile(path);
  const json = extname(path) === ".gz" ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
  return JSON.parse(json) as HoldoutExport;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

function printReport(report: ReturnType<typeof analyzeHoldoutExport>) {
  console.log("[holdout] Digger HOLDOUT report");
  console.log(
    `[holdout] mode=${report.mode.direction || "?"} | obscurity=${report.mode.obscurity ?? "?"} | complete=${report.complete}`,
  );
  console.log(
    `[holdout] seeds=${report.seedCount} | resolved=${report.resolvedSeedCount} (${pct(report.resolutionRate)}) | no-results=${report.noResultsCount} | resolution-failed=${report.resolutionFailedCount} | errors=${report.errorCount}`,
  );
  console.log(
    `[holdout] seeds with recommendations=${report.seedsWithRecommendations} (${pct(report.recommendationCoverageRate)}) | ratings=${report.ratingCount}`,
  );
  console.log(
    `[holdout] votes: ${Object.entries(report.voteCounts).map(([vote, count]) => `${vote}=${count}`).join(" | ")}`,
  );
  console.log(
    `[holdout] off-topic=${pct(report.offTopicRate)} | too-popular=${pct(report.tooPopularRate)} | unavailable=${pct(report.unavailableRate)}`,
  );

  console.log("\n[holdout] score moyen par vote");
  for (const [vote, values] of Object.entries(report.scoresByVote)) {
    console.log(`  ${vote.padEnd(22)} n=${String(values.count).padStart(2)} avg=${fmt(values.average)} min=${fmt(values.min)} max=${fmt(values.max)}`);
  }

  console.log("\n[holdout] sources");
  for (const row of report.bySource) {
    console.log(
      `  ${row.source.padEnd(14)} n=${String(row.count).padStart(2)} off-topic=${pct(row.offTopicRate)} avg-score=${fmt(row.averageScore)} | ${Object.entries(row.voteCounts).map(([vote, count]) => `${vote}=${count}`).join(" ")}`,
    );
  }

  console.log("\n[holdout] chemins de découverte");
  for (const row of report.byDiscoveryPath) {
    console.log(
      `  ${row.path.padEnd(28)} n=${String(row.count).padStart(2)} off-topic=${pct(row.offTopicRate)} avg-score=${fmt(row.averageScore)}`,
    );
  }

  console.log("\n[holdout] seeds");
  for (const row of report.bySeed) {
    console.log(
      `  ${row.seedId.padEnd(34)} status=${row.status.padEnd(18)} resolved=${row.resolved ? "yes" : "no "} recos=${String(row.recommendationCount).padStart(2)} ratings=${String(row.ratingCount).padStart(2)} avg-score=${fmt(row.averageScore)}`,
    );
  }
}

async function main() {
  const defaultInput = join("tests", "fixtures", "holdout-a-2026-09-20.json.gz");
  const input = optionValue("--input") || defaultInput;
  if (!existsSync(input)) {
    throw new Error(`Fichier HOLDOUT introuvable: ${input}`);
  }

  const data = await loadExport(input);
  const report = analyzeHoldoutExport(data);
  printReport(report);

  const out = optionValue("--out");
  if (out) {
    const folder = out.includes("/") || out.includes("\\")
      ? out.replace(/[\\/][^\\/]+$/, "")
      : ".";
    if (folder && folder !== ".") await mkdir(folder, { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`\n[holdout] rapport JSON écrit: ${out}`);
  }
}

main().catch(error => {
  console.error("[holdout] Échec:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
