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
