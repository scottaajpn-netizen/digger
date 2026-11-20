# Sukotto Crate Digger — cadrage V0.1 (20 novembre 2026)

> Objectif : allumer la MPC, ouvrir un instrument « Crate Digger », écouter une pépite choisie au hasard, passer à la suivante. Pas de recherche textuelle ni d'artiste de départ.

## Expérience cible

1. Ouvrir le plugin sur MPC One Gen 1 (MPC OS 3.10.1+, Ethernet).
2. Retrouver les derniers filtres et lancer automatiquement une sélection.
3. Écouter un titre et utiliser **NEXT**, **LIKE**, **BACK**, **SURPRISE** ; pas de recherche textuelle.
4. Si la source le permet, envoyer le flux au sampler MPC ; ne pas promettre de téléchargement depuis toutes les plateformes.
5. Ne pas représenter un disque comme « jouable » tant qu'une URL audio autorisée et vérifiée n'est pas disponible.

### Filtres

| Filtre | V1 métadonnées | Limites |
|---|---|---|
| Genre / style | Oui, Discogs | Tags manquants ou très larges |
| Intervalle d'années | Oui | Année d'édition != année d'enregistrement |
| Pays | Oui | Pays de sortie != nationalité |
| Instrument | Plus tard | Crédits incomplets : jamais inventer |
| Nombre maximum de vues | Plus tard | Statistique d'une vidéo, pas d'un morceau |
| Surprise totale | Oui | Ne tient pas compte des filtres, respecte les exclusions |

## Architecture proposée

- **Moteur de sélection**, indépendant du matériel, avec aléatoire reproductible, déduplication (master Discogs puis artiste+titre), exclusions et diversité.
- **API Digger** : récupération de sorties Discogs avec année/genre/style/pays, échantillonnage de pages pour éviter de toujours piocher parmi les premiers résultats. Le service ne renvoie d'abord **que des métadonnées**, jamais de faux extrait audio.
- **Lecteur** : deuxième étape, exclusivement avec une source/licence autorisant l'écoute intégrée. Éviter toute dépendance critique à une extraction non officielle de YouTube.
- **Plugin MPC** : interface en instrument VST2 via le SDK Akai, cible ARMv7 (MPC One Gen1). La connexion Ethernet passe par la MPC, pas par le PC.
- **Historique et favoris** : persistance sur support externe à prévoir, pas dans la mémoire interne système.

## Critères de qualité

- Les titres proposés sont issus d'une source identifiée.
- Ne jamais inventer des tags instrumentaux, des vues ou un signal « rareté ».
- Si « vue max » ou instrument est activé sans données disponibles, le dire ou refuser proprement ; ne pas ignorer le filtre.
- Maximum un même artiste dans le premier tour si le corpus le permet.
- Dédupliquer les éditions d'une même œuvre et écarter l'historique transmis.
- Limiter l'utilisation des API publiques (timeouts, cache, plafonds de pages).
- Pas d'installation sur la MPC tant que le binaire ARMv7 n'a pas été compilé et testé.

## Découpage

- **V0.1 — maintenant** : sélection, endpoint de métadonnées Discogs, tests unitaires, documentation.
- **V0.2 — ensuite** : favoris/historique persistants, audit des sources audio et test d'écoute légal, validation de la disponibilité.
- **V0.3 — ce week-end** : projet plugin MPC minimal, Q-Links, essais Gen1 avec sauvegardes préalables.
- **V1** : préchargement du prochain titre, boutons NEXT/BACK/LIKE/SURPRISE, navigation rapide, passage au sampling si autorisé.

## Références

- Base communautaire : https://github.com/sd88me/mpc-vst-cratedigger — licence MIT (conserver l'attribution si du code est repris).
- SDK : https://github.com/inmusic-software/mpc-plugin-builder-sdk — MPC OS 3.10.1+, Gen1 compatible.
- Discogs API : https://www.discogs.com/developers/
- YouTube API statistiques (phase future) : https://developers.google.com/youtube/v3/docs/videos/list

> Cette branche reste séparée de `main`. Aucun logiciel n'est nécessaire sur le PC du boulot et rien n'est installé sur la MPC.


## Avancement V0.1 — interface et tests

