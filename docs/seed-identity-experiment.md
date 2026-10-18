# Résolution multi-source — Pleine Forêt — 14 octobre 2026

**Décision : poursuivre l’expérience, ne pas intégrer automatiquement.**
Conserver les crédits MusicBrainz débloque deux chemins Discogs et deux candidats
admissibles, dont un sélectionné. Ce gain de couverture est réel, pas une preuve
de pertinence sonore. Le changement de contexte du seed modifie aussi les niveaux
de preuve et fait disparaître Dat It, apprécié par l’utilisateur.

## Comparaison des identités

Le benchmark choisit d’abord l’égalité textuelle normalisée. « Léon Phal,
Jungle Jack » est égal à « Léon Phal & Jungle Jack », pas à « Léon Phal ft
Jungle Jack ». Le matcher tolérant attribue pourtant 100 aux deux propositions.
Il s’agit du choix automatique du benchmark, pas d’une preuve du choix manuel
effectué dans le Dig 7.

| | Variante Last.fm | Variante MusicBrainz |
|---|---|---|
| ID | lastfm:2085781718 | b25ebfbd-6223-434c-93ba-e42856bebf90 |
| Titre | Pleine Forêt | Pleine forêt |
| Artiste affiché | Léon Phal, Jungle Jack | Léon Phal ft Jungle Jack |
| Crédits structurés | Absents | Léon Phal primary ; Jungle Jack featured |
| IDs artistes | Absents | Léon : 61f428e7-1721-439c-8110-186d1fdff1df ; Jungle Jack : f52ac7bf-958b-4ba2-9335-ee4cbc504227 |
| Sortie | Absente | Bodies & Ideas, 84a289eb-7f06-4f25-9757-250756385b41 |
| ISRC | Absent | Aucun retourné |
| Relations Discogs artistes | Non disponibles dans la fiche | Léon 9121828 ; Jungle Jack 13944712 et ancien crédit Jack Furaxx 10457356 |

Vérification réelle : le recording MB renvoie les deux artistes, aucun qualificatif
de remix/live, et une durée de 219 400 ms. Les deux fiches artistes concordent avec
leurs IDs ; Jungle Jack est décrit comme le rappeur français, ancien Jack Furaxx.
La piste B2 de la sortie Discogs 38593965, *Bodies & Ideas*, est « Pleine Forêt »,
durée 3:39, artiste de sortie Léon Phal, avec **Jungle Jack (3), ID 13944712,
Featuring, Lyrics By, Vocals** dans ses extraartists. Album, titre, crédits et
durée concordent. Aucun transfert d’ID n’a été effectué en production.

Cela corrobore le même morceau au niveau catalogue ; sans ISRC commun ni audio,
cela ne certifie pas une identité de master audio entre services.
Le second lien Jungle Jack est un ancien crédit explicitement indiqué dans MB,
pas une deuxième personne supposée. Aucun de ces liens artistes n’a été nécessaire
au parcours obtenu : c’est la recherche simplifiée par crédit primaire qui réussit.

## Protocole et périmètre exact

Source : `benchmark-results/discovery-2026-10-13T05-35-52-532Z.json`.
Même pool historique non-Discogs de **340 candidats**, même session, mêmes
exclusions/mémoire, obscurité 100 et mêmes fonctions réelles de fusion, scoring,
gate et sélection. Aucun accès en écriture au catalogue normal ou de benchmark.

On fait varier la résolution du seed, ses métadonnées MB disponibles et la collecte
Discogs réelle. Les audiences des nouveaux candidats sont vérifiées par les
fournisseurs existants ; les audiences historiques du pool commun sont figées.
Les crédits structurés alimentent les exclusions de participants existantes.
Les réponses réseau sont capturées et rejouables sans aucun nouvel appel.

**Ce n’est pas un nouveau run complet de recommendLive** : pas de régénération
Last.fm/ListenBrainz, ni de collecte de la sortie MB complète. Le but est d’isoler
le déblocage Discogs, avec un fond musical identique. La petite orchestration
d’audience est propre à l’essai ; elle reprend la concordance artiste/titre et les
seuils actuels, sans prétendre tester l’ordonnancement adaptatif de tous les appels
du moteur live. Pas de nouvelle source, dépendance, ni modification du moteur.

## Connexions et admissibilité

| Mesure | Last.fm | MusicBrainz |
|---|---:|---:|
| Lectures Discogs | 1 | 10 |
| Recherche primaire : résultats | 0 | 0 |
| Recherche simplifiée : résultats | Non lancée | 2 |
| Sorties confirmées | 0 | 2 (score 94) |
| Candidats Discogs générés | 0 | 2 |
| Candidats Discogs admissibles après scoring/gate | 0 | 2 |
| Candidats Discogs sélectionnés | 0 | 1 |
| Total sélectionné | 10 | 10 |

