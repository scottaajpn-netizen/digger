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


## 16. Explain each ranking decision (read-only)

The discovery benchmark now writes a human-readable report at
\`benchmark-results/latest-ranking.md\` in addition to
\`benchmark-results/latest.json\`. For each seed/mode and its optional
\`--compare-vibe\`, \`--compare-scope\` or \`--compare-paths\` shadow:

- per-title final position, previous position in the baseline, score and
  largest *accounting* contributions (retrieval, overlap, origins, etc.);
- path relation, qualitative reliability warnings and tag-overlap scope;
- exact historical human coherence/taste labels, **never invented labels**;
- all misordered pairs where a title known to be less coherent appears above
  a reviewed more coherent title;
- score factors favoring the wrongly advanced title and a separate warning
  when its raw score is lower, because diversity/selection may explain
  the displayed rank instead.

The rank audit uses only the already selected 10 tracks and the same
historical user verdicts. Components describe what increased the score;
they are **not** acoustic evidence or necessarily the cause of final
placement. Missing human ratings mean unknown performance, not success.
This diagnostic does not modify ranking, call music APIs, require a new
listening session or touch the production app UI.

For a short, focused example:

\`\`\`powershell
pnpm benchmark:discovery -- --case=mia-love-me-right-vibe-80 --direction="Même vibe" --compare-vibe
\`\`\`

Then read \`benchmark-results/latest-ranking.md\` and the corresponding
\`runs[].rankingDecisionAudit\` or
\`runs[].vibeShadow.rankingDecisionAudit\` in JSON. Experiments remain
opt-in; the standard engine stays on the baseline strategy.


## 17. Accurate Last.fm artist-hop evidence without deleting discoveries

A two-hop Last.fm graph through artist.getSimilar and artist.getTopTracks
is a legitimate candidate-finding association but does not establish
track-to-track listening similarity. The discoveryPath evidence is now
catalogue rather than the former misleading listening label. The UI
explicitly displays "voisinage entre artistes" and explains its scope.

The musical evidence kind for such routes is artist-link. A documented
multi-hop artist association is still credible as an exploration route
(and remains eligible for supported Surprends-moi discoveries), but it
does not claim actual sonic or behavioral track similarity. New paths
no longer generate the old artist-chain-mislabeled-listening warning;
legacy paths retain that diagnostic. Long paths without recording-scope
confirmation continue to be flagged.

Previously saved path feedback under the old label is still honored as
a fallback until a newer preference exists. This change adds no API
requests or candidate retrieval. Listening tests are still needed to
determine whether users prefer the changed ordering.


## 18. Score-source calibration in the opt-in Même vibe shadow

The shadow-only \`vibe-aware\` adjustment now explicitly reverses
**unsupported Last.fm source bonuses**, instead of applying a single
flat negative score to every indirect artist connection.

When no *recording-scoped* fine-tag overlap is established:

- \`lastfm-crate\` at obscurity 80+ loses precisely the +24 origin bonus
  granted to catalogue expansion, plus up to 6 points previously
  granted solely for Last.fm's \`artist.getSimilar\` match.
- Below obscurity 80, the crate has no +24 bonus to remove; it gets
  only a cautious 8-point context adjustment, plus that artist match.
- Second-circle \`lastfm-artist-hop\` loses its artist-neighbour match
  bonus plus a restrained 8-point path-context adjustment, preserving
  deep niche candidate discovery.
- A \`lastfm-tag-crate\` gets a 12-point context caution.

Candidates with *independently shared recording-scoped* tags are exempt.
Direct Last.fm track-to-track similarity and Discogs/label/compilation
paths are untouched; all other directions are exactly unchanged.
User-taught path-memory scores stay intact. The score changes are
accounted for in \`scoreBreakdown.origin\`,
\`scoreBreakdown.discoveryPath\` and \`scoreBreakdown.direction\`, for
transparent before/after reports.

The numbers are hypotheses, NOT listening-validated accuracy. Use
\`--compare-vibe\` to compare both rankings over the exact same candidate
pool without extra Last.fm/Discogs API calls. The production algorithm
remains \`baseline\` until there's sufficient human evidence.

## 19. Conservative evidence gate for vibe-aware (offline)

A passing technical test is not proof of better music recommendations.
Each --compare-vibe run now records an evidence decision:

- insufficient-evidence: not enough comparable reviews, source gaps, incomplete runs, low rated coverage, or no measured gain;
- regression-risk: human-reviewed ranking pairs get worse or a known coherent recording disappears from the top ten;
- candidate-for-listening: several independent same-mode comparisons show a promising signal worth checking by ear.

The gate requires at least **4 independent seeds with exact track-specific listening reviews**,
**12 reviewed recordings**, **8 comparable pairs of different musical coherence**
and **75% retention of rated tracks**. Last.fm and Discogs must have been configured
and there must be zero benchmark errors. These thresholds are engineering safeguards,
not scientifically validated accuracy cutoffs. No status activates a strategy automatically.

Crucially, the historical feedback must be from the **same direction and obscurity**
as the new run. Old Surprends-moi ratings cannot certify Même vibe.
Old snapshot versions without mode provenance are intentionally insufficient.
Unreviewed replacements are never counted as better music.

The normal comparison automatically writes
benchmark-results/latest-vibe-decision.md and adds vibeDecision to latest.json.
Review a previously saved benchmark **with no music API calls**:

    pnpm report:vibe
    pnpm report:vibe -- --input=benchmark-results/discovery-....json

To create a live A/B snapshot (provider credentials required):

    pnpm benchmark:discovery -- --case=mia-love-me-right-vibe-80 --direction="Même vibe" --compare-vibe

The historical corpus currently has just one specifically rated Même vibe seed
at obscurity 80%, Mia — Love Me Right. The expected responsible outcome
remains insufficient-evidence until other same-mode human reviews exist.

## 20. Multi-artist seed coverage and empty seed field

The main seed search now starts empty, with its existing autocomplete and
submit validation unchanged. Clicking a recommendation to explore it still
sets the selected seed explicitly.

When Last.fm catalogue expansion is available, second-circle exploration
now divides its existing budget of 3 bridge lookups and up to 6 deeper
artists between the independently verified seed artists. Sessions rotate
the initial anchor. No additional API requests, no guessed collaborators
and no extra Last.fm aliases are introduced.

The Surprise MMR selector gently discourages repeated use of the same
seed-artist root only when **at least two distinct verified roots** already
have eligible candidates. This is a soft diversity penalty, not a forced
50/50 split, and does not exempt candidates from strict audience gates.

The live response includes retrievalDiagnostics.anchorCoverage with
per-participant `verified`, `generated`, `eligible` and `selected` counts.
An unverified participant is displayed with zero Last.fm branch coverage
rather than silently pretending it was searched. The main UI exposes
these counts in the collapsible 'Branches Last.fm du morceau' section.

Important: all counts concern only Last.fm artist-catalogue and artist-hop
routes. A zero value does not mean the participant is absent from other
providers or that it cannot be discovered via labels or recording similarity.
Some candidate identities merge across providers, in which case the
surviving route determines its selected anchor.

For Léon Phal & Jungle Jack — Pleine Forêt, inspect the diagnostics to
tell apart (a) Jungle Jack identity not verified, (b) no candidate
generated, (c) eliminated by audience/obscurity, and (d) generated and
eligible but not picked by ranking. This diagnostic is actionable without
guessing musical similarity from an artist chain.

## 21. Last.fm seed lookup failure does not erase trusted MusicBrainz artist credits

A recording can be correctly identified by MusicBrainz even when Last.fm
has no corresponding track.getInfo, track.getTopTags or track.getSimilar
entry under its artist-title spelling. Previously, artist catalogue
expansion required a successful Last.fm seed track identity and was
silently skipped even for independently credited MusicBrainz artists.

When MusicBrainz recording credits contain verified artist MBIDs,
catalogue exploration can now use those **exact MBIDs** via
Last.fm artist.getSimilar. Each participant must first pass the
existing identity guard: contradictory Last.fm artist MBIDs and
uncorroborated short names (notably Mia) remain blocked. No artist
identity is guessed from a compound credit string or an artist alias.

User-visible source notes include the numeric Last.fm API error code
(when returned) but never API keys or request URLs. This helps distinguish
invalid/unrecognized seed recordings from provider outages or rate limits.
The seed not being found still does **not** grant authority to use its
unverified Last.fm tags or direct recording similarities.

If Last.fm is truly unavailable for artist lookups too, those branches
will still have no neighbours. This fallback cannot bypass the strict
obscurity/audience gate, and does not change candidate scores or add
more than the existing bounded Last.fm artist-request budget.

Use the UI 'Branches Last.fm du morceau' on Pleine Forêt to check
whether both credited artists were independently verified and whether
any candidates passed the final strict gate.
