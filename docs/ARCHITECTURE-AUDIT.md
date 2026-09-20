# Audit court et progression proposée

## Constat

`src/lib/providers/live.ts` concentre l’identité du morceau, les appels externes, les chemins de découverte, les enrichissements d’audience, les exclusions, la fusion et le classement. Les tests existants donnent un filet de sécurité, mais changer une stratégie de recherche oblige encore à comprendre l’ensemble du pipeline. Une API supplémentaire n’améliore pas automatiquement les recommandations : elle doit apporter des candidats pertinents et une provenance vérifiable.

La panne Soulseek venait du cycle de vie d’une recherche asynchrone, pas d’un manque de providers. Les délais empilés et les fallbacks rendaient une attente normale impossible à distinguer d’une absence de résultat.

## Garder

Les identités multi-source, les crédits structurés, les preuves Discogs, les exclusions utilisateur, les limites réseau et les tests de non-régression. Conserver slskd comme propriétaire des transferts, le watcher comme propriétaire du classement et Navidrome comme propriétaire de l’index de bibliothèque. Digger déclenche et affiche ; il ne déplace pas la musique.

## Retirer ou éviter

Les attentes fixes suivies d’une suppression de recherche, les messages « aucun résultat » avant un état terminal, les suppositions sur les unités d’un service, les classements de genres génériques pris pour des liens musicaux, et les reprises de transfert aveugles après une réponse ambiguë. Ne pas réappliquer automatiquement le stash de mémoire expérimentale.

## Séparation progressive

1. **Soulseek, réalisé ici** : transport et erreurs dans client.ts ; normalisation déterministe dans results.ts ; routes courtes pour créer, lire, annuler, télécharger. Aucun ajout dans live.ts.
2. **Classement, prochaine extraction** : déplacer les fonctions pures de fusion/diversité/audience dans un module de ranking sans changer les coefficients. Comparer les sorties sur fixtures avant/après.
3. **Génération de candidats** : un adaptateur par source retourne candidats, chemin, avertissements et durée. L’orchestrateur possède un budget global, la concurrence et les conditions d’élargissement ; les providers ne décident pas du classement final.
4. **Identité et collaborations** : privilégier les crédits structurés, vérifier les hypothèses de noms, conserver plusieurs participants. Ne pas découper tous les groupes contenant « & ». Les sources artistiques ne deviennent pas automatiquement des caractéristiques du morceau.
5. **Catalogue et mémoire** : stocker identités et liens datés avec provenance, séparément du profil utilisateur et du cache HTTP. Inspecter le stash avant toute reprise, tester péremption, corruption et erreurs disque. Pas de graphe permanent constitué uniquement de réponses non vérifiées.
6. **Bibliothèque locale** : adaptateur Navidrome en lecture pour détecter ce qui est déjà possédé, puis suivi slskd des transferts par identifiant. Lancer un téléchargement seulement sur un choix explicite. Une wishlist ultérieure devra avoir états, déduplication et limites de relance.

La refonte de live.ts est différée : elle ne corrige pas la panne Soulseek et rendrait sa validation moins lisible. La séparation du transport et du parsing Soulseek apporte déjà une frontière testable sans déplacer le moteur musical.

## Mesurer le digging

Utiliser un jeu d’environ trente morceaux variés, dont des nouveautés et collaborations. Mesurer couverture de recherche, latence, diversité des artistes, répétitions, pistes déjà connues et taux de morceaux conservés après écoute. Comparer une version à la précédente sur les mêmes seeds. La rareté doit rester un signal parmi d’autres ; une fiche Last.fm peu écoutée peut être une simple variante de crédit d’un artiste connu.

## Prochaines étapes courtes

- Faire choisir un téléchargement réel par l’utilisateur ; vérifier réception dans 00_INBOX puis traitement existant et indexation Navidrome.
- Extraire le ranking pur avec résultat identique et tests complets.
- Corriger les collaborations et les recherches pauvres sur un corpus, avant d’ajouter un provider.
- Introduire seulement ensuite une mémoire persistante, avec un gain mesuré de couverture et de latence.
