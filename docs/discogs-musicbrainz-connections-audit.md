# Audit des connexions Discogs / MusicBrainz — 13 octobre 2026

## Conclusion

Le principal blocage démontré pour Pleine Forêt se situe **avant le ranking** :
le benchmark choisit une variante Last.fm sans identifiants ni crédits structurés,
alors qu’une proposition MusicBrainz du même titre figure dans ses résultats.
Discogs reçoit le nom composé, sa recherche est vide et aucune ancre MusicBrainz
n’est disponible. Ce n’est pas un rejet de candidats Discogs par le MMR.

Mia et Qendresa montrent deux situations différentes : connexions effectivement
retrouvées, puis réduction légitime par le gate d’obscurité. Aucune modification
du moteur n’est justifiée par la seule absence de chemins visibles.

## Méthode et mesures

Audit du code guidé par Graphify ; **aucun nouvel appel fournisseur**.
Réutilisation du snapshot
`benchmark-results/discovery-2026-10-13T05-35-52-532Z.json`, mode Surprends-moi,
obscurité 100. Ce snapshot n’est pas le Dig 7 historique et ne prouve pas l’état
actuel des catalogues externes.

Les trois pools sauvegardés ont été rejoués avec les fonctions réelles
`rankDiscoveryCandidates`, `passesDeepAudienceGate`, `selectModeRecommendations`,
les profils et la mémoire sauvegardés : mêmes identifiants sélectionnés, dans
le même ordre, pour les trois cas. 40 tests existants réussis : Discogs,
identité recording/ISRC, homonymie Mia et corpus de benchmark. Aucun code modifié.

| Cas | Résolution / connexions | Discogs générés → après gate → sélectionnés | Résultat total |
|---|---|---:|---:|
| Pleine Forêt | Seed Last.fm ; aucune ancre MB ; recherche Discogs vide | 0 → 0 → 0 | 10 |
| Mia — Love Me Right | Seed Last.fm ; Discogs confirme une sortie parmi trois inspectées | 4 → 2 → 2 | 2 |
| Qendresa — Good Love | Recording MB, deux artistes MB ; deux ancres Discogs | 3 → 0 → 0 | 10 |

### Pleine Forêt : perte d’identifiants lors du choix du seed

`searchLive` conserve dans les alternatives le recording MB
`b25ebfbd-6223-434c-93ba-e42856bebf90`, « Léon Phal ft Jungle Jack — Pleine forêt ».
Le benchmark `resolveSeed` privilégie toutefois l’égalité textuelle normalisée :
« Léon Phal, Jungle Jack » correspond à « Léon Phal & Jungle Jack », contrairement
à la variante « ft ». Les deux propositions obtiennent pourtant **100** avec le
matcher tolérant existant, vérifié hors réseau.

La fiche Last.fm retenue n’a ni recording MBID, ni artist MBID, ni release ID,
ni crédits. `recommendLive` ne recherche pas à nouveau de recording MB en leur
absence. Il ne peut donc demander ni fiche artiste MB, ni sortie MB, ni radio
ListenBrainz par artist MBID. La confirmation ultérieure des deux branches
Last.fm n’alimente pas rétroactivement le job Discogs déjà lancé.

Discogs : **1 lecture logique**, zéro résultat de recherche, zéro sortie inspectée,
aucune recherche simplifiée, aucune ancre. Sans crédit primaire structuré, le
fallback reprend le même nom composé et n’est pas lancé. Le message « identité
insuffisamment confirmée » masque ici un `search-empty`, pas une contradiction.
On ne peut en déduire que le morceau n’existe pas dans Discogs.

Cette priorité textuelle est démontrée dans le **benchmark** ; elle ne prouve pas
quel résultat avait été choisi manuellement dans l’interface du Dig 7.

### Mia : résolution Discogs fonctionnelle, audience limitante

Discogs : 8 résultats de recherche, 3 sorties inspectées, 1 correspondance à 100,
13 lectures logiques. Racine : *Creatures Of The Night*, release 16436307.
Chemins : Mango Hill Records → Thee Lakesiders ; prolongement vers une autre
sortie du groupe ; contexte Boogie / US / 2020 vers DJ Spair et 40wlz.

- « Can’t Fool Me Twice » : audience morceau absente ; note Last.fm code 6,
  qui ne suffit pas à distinguer introuvable d’autres paramètres invalides.
- « Si Me Faltaras Tu » : 13 047 auditeurs, au-dessus du seuil morceau de 10 000.
- « Work Out » : 14 auditeurs ; « New Love » : 1 ; les deux passent le gate.

Les deux premiers sont éliminés **avant** la sélection finale. Le blocage du
voisinage Last.fm pour l’homonyme Mia reste une protection nécessaire, pas une
raison de réautoriser une branche douteuse. L’absence de MBID empêche les parcours
MB dans ce run ; elle ne démontre pas une absence du catalogue MusicBrainz.

