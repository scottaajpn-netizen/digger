import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTRUMENT_PRESETS,
  instrumentMetadataEvidence,
  instrumentSearchPhrase,
  resolveInstrument,
} from "../src/lib/sampling/instruments";
import { buildSamplingQuery, normalizeSamplingFilters } from "../src/lib/sampling/youtube";

test("French instrument names resolve to multilingual YouTube search phrases", () => {
  assert.equal(resolveInstrument("flûte")?.id, "flute");
  assert.equal(resolveInstrument("Basse")?.id, "bass");
  assert.equal(resolveInstrument("Piano électrique")?.id, "rhodes");
  assert.equal(resolveInstrument("Rhodes")?.id, "rhodes");
  assert.equal(resolveInstrument("guitare")?.id, "guitar");
  assert.equal(instrumentSearchPhrase("flûte"), "flute");
  assert.equal(instrumentSearchPhrase("rhodes"), '"fender rhodes"');
  assert.equal(instrumentSearchPhrase("rhodes", true), '"electric piano"');
  assert.equal(instrumentSearchPhrase("basse"), '"bass guitar"');
});

test("instrument filter retains the instrument in primary and fallback queries", () => {
  const filters = normalizeSamplingFilters({ instrument: "flûte", archiveFocus: true });
  const first = buildSamplingQuery(filters);
  const relaxed = buildSamplingQuery(filters, true);
  assert.match(first, /\bflute\b/);
  assert.match(relaxed, /\bflute\b/);
  assert.doesNotMatch(first, /\b19[6-9]\d\b/);
  assert.doesNotMatch(relaxed, /\b19[6-9]\d\b/);
});

test("instrument evidence matches actual metadata fields, with accented variants", () => {
  assert.equal(instrumentMetadataEvidence({ title: "Rare Jazz - Fender Rhodes 1974" }, "rhodes"), "title");
  assert.equal(instrumentMetadataEvidence({ title: "Unknown - Jazz Funk", description: "Musicians: electric piano, congas, bass." }, "rhodes"), "description");
  assert.equal(instrumentMetadataEvidence({ title: "Private Press - Flauta Solo (1975)" }, "flûte"), "title");
  assert.equal(instrumentMetadataEvidence({ title: "Lounge Music", description: "Featuring flûte et percussion" }, "flute"), "description");
});

test("instrument is not accepted merely because YouTube search returned a video", () => {
  assert.equal(instrumentMetadataEvidence({ title: "Rare Vinyl Funk", description: "Original pressing 1975." }, "flûte"), null);
  assert.equal(instrumentMetadataEvidence({ title: "Underground Jazz (1975)", description: "Guitar, piano, upright bass." }, "saxophone"), null);
  assert.equal(instrumentMetadataEvidence({ title: "No drums version", description: "Vintage 1980." }, "drums"), null);
  assert.equal(instrumentMetadataEvidence({ title: "Synthesizer music", description: "" }, "synth"), "title");
});

test("unknown instruments use a safe literal query and literal text evidence", () => {
  assert.equal(instrumentSearchPhrase("flugelhorn"), "flugelhorn");
  assert.equal(instrumentMetadataEvidence({ title: "Jazz - Flugelhorn solo" }, "flugelhorn"), "title");
  assert.equal(instrumentMetadataEvidence({ title: "Jazz - trumpet solo" }, "flugelhorn"), null);
});

test("presets have distinct IDs and nonempty English query hints", () => {
  assert.equal(new Set(INSTRUMENT_PRESETS.map(item => item.id)).size, INSTRUMENT_PRESETS.length);
  for (const item of INSTRUMENT_PRESETS) {
    assert.ok(item.label.length > 0);
    assert.ok(item.search[0].length > 0);
    assert.ok(item.evidence.length > 0);
    assert.equal(resolveInstrument(item.id)?.id, item.id);
  }
});
