# Catalogue contamination audit

Confirmed source: `tests/lastfm-seed-mbid-fallback.test.ts` mocks
artist.getSimilar with Jazz Root / Rap Root and artist.getTopTracks with
two cuts each. It invokes recommendLive without a catalogue override.
The live pipeline persists those mocked responses using rememberCatalogueEntries.
Previously its default was the same `.digger/discovery-catalogue.json` as the app.
Four matching rows were found, including fixture anchor MBIDs, generated IDs,
listener counts 60/75 and similarity 0.9. The sparse-seed chaining test in
`tests/live.test.ts` contaminated four further rows with Niche/Neighbour fixture.

The store retains up to 1500 entries for seven days, merges by anchor identity,
neighbour and track identity, and atomically replaces JSON through a queued
temporary file rename. Schema validation checks structure, not provider truth.

## Meaning of verification

- The seed artist anchor passes the existing MusicBrainz/Last.fm identity guards.
- A cached track was reported by artist.getTopTracks; no independent existence
  check is performed for every cache hit. A URL or generated ID alone is not proof.
- artist.getSimilar provides an artist relationship, not listening similarity
  between the two recordings. The cache reconstitutes that catalogue path.
- Strong/credible/exploratory is an evidence classification based on the path
  and metadata, not authentication of the original HTTP response. Mocks crossing
  the persistence boundary can therefore receive normal recommendation scores.

## Repair

Test runners and `.test-build` use a process-scoped temporary catalogue. An
inherited DIGGER_CATALOGUE_PATH only namespaces that temporary file. Benchmarks
use `.benchmark-build/discovery-catalogue.json`, independent of the live override.
Explicit filePath injection remains available for storage unit tests.
Live path resolution, TTL, identity gates, scoring and selection are unchanged.

`node scripts/quarantine-catalogue-fixtures.cjs <exact-file>` quarantines only
the confirmed compound fixture fingerprints, backing up the entire original
file before an atomic replacement. Same-name entries with different provenance
survive. Running it twice is safe. Backups are not read by the catalogue loader.
Eight confirmed rows were removed locally; 1492 others were preserved, without
claiming independent verification of every remaining row. Other installations
with a contaminated cache need the same targeted migration on their own file.

Benchmark inputs are seed/assessment fixtures used by the benchmark runner;
their verdicts are not catalogue entries. Provider calls from that runner now
have a separate cache. UI cache wording explicitly states that stored provider
responses are not reverified on every dig.
