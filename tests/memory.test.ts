import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadDiscoveryMemorySnapshot,
  recordDiscoveryFeedback,
} from "../src/lib/discovery/memory";
import { discoveryPathPreferenceKey, lastFmDeepPath } from "../src/lib/discovery/paths";
import { trackIdentity } from "../src/lib/discovery/ranking";
import type { Track } from "../src/lib/types";

const seed: Track = {
  id: "seed",
  title: "Seed",
  artist: "Seed Artist",
  scene: "",
  label: "",
  tags: [],
  obscurity: 50,
  year: 0,
  colors: ["a", "b"],
};

const candidate = {
  id: "candidate",
  title: "Candidate",
  artist: "Candidate Artist",
};

async function tempMemoryFile() {
  const directory = await mkdtemp(path.join(tmpdir(), "digger-memory-"));
  return path.join(directory, "memory.json");
}

test("discovery memory persists path feedback and known tracks", async () => {
  const file = await tempMemoryFile();
  const discoveryPath = lastFmDeepPath(
    seed,
    { artist: "Bridge Artist", title: "Bridge" },
    candidate,
  );

  await recordDiscoveryFeedback(
    { artist: candidate.artist, title: candidate.title, discoveryPath },
    "love",
    "Rabbit hole",
    file,
  );
  const positive = await loadDiscoveryMemorySnapshot(file);
  const key = discoveryPathPreferenceKey(discoveryPath, "Rabbit hole");
  assert.ok(key);
  assert.ok((positive.pathScores[key!] || 0) > 0);

  await recordDiscoveryFeedback(
    { artist: candidate.artist, title: candidate.title, discoveryPath },
    "known",
    "Rabbit hole",
    file,
  );
  const known = await loadDiscoveryMemorySnapshot(file);
  assert.ok(known.knownTracks.includes(trackIdentity(candidate)));
  assert.equal(known.pathScores[key!] || 0, 0);

  await recordDiscoveryFeedback(
    { artist: candidate.artist, title: candidate.title, discoveryPath },
    null,
    "Rabbit hole",
    file,
  );
  const cleared = await loadDiscoveryMemorySnapshot(file);
  assert.equal(cleared.knownTracks.includes(trackIdentity(candidate)), false);
});

test("discovery memory survives corrupt JSON by starting fresh", async () => {
  const file = await tempMemoryFile();
  await writeFile(file, "{not-json", "utf8");
  const snapshot = await loadDiscoveryMemorySnapshot(file);
  assert.deepEqual(snapshot.pathScores, {});
  assert.deepEqual(snapshot.knownTracks, []);
  await assert.rejects(readFile(file, "utf8"));
});