- Interface provisoire disponible sur `/crate` après démarrage/déploiement du projet Next.js.
- Boutons « Nouvelle exploration », « Suivant », « Précédent », « Surprise totale » ; favoris et filtres dans le navigateur.
- Le moteur actuel **ne lit pas d'audio** et **n'est pas un plugin MPC** : il affiche des métadonnées réelles Discogs.
- La recherche dans la base de Discogs requiert l'authentification. Définir `DISCOGS_TOKEN` **uniquement dans les variables d'environnement serveur** (par ex. dans une variable protégée côté hébergeur). Ne pas placer la valeur dans GitHub, dans `NEXT_PUBLIC_*`, dans l'URL ou dans le navigateur.
- Les essais audio restent séparés : étudier un accès au flux respectant les permissions de la source et ne jamais présenter une vidéo comme un fichier audio libre.
- Le déclenchement des tests sur GitHub Actions est dans `.github/workflows/crate-ci.yml`. Vérifier le dernier résultat dans l'onglet Actions avant toute fusion.

### Test d'API (après configuration)

`GET /api/crate?genre=Jazz&from=1965&to=1985&count=8`

`GET /api/crate?surprise=1&count=8`

L'API renvoie `mode: "metadata-only"` et `playable: false`. Tant que le jeton est absent, elle renvoie une erreur de configuration, jamais de résultats inventés.

### Risques techniques à vérifier

- La qualité de l'échantillon aléatoire : sélection de plusieurs pages Discogs dans une plage limitée ; pas encore un aléatoire uniforme à l'échelle entière de la base.
- Les crédits de **l'instrument** et les **vues** exigent un enrichissement fiable et une politique explicite pour les valeurs manquantes.
- Favoris aujourd'hui dans `localStorage` (navigateur PC), pas encore synchronisés avec la MPC.
- Pas de préchargement audio ni de tests MPC One Gen 1 à ce stade.


## Exigence prioritaire : qualité des morceaux proposés (retour utilisateur du 20/11/2026)

Deux résultats à écarter en priorité :
1. **Musiques manifestement générées par IA** — uploads mentionnant `AI generated`, `Suno`, `Udio`, `AI music`, `AI cover` ; ne jamais confondre filtrage de labels avec détection fiable de l'origine audio.
2. **Compilations / longs mixes** — vidéos « full album », « best of », « DJ set », « compilation » et fichiers de 40 minutes : l'utilisateur veut un **morceau individuel**, pas un album de 40 minutes.

### Règles proposées pour l'étape d'écoute

- **Durée par défaut : 1:00 à 10:00** par morceau ; possibilité de relever la limite à 12 minutes pour des pièces longues (jazz, psyché, ambient). Une vidéo sans durée connue n'est pas présentée comme « vérifiée ».
- Refuser les compilations identifiées par leur titre, même si elles sont courtes ; ne pas exclure automatiquement les titres « remix » ou « extended mix », qui sont souvent des morceaux individuels.
- Rejeter les vidéos déclarées IA dans leur titre, description ou chaîne connue, en sachant que **l'absence de mention ne prouve pas que la musique soit humaine**. Ne pas écarter « Aïcha » ou des titres contenant naturellement la suite de lettres « ai ».
- Contrôler le nombre de vues **sur l'upload réellement sélectionné**, pas seulement sur la fiche Discogs.
- Préserver ces exclusions en mode **Surprise totale** ; celui-ci neutralise uniquement les préférences musicales (genre, pays, années).
- Enrichir un résultat Discogs **release/album** vers un **titre précis** avant de chercher un enregistrement. Une fiche Discogs n'est pas une preuve d'écoute disponible et une compilation peut être utile pour identifier un morceau individuel à proposer.
- Prévoir une commande **« Pas intéressant / Ne plus proposer »**, avec une raison facultative : IA suspectée, compilation, pas un morceau, mauvaise correspondance audio. Cela améliorera les règles sans inventer une détection parfaite.

### Implémentation déjà ajoutée

- `src/lib/crate/audio-quality.ts` : filtre pur des candidats audio avec durée, titres de compilations, déclarations IA, éventuel nombre de vues.
- `tests/crate-audio-quality.test.ts` : scénarios sur de vrais morceaux, contenus déclarés IA, compilations de 40 minutes, durée manquante et extensions jazz.

**Important : cette étape n'est PAS encore branchée à un résolveur audio en production.** La V0.1 sur `/crate` ne montre encore que des fiches Discogs et ne connaît pas la durée des vidéos. Il ne faut donc pas prétendre que le filtrage IA/durée fonctionne déjà pour les propositions affichées.
