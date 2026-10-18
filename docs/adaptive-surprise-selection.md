# Adaptive Surprise selection

The final selector receives the existing post-exclusion, post-identity and
post-obscurity candidate pool. Scoring weights and other modes are unchanged.
It selects the non-exploratory core first, then runs one exploratory MMR
selection to fill remaining slots. The first two exploratory picks retain the
nominal quota; further picks are added one at a time only while slots remain.
All picks enforce artist aliases, shared credits, edition and seed guards.

Diagnostics are collected inside that same execution, not by replaying ranking:

- `exploratoryDeferred`: candidates deferred from the core because of their
  evidence tier. This is a stage count, not a final rejection.
- `nominalQuotaBlocked`: still admissible candidate rows at the nominal quota
  when the target is unfilled. Rows can share artists, so this is not a count of
  additional fillable slots.
- `adaptiveAdded`: actual recommendations added beyond that quota.
- `rejected`: mutually exclusive final counts. Duplicate ID/edition and seed
  guards take priority over artist overlap. `mmrCapacity` means a candidate
  remained available when the target was reached, not a score cutoff.
  `exploratoryEvidence` and `exploratoryQuota` are zero after adaptive filling:
  neither is a final veto. Selected rows plus rejected rows equal input rows.

`supportedSelected` counts the existing non-exploratory core;
`exploratorySelected` counts the exploratory recommendations. Historical
untyped candidates retain the existing policy and are not reclassified here.

The regression fixture demonstrates five core picks plus two nominal picks
with six candidate rows still available: adaptive filling adds three and reaches
ten. This fixture verifies the mechanism; it is not a replay of the historical
Pleine Forêt response, whose complete enriched candidate pool is unavailable.
