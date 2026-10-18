# Pleine Forêt — Dig 7, évaluation enregistrée le 13 octobre 2026

## Données et limites

Référence : cas `leon-phal-jungle-jack-pleine-foret`, suivi
`dig-7-human-review-recorded-2026-10-13` dans le corpus existant.
Les dix titres, leur ordre et les verbatims sont conservés dans `partialReviews`.
Surprends-moi, obscurité 100. La date du dig et le commit sont inconnus.
Les archives `benchmark-results/discovery-2026-09-20*.json` contiennent des
listes de deux à quatre titres, pas ce Dig 7. Leurs scores ne lui sont pas imputés.
Le pool, la session, les exclusions/mémoire, les dix breakdowns et décisions MMR
de ce run manquent. Le catalogue courant ne permet pas de reconstruire cet état.

## Mesures reproductibles

| Mesure | Résultat | Interprétation |
|---|---:|---|
| Taille / artistes affichés distincts | 10 / 10 | D’après la liste fournie |
| Goût renseigné | 6/10 | 1 love, 1 like, 4 neutral (« moyen ») |
| Goût positif parmi les goûts renseignés | 2/6 = 33,3 % | Pas une précision de pertinence |
| Titres positifs sur toute la liste | 2/10 = 20 % | Couverture appréciée observée |
| Cohérence renseignée | 2/10 | Deux « hors sujet », aucun jugement positif explicite |
| Hors sujet observés | 2/10 = 20 % | 8 pertinences inconnues, pas 80 % pertinents |
| Hors sujet parmi les avis goût/cohérence | 2/8 = 25 % | Dénominateur distinct du goût |
| Déjà connu déclaré | 1/10 | Nouveauté inconnue pour les 9 autres |
| Sans avis goût/cohérence | 2/10 | Huntrill : connu seulement ; Peace Flag : non évalué |
| Branches déclarées | 8 Léon Phal / 2 Jungle Jack | Distribution des sélectionnés, pas des opportunités |
| Affinité morceau mesurée | 0/10, selon le retour | Absence de mesure, pas similarité nulle |
| Paires de cohérence comparables | 0 | Les deux seuls avis de cohérence sont égaux |

`comparePairedHumanOrdering` confirme l’absence de paires comparables et retourne
une exactitude null, pas zéro. Le test du corpus vérifie les dénominateurs.
La part Last.fm est décrite comme quasi exclusive, sans inventer un pourcentage.
Le nombre total d’exploratoires de ce run n’est pas fourni : on ne calcule donc
pas un taux d’échec des exploratoires. Ne pas lui attribuer les 5/5 du Dig 8.

## Ce que le moteur explique

Le score brut n’est pas une prédiction de goût. Dans `scoring.ts`, Surprends-moi
pondère la pertinence fournisseur par 0,2, ajoute similarité de métadonnées,
chemin, mémoire et jitter, et retire des pénalités d’audience/écart d’obscurité.
Une audience compatible avec le gate peut encore produire des pénalités.
Sans le breakdown de Dat It, leur contribution exacte reste indéterminée.

Le sélecteur ajoute une préférence de mode au score pour ordonner les candidats,
puis MMR utilise leur rang normalisé dans le groupe, pas un seuil score > 0.
Il traite d’abord le noyau non exploratoire, puis les exploratoires pour remplir.
Dat It peut donc être sélectionné avec un score négatif. L’aimer beaucoup ne
démontre ni un bug arithmétique ni l’intérêt de supprimer les pénalités.
La mémoire, la nouveauté artiste, la redondance et la pénalité souple de branche
peuvent changer l’ordre. Aucun calcul divergent du ranking n’est ajouté ici.

Waan et Alina sont déclarés exploratoires : l’absence de preuve musicale forte
n’est pas un veto dans ce mode. Le remplissage peut donc admettre un artiste
distinct, obscur et identifié, malgré une pertinence faible. Leur rang exact,
les alternatives disponibles et le rôle marginal de MMR ne sont pas prouvables
sans le pool. On ne sait pas si ces deux titres occupaient déjà les deux places
nominales ou ont été ajoutés au-delà : leur présence ne prouve pas à elle seule
une régression causée par le remplissage adaptatif.

Rémi, Ashley, Veust et Gwenno ont un goût neutre enregistré, sans cohérence
déduite. Huntrill n’a ici qu’un avis de familiarité, même si un ancien run avait
un avis positif. Emile est apprécié ; Peace Flag reste sans évaluation.
Les preuves et contributions individuelles non fournies restent inconnues.

## Relations au niveau du morceau : utilisation actuelle

