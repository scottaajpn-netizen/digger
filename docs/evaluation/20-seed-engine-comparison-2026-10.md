# Digger — comparaison moteur liée aux 20 seeds (octobre 2026)

## Ce qui est comparable

La campagne humaine reste la référence inchangée : **63/181 appréciés (34,8 %),
127/182 pertinents (69,8 %), 147/182 inconnus (80,8 %)**. Ces chiffres ne sont
pas recalculés et aucune hausse d'appréciation ou de pertinence n'est revendiquée
sans nouvelle écoute.

Le fichier de baseline contient les agrégats et diagnostics des 20 seeds, mais
pas les 182 candidats complets avec leur provenance, score et rang. Il est donc
impossible de rejouer honnêtement l'ancien et le nouveau moteur sur ces mêmes
182 lignes. Le harness `scripts/discovery-benchmark.ts` reste la source des
rapports par morceau (`source`, `path`, rang, score, composantes et effets MMR)
pour les runs dont le pool candidat est conservé.

## Comparaison reproductible sur candidats identiques

Les tests de régression construisent des pools identiques avant/après et isolent
les changements demandés :

| Cas de contrôle | Ancienne stratégie | Nouvelle stratégie | Mesure moteur |
|---|---|---|---:|
| seed session artiste/titre inversés (`Grünt #53` / `Saboteur`) | identité autorisée faute de contradiction MBID | similarités Last.fm bloquées, autres sources conservées | 1 conflit explicite |
| session remplacée par un titre générique | titre autocorrigé accepté | conflit `session-title-conflict` | 1 conflit explicite |
| collaboration avec artiste hors crédits | crédit texte accepté | conflit `credited-artist-conflict` | 1 conflit explicite |
| même titre et même ISRC, crédit long/court | 2 candidats | 1 enregistrement fusionné | 1 doublon retiré |
| seed boom bap, candidat tags `hip hop + rap` | aucun correctif de preuve | preuve générique pénalisée | −10 points |
| seed boom bap, candidat chillhop | aucune pénalité de dérive ciblée | dérive de sous-genre pénalisée | −18 points |
| Discogs compilation, seulement genre + pays + année | contexte de sortie encore trop favorable | contexte générique et compilation pénalisés | au moins −11 points |
| feedback humain `À sampler` | confondu avec aucune intention disponible | signal distinct, positif mais plus faible que `J’aime` | poids 0,20 vs 1,00 |

Ces deltas sont des changements de score et de garde-fou, pas des gains humains.
Une nouvelle campagne d'écoute sur les mêmes 20 seeds est requise pour mesurer
l'effet sur appréciation, pertinence et découverte.

## Garde-fous

- Les conflits d'identité ferment uniquement la branche Last.fm contradictoire ;
  MusicBrainz, Discogs et ListenBrainz restent disponibles.
- Un ISRC ne fusionne des crédits d'artiste différents que si le titre normalisé
  est aussi identique ; des titres distincts restent séparés.
- Les tags propres au titre et les sous-genres corroborés gardent leur valeur.
  Un label non générique, corroboré au niveau enregistrement, reçoit encore un
  léger bonus.
- Les imports YouTube AUTO restent des préférences d'écoute agrégées. La
  curiosité et le potentiel de sample proviennent de feedbacks humains séparés.
  Les fichiers locaux `.digger/` restent exclus de Git.
