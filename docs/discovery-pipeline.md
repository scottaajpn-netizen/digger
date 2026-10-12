# Discovery pipeline

Digger treats recommendation as a pipeline rather than one additive score.
This document records the current architectural invariants so future changes
can be tested against them.

## 1. Candidate generation

Providers may propose candidates from different kinds of graphs:

- Last.fm: direct listening similarity, second-circle paths, catalogue fallback;
- ListenBrainz: behavioral radio and tag routes;
- Discogs: releases, labels, compilations and deeper editorial paths;
- MusicBrainz: identity, releases and credits.

A provider's retrieval rank is useful for prospecting, but is **not** proof that
a candidate belongs in the final recommendation list.

## 2. Evidence

Ranked candidates expose a qualitative evidence assessment:

- **strong**: musical evidence plus a credible structured/behavioral path;
- **credible**: either musical evidence or a credible structured/behavioral path;
- **exploratory**: retrieval exists, but no credible recommendation evidence is
  currently available.

Low metadata similarity is not automatically bad. A structured Discogs path or
a behavioral listening path can remain credible even when tags do not overlap.
Conversely, catalogue position alone does not become musical evidence.

## 3. Surprends-moi

Surprends-moi is exploration, not score inflation.

- retrieval relevance is downweighted before final ranking;
- source-only Last.fm/Discogs bonuses do not prove quality;
- random jitter is centered and bounded to +/- 3.75 points so it only breaks
  near ties;
- depth is represented by the discovery path rather than by rewarding absence
  of musical similarity;
- supported candidates are selected before exploratory wildcards;
- at most two exploratory wildcards may fill a list;
- repeated artists do not fill empty discovery slots.

This is intentionally closer to a playlist pipeline: generate broadly, assess
evidence, rank supported candidates, diversify, then allow controlled
exploration.

## 4. Evaluation

The human benchmark is the product truth. Automated metrics are secondary and
should help diagnose regressions rather than replace listening judgments.
Useful metrics inspired by recommender-system evaluation include:

- positive / bad human verdict ratios;
- unique-artist coverage and dominant-artist concentration;
- source/path concentration;
- confirmed known-track rate;
- confirmed successful discoveries (good/excellent and explicitly unknown);
- obscurity/long-tail compliance where audience data is available.

Do not optimize one metric in isolation. A list can be diverse but irrelevant,
or novel but musically incoherent.

## 5. Change discipline

Before tuning coefficients, prefer a causal invariant and a regression test.
Validate with typecheck, tests, build, then rerun representative seeds from the
human benchmark. Keep main untouched until the feature branch is validated.


## 6. Tag provenance without ranking changes

Musical tags have a provider and a scope when this is known:
MusicBrainz recording tags and Last.fm track.getTopTags describe recording
**metadata**; MusicBrainz artist tags describe the **artist**; Discogs
styles describe a **release**, which may be a multi-artist compilation.
Artist-relation and retrieval context tags are not recording facts.
Unattributed tags remain marked as such; no audio analysis is implied.

The audit separates classified fine-grained musical clues by scope,
without changing the existing scoring weights or candidate selection.
The human-readable reasons no longer present compilation styles as
demonstrated recording-level similarity. Regression tests preserve this
boundary and the unchanged musical profile similarity formula.


## 7. Shadow measurement for provenance-dependent ranking

The discovery benchmark now records `metadataScopeCounts` and the percentage
of recommendations whose shared fine-grained musical tags depend on
release/compilation metadata. Categories are `recording`, `release-context`,
`artist-context`, `unscoped`, `none` or `not-measured`.

The pure ranker accepts internal `strategy: "scope-aware"` to test reducing
only the similarity contribution from release-scoped subgenre/trait overlap by
50%. Its default remains `"baseline"`; neither the live API nor the UI
activates the experiment. Discogs editorial path relevance, direction
bonuses and the evidence tier are unchanged. Automated tests verify both
strategies and their score breakdown; an actual improvement in listening
quality must still be measured with the human benchmark.


## 8. Offline same-pool ranking comparison

To compare the current scoring with the candidate release-scope adjustment:

```powershell
pnpm benchmark:discovery -- --case=mia-love-me-right,qendresa-good-love,leon-phal-jungle-jack-pleine-foret --direction=Surprends-moi --compare-scope
```

The command makes one normal discovery request per seed and direction, then
scores the *same final enriched candidate pool* twice in memory. It applies
the same obscurity gate, mode-specific selection, artist constraints and
known-track exclusions. No second provider/API run is made for the shadow.

Each JSON run now includes `scopeShadow`: shared results, entrants,
exits, position changes, candidate counts, separate standard metrics,
and separate historical human-verdict matches. Unrated tracks are
reported as **unknown**, not as good discoveries.

**Caveat**: artist-audience enrichment still uses the baseline shortlist.
An experiment-only entrant may lack artist-audience metadata; inspect the
shadow's unknown-audience metrics before interpreting a result. This is
an offline diagnostic, not a claim of better recommendations. The
production ranking continues to default to baseline.