- Last.fm : `track.getSimilar` est déjà appelé (40 résultats), sous contrôle de
  l’identité du seed. Un deuxième cercle utilise au plus trois morceaux aux
  positions 12/20/28 en obscurité 100, avec 20 voisins chacun. Une réponse courte
  peut donc ne fournir aucun pont. Ces associations déclarées au niveau des
  morceaux diffèrent de `artist.getSimilar → artist.getTopTracks`, majoritaire
  ici selon le retour. Une chaîne artiste crédible ne mesure pas une proximité
  entre les deux enregistrements. Disponibilité effective du Dig 7 inconnue.
- Les tags recording Last.fm sont exploités ; l’enrichissement des candidats
  vise actuellement jusqu’à 60 titres sans audience. Les pistes du catalogue
  avec audience déjà connue peuvent donc manquer cette occasion d’enrichir leurs
  métadonnées morceau. Des tags artiste peuvent améliorer le niveau de preuve
  sans devenir une affinité recording affichée.
- MusicBrainz : identités, crédits, ISRC, tags et appartenance à une sortie ;
  liens URL artiste vers Discogs. Le code n’explore pas de graphe de relations
  recording-to-recording pour la recommandation. La radio utilisée est celle
  de ListenBrainz par artiste/tags, pas une similarité MusicBrainz de morceaux.
- Discogs : correspondance du titre dans une tracklist, sorties/compilations,
  labels et artistes documentés. Un lien de catalogue réel établit une provenance,
  pas une similarité sonore. Les styles de sortie sont des indices contextuels.

## Feedback et réutilisation des outils

Le feedback normal love/curious/neutral/known influence préférences de chemins
et exclusions ; il ne sépare pas complètement les trois axes demandés.
Le mode d’évaluation exporte les titres et données techniques, avec notamment
love/ok/relevant_not_for_me/off_topic/known. Les outils existants fournissent
mesures de sources, preuves, scores négatifs, scopes de métadonnées, audit de
contributions et comparaison humaine sur les mêmes titres. Leur réutilisation
évite de fabriquer une note globale pour un avis partiel.

Les `partialReviews` restent attachés à ce run et ne passent pas dans le matcher
historique de verdict global. Celui-ci rassemble des avis de plusieurs runs :
ses anciens avis sur Huntrill/Ashley ne doivent pas servir d’étiquettes du Dig 7.
Les baselines et le holdout existants restent conservés.

## Trois améliorations candidates, par priorité

| Priorité | Expérience ciblée | Impact attendu | Coût | Risque |
|---|---|---|---|---|
| 1 | Cibler une partie du budget d’enrichissement existant sur les finalistes exploratoires sans tags morceau, même avec audience connue ; mêmes endpoints et plafond | Potentiellement élevé si les tags discriminent réellement | Moyen : latence et arbitrage du budget audience | Moyen : couverture audience réduite, tags bruités |
| 2 | Sur une réponse track.getSimilar courte, choisir les ponts parmi les morceaux effectivement disponibles, avec budget inchangé et identité validée | Conditionnel : augmente les chemins recording | Faible | Faible à moyen : voisins plus évidents, filtre obscurité toujours requis |
| 3 | Dans une expérimentation Surprise, départager les exploratoires par corroboration recording disponible avant l’ordre actuel, sans poids ni quota de branche | Potentiellement moyen | Moyen | Moyen/élevé : favorise les morceaux mieux documentés et réduit la sérendipité |

Pas de modification du moteur : ce run ne démontre pas un correctif de pertinence
local sûr. La priorité 1 est une hypothèse à mesurer, pas une amélioration acquise.

## Prochaine expérience

Exporter le prochain run complet via le mode d’évaluation existant : seed exact,
mode, obscurité, commit, session, mémoire/exclusions, réponses/erreurs fournisseurs,
pool enrichi si disponible, scores et provenance. Conserver la sortie réelle du
sélecteur ; ne pas reconstruire ses raisons avec une autre formule.
Faire noter séparément goût, cohérence et familiarité pour les dix titres.
Compléter en priorité la cohérence de Dat It et As One et l’avis sur Peace Flag.

Comparer baseline et une seule variante (priorité 1) sur plusieurs seeds et
sessions à paramètres identiques. Réutiliser auditRankingDecisions et
comparePairedHumanOrdering sur les mêmes enregistrements explicitement évalués.
Mesurer couverture des tags recording, hors-sujet par tier, appréciation,
rétention des titres appréciés, nouveauté déclarée, latence/appels et taille.
Les remplaçants inconnus ne sont pas comptés comme des victoires. Les nouveaux
avis ne doivent pas entraîner le moteur avant cette comparaison. Aucun seuil
statistique ou gain de précision n’est revendiqué à partir d’un seul dig.
