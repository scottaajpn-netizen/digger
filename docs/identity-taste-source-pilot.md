# Identité, mémoire musicale et essai YouTube Music — 14 novembre 2026

## Version et périmètre

Base récupérée : `improvement/discovery-quality-20-seeds`, commit `8982b44`.
Travail : `improvement/identity-taste-source-pilot`. Aucun changement de main.
Le commit RC1 `40011d6` et `docs/RC1.md` ne figurent pas dans l'historique
récupéré. La version Windows et les données privées de l'utilisateur ne sont
pas accessibles ici : ne pas remplacer cette copie locale à l'aveugle.

## Changements utilisables dans cette branche

- La recherche rapproche les variantes d'une collaboration lorsque le titre
  complet correspond, que tous les participants structurés sont présents et
  qu'un seul recording MusicBrainz compatible est déjà disponible. Aucun appel
  supplémentaire. Les remixes, albums contradictoires, crédits incomplets et
  IDs contradictoires ne sont pas fusionnés. Un nom court comme Mia exige une
  corroboration supplémentaire. Les recordings concurrents restent distincts.
- Les avis enregistrent des caractéristiques bornées : IDs artistes, tags
  explicitement rattachés à l'enregistrement, IDs de labels Discogs. Les tags
  d'album/artiste et le texte d'affichage « scène » ne deviennent pas des
  caractéristiques sonores du morceau.
- Le profil musical est reconstruit depuis les avis persistants et l'import
  existant. Son ajustement apparaît dans `scoreBreakdown.taste`, borné entre
  −6 et +8. C'est une hypothèse de classement, pas un gain d'écoute démontré.
- Les imports AUTO de confiance ≥90 apportent un faible signal d'artiste par
  nom exact, sans transférer d'identité. Les doublons de titres ne l'amplifient
  pas. Les noms courts sont exclus de ce signal ; les labels inconnus ne sont
  pas inventés. Les catégories de playlists restent un signal faible.
- Un CSV contenant les colonnes obligatoires reste importable même sans les
  colonnes facultatives comme `sources` (auparavant, une valeur absente faisait
  échouer le découpage de cette colonne).
- Les avis « À sampler » étaient omis lors de la relecture du fichier mémoire.
  Ils survivent désormais aux relectures et peuvent être remplacés ou retirés
  sans ajouter de nouveaux compteurs fantômes.
- Dans le nouveau profil, curiosité, sampling et « connu » ne sont pas des
  likes. Les pondérations historiques de chemins (curiosité/sampling) et les
  signaux temporaires du pool restent distincts et inchangés.

Les anciens avis sans caractéristiques restent lisibles et conservent leur
effet historique sur les chemins. Aucun enrichissement rétroactif n'est inventé.
Pour apprendre les nouvelles caractéristiques, noter de nouvelles propositions
ou renouveler un avis. Les anciens compteurs déjà orphelins ne sont pas réparés
automatiquement : leur historique complet peut avoir été perdu.

## Essai de source réellement exécuté

Script optionnel `scripts/youtube-source-pilot.py`, dépendance `ytmusicapi==1.12.3`.
Recherche publique, sans compte, cookies personnels ni clé YouTube. Lecture
uniquement ; aucune lecture audio, écriture de playlist ou synchronisation de likes.
La bibliothèque encapsule des interfaces non officielles : ce n'est pas un
remplacement garanti ni une API approuvée par Google.

| Départ | Observation du test réel | Décision automatique |
|---|---|---|
| Pleine Forêt | Timeout initial, puis titre et les deux artistes retrouvés ; album renvoyé : Bodies & Ideas | Correspondance de métadonnées à examiner ; 19 voisins de radio conservés pour étude |
| Mia — Love Me Right | Fiche trouvée ; album renvoyé « Creatures of the Night/Love Me Right » | Le titre d'album diffère du témoin : pas de radio automatique |
| Junior Jazz — Rekere Ke Rekere | Fiche trouvée avec Junior Jazz **et Ben Produces** | Crédit supplémentaire : pas de fusion ou radio automatique |
| Avenoir — AFTER HOURS | Titre et artiste concordants | Correspondance de métadonnées à examiner ; 19 voisins de radio conservés pour étude |
| Rebe — Ramito de violetas | Fiche trouvée, album disponible | Nom court sans album témoin : pas de radio automatique |

Le premier passage a utilisé 7 appels HTTP via la session instrumentée. Après
le timeout, un second passage a réutilisé les caches et réussi Pleine Forêt.
Le rejeu hors ligne a utilisé **0 requête** et retrouvé les cinq recherches et
les deux radios en cache. Le fournisseur a renvoyé plus que la limite demandée :
le script conserve au plus 20 lignes par réponse (19 voisins après retrait du seed).

Les radios contiennent aussi des vidéos, chaînes et titres du même artiste.
Ces 38 propositions ne sont **ni 38 découvertes nouvelles ni 38 titres appréciés**.
Pas de comparaison au pool Digger : les clés Last.fm/Discogs et le catalogue privé
ne sont pas configurés dans cet environnement. La valeur incrémentale reste inconnue.
La baseline historique de 34,8 % d'appréciation n'est donc pas révisée.

## Exécution locale

Depuis le dépôt, avec Python disponible :

```powershell
python -m pip install -r scripts/requirements-youtube-pilot.txt
python scripts/youtube-source-pilot.py --radio
python scripts/youtube-source-pilot.py --offline --radio
```

Les rapports et caches sont dans `.digger/youtube-source-pilot/`, exclus de Git.
`latest.json` / `latest.md` présentent le dernier passage ; les nouveaux passages
JSON sont aussi archivés. Cache 7 jours, 16 appels maximum par exécution,
délai réseau 8 secondes et budget temporel de 100 secondes. Pas de boucle de
reconnexion. Les erreurs ne sont pas mises en cache comme des absences de musique.
Seules les métadonnées publiques retenues sont sauvegardées, jamais les jetons
de feedback ou les URL de lecture renvoyés par la bibliothèque.

Sources de l'intégration : documentation primaire du projet ytmusicapi,
https://ytmusicapi.readthedocs.io/en/stable/reference/search.html et méthode
`get_watch_playlist` du module `mixins/watch.py` de la version installée.

## Vérifications et suite

- Base : 246 tests Node réussis avant modification.
- Après changements : 253 tests Node et 3 tests Python hors ligne réussis.
- Régressions : collaboration, versions/IDs concurrents, homonymes, mémoire
  persistante, réordonnancement sur pool identique, retrait d'avis, sampling,
  import AUTO/confiance/doublons, cache hors ligne et échecs fournisseur.
- Contrôle TypeScript et compilation de production.
- Génération du rapport HOLDOUT existant réussie (relecture des données
  historiques, pas une nouvelle mesure de qualité musicale).
- Test HTTP de production : page d'accueil, sauvegarde des caractéristiques,
  exclusion des tags de sortie, remplacement et retrait d'un avis sampling.
- Graphify absent de cet environnement ; `graphify update .` indisponible.
  Le graphe local Windows n'a pas été modifié.

Avant de fusionner avec la copie Windows : relever `git status --short`,
`git branch --show-current` et `git log -1 --oneline`. Si RC1 est présente
localement, comparer les deux versions et intégrer les corrections utiles,
plutôt que remplacer son profil par celui de cette branche.

Prochaine mesure : capturer un pool Digger avec les clés locales, vérifier les
fiches YouTube ambiguës, mesurer les nouveaux candidats vérifiables, puis noter
les seuls entrants intéressants. Garder appréciation, pertinence et nouveauté
séparées ; compter aussi leur intersection « inconnu ET apprécié ».
