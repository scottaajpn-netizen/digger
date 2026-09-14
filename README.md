# Digger — version connectée

Web-app locale de digging musical en français, Next.js / React / TypeScript.

## Lancement Windows

Double-cliquer sur **Lancer Digger.cmd**, attendre Ready et ouvrir http://127.0.0.1:3000. Node.js 22 ou 24 avec npm est recommandé. Le premier lancement installe les dépendances. Garder la fenêtre ouverte ; Ctrl+C arrête le serveur. Si le port est occupé, lire le port choisi dans la fenêtre.

Alternative dans ce dossier :

```powershell
npm install
npm run dev
```

## Tester maintenant

1. Saisir **Ttabla — Taxi Kebab** ou **Kerala — Bonobo** (l’ordre artiste — titre fonctionne aussi).
2. Cliquer sur **Lancer l’exploration**.
3. Choisir la bonne version parmi les résultats MusicBrainz.
4. Explorer jusqu’à dix cartes, puis changer la direction ou le curseur et relancer.
5. Utiliser ❤️ / 👀 / 😐 / ✓. Les deux premiers alimentent Ma collection ; les deux derniers excluent le morceau des prochaines sélections. Cliquer de nouveau sur un avis le retire.
6. Le bouton ↳ repart directement de l’identifiant du morceau. Les liens permettent de voir sa fiche MusicBrainz ou de le rechercher sur YouTube.

## Connexions actives

- **MusicBrainz** : recherche, identifiants stables, artistes, tags, sorties, labels et catalogue de label.
- **ListenBrainz** : radio d’artistes associés selon les écoutes, recherche de morceaux par tag et popularité, métadonnées groupées.
- **Last.fm** : tags communautaires, morceaux similaires et exploration par genre. Nécessite une clé API serveur `LASTFM_API_KEY`.
- **Discogs** : pas encore connecté.

Les premières recherches peuvent prendre plusieurs secondes ; les résultats externes sont mis en cache une heure. Une connexion Internet est nécessaire. Un morceau inconnu affiche une erreur explicite. Aucun retour automatique aux données simulées.

## Sens des directions et limites

Même vibe combine les artistes associés, les tags et les sorties en commun. Même scène ajoute une préférence géographique quand elle est connue ; ce n’est pas une scène musicale certifiée. Labels privilégie les morceaux d’éditions associées au même label. Rabbit hole élargit la radio et favorise d’autres artistes. Surprends-moi augmente la variation dans ces candidats.

Le curseur change le mode de radio et la plage de popularité des recherches par tag. L’indice de popularité appartient à ListenBrainz, pas au marché mondial. Si une fiche n’a pas cette mesure, l’interface affiche Popularité inconnue et le classement ne lui invente pas de score de rareté. Pour un mode Labels pauvre en statistiques, le curseur peut peu modifier les résultats.

Les communautés ne documentent pas tous les morceaux de manière égale. Quand la similarité manque, l’application signale l’élargissement aux genres ou aux sorties. S’il reste moins de dix candidats exploitables, elle affiche ce qu’elle a trouvé sans inventer de pistes. Les cinq directions ne sont pas une analyse audio ou une IA sémantique.

Les pochettes sont des illustrations. Aucun extrait audio ni lecteur intégré : le lien YouTube ouvre une recherche. La source de chaque fiche est consultable. Les genres peuvent être renseignés au niveau de l’artiste ou de la sortie.

## Profil et confidentialité

Le profil connecté est dans `localStorage`, clé `digger.profile.v2`. La démo v1 reste stockée séparément pour éviter de mélanger ses fausses fiches avec les vraies. Pas de compte, ni synchronisation entre navigateurs. Les avis sont envoyés uniquement au serveur Digger pour classer les candidats ; ils ne sont pas publiés sur les plateformes. Les recherches musicales sont transmises à MusicBrainz et ListenBrainz. Les tags des candidats aimés ou à écouter favorisent les prochaines sélections lorsqu’ils figurent dans le groupe de candidats chargé. Maximum 200 avis transmis par demande ; les avis plus anciens restent conservés localement. Une remise à zéro est disponible en bas de page avec confirmation.

## Architecture

- `src/lib/providers/http.ts` : accès serveur aux deux APIs, délais maximaux, trois tentatives pour 429/502/503/504, cache limité à 300 réponses et espacement MusicBrainz de 1,1 seconde.
- `src/lib/providers/live.ts` : recherche, normalisation, rapprochements, déduplication et classement réel.
- `src/app/api/recommendations/route.ts` : validation ; sans seedId renvoie des choix, avec seedId renvoie une sélection.
- `src/components/digger.tsx` : choix du morceau, interface, feedback et collection.
- Les anciennes fixtures et le moteur mock restent disponibles pour les tests, mais ne sont plus appelés par l’application.

Variables serveur :

- `LASTFM_API_KEY` : clé API Last.fm. Copier `.env.example` vers `.env.local`, puis renseigner la clé. Ne jamais utiliser `NEXT_PUBLIC_` pour cette clé.
- `MUSICBRAINZ_USER_AGENT` : optionnelle, pour identifier proprement l’application auprès de MusicBrainz.

Sans `LASTFM_API_KEY`, Digger continue de fonctionner avec MusicBrainz + ListenBrainz et ignore simplement Last.fm.

## Vérification

```powershell
npm test
npm run typecheck
npm run build
npm run start
```

Dans le sandbox Codex uniquement, définir `DIGGER_SANDBOX=1` pour compiler avec des workers par threads. Sur Windows ordinaire et Vercel, les réglages standards s’appliquent. Le fichier pnpm-lock.yaml verrouille les dépendances pour pnpm.

## Vercel ensuite

Importer le dépôt, choisir le dossier digger comme Root Directory si nécessaire, preset Next.js. Build : pnpm build. Installation : pnpm install --frozen-lockfile. Aucune base ni clé API nécessaire à ce stade. Ne pas utiliser un export statique : la recherche utilise une API serveur. Durée serveur maximale configurée à 60 secondes ; vérifier les limites du plan choisi. La limitation MusicBrainz est locale au processus : pour un déploiement public avec plusieurs instances ou beaucoup de trafic, ajouter une file partagée ou un miroir avant de monter en charge. Rien n’a été publié pendant cette tâche.

Documentation des sources :
- https://musicbrainz.org/doc/MusicBrainz_API
- https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
- https://listenbrainz.readthedocs.io/en/latest/users/api/metadata.html
