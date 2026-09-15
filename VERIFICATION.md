# Vérification du MVP

Vérifié le 14 septembre 2026, sur Windows avec Node.js 24.

- Build Next.js de production : réussi, y compris vérification TypeScript.
- Quatre tests du moteur : réussis (10 résultats uniques, directions, curseur, exclusion, fallback, feedback et épuisement).
- API HTTP : dix recommandations pour une requête valide ; HTTP 400 pour objet vide, null et JSON invalide.
- Navigateur : dix cartes affichées, recherche Bonobo, direction Labels et curseur 100 appliqués, coup de cœur retrouvé dans Ma collection après rechargement.
- Un morceau « déjà connu » est absent de l’exploration suivante.
- Recherche inconnue : fallback Taxi Kebab expliqué dans l’interface.
- Console navigateur : aucune erreur observée.
- Affichage ordinateur et mobile vérifié visuellement ; aucun débordement horizontal à 390 px.

L’outil agent-browser n’était pas installé ; les contrôles visuels et interactions ont été effectués dans le navigateur intégré de Codex. Le sandbox de cette session interdit les sous-processus : le build a utilisé `DIGGER_SANDBOX=1` pour activer les workers par threads et la vérification TypeScript par API. Hors sandbox, les commandes du projet utilisent les réglages Next.js standards. Le double-clic Windows et le déploiement Vercel restent à tester hors de cette session ; aucun déploiement n’a été effectué.

## Reprise v0.3 — 15 septembre 2026

- `pnpm install --frozen-lockfile` : réussi, lockfile conservé.
- `pnpm test` : 18 tests réussis. Le premier passage révélait un échec du test
  second-circle : le sélecteur trie désormais explicitement par score.
- `pnpm typecheck` et `pnpm build` : réussis (Next.js 16.3.5).
- Régression API simulée : obscurité 100 / Surprends-moi, trois sessions ;
  un candidat à 500 auditeurs conservé, candidats à 500 000 écartés,
  pas de sous-genre attribué par héritage du morceau de départ.
- À partir de 90 : audience vérifiée requise ; à 95–100 : maximum 10 000
  auditeurs Last.fm et/ou percentile LB <= 20. Un signal connu trop élevé
  exclut le candidat même si l'autre signal est bas. Ce sont des seuils produit.
- Enrichissement déplacé après assemblage des sources, jusqu'à 60 candidats,
  six appels simultanés maximum. Les inconnus sont exclus en mode strict.
- Taxonomie enrichie et alias testés ; genres inconnus non inventés.
- Discogs : contrat interne et plan dans docs/DISCOGS.md, intégration inactive.
- Limite : aucune clé Last.fm dans cet environnement ; validation musicale réelle
  et latence avec les services externes restent à mesurer sur la configuration
  de l'utilisateur. Le nombre d'auditeurs concerne la piste, pas tout l'artiste.
