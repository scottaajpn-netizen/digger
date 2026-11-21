# Sukotto Digger — premier prototype MPC One Gen 1

Ce dossier prépare une version EXPÉRIMENTALE de Sukotto Digger pour MPC One Gen 1 : un seul morceau à la fois, un bouton NEXT RECORD et une page tactile vintage.

## Origine et sécurité

Cette adaptation s'appuie sur le code source open source MIT de [Crate Digger](https://github.com/sd88me/mpc-vst-cratedigger), écrit par sd88me. Elle conserve le moteur de recherche/streaming existant et produit une archive distincte du Crate Digger déjà installé. Les sources et les binaires tiers conservent leurs mentions de licence.

- Nom du nouveau plugin : Sukotto Digger.
- Identifiant VST distinct : SkDg.
- Plateforme visée : ARMv7 (MPC One Gen 1, MPC OS 3.10.1 ou ultérieur).
- Pas d'édition du firmware, du fichier MPC.settings ni d'accès root.
- Ne pas remplacer Crate Digger ni Morph FX.

## Fonctions prévues en V1

- Une seule page tactile, pas d'onglets PLAY / FILTERS / FIND.
- Un seul titre affiché en grand, sans liste de huit résultats.
- NEXT RECORD : écoute le résultat suivant immédiatement ; après le dernier résultat, relance une recherche.
- NEW DIG : effectue une nouvelle recherche et tente de lancer le premier titre lorsqu'elle se termine.
- PLAY / PAUSE et SYNC pour le resampling.
- Genre, décennie, région et pays visibles sur le même écran.
- Q-Links pour la navigation principale.

Le moteur utilise pour cette V1 **Discogs comme source de découverte**, puis la résolution audio de Crate Digger. Il n'est pas encore l'agrégateur Digger multi-sources. Les filtres du Digger Web (instruments, pays multiples, exclusions, anti-compilations, anti-IA, obscurité) ne sont pas encore portés. Le préchargement du morceau suivant reste à développer.

## Compilation avec GitHub Actions

Les fichiers source de cette adaptation se trouvent dans mpc/patch_sukotto.py.

La compilation expérimentale est configurée dans [.github/workflows/build-sukotto-mpc.yml](../.github/workflows/build-sukotto-mpc.yml) sur la branche feat/mpc-sukotto-one-track-v1. Une modification du dossier mpc/ ou du workflow sur cette branche déclenche une tentative de build.

Sources épinglées pour rendre le résultat reproductible :

- Crate Digger : 331d32442fc7a53f5bd6bd2d7eb2648ed59dd661
- SDK MPC Akai : a5949cf6fe2cbfb95bcbe0ddf1f7ef555e71f2be

Le workflow récupère les deux dépôts, applique le patch, génère le skin et lance la compilation ARM32 dans Docker/QEMU. **Si elle réussit**, l'archive Sukotto-Digger-2.2.0-VST2-Plugins-armv7.zip est jointe au job sous la forme d'un artifact GitHub Actions.

Il est également possible de construire manuellement avec les outils Linux du projet amont :

    git clone https://github.com/sd88me/mpc-vst-cratedigger.git cratedigger-upstream
    git -C cratedigger-upstream checkout 331d32442fc7a53f5bd6bd2d7eb2648ed59dd661
    git clone https://github.com/inmusic-software/mpc-plugin-builder-sdk.git mpc-sdk
    git -C mpc-sdk checkout a5949cf6fe2cbfb95bcbe0ddf1f7ef555e71f2be
    python3 mpc/patch_sukotto.py cratedigger-upstream
    (cd cratedigger-upstream && python3 tools/make_tui.py --preview)
    (cd cratedigger-upstream && MPC_SDK="$(pwd)/../mpc-sdk" ./build-sdk.sh && python3 tools/package.py)

Il faut Docker, QEMU ARM, Python avec Pillow et gh. La procédure n'a pas encore été validée sur une MPC One.

## Installation sur la MPC (uniquement après réussite du build)

1. Sauvegarder le contenu de la clé USB.
2. Décompresser l'archive générée.
3. Copier exclusivement le dossier VST2 Plugins/sd88me - VST - Sukotto Digger dans le dossier VST2 Plugins de la clé USB.
4. Vérifier que plugin.json, VST/sukotto-arm32.so et Plugin Skins/TUI.json existent.
5. Vérifier que plugin.json contient format: vst2 et file32: VST/sukotto-arm32.so.
6. Éjecter la clé proprement, puis redémarrer la MPC avec Enhancements et External Plugin Support activés.
7. Créer une nouvelle piste Plugin et rechercher Sukotto Digger sous les instruments externes.

Ne pas lancer install-force.sh : la méthode classique suffit sur le firmware déjà utilisé.

## Test utilisateur à réaliser

1. Crate Digger et Morph FX restent disponibles.
2. Sukotto Digger apparaît comme un autre instrument.
3. Le plugin s'ouvre sans blocage.
4. NEW DIG donne un résultat et lit un morceau.
5. NEXT RECORD passe au morceau suivant avec une seule pression.
6. En fin de résultats, NEXT RECORD lance une nouvelle recherche.
7. Les flèches des filtres fonctionnent et la piste peut être enregistrée avec Sampler > Resample L+R.

## Points à investiguer

L'autolecture de NEW DIG repose sur le passage du moteur par SEARCHING avant DONE ; si le moteur répond trop vite, l'écoute automatique peut manquer ce premier état. La compatibilité et les performances du moteur Crate Digger 2.2 sur MPC One ARM32 restent à confirmer. La musique soumise aux droits d'auteur nécessite les autorisations applicables avant toute réutilisation publique.
