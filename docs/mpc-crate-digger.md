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
