# Expérience Last.fm — 13 octobre 2026

Décision après comparaison `track.getTopTags` : **abandonner cette méthode pour
les cinq morceaux testés**. Résultats détaillés ci-dessous.

Recommandation initiale (avant comparaison) : **approfondir uniquement hors production**. Ne pas activer cet
enrichissement automatiquement : les cinq recherches utiles de cet essai n’ont
rapporté aucun tag. Cela ne suffit pas à condamner toutes les métadonnées morceau.

Commande reproductible :

```text
npm run benchmark:discovery -- --case=leon-phal-jungle-jack-pleine-foret,mia-love-me-right,qendresa-good-love --direction=Surprends-moi --compare-recording
```

Résultat conservé : `benchmark-results/discovery-2026-10-13T05-35-52-532Z.json`.
Le fournisseur peut changer ses réponses. Le champ `recordingEnrichment.replay`
conserve les pools avant/après, le seed, la requête et la sélection de référence
pour reproduire le scoring et la sélection hors réseau, avec le code de cette
version. Les poids et règles sont ceux du moteur actuel.

| Cas | Titres proposés | Recherches audience existantes | Requêtes expérimentales réelles | Titres enrichis | Couverture recording avant → après | Changements de score/ordre/sélection |
|---|---:|---:|---:|---:|---:|---:|
| Qendresa — Good Love | 10 | 36 | 0 | 0 | 0/10 → 0/10 | 0 |
| Mia — Love Me Right | 2 | 4 | 0 | 0 | 0/2 → 0/2 | 0 |
| Léon Phal & Jungle Jack — Pleine Forêt | 10 | 0 | 5 | 0 | 0/10 → 0/10 | 0 |

Les cinq recherches concernent Gwenno Morgan / sglefrio, Waan / Bang,
Emile Londonien / As One, Peace Flag Ensemble / I Am Not The Gauguin I Used To Be
et Alina Bzhezhinska / Altera Vita - Another Life. Chaque réponse a passé le
contrôle d’identité et n’a fourni aucun tag. Aucune preuve supplémentaire,
aucun rejet d’identité, aucun échec fournisseur. Zéro cache hit sur ces cinq
requêtes du run mesuré. Les autres seeds n’avaient aucune cible exploratoire
finalement sélectionnée répondant aux critères.

## Isolation et budget

L’option est passée explicitement par le script de benchmark. Le comportement
normal de recommendLive ne lance pas cette expérience et renvoie toujours la
sélection baseline. Les autres modes ne lancent aucun enrichissement.
Le catalogue du benchmark reste séparé du catalogue réel.

On ne cible que des finalistes exploratoires déjà admissibles, avec audience
Last.fm connue et sans tags explicitement sourcés au niveau recording.
Déduplication artiste+titre ; dix cibles maximum et seulement les places libres
du budget existant de 60 track.getInfo. Les recherches d’audience prioritaires
ne sont pas déplacées. Les 60 sont des recherches logiques ; le helper existant
autorise jusqu’à trois tentatives chacune. Le compteur requests mesure les
tentatives HTTP de l’expérience, cacheHits les réponses réutilisées pendant une
heure via le cache existant. Ce n’est pas un budget global tous fournisseurs.

Titre et artiste doivent correspondre après normalisation, sans supprimer les
qualificatifs de remix/version. Les conflits MBID et les protections d’identité
existantes sont respectés. Seuls les tags retournés sont attachés à une copie
indépendante du pool ; audiences, chemins entre artistes et données baseline
restent inchangés. Une relation artiste ne devient pas une similarité morceau.

## Limites et suite

La couverture mesure les tags explicitement marqués recording, pas toutes les
métadonnées génériques déjà présentes. L’expérience ne teste que track.getInfo,
pas une nouvelle collecte MusicBrainz/Discogs ni track.getTopTags. Elle ne cible
pas les non-finalistes ni les candidats dont seule l’audience ListenBrainz est
connue. Avec un budget audience saturé, aucune expérience n’est effectuée.

Ce run n’est pas le replay historique du Dig 7 : les titres peuvent différer.
Aucun gain de pertinence humaine n’est mesurable sans enrichissement obtenu.
La prochaine petite expérience devrait vérifier si track.getTopTags apporte
effectivement davantage de tags sur les mêmes titres, à budget égal, avant
d’élargir le périmètre. Aucun changement du ranking n’est recommandé ici.

