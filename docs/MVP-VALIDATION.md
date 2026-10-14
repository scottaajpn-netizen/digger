# Validation du MVP — 16 septembre 2026

Branche : feature/musical-intelligence. Aucun merge dans main, aucun déploiement Vercel.

## Vérifications

- 45 tests automatisés réussis ; typecheck et build de production réussis.
- Recherche : ordre inversé, accents/ponctuation, fautes, fusion multi-source, absence de clés, indisponibilité MusicBrainz, debounce et annulation couverts par tests.
- Navigateur : sélection de Ttabla et Mes jambes au clavier ; DÜK via Last.fm sans MBID ; nouvelle exploration ↳ depuis Pulse Mineur — calabasa sans MBID.
- Recherche réelle : your no gro / your no groove duk / duk your no groove trouvent Yoru no Groove — DÜK ; mes jambe jean jass trouve une fiche Last.fm ; les saisies normales et inversées de Mes jambes trouvent MusicBrainz.
- Écran 390 × 844 : recherche et commandes utilisables, pas de débordement horizontal ; aucune erreur console observée.
- Aucun des secrets configurés retrouvé dans les onze fichiers statiques client contrôlés.

## Mesures réelles

Requêtes séquentielles sur le serveur local de production, même session, sans feedback. Même vibe à 65 %, Rabbit hole et Surprends-moi à 90 %. Les appels suivants bénéficient du cache ; ce ne sont pas des mesures comparables à froid ni des garanties de performance.

| Départ | Direction | Temps API | Cartes | Crédits artistes distincts |
|---|---|---:|---:|---:|
| Yoru no Groove — DÜK | Même vibe | 778 ms | 6 | 5 |
| DÜK | Rabbit hole | 5 ms | 6 | 5 |
| DÜK | Surprends-moi | 5 ms | 6 | 5 |
| Ttabla — Taxi Kebab | Même vibe | 7 169 ms | 9 | 8 |
| Ttabla | Rabbit hole | 360 ms | 9 | 8 |
| Ttabla | Surprends-moi | 5 ms | 9 | 8 |
| Mes jambes — JeanJass | Même vibe | 7 322 ms | 10 | 10 |
| Mes jambes | Rabbit hole | 3 063 ms | 10 | 10 |
| Mes jambes | Surprends-moi | 554 ms | 10 | 10 |

Neuf réponses HTTP 200. Recherche initiale observée entre environ 0,3 et 3,4 secondes selon source/cache. Dans le navigateur, clic → cartes : environ 929 ms pour DÜK et 818 ms pour ↳ calabasa ; 123 ms pour Ttabla avec cache chaud.

## Qualité et corrections générales

Les classements de tags génériques ramenaient des noms très prévisibles sans lien précis avec le morceau : les requêtes de découverte par tags utilisent maintenant uniquement les sous-genres reconnus. Les liens de catalogue, radio, label et compilation restent disponibles. Les pondérations musicales n’ont pas été bouleversées.

Une passe favorise les artistes encore absents avant de répéter un artiste. Les éditions radio/extended/original d’un même morceau n’occupent plus plusieurs cartes ; les remixes nommés restent distincts. Tests de non-régression ajoutés pour ces deux causes.

Ttabla ouvre notamment des chemins vers Ko Shin Moon, Soap Kills, GASBA.bpm et KasbaH. DÜK utilise les catalogues des artistes voisins ; son groupe de cinq artistes reste limité et peut se répéter entre directions. JeanJass conserve des noms connus : le faible compteur d’une fiche de collaboration Last.fm ne mesure pas la notoriété globale de son artiste.

## Limites et écoute à faire

DISCOGS_TOKEN absent lors des essais : intégration couverte par tests, mais pertinence réelle des chemins Discogs et latence avec token non validées. Les chemins MusicBrainz de label/compilation ont été exercés.

La pertinence est évaluée par provenance et métadonnées, sans écoute audio. Tester DÜK en Rabbit hole à 90 %, Ttabla à 65 puis 90 %, et Mes jambes en Surprends-moi ; utiliser « déjà connu » et « pas pour moi » pour signaler les évidences et écarts. Six ou neuf cartes fiables sont conservées au lieu de compléter artificiellement jusqu’à dix.

Le cache et la limitation MusicBrainz restent propres au processus. Une exposition publique à plusieurs instances nécessiterait une coordination des quotas ; elle est hors de cette passe locale.
