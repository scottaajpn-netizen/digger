# Préparation Discogs — Digger v0.3

État : contrat TypeScript disponible dans `src/lib/providers/discogs.ts`.
Aucun appel Discogs ni branchement au classement n'est actif.

## Parcours prévu

1. Résoudre artiste + titre vers une édition. Vérifier artiste, titre, version,
   année et identifiants ; ne pas accepter automatiquement le premier résultat.
2. Conserver les identifiants d'édition et de master séparément. Dédupliquer les
   rééditions sans confondre remix, version live et original.
3. Explorer les labels par identifiant, les autres artistes des compilations et
   les crédits partagés. Chaque connexion conserve son chemin et ses sources.
4. Présenter une scène comme hypothèse étayée par plusieurs connexions. Un pays
   de publication seul ne prouve ni l'origine de l'artiste ni une scène musicale.
5. Réconcilier les pistes avec les identités MusicBrainz/Last.fm avant de les
   ajouter au moteur. Un label partagé ne dispense pas du filtre d'audience.

## Contraintes d'implémentation

- Adaptateur côté serveur, secret hors du navigateur et du dépôt.
- Avant activation : vérifier la documentation officielle Discogs, les conditions
  d'utilisation, les modalités d'authentification et les limites en vigueur.
- Pagination et nombre d'expansions bornés ; cache, limiteur partagé et gestion
  des 429/Retry-After ; annulation compatible avec le budget de la requête.
- Conserver URL source, date de collecte et granularité des métadonnées.
- Les genres/styles d'une compilation ne sont pas les genres de chaque piste.
- Les quantités en collection/wantlist ne sont pas des auditeurs Last.fm et ne
  doivent pas être converties artificiellement dans la même échelle.
- Activation optionnelle ; panne ou absence de clé sans panne des autres sources.

## Vérifications avant activation

Fixtures pour homonymes, Various Artists, remix, réédition, compilation multi-
artistes, label homonyme, métadonnées absentes, pagination, 429 et annulation.
Puis essai réel sur quelques morceaux connus avec inspection des chemins proposés.