### Qendresa : connexions actives mais non visibles à la fin

Recording MB `61d3aafb-ffc4-4722-8f87-6d7168aa6a80`, ISRC unique et deux crédits
structurés Qendresa / Hugo Mari. La sortie MB *Shades on, Pt. 1* fournit six
candidats, tous rejetés comme seed ou participants du seed. Le label est vide
dans le seed sauvegardé ; l’exploration MB par label est de toute façon réservée
au mode Labels.

Les deux recherches Discogs restent vides, mais les liens artistes MB → Discogs
ouvrent deux ancres, trois sorties d’ancrage et trois candidats de compilation
(15 lectures logiques). Les trois candidats — Juls & S.O.N, Alchemist,
Budgie / Novelist — n’ont aucune audience morceau validée dans le pool final :
ils sont tous exclus par le gate. Les audiences artistes ne remplacent pas une
audience morceau. Le snapshot ne conserve pas les réponses d’audience brutes :
impossible de départager absence, réponse sans compteur ou discordance de nom.

La radio **ListenBrainz**, distincte de MusicBrainz, fournit 33 candidats,
22 passent le gate et 6 sont sélectionnés. Les identifiants MB sont donc utiles
même lorsque la provenance visible est ListenBrainz et non MusicBrainz.

## Parcours réel et données exploitées

Recherche → choix du seed → recording MB si MBID → artistes/sortie MB →
Discogs et radios → fusion des candidats → audience → éligibilité/scoring →
gate strict → sélection/MMR.

| Donnée | Utilisation actuelle | Limite constatée dans le code |
|---|---|---|
| Recording MB | Titre, artist-credit, tags, sorties, ISRC unique | Pas de résolution MB additionnelle dans recommendLive sans identifiant fourni |
| Artistes MB | Crédits primary/featured, tags, pays/zone, liens URL Discogs | Trois artistes maximum ; pas de parcours des relations artistiques détaillées |
| Sorties MB | Une sortie choisie, labels, enregistrements de sa tracklist | Choix heuristique d’une seule sortie ; autres éditions/compilations non explorées |
| Labels MB | Premier label, jusqu’à six sorties | Seulement en mode Labels ; pas de discoveryPath construit par addRelease, seulement une raison textuelle |
| Labels Discogs | Liens sortie → label → sortie vérifiés dans les fiches | En mode deep, un label de départ et une sortie liée priorisés |
| Compilations Discogs | Crédits explicites des pistes, puis artiste voisin → autre sortie | Pas de recherche exhaustive de toutes les compilations contenant le seed |
| Masters Discogs | Résolution vers main_release, déduplication de certaines éditions | Pas d’exploration générale des versions du master |
| Producteurs/remixeurs Discogs | Crédits extraartists au niveau piste conservés | Aucun parcours via ces rôles ; extraartists au niveau sortie non parsés |
| Relations MB détaillées | Non demandées par les paramètres inc actuels | Producteurs, œuvres, relations recording/release ne sont pas parcourus |
| Styles/genres Discogs | Conservés sur la sortie, bonus existant de contexte de sortie | Ne sont volontairement pas transformés en tags du morceau |

Les données **déjà reçues mais sous-exploitées** incluent les crédits Discogs
de producteurs/remixeurs, les autres sorties d’un recording MB et la proposition
MB déjà trouvée pour Pleine Forêt. Les relations MB non demandées sont une
possibilité non mesurée : leur présence pour ces trois morceaux n’est pas établie.
Les crédits de collaboration identifient des participants ; ils ne prouvent pas
une similarité sonore. Il en va de même d’un label ou d’une compilation partagés.

## Identité, budgets, caches et limites du diagnostic

- Discogs vérifie artiste/titre dans la tracklist (score >= 80), distingue les
  versions et rejette plusieurs signatures d’IDs artistes concurrentes parmi
  les sorties inspectées. Cette vérification catalogue par noms/crédits ne vaut
  pas confirmation d’un recording MBID/ISRC. Trois résultats seulement sont
  inspectés par recherche ; absence de match n’est pas absence du catalogue.
- Les ancres artistes Discogs viennent des liens URL MusicBrainz, pas d’une
  recherche floue de noms. Elles ne sont utilisées que si **zéro résultat de
  recherche** : une recherche non vide mais sans match bloque ce repli. Une
  ambiguïté explicite ne doit pas être contournée.
- Discogs : 18 lectures logiques maximum, 22 secondes, espacement >= 1,1 s,
  jusqu’à deux tentatives HTTP ; cache mémoire 15 minutes / 200 entrées.
  Le compteur `calls` inclut les lectures servies par cache et ne compte pas
  séparément les réessais : ce n’est pas un compteur exact de requêtes réseau.
  Échantillonnage de deux pages au plus, sorties/artistes parcourus bornés.