Validation : trois tests ciblés (identité, cache, budget, autres modes, absence
de mutation et replay), suite complète de 236 tests, TypeScript et build réussis.

## Comparaison ciblée getTopTags / getInfo — 13 octobre 2026

Le même snapshot Pleine Forêt a fourni les cinq cibles exactes et leurs contrôles
d’identité `getInfo` déjà réussis. Aucun nouveau `getInfo`, aucune nouvelle
recherche d’audience, aucun benchmark multi-fournisseur relancé.

| Morceau | Tags getInfo antérieur | Tags getTopTags bruts / exploitables | Diagnostic |
|---|---:|---:|---|
| Gwenno Morgan — sglefrio | 0 | 0 / 0 | Liste vide |
| Waan — Bang | 0 | 0 / 0 | Liste vide |
| Emile Londonien — As One | 0 | 0 / 0 | Liste vide |
| Peace Flag Ensemble — I Am Not The Gauguin I Used To Be | 0 | 0 / 0 | Liste vide |
| Alina Bzhezhinska — Altera Vita - Another Life | 0 | 0 / 0 | Liste vide |

**Coût : 5 requêtes supplémentaires exactement, 0 cache hit, 0 réessai.**
Les cinq réponses JSON ont la forme `toptags: { tag: [], "@attr": { artist, track } }`.
Les noms retournés concordent avec les cibles, versions comprises. Il s’agit
d’une absence explicite de tags : zéro erreur fournisseur/API, zéro morceau
signalé introuvable, zéro réponse malformée et zéro rejet d’identité.

Couverture sur les cinq exploratoires : **0/5 → 0/5** ; couverture recording
de la sélection : **0/10 → 0/10**. Aucun tag supplémentaire par rapport aux
métadonnées existantes (le champ tags des cinq finalistes était également vide),
aucune nouvelle preuve musicale. Aucun changement de classement : cet essai
observe les réponses sans réinjecter de données ni recalculer le ranking.

### Reproduction et garanties

Résultat local complet, avec payloads de succès conservés pour inspection hors
réseau : `benchmark-results/top-tags-pleine-foret.json`.
Script dédié : `scripts/top-tags-benchmark.ts`, compilé avec
`npx tsc -p tsconfig.benchmark.json`, puis exécuté avec
`node .benchmark-build/scripts/top-tags-benchmark.js`.
Le script refuse de remplacer un résultat existant pour empêcher un deuxième
lot accidentel. Ne pas relancer pour consulter les résultats : lire le JSON.

Réutilisation du helper HTTP/cache existant ; option `retry: false` réservée
à cet essai. Le comportement par défaut conserve ses trois tentatives.
Maximum cinq cibles uniques, toutes issues de réponses getInfo ayant passé
les gardes d’identité ; artiste et titre getTopTags doivent aussi concorder.
Ces attributs ne constituent pas une nouvelle preuve indépendante d’identité
ou d’affinité entre morceaux. Les tags exploitables seraient des noms non vides,
dédupliqués, avec un count numérique strictement positif : ce critère technique
ne prouverait pas à lui seul leur pertinence musicale.

Le diagnostic distingue les listes vides, données inutilisables, identités
discordantes, erreurs API et erreurs fournisseur. Le code API 6 seul ne suffit
pas à conclure « morceau introuvable » : le message doit le confirmer.
Le module est appelé uniquement par ce script et ses tests ; aucune écriture
au catalogue, aucun changement de scoring, MMR, filtres, obscurité ou sélection.

**Décision : abandonner l’enrichissement par ces deux méthodes Last.fm pour
ces cinq morceaux.** Ne pas engager de nouveaux appels sur ces cibles dans
cette expérience. Résultat limité à cet échantillon et à ces réponses datées,
sans conclusion générale sur Last.fm ni mesure statistique de pertinence.
La comparaison utilise un getInfo antérieur, pas des appels simultanés.

Validation finale : 6 tests expérimentaux ciblés réussis, **239/239 tests**
réussis, TypeScript et build réussis. Les tests de fichiers temporaires et le
build ont nécessité une exécution hors bac à sable après erreurs d’accès
Windows ; aucun correctif métier n’a été nécessaire pour ces erreurs.
Branche `feature/musical-intelligence` conservée, aucun push.
