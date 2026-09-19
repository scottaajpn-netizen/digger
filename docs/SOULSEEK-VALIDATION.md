# Digger / slskd : diagnostic et validation, 16 septembre 2026

## Cause vérifiée

slskd local 0.26.0.0 répond et est connecté. Sur une recherche You Man Birdcage, les compteurs annoncent 70 fichiers à 5 secondes puis 71 à 15 secondes, mais `responses` reste vide pendant la recherche. À environ 25 secondes, la recherche est `Completed, TimedOut`, `isComplete: true`, et 34 réponses deviennent accessibles.

L’ancienne route attendait 12 secondes puis supprimait la recherche ; le navigateur abandonnait au bout de 15 secondes. Un résultat en cours était donc présenté comme un résultat vide. Le JSON n’était pas imbriqué autrement : il fallait attendre sa disponibilité.

La documentation master de SearchRequest décrit un délai en secondes, mais la version locale termine en 26 ms avec `searchTimeout: 10`. Ne pas appliquer aveuglément la documentation d’une autre version : le réglage est désormais omis pour utiliser le défaut natif de slskd. Le budget du navigateur, indépendant, est de 60 secondes.

## Contrat observé

- POST `/api/v0/searches` : HTTP 200, objet avec id, state, isComplete, compteurs, responses.
- GET `/searches/{id}` : état et compteurs ; responses vide par défaut.
- GET `/searches/{id}?includeResponses=true` : même objet, réponses disponibles après finalisation.
- GET `/searches/{id}/responses` : tableau des mêmes réponses, sans avantage de disponibilité pendant la recherche.
- Une réponse porte username, hasFreeUploadSlot, uploadSpeed (octets/seconde), queueLength et files.
- Un fichier porte filename, size (octets), extension, bitRate (déjà en kb/s), isLocked et parfois length.
- PUT `/searches/{id}` annule ; DELETE supprime l’historique et n’est plus appelé par Digger.

Sources de référence : [SearchesController](https://github.com/slskd/slskd/blob/master/src/slskd/Search/API/Controllers/SearchesController.cs), [SearchRequest](https://github.com/slskd/slskd/blob/master/src/slskd/Search/API/DTO/SearchRequest.cs), [TransfersController](https://github.com/slskd/slskd/blob/master/src/slskd/Transfers/API/Controllers/TransfersController.cs). L’observation de la version installée prime sur les commentaires de master.

## Changements

POST Digger crée et retourne immédiatement un identifiant. GET suit l’état une fois par seconde. L’interface affiche les compteurs, attend les réponses persistées et distingue annulation, indisponibilité, délai et absence d’audio. Les recherches terminées restent dans slskd. Les résultats sont limités à 100 fichiers audio accessibles et dédupliqués par utilisateur/chemin. Les fichiers verrouillés sont exclus. La recherche réseau peut aussi renvoyer des fichiers voisins du même dossier : les noms et formats restent visibles pour choisir la bonne version.

La clé API reste côté serveur. Les erreurs ne reflètent ni les réponses brutes ni la clé. Transport HTTP, parsing et route sont séparés dans `src/lib/soulseek`.

Après validation de la recherche, bouton Télécharger ajouté. Le serveur relit la recherche, valide l’appartenance du fichier et sa taille, vérifie la destination `C:\MUSIC\00_INBOX`, puis envoie uniquement le fichier sélectionné à slskd. Aucun déplacement local n’est effectué par Digger. Une réponse positive signifie demande transmise, pas fichier téléchargé ni indexé. Un transfert non confirmé doit être vérifié dans slskd avant de réessayer.

## Validation et limites

56 tests réussis ; typecheck et build réussis. Navigateur réel : carte Birdcage — You Man, 111 fichiers audio disponibles, 100 affichés lors de la première vérification réussie. Résultats constatés en moins de 33 secondes ; le nombre dépend des pairs connectés. Débit affiché en kb/s corrigé (320 reste 320).

Le dossier de téléchargement a été lu dans la configuration réelle : `C:\MUSIC\00_INBOX`, incomplets dans `_INCOMPLETE`. Les transferts sont testés avec transport simulé : aucune musique téléchargée pendant cette passe. La première sélection manuelle reste nécessaire pour valider le transfert complet avec les pairs réels et le watcher existant.

Les recherches conservées peuvent être nettoyées dans slskd. Pas de wishlist, de retry automatique, ni de suivi détaillé des transferts ajouté à ce stade. Aucun secret ou diagnostic contenant une clé n’est commité. Stash expérimental non appliqué et non supprimé.