- MusicBrainz/ListenBrainz : cache mémoire partagé du helper, une heure /
  300 entrées ; espacement MB de 1,1 s, attente refusée au-delà de 8 s,
  timeout réseau 8 s, trois tentatives maximum. Pas de budget global explicite
  comparable aux 18 lectures Discogs ; bornes locales et signal parent.
- Le catalogue persistant sept jours favorise la réutilisation des chemins
  Last.fm ; il n’est pas un cache persistant équivalent des parcours MB/Discogs.
  Les stockages test, benchmark et normal restent séparés.
- Audience morceau : jusqu’à 60 cibles sans audience, triées par relevance ;
  noms artiste/titre exacts normalisés exigés pour les candidats Discogs.
  Audience artiste : jusqu’à 60 références, avec éventuel repli par nom.
  Aucun budget saturé démontré pour les sept candidats Discogs de ces runs :
  tous ont été ciblés pour l’audience (4 chez Mia, 3 chez Qendresa).
- À obscurité 100 : plafond morceau 10 000 auditeurs, popularité 20, plafond
  artiste 3 000 000 si connu ; une audience morceau/popularité est requise.
- `read` Discogs transforme les exceptions en null avec une note générique.
  `search-empty` peut donc, dans d’autres runs, résulter d’un échec fournisseur.
  Le texte « morceau absent de Discogs » du repli artiste est trop catégorique.
  Les snapshots actuels ne donnent pas les réponses brutes MB/Discogs ni le
  motif exact de chaque échec d’audience : aucune conclusion plus précise sans
  instrumentation ciblée. Ce manque ne justifie pas une collecte générale.

## Trois améliorations potentielles, par priorité

| Priorité | Amélioration à évaluer, non implémentée | Impact potentiel | Coût | Risque |
|---|---|---|---|---|
| 1 | Réconcilier les propositions de seed déjà trouvées : ne pas perdre les identifiants/crédits MB sur une simple variante de collaboration ; confirmation explicite avant tout transfert | Élevé pour Pleine Forêt, débloque plusieurs chemins à la fois | Faible à moyen | Moyen : homonymes, mauvaises versions ; pas de préférence MB aveugle |
| 2 | Diagnostic par étape réelle : vide/erreur/timeout/ambiguïté et audience absente/discordante, cache hits et appels réseau | Élevé pour décider correctement, nul garanti sur la pertinence | Faible | Faible : instrumentation seulement, pas de second pipeline |
| 3 | Petit parcours catalogue par producteur/remixeur explicitement crédité, en réutilisant les IDs Discogs déjà reçus | Potentiellement utile, non démontré sur ce corpus | Moyen | Moyen : rôle ou portée de crédit mal interprétés, coût d’audience supplémentaire |

## Une seule prochaine expérience recommandée

**A/B hors production de la résolution du seed Pleine Forêt**, entre la fiche
Last.fm actuelle et la proposition MB déjà identifiée. Vérifier d’abord le
recording, ses deux artistes crédités et sa version ; ne transférer aucun ID
si ambiguïté. Mia et Qendresa servent de témoins de non-régression.

Rejouer les réponses communes depuis des captures, instrumenter les véritables
étapes, garder les budgets actuels (18 lectures Discogs / 22 s, audience <= 60),
la même session, la même obscurité et le même sélecteur. Pas d’expérience
simultanée sur producteurs, ni changement de poids.

Critères de réussite : (1) les deux participants sont conservés sans conflit
d’identité ; (2) au moins un chemin MB/Discogs vérifiable est obtenu, contre
zéro actuellement ; (3) mesurer séparément générés, audience validée, après gate
et sélectionnés, ainsi que les vrais appels/cache hits ; (4) aucune régression
des gardes Mia/remix/ISRC et aucune modification des résultats témoins à réponses
identiques. Un chemin supplémentaire ne prouve pas une meilleure pertinence :
ne poursuivre vers l’écoute que si au moins un nouveau candidat passe les gardes.

## Points de code relus

- `scripts/discovery-benchmark.ts` : resolveSeed.
- `src/lib/providers/live.ts` : searchLive, fromRecording, recommendLive,
  addRelease et étapes audience/ranking/gate.
- `src/lib/providers/discogs.ts` : parseDiscogsRelease, discogsSeedMatchScore,
  discoverDiscogs.
- `src/lib/providers/discogs-http.ts`, `http.ts` : caches et budgets HTTP.
- `src/lib/discovery/recording-identity.ts`, `ranking.ts`, `scoring.ts`,
  `catalogue.ts` : identité, filtre d’audience, score de contexte, persistance.

Branche conservée : feature/musical-intelligence. Main intacte, modifications
locales préservées, aucun push. Seul ce rapport est ajouté pendant l’audit.
