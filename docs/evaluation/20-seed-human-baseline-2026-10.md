# Digger — campagne d'écoute humaine, 20 seeds (octobre 2026)

## Conditions constantes
Direction `Surprends-moi`, obscurité 80, 10 propositions visées par seed.
Les avis sont des jugements humains, pas des labels de vérité musicale universelle.
`Aimé` = J'adore ou J'aime bien; `pertinent` = Très pertinent ou Plutôt pertinent; `inconnu` = Inconnu.
Les champs `Non évalué` sont exclus **par dimension**.

## Résultats historiques à préserver
| # | Seed | Appréciés | Pertinents | Inconnus | Diagnostic |
|---|---|---:|---:|---:|---|
| 1 | Ednah Holt — Serious, Sirius Space Party | 7/10 | 10/10 | 10/10 | disco/modern funk: bonne découverte |
| 2 | Angel Bat Dawid — We Are Starzz | 2/10 | 9/10 | 10/10 | jazz expérimental peu apprécié même si pertinent |
| 3 | Népal — Trajectoire | 3/10 | 9/10 | 7/10 | cohérence supérieure au goût |
| 4 | Junior Jazz — Rekere Ke Rekere | 0/10 | 0/10 | 10/10 | homonymie probable jazz belge vs amapiano |
| 5 | Avenoir — AFTER HOURS | 0/2 | 2/2 | 2/2 | recording/artist MBID conflict; faible rappel |
| 6 | Curren$y feat. Mac Miller — Money Shot | 2/10 | 3/10 | 7/10 | dérives stylistiques et crédits douteux |
| 7 | Rajie — THE TOKYO TASTE | 8/10 | 9/10 | 5/10 | city pop: réussite |
| 8 | Amadou Balaké — Yele | 7/10 | 9/10 | 10/10 | très bon, ambiguïtés d'alias |
| 9 | Wizkid — Joro | 2/10 | 10/10 | 10/10 | pertinence != préférence |
| 10 | Galt MacDermot — Cathedral | 4/10 | 5/10 | 9/10 | liens Discogs trop génériques |
| 11 | DJ Swagger & DJ ÆDIDIAS — Ствол | 4/9 | 8/9 | 9/9 | m4a4 introuvable, excluded |
| 12 | The Floaters — Float On | 7/9 | 8/9 | 9/9 | 9 titres réellement transmis |
| 13 | Rebe — Ramito de violetas | 1/3 | 2/3 | 3/3 | un titre non évalué; MBID conflict |
| 14 | Pauline Croze — La Rua Madureira | 1/10 | 4/10 | 5/10 | dérive chanson française, perd bossa nova |
| 15 | Sinik — Balles perdues | 1/9 | 5/10 | 4/10 | Shurik'n: goût non évalué, pertinence et découverte conservées |
| 16 | Jazzy Bazz — Gizeh | 4/10 | 7/10 | 4/10 | boom bap Discogs réussi, branches Last.fm utiles |
| 17 | Lord Kossity — Hotel Room | 1/10 | 6/10 | 10/10 | branches Nicky B > candidats non appréciés, L'Skadrille seul coup de cœur |
| 18 | Raimonds Pauls — Vīzija | 0/9 | 6/9 | 9/9 | source aimée pour potentiel de sampling; source audio atypique; 1 non évalué |
| 19 | Philanthrope — Monothrope | 3/10 | 8/10 | 9/10 | trop chillhop, pas assez boom bap; vidéo initiale mix Radio Juicy |
| 20 | Grünt #53 — Saboteur | 6/10 | 7/10 | 5/10 | mauvaise identité « Saboteur » utilisée comme artiste; malgré cela 3 nouveaux titres aimés |

**Bilan : 63/181 appréciés (34,8%), 127/182 pertinents (69,8%), 147/182 inconnus (80,8%).**

Attention : ces dénominateurs ne comprennent pas le même nombre de titres dans chaque dimension. Les 20 scénarios n'ont pas tous 10 recommandations évaluables. Ne PAS substituer des valeurs « non évalué » par des notes négatives.

## Chantier groupé à livrer AVANT tout nouveau test manuel

1. **Identité avant scoring** : détecter erreur artiste/titre, crédits multiples, sessions/mixes; préserver vérification MBID/ISRC sans fermer aveuglément toutes les branches. Contrôles: Junior Jazz, Grünt/Saboteur, Avenoir, Rebe, Philanthrope/Mono:Massive.
2. **Sémantique des preuves** : réduire la valeur des correspondances Discogs `genre + pays + année`, des labels généralistes et du simple co-listening; récompenser les labels de niche corroborés, crédits et sous-genres *propres au titre*. Aucun champ d'album ne doit être présenté comme preuve audio.
3. **Sélection** : pénaliser dérives sur chanson française (Pauline Croze), lo-fi au lieu de boom bap (Philanthrope), tags génériques rap/hip-hop (Grünt), sans casser Rajie, Ednah Holt, Amadou Balaké, Floaters.
4. **Personnalisation** : agréger les likes YouTube AUTO et évaluations humaines en distinguant préférence d'écoute, simple curiosité et potentiel de sample; pas de fuite de fichiers privés dans Git.
5. **Mesure honnête** : comparer baseline vs nouvelle stratégie sur les mêmes seeds et candidats, journaliser source/path/rang/score/MMR, couvrir tests et garde-fous; ne jamais prétendre à une hausse des appréciations sans nouvelle écoute humaine.

## Contraintes d'exécution
- Branche de travail seulement, jamais `main`.
- Lire `AGENTS.md` et utiliser Graphify disponible localement pour viser les bons fichiers; ne pas reconstruire la carte du code à chaque étape.
- Exploiter modules existants `src/lib/discovery/{recording-identity,path-reliability,scoring,ranking,taste-import}` et harness `scripts/discovery-benchmark.ts`; ne pas empiler de sous-systèmes.
- Une livraison groupée avec tests, typecheck et build, comparaison lisible baseline/nouveau; si la comparaison n'est pas disponible, le dire explicitement.
- Ce document est une **baseline de données et d'acceptation**, pas la preuve qu'un correctif de moteur a été livré.
