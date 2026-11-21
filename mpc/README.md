# Sukotto Digger V3 — MPC One Gen 1 / ARM32

## Objet

Sukotto Digger adapte le moteur MIT de Crate Digger à une machine de digging et sampling. La V3 possède une façade originale inspirée des samplers 80–90s et des instruments de laboratoire : châssis beige/gris, écran phosphore, boutons physiques rouges et ambre.

Le plugin est indépendant de Crate Digger (identifiant VST SkDg). Ne jamais supprimer Crate Digger ni Morph FX pour installer Sukotto.

## Commandes V3

- NEW DIG : nouvelle recherche à partir des filtres genre, décennie, région, pays.
- NEXT RECORD : morceau suivant, nouvelle recherche lorsque la liste est épuisée.
- PREV : retrouver un des 12 morceaux précédents, y compris après une nouvelle recherche.
- TO START / PLAY-PAUSE / SYNC : transport.
- Waveform : niveaux constatés pendant l'écoute, pas analyse complète du morceau.
- MARK IN : début de prise ; MARK OUT : fin, fermeture et sauvegarde WAV.
- REC / STOP : alternative pour lancer et stopper une prise.
- LAST 30 SEC : enregistrer jusqu'à 30 secondes d'audio tout juste entendu.

La capture se fait sur la sortie stéréo du plugin, avec tampon audio et thread d'écriture distinct : pas d'I/O USB dans le callback audio.

## Où retrouver les samples

Dossier à la racine du support contenant le plugin :

    USB ou SD / Sukotto Samples / SUKOTTO_YYYYMMDD_HHMMSS_PID_N.wav

Fichiers PCM stéréo 16 bits, 44 100 Hz, durée maximale de 3 minutes par prise. Le dossier est créé au premier enregistrement.

Sur la MPC, ouvrir le Browser, trouver « Sukotto Samples », importer le WAV dans le projet, puis utiliser Sample Edit > Chop et affecter les slices aux pads.

IMPORTANT : le SDK public n'expose pas de commande documentée pour insérer directement le WAV dans le Sample Pool. L'export est natif, mais l'import MPC reste manuel à ce stade. Un disque plein ou non inscriptible doit produire SAVE ERROR / CHECK USB. Une clé trop lente peut entraîner REC / USB TOO SLOW.

## Installation

1. Sauvegarder sur ordinateur le dossier Sukotto Digger actuellement fonctionnel.
2. Décompresser le ZIP de la release alpha 0.3.
3. Remplacer uniquement le dossier « sd88me - VST - Sukotto Digger » sous « VST2 Plugins » à la racine de la clé USB.
4. Ne pas toucher à Crate Digger ni à Morph FX.
5. Éjecter la clé, redémarrer la MPC avec Enhancements + External Plugin Support activés et Ethernet branché.
6. Tester sur un nouveau projet vide.

Ne pas lancer install-force.sh ni modifier le firmware.

## Tests matériels à confirmer

- Interface et filtres réactifs, waveform progressive lisible.
- NEW DIG / NEXT / PREV / TO START fonctionnels.
- MARK IN puis MARK OUT créent un WAV, que le Browser MPC ouvre.
- LAST 30 SEC produit un autre WAV non muet.
- Sample Edit > Chop fonctionne sur le WAV importé.
- Pas de craquements audio ni blocage en cours de prise.
- Crate Digger et Morph FX restent utilisables.

Le code compile sur ARM32 et un test Linux natif contrôle REC/STOP, LAST 30 et en-têtes WAV. Cette validation ne remplace PAS les essais sur MPC One réelle.

## Sources et développement

- Crate Digger, commit 331d32442fc7a53f5bd6bd2d7eb2648ed59dd661.
- MPC Plugin Builder SDK, commit a5949cf6fe2cbfb95bcbe0ddf1f7ef555e71f2be.
- patch_sukotto.py : identité VST, paramètres append-only, moteur.
- skin_v3.py : visuel MPC original, contrôles et filtres.
- sukotto_capture.h : file lock-free + 30 s de mémoire + sauvegarde WAV.
- tests/test_capture.cpp : test Linux des captures.
- GitHub Actions : build-sukotto-mpc.yml, Docker / QEMU, release préliminaire.

Le moteur de découverte reste Crate Digger / Discogs. Les critères anti-IA, anti-compilations, obscurité, instruments, vues et les filtres avancés de Digger Web sont encore à porter.

La waveform complète dès le chargement, le clic direct pour repositionner la lecture et l'import automatique au Sample Pool ne sont pas encore développés.
