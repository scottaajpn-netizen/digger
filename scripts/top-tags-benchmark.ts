import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { compareTopTags } from "../src/lib/discovery/top-tags-experiment";
import type { compareRecordingEnrichment } from "../src/lib/discovery/recording-enrichment-experiment";

async function main() {
  const source = "benchmark-results/discovery-2026-10-13T05-35-52-532Z.json";
  const destination = "benchmark-results/top-tags-pleine-foret.json";
  // Refuse accidental reruns, including after a partially completed provider run.
  const output = await import("node:fs/promises").then(fs => fs.open(destination, "wx"));
  await output.close();
  loadEnvFile(".env.local");
  if (!process.env.LASTFM_API_KEY) throw new Error("Missing Last.fm credential");
  const snapshot = JSON.parse(await readFile(source, "utf8")) as { runs: Array<{
    caseId: string; recordingEnrichment: Awaited<ReturnType<typeof compareRecordingEnrichment>>;
  }> };
  const run = snapshot.runs.find(r => r.caseId === "leon-phal-jungle-jack-pleine-foret")!.recordingEnrichment;
  if (run.outcomes.length !== 5) throw new Error("Expected the same five benchmark targets");
  const targets = run.outcomes.map(outcome => {
    const baseline = run.replay.baselineTracks.find(t => t.id === outcome.id);
    if (!baseline || baseline.evidence?.tier !== "exploratory") throw new Error("Invalid benchmark target");
    return { ...outcome, existingTags: baseline.tags };
  });
  const result = await compareTopTags(targets, AbortSignal.timeout(55000));
  await writeFile(destination, JSON.stringify({ source, generatedAt: new Date().toISOString(), ...result }, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => { console.error("Benchmark failed; inspect local setup before any rerun."); process.exitCode = 1; });