Les crédits MB permettent le repli « Léon Phal / pleine foret », qui retrouve
les sorties 38593965 et 38645634. Le parseur actuel ignore le featuring extraartists
de la piste : sa confirmation à 94 repose sur le titre et le participant Léon Phal.
L’essai vérifie donc **également le payload brut** pour confirmer Jungle Jack.
Les crédits MB des deux artistes sont conservés dans la variante expérimentale.

Chemins obtenus, tous avec fiches sources capturées :

1. Bodies & Ideas (38593965) → Heavenly Sweetness (64154) → Good Ol’ Days
   (12073621) → **Blundetto — Good Ol’ Days**.
2. Même chemin → artiste Blundetto (1062812) → Cousin Zaka (Vol. II)
   (25537519) → **Blundetto — West Highland**.

Audiences Last.fm morceau : **1 888** et **486** ; artiste : **99 648**.
Artiste/titre concordent pour les deux réponses morceau. Les deux passent les
seuils actuels (morceau <= 10 000, artiste <= 3 000 000 si connu). West Highland
est retenu ; Good Ol’ Days ne l’est pas, conformément à l’unicité artiste.
Ce sont des liens de catalogue, jamais une similarité sonore mesurée.

## Sélection et coût

Entrées : **Blundetto — West Highland** (#1), **Infinit’ — Médecine** (#9).
Sorties : **Huntrill — Gucci EN 2010**, **Blue Lab Beats — Dat It**.
Huit titres restent présents ; l’ordre change. Le moteur passe de 5 crédibles /
5 exploratoires à 10 crédibles dans ce replay : ce classement de preuve dépend
aussi du contexte du seed MB/Discogs, pas seulement de nouveaux chemins.
Il ne constitue pas une mesure de qualité d’écoute. Aucun poids n’a changé.

Branches Last.fm sélectionnées : Léon Phal **8 → 7**, Jungle Jack **2 → 2**,
plus **1 connexion Discogs**. Artistes uniques : **10 → 10** ; fournisseurs de
provenance des résultats : **1 → 2**. La branche Jungle Jack n’est pas supprimée.

**17 requêtes HTTP nouvelles au total**, toutes réussies :
3 MusicBrainz pour l’identité et ses relations ; 1 Discogs pour A ; 10 Discogs,
2 track.getInfo et 1 artist.getInfo pour B. Donc coût A = 1, B = 16 en comptant
la préparation MB. Budgets autorisés identiques, **consommation non identique** :
<= 18 lectures Discogs / 22 s par variante ; <= 60 recherches audience morceau
et <= 60 artistes. Aucun plafond dépassé ; aucun réessai réseau observé.
Le coût de la collecte historique du pool commun n’est pas inclus.

## Reproduction et validation

Script : `scripts/seed-identity-experiment.ts`.

```text
npx tsc -p tsconfig.benchmark.json
node .benchmark-build/scripts/seed-identity-experiment.js --replay
```

Fichiers locaux : `benchmark-results/seed-identity-pleine-foret-http.json`,
`-result.json` et `-replay.json` sous le même préfixe. Le mode capture refuse
un second lancement via son fichier lock. Aucun secret ni URL avec clé API n’est
enregistré. Le replay refuse toute réponse manquante et n’autorise aucun réseau.

Replay validé : mêmes IDs, scores et ordre pour A et B ; référence A reproduit
exactement les dix IDs historiques. Assertions sur les deux artistes MB, leurs
fiches, le titre, l’album et le featuring brut Discogs. 35 tests ciblés existants,
**239/239 tests complets**, TypeScript et build réussis.

## Recommandation

**Poursuivre**, sans fusion automatique ni changement du choix normal du seed.
Le gain catalogue est démontré et l’identité bibliographique est corroborée,
mais un replay partiel ne suffit pas à garantir le comportement complet : les
branches Last.fm régénérées avec « ft » pourraient différer, les audiences du
pool commun sont historiques, et Dat It disparaît malgré son retour favorable.

Prochaine étape unique : confirmer A/B par le pipeline recommendLive complet
avec captures partagées et catalogue initial identique, en conservant le featuring
Jungle Jack comme assertion. Réussite : même identité corroborée, au moins un
nouveau candidat Discogs admissible, branche Jungle Jack préservée, budgets
respectés et écoute favorable des entrants avant toute décision d’intégration.

Main intacte ; aucun push ; seules l’orchestration expérimentale et cette note
sont ajoutées. Les modifications locales antérieures sont préservées.
