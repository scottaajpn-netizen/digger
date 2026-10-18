# Discogs dans Digger v0.3

## Activation locale

Dans `.env.local`, ajouter `DISCOGS_TOKEN=...`, puis redémarrer Digger.
Créer un jeton personnel dans https://www.discogs.com/settings/developers.
Ne pas coller le jeton dans une conversation, un commit ou une variable
`NEXT_PUBLIC_*`. `DISCOGS_USER_AGENT` est optionnel ; une identification Digger
avec l'URL du projet est fournie par défaut. La clé Last.fm reste indépendante.

Sans token Discogs, aucun appel Discogs n'est effectué. Sans clé Last.fm,
les candidats Discogs sans autre mesure d'audience sont exclus à obscurité >= 90.

## Chemins réellement activés

| Chemin vérifié | Modes et origine |
| --- | --- |
| Morceau → sortie → label identifié → autre sortie → piste créditée | Tous les modes ; priorité dans Labels ; `discogs-label` |
| Morceau → compilation/sortie partagée → piste d'un autre artiste | Tous les modes ; `discogs-compilation` |
| Compilation → autre artiste crédité → autre sortie principale → piste de cet artiste | Rabbit hole et Surprends-moi à partir de 80 ; `discogs-deep` |
| Sortie → label → autre sortie → artiste crédité → autre sortie principale | Même activation profonde, si aucune compilation confirmée ; `discogs-deep` |
| Sortie → style + pays d'édition + année → autre sortie vérifiée | Même scène et exploration profonde ; `discogs-scene` |

Les origines profondes reçoivent un bonus dans Rabbit hole et Surprends-moi.
Le hasard et ces bonus ne contournent jamais le filtre strict d'audience.
Le pays, le style et l'année établissent un voisinage éditorial, pas une scène
culturelle certifiée. Une carte garde tous les nœuds, URL, identifiants et
informations d'édition dans `discogs`, et montre le chemin et la source.

## Identité et qualité des données

- Recherche `database/search` avec artiste + titre de piste, type release.
  Inspection d'au plus trois sorties ; titre complet/version et crédit artiste
  doivent correspondre. L'album connu aide à choisir une édition.
- Plusieurs identifiants d'artiste correspondants : abstention. Les aliases,
  collaborations complexes et homonymes non visibles dans ce petit échantillon
  nécessitent encore une résolution plus fine.
- Les listes de sorties d'artiste peuvent contenir des masters. Leur
  `main_release` est résolu vers une édition ; les deux IDs restent séparés.
- Une entrée de catalogue doit porter réellement l'ID du label recherché.
  `Not On Label` n'est pas traité comme un label partagé.
- Pistes avec crédits explicites, ou artiste unique d'une sortie non compilée
  et non mixée. Ni Various Artists, ni curator de DJ mix, ni titre de face
  ne deviennent un artiste ou une piste inventés.
- Les genres/styles, pays, année, labels et numéros de catalogue d'édition
  restent dans les preuves Discogs. Les styles contribuent modestement au
  score éditorial, davantage réduits pour les compilations ; ils ne deviennent
  pas des genres vérifiés de la piste.
- Fusion par artiste/titre exacts avec les candidats existants : conservation
  des tags, pays, année et identifiants du candidat MusicBrainz/ListenBrainz,
  ajout des preuves Discogs et conservation des IDs d'exclusion.
  Pas de recherche MusicBrainz supplémentaire par candidat ; « Explorer »
  relance la résolution MusicBrainz si aucun MBID n'est disponible.
- Maximum trois pistes d'un même label après assouplissement, y compris
  co-labels ; artistes/crédits également plafonnés. Cela peut donner moins
  de dix pistes, même dans Labels.

## Obscurité

Discogs ne fournit pas ici de mesure d'audience utilisée pour classer une piste.
`discogs.audience = "unknown"` et `obscurityKnown = false` le rendent explicite.
Le champ numérique historique `obscurity = 50` est une valeur neutre interne,
jamais présentée comme une mesure Discogs. Ni l'âge, ni l'absence de métadonnées,
ni les collections/wantlists ne sont convertis en rareté ou en auditeurs.

À partir de 75, les candidats peuvent recevoir les auditeurs Last.fm ; pour
Discogs, artiste et titre retournés doivent correspondre, sans autocorrection.
À 90+, le filtre commun requiert une audience Last.fm ou un percentile
ListenBrainz connu. À 95–100 : au plus 10 000 auditeurs Last.fm et/ou percentile
LB <= 20, sans signal contradictoire trop élevé. L'audience du morceau ne
certifie pas la faible notoriété de son artiste.

## Appels, cache et dégradation

- Graph démarré en parallèle des autres fournisseurs : plafond 18 lectures
  logiques et 22 secondes, 5 secondes par appel HTTP, une reprise maximum.
- Pagination : première page + une page variable, parmi au plus 100 pages ;
  tirage déterministe selon la session. Aucun tri « most collected/wanted ».
- Client partagé dans le processus Node : appels sérialisés, espacement minimal
  1,1 s, ajustement via `X-Discogs-Ratelimit`, pause si quota épuisé, respect de
  `Retry-After` (secondes ou date). Une attente trop longue rend la branche
  indisponible au lieu de bloquer toute l'exploration.
- Cache de 200 réponses maximum, durée 15 minutes, séparé par empreinte du
  token. Aucun secret dans l'URL, les messages d'erreur ou le cache en clair.
- Les branches en échec n'annulent pas les candidats déjà obtenus. Les autres
  fournisseurs fonctionnent sans Discogs ; les notes signalent les limites.
- Pour plusieurs instances, il faut un limiteur partagé externe : le limiteur
  mémoire actuel ne coordonne que ce processus. L'enrichissement Last.fm a son
  budget existant ; la latence totale doit être mesurée avec les vraies clés.

## Références et vérification

Consultées le 15 septembre 2026 :
- Documentation officielle : https://www.discogs.com/developers (403 ici).
- Documentation d'authentification du client officiel :
  https://github.com/discogs/discogs_client/blob/master/docs/authentication.md
- Modèles release/master/label/artist du client officiel :
  https://github.com/discogs/discogs_client/blob/master/discogs_client/models.py
- Exemple public lu : https://api.discogs.com/releases/249504 ; parsing réussi,
  master et pistes reconnus ; en-têtes de débit présents (25 sans auth lors
  de cet essai). Ce test ne valide pas l'authentification ni le quota avec token.

Tests : graphe, credits, homonymes/remix, styles d'édition, diversité/co-labels,
masters, pagination, absence de configuration, pannes partielles, 429, reprise,
cache, annulation et sélection live avec réponses simulées.

Limites : recherche authentifiée et pertinence à l'écoute à valider avec les
clés locales. Pas encore de parcours « label fréquent de l'artiste de départ »,
ni de réseaux de crédits producteurs/remixeurs, ni de navigation parent/sous-
labels. L'échantillonnage est borné et ne couvre pas tout le catalogue Discogs.
