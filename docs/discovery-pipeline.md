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


## 9. Path reliability audit (diagnostic, production ranking unchanged)

The offline discovery benchmark measures what each selected path actually
**demonstrates**, separately from its eligibility or numerical score.
`pathRelationCounts` classifies direct track similarity, artist radio,
artist-similarity chains, catalogue links, editorial context, tag context
and unknown relations. `pathReliabilityFlags` counts structural warnings.

Identified risk patterns:

- `artist-chain-mislabeled-listening`: `artist.getSimilar` twice plus
  `artist.getTopTracks` is currently labeled as a behavioral listening
  relation. These are artist-level links, not direct similarity of recordings.
- `release-tags-used-as-musical-proof`: a release or compilation style
  contributed to the evidence tier as if it described the specific track.
- `discogs-link-labeled-editorial`: the graph has real Discogs release/label
  nodes but their metadata alone does not establish curator-verified sonic
  similarity.
- `scene-context-is-not-musical-proof`: style, country and year on two
  releases establish an editorial search context, not an artistic scene.
- `long-path-no-recording-match`: a >=3-edge path has no shared
  recording-scoped fine-tag evidence; its length must not certify relevance.
- `unscoped-tags-used-as-proof`: musical evidence is supported by tags whose
  recording scope has not been established.
- `discogs-structured-without-path`: a Discogs association could receive
  structured evidence without a displayed chain of nodes.

These flags are **review prompts, not verdicts**: a valid obscure discovery
may come from a chain with weak metadata, and a perfectly documented label
relationship might still sound unlike its seed. The audit adds no API
requests, no inference cost, no new filtering and no score change.
Human listening verdicts and the same-pool shadow comparison remain
necessary before changing path weights or tiers.


## 10. Per-link path anatomy

`inspectPathEdges` now breaks every documented discovery path into directed
adjacent links. Each link records its two nodes, relation and one support kind:

- `provider-association`: a relation the provider reports (e.g. Last.fm
  track similarity or artist.getSimilar). An artist association is NOT a
  verified similarity of the resulting recordings.
- `catalogue-fact`: release membership, artist catalogue track, label or
  release-credit relation. These are membership facts, not acoustic evidence.
- `contextual`: artist anchor, tag context or search-style/year/country
  relation. Not a verified per-track sonic connection.
- `unclassified`: an edge not supported by a known path constructor.
  Such edges are flagged for inspection; no invented proof is added.

Benchmark metrics now include `pathEdgeSupport`, `pathEdgeRelations`,
direct track-level associations, contextual steps, and unclassified steps,
with full per-link details in each compact track's `pathAudit.edges`.
This changes no score, selection, provider calls, memory or production UI.


## 11. Optional path-aware ranking shadow

The existing `--compare-scope` flag remains available. To compare the
current scoring with a **path-aware** shadow, use:

```powershell
pnpm benchmark:discovery -- --case=mia-love-me-right,qendresa-good-love,leon-phal-jungle-jack-pleine-foret --direction=Surprends-moi --compare-paths
```

This computes the third, opt-in strategy against the same enriched candidate
pool with no new provider request. It caps the reduction of a *positive path
bonus* to **8 points** when the association is an indirect Last.fm artist
chain, Discogs scene-context connection or Discogs catalogue chain labelled
editorial. Other score components, provenance and evidence tiers are
unchanged; strict obscurity gates, known-track exclusions and diversity
selection apply identically. `pathShadow` in the resulting benchmark JSON
records position changes, entrants/exits, coverage and historical verdict
matches. A reported difference is NOT proof of improved musical taste.


## 13. Last.fm recording-level identity guard

Artist-identity validation alone does not secure Last.fm
\`track.getSimilar(artist, track, autocorrect=1)\`: a track lookup by name
can still refer to a different recording. If the selected seed has a
verified MusicBrainz recording ID, its Last.fm \`track.getInfo.track.mbid\`
is compared to it **before** trusting track tags, listener counts or the
direct track-similarity branch.

An explicit recording-ID conflict rejects the Last.fm track metadata and
direct recommendations. For short names (up to four letters), a
MusicBrainz-identified recording requires either the **same recording MBID**
or a corroborated artist MBID before that Last.fm track branch is used.
This does not require a new provider request: the existing \`track.getInfo\`
response supplies the confirmation or its absence. A seed without a
recording MBID (for example the rare DÜK test case) retains direct Last.fm
track discovery rather than losing all niche recommendations.

The MusicBrainz/ListenBrainz/Discogs branches and the production ranking
formula remain unchanged. Integration regression tests cover missing,
contradictory and matching recording IDs using the observed Mia failure
pattern. A missing ID is uncertainty, not proof of incorrect music; a
few more sparse results can be preferable to false confidence.


## 14. Annotated "Même vibe" regression and opt-in vibe scoring

A separate benchmark case, \`mia-love-me-right-vibe-80\`, records the
five actual listening verdicts for Mia — Love Me Right in "Même vibe"
at 80% obscurity. Coherence and personal taste stay independent:
Thee Lakesiders = coherent / liked, Jeans Team = distant / liked,
Polarkreis 18 = distant / neutral, LEA and 2raumwohnung = off-topic
/ disliked. The earlier Mia "Surprends-moi" at 100% remains a
different benchmark case rather than mixing evaluation conditions.

To evaluate the isolated same-pool experiment:

\`\`\`powershell
pnpm benchmark:discovery -- --case=mia-love-me-right-vibe-80 --direction="Même vibe" --compare-vibe
\`\`\`

The optional \`vibe-aware\` strategy subtracts at most 20 points from
Last.fm artist-catalogue and artist-hop connections (16 for tag-to-artist
catalogue) when no independently recording-scoped fine tag overlap is
available. It does NOT filter these candidates, rewrite evidence,
touch direct Last.fm track similarity, or penalize Discogs paths.
The adjustment never applies to other directions. The offline
\`vibeShadow\` report compares the same candidates under unchanged
obscurity gates and selection rules, including separate human coherence
and taste counts. No extra API requests are made for the experiment.
The production strategy remains baseline until reviewed by listening.

 
## 15. Paired coherence ordering (without extra API calls)

The existing same-pool comparisons --compare-vibe, --compare-paths and
--compare-scope now include pairedHumanOrdering in their run JSON.

This asks whether a ranking places a human-reviewed musically coherent
track ahead of a less coherent reviewed track. Comparisons use exactly
matched artist+title identities that are present in BOTH lists, under
the same seed, direction and obscurity. Artist-only reviews are not
treated as recording-level judgments. Pairs with identical coherence
ratings are excluded, and taste/novelty remain separate.

A new unreviewed recommendation replacing a rejected one is not counted
as an improvement: coverage of common rated recordings and comparable
pairs is shown explicitly. If no graded pair exists the accuracy and
delta are null (indeterminate), never a false claim of success. Improved
and regressed pair counts expose order inversions.

These statistics require no additional calls, change no ranking scores,
do not touch the UI, and cannot replace actual listening validation.
