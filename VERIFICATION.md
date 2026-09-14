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
