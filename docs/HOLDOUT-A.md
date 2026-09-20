# HOLDOUT-A — baseline figée du 20/09/2026

Le fichier brut `tests/fixtures/holdout-a-2026-09-20.json.gz` est l'export complet de la première session d'évaluation automatisée de Digger.

- Export : `2026-09-20T11:32:19.356Z`
- Mode : `Surprends-moi`
- Obscurité : `100`
- Seeds : `15`
- Recommandations évaluées : `54`
- SHA-256 du JSON décompressé : `830570284eca7bc94628950b23df1c2b19555cb2ef5028112b1c64170010ddd9`

## Baseline observée

Votes :

- ❤️ J'aime : 21
- 😐 OK / moyen : 8
- 🎯 Pertinent mais pas ma came : 17
- ❌ Hors sujet : 6
- ✓ Déjà connu : 0
- ⚠ Trop populaire : 2
- ? Introuvable : 0

Résolution :

- 14 / 15 seeds résolus
- 1 échec de résolution : Adam Chini — Stimulation (Original Mix)
- 1 seed résolu mais sans recommandation : Léon Phal & Jungle Jack — Pleine Forêt
- 13 / 15 seeds ont produit au moins une recommandation

Sources des 54 recommandations évaluées :

- ListenBrainz : 25
- Last.fm : 25
- Discogs : 4

## Statut méthodologique

Cette session n'est plus un holdout vierge dès lors que ses résultats servent à guider les modifications du moteur. Elle devient donc **HOLDOUT-A / corpus de développement**.

Toute amélioration doit être mesurée contre cette baseline, sans modifier rétroactivement le fichier brut. La validation finale devra utiliser un **HOLDOUT-B** composé de nouveaux seeds jamais utilisés pour régler le moteur.

## Rapport reproductible

Depuis la racine du projet :

```powershell
npm run report:holdout
```

Pour analyser un autre export :

```powershell
npm run report:holdout -- --input=chemin/vers/export.json
```

Pour écrire également le rapport calculé en JSON :

```powershell
npm run report:holdout -- --out=benchmark-output/holdout-a-report.json
```

Le test `tests/holdout-report.test.ts` vérifie le SHA-256 du JSON décompressé et les métriques principales, afin d'empêcher toute modification silencieuse de la baseline.
