export type BenchmarkVerdict =
    | "excellent"
    | "good"
    | "acceptable"
    | "bad";

export type BenchmarkExample = {
    artist: string;
    title?: string;
    verdict: BenchmarkVerdict;
    known?: boolean;
    note?: string;
};
export type BenchmarkPoolObservation = {
    beforeGate?: {
        candidateCount: number;
        uniqueArtistCount: number;
    };
    afterGate?: {
        candidateCount: number;
        uniqueArtistCount: number;
    };
    gateRejections?: {
        lastfmTag?: number;
        tooManyListeners?: number;
        tooPopular?: number;
        unknownAudience?: number;
    };
};
export type BenchmarkFollowUpRun = {
    label: string;
    examples: BenchmarkExample[];
    observations: string[];
};

export type DiscoveryBenchmarkCase = {
    id: string;
    seed: {
        artist: string;
        title: string;
    };
    direction: "surprise";
    obscurity: 100;
    overall: "excellent" | "good" | "mixed" | "bad" | "regression";
    examples: BenchmarkExample[];
    observations: string[];
    poolObservation?: BenchmarkPoolObservation;
    followUpRuns?: BenchmarkFollowUpRun[];
};

export const discoveryBenchmark: DiscoveryBenchmarkCase[] = [
    {
        id: "sti-autonome",
        seed: {
            artist: "STI",
            title: "AUTONOME",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "bad",
        examples: [
            {
                artist: "Camel in Space",
                title: "Hell To Heaven [Electronic 2009] [musicore.net]",
                verdict: "bad",
                note: "Aucun rapport perçu avec le seed.",
            },
            {
                artist: "Stinkie",
                title: "Ангел",
                verdict: "bad",
                note: "Aucun rapport perçu avec le seed.",
            },
            {
                artist: "stretching time in nature keeps images endless",
                verdict: "bad",
                note: "Aucun rapport perçu avec le seed.",
            },
            {
                artist: "Tisma",
                title: "LA CANTINIÈRE",
                verdict: "good",
                note: "Rap français, rapprochement jugé pertinent.",
            },
            {
                artist: "STI & LEDOUBLE",
                title: "Grazie mille",
                verdict: "acceptable",
                note: "Pertinent mais reste centré sur STI.",
            },
            {
                artist: "STI & Sopico",
                title: "Player",
                verdict: "acceptable",
                note: "Pertinent mais faible valeur de découverte.",
            },
            {
                artist: "OgLounis",
                title: "LA VEINE",
                verdict: "good",
                note: "Bonne recommandation.",
            },
            {
                artist: "STI & Jungle Jack",
                title: "Faut pas m’faire chier",
                verdict: "acceptable",
                note: "Pertinent mais reste centré sur STI.",
            },
        ],
        observations: [
            "Plusieurs candidats Last.fm catalogue sans affinité mesurée sont hors sujet.",
            "Les mauvais candidats peuvent obtenir des scores très élevés.",
            "Trop de recommandations réutilisent directement STI.",
        ],
    },

    {
        id: "st-germain-sittin-here",
        seed: {
            artist: "St Germain",
            title: "Sittin' Here (Boddhi Satva Ancestral Soul Remix)",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "good",
        examples: [
            {
                artist: "Lorenzo",
                title: "Get Deep (Sebo K Edit)",
                verdict: "good",
                note: "Découverte intéressante via une connexion Discogs.",
            },
            {
                artist: "Phil Weeks",
                title: "Slow Dance (U Cry) (Sebo K Edit)",
                verdict: "good",
                note: "Découverte intéressante via une connexion Discogs.",
            },
        ],
        observations: [
            "Seulement deux recommandations.",
            "Les deux résultats exploitent la même branche Sebo K.",
            "Mieux vaut peu de recommandations pertinentes que du remplissage hors sujet.",
        ],
    },

    {
        id: "midland-final-credits",
        seed: {
            artist: "Midland",
            title: "Final Credits",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "mixed",
        examples: [
            {
                artist: "Overmono",
                title: "WalkThru (Chee’s bootleg)",
                verdict: "acceptable",
                note: "Surprenant mais rapprochement musical peu évident.",
            },
            {
                artist: "Peggy Gou",
                title: "Lobster Telephone (Mogwaa remix)",
                verdict: "acceptable",
                known: true,
                note: "Surprenant mais déjà connu.",
            },
            {
                artist: "DJ Shadow featuring Little Dragon",
                title: "Scale It Back (Kev Willow remix)",
                verdict: "bad",
                note: "Connexion peu compréhensible et résultat non apprécié.",
            },
            {
                artist: "Hird feat. Yukimi Nagano",
                title: "Fading Blues",
                verdict: "excellent",
                known: false,
                note: "Très bonne découverte.",
            },
            {
                artist: "Bicep",
                title: "Getcha Boi",
                verdict: "acceptable",
            },
            {
                artist: "Chris Lorenzo",
                title: "My Own",
                verdict: "acceptable",
            },
            {
                artist: "Joy Orbison",
                title: "Ladywell",
                verdict: "good",
                note: "Recommandation intéressante.",
            },
            {
                artist: "Crazy P",
                title: "You Are We",
                verdict: "excellent",
                known: false,
                note: "Très bonne découverte.",
            },
            {
                artist: "AceMo",
                title: "Sequence of Life",
                verdict: "bad",
                note: "Pas apprécié.",
            },
            {
                artist: "Death Grips",
                title: "Culture Shock (FX)",
                verdict: "bad",
                note: "Pas apprécié.",
            },
        ],
        observations: [
            "Certaines excellentes découvertes ont un score inférieur à des recommandations médiocres.",
            "Surprends-moi doit permettre une distance musicale contrôlée.",
        ],
    },

    {
        id: "anri-remember-summer-days",
        seed: {
            artist: "Anri",
            title: "Remember Summer Days",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "excellent",
        examples: [
            { artist: "菊池桃子", title: "Good Friend", verdict: "excellent" },
            { artist: "Makoto Matsushita", title: "One Hot Love", verdict: "good" },
            { artist: "Naoko Kawai", title: "疑問符", verdict: "acceptable" },
            { artist: "杏里", title: "Good Bye Boogie Dance", verdict: "good" },
            {
                artist: "大橋純子",
                title: "クリスタル・シティー",
                verdict: "good",
                known: true,
            },
            {
                artist: "竹内まりや",
                title: "プラスティック・ラブ",
                verdict: "excellent",
                known: true,
            },
            { artist: "高中正義", title: "BRASILIAN SKIES", verdict: "excellent" },
            { artist: "山下達郎", title: "Magic Ways", verdict: "good" },
            { artist: "泰葉", title: "フライディ・チャイナタウン", verdict: "good" },
        ],
        observations: [
            "Très bonne pertinence globale.",
            "Risque d'enfermement dans la même scène japonaise sur le long terme.",
            "Le moteur doit conserver des portes de sortie crédibles vers d'autres scènes.",
        ],
    },

    {
        id: "maria-creuza-o-que-tinha-que-ser",
        seed: {
            artist: "Maria Creuza",
            title: "O Que Tinha Que Ser",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "good",
        examples: [
            { artist: "Eliana Pittman", title: "Beira-Mar", verdict: "good" },
            { artist: "Doris Monteiro", title: "Olhou Pra Mim", verdict: "good" },
            { artist: "Fafá de Belém", title: "Coraçao do Agreste", verdict: "acceptable" },
            {
                artist: "Elizeth Cardoso",
                title: "Seleção De Sambas Da Mangueira - Medley",
                verdict: "acceptable",
                note: "Niche et légitime dans Surprends-moi 100.",
            },
            { artist: "Doris Monteiro", title: "Dia De Feira", verdict: "good" },
            {
                artist: "Eliana Pittman",
                title: "Sinhá Pureza / Carimbó do Mato",
                verdict: "good",
            },
        ],
        observations: [
            "Bonne pertinence globale.",
            "Quatre résultats sur six proviennent de seulement deux artistes.",
            "Le moteur surexploite les branches pertinentes.",
        ],
    },

    {
        id: "goya-gumbani-fight-for-love",
        seed: {
            artist: "Goya Gumbani & Oliver Palfreyman",
            title: "Fight For Love (Feat. George Riley)",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "excellent",
        examples: [
            { artist: "Sampa the Great", verdict: "acceptable" },
            { artist: "Fly Anakin", title: "Black Be The Source", verdict: "good" },
            {
                artist: "CRi feat. Ouri & Odile M.",
                title: "The Other Side of Why I Love You",
                verdict: "excellent",
                known: false,
                note: "Très bonne découverte et niche.",
            },
            { artist: "Cold Callers", title: "Playa’s Praya", verdict: "bad" },
            {
                artist: "Starker feat. YL & Goya Gumbani",
                title: "Episodes",
                verdict: "good",
                note: "Pertinent mais réutilise Goya Gumbani.",
            },
            { artist: "JADASEA", title: "Holding On", verdict: "acceptable" },
            {
                artist: "Goya Gumbani & Oliver Palfreyman",
                title: "Signs*",
                verdict: "good",
                note: "Apprécié mais reste sur l'artiste du seed.",
            },
            {
                artist: "Ouri, Zach Frampton",
                title: "rêverie",
                verdict: "excellent",
                known: false,
                note: "Très surprenant, apprécié et extrêmement obscur.",
            },
            { artist: "yungmorpheus", title: "Spacetrips", verdict: "good" },
            { artist: "Fly Anakin", title: "Sean Price", verdict: "excellent" },
        ],
        observations: [
            "Des candidats à faible affinité métadonnées peuvent être d'excellentes découvertes.",
            "ListenBrainz peut produire des sauts exploratoires très réussis.",
            "Une faible similarité ne doit donc pas constituer un motif automatique d'exclusion.",
        ],
    },

    {
        id: "lausse-the-cat-mocking-stars",
        seed: {
            artist: "LAUSSE THE CAT",
            title: "The Mocking Stars",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "bad",
        examples: [
            { artist: "André 3000, Tyler, The Creator", verdict: "bad" },
            { artist: "The Notorious B.I.G.", verdict: "bad", known: true },
            { artist: "Odd Future", verdict: "bad", known: true },
            { artist: "Billie Eilish", verdict: "bad", known: true },
            { artist: "Kaytradamus", title: "Ensoleillé", verdict: "bad" },
        ],
        observations: [
            "La majorité des recommandations est hors sujet.",
            "ListenBrainz semble confondre proximité d'écoute et pertinence de digging.",
            "Plusieurs artistes très connus sont inadaptés à une obscurité de 100.",
        ],
        followUpRuns: [
            {
                label: "post-evidence-refactor-2026-09-18",
                examples: [
                    {
                        artist: "illiterate feat. lausse the cat",
                        title: "catching moths",
                        verdict: "excellent",
                        note: "Excellent, mais LAUSSE THE CAT participe au morceau : découverte adjacente, pas nouvel artiste entièrement indépendant.",
                    },
                    {
                        artist: "JID",
                        title: "Interlude 3",
                        verdict: "excellent",
                        known: true,
                        note: "Excellent mais déjà connu.",
                    },
                    {
                        artist: "J.I.D feat. L.E. & Hollywood JB",
                        title: "Heather",
                        verdict: "good",
                    },
                    {
                        artist: "KAYTRANADA",
                        title: "Snap My Finger (instrumental)",
                        verdict: "good",
                    },
                    {
                        artist: "Clairo",
                        title: "my funny valentine",
                        verdict: "excellent",
                        note: "Excellent découverte apparue après canonicalisation des alias d'artistes, en remplacement d'un doublon Kaytradamus/KAYTRANADA.",
                    },
                ],
                observations: [
                    "La qualité ListenBrainz s'est nettement améliorée par rapport à la baseline historique.",
                    "New Order — Ruined In A Day (Dance Hall Groove) n'a pas reçu de verdict : le lien avec le seed n'était pas compris.",
                    "Kaytradamus — I'll Try (interlude) / BOOM! n'a pas reçu de verdict car le morceau n'a pas été retrouvé pendant l'écoute.",
                    "Le run expose deux besoins distincts : gérer les collaborations contenant l'artiste du seed sans les bannir, et canonicaliser les alias d'artistes.",
                    "Après canonicalisation des alias, le slot libéré a produit Clairo — my funny valentine, jugé excellent.",
                ],
            },
        ],
    },

    {
        id: "qendresa-good-love",
        seed: {
            artist: "Qendresa",
            title: "Good Love (Prod. by Hugo Mari)",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "mixed",
        examples: [
            { artist: "Ley Soul", title: "Fortune Eyes", verdict: "acceptable" },
            {
                artist: "The Weeknd",
                title: "BLINDING LIGHTS (CARMACK 80’S REMIX)",
                verdict: "bad",
                known: true,
            },
            {
                artist: "Stella & NTEIBINT",
                title: "A State Nearby (Adam Port Calypso Remix)",
                verdict: "bad",
            },
            {
                artist: "NTEIBINT feat. Stella",
                title: "Never Without You (Domestic Technology remix)",
                verdict: "acceptable",
                note: "Répétition de la même branche.",
            },
            { artist: "Babyfather feat. Tirzah", title: "1471", verdict: "acceptable" },
            {
                artist: "Lynda Dawn",
                title: "11th Hour",
                verdict: "good",
                note: "Bonne recommandation et pertinente.",
            },
            {
                artist: "The Weeknd & Anitta",
                title: "São Paulo (single version / a cappella)",
                verdict: "bad",
                known: true,
                note: "Artiste trop connu et version a cappella peu utile.",
            },
            { artist: "MIKE", title: "Babyboy", verdict: "acceptable" },
            { artist: "Ley Soul", title: "Mystical Girl", verdict: "bad" },
            {
                artist: "Lynda Dawn",
                title: "Roses - 7\" Version",
                verdict: "excellent",
                note: "Recommandation jugée la plus pertinente.",
            },
        ],
        observations: [
            "Quelques très bonnes pistes mais beaucoup de répétitions de branches.",
            "Obscurité 100 laisse passer des artistes beaucoup trop évidents.",
        ],
        followUpRuns: [
            {
                label: "post-evidence-refactor-2026-09-18",
                examples: [
                    {
                        artist: "Novelist & Qendresa",
                        title: "DON'T CRY 4 ME",
                        verdict: "acceptable",
                        note: "Jugé bof ; conserve une proximité directe avec Qendresa.",
                    },
                    {
                        artist: "Little Dragon & Keinemusik",
                        title: "Saving My Love",
                        verdict: "good",
                    },
                    {
                        artist: "Teebs",
                        title: "SPCD / There's a Watermelon in My Pocket",
                        verdict: "acceptable",
                        note: "Jugé niche donc acceptable dans un mode obscurité 100.",
                    },
                    {
                        artist: "Bien à toi feat. Biig Piig",
                        title: "Rainbow Tables",
                        verdict: "good",
                    },
                    {
                        artist: "Beyonce feat. J. Cole",
                        title: "Party (remix)",
                        verdict: "bad",
                        note: "Musicalement non évalué comme mauvais, mais jugé beaucoup trop mainstream pour obscurité 100.",
                    },
                    {
                        artist: "Rosie Lowe",
                        title: "Me & Your Ghost (Andrealo remix)",
                        verdict: "acceptable",
                        note: "Remplacement de Beyoncé après filtrage par notoriété artiste ; morceau jugé plutôt bof, sans rejet net.",
                    },
                    {
                        artist: "threetwenty",
                        title: "fruit",
                        verdict: "good",
                        known: true,
                        note: "Déjà connu mais apprécié ; wildcard catalogue.",
                    },
                ],
                observations: [
                    "Biig Piig — Me gustas tú n'a pas reçu de verdict d'écoute car le morceau n'a pas été retrouvé pendant le test, malgré un fort intérêt pour l'artiste.",
                    "Le run est globalement meilleur que la baseline, mais l'obscurité 100 laisse encore passer un artiste extrêmement mainstream via une version/remix peu écoutée.",
                    "La popularité au niveau morceau ne suffit donc pas toujours : la notoriété artiste doit être distinguée de l'audience de la piste.",
                    "Après ajout du filtre artiste, Beyoncé a été remplacée par Rosie Lowe — Me & Your Ghost (Andrealo remix), jugé acceptable mais pas spécialement apprécié.",
                ],
            },
        ],
    },

    {
        id: "rita-moss-red-balloon",
        seed: {
            artist: "Rita Moss",
            title: "Red Balloon",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "mixed",
        examples: [
            { artist: "Tõnu Naissoo", title: "Komistades", verdict: "acceptable" },
            { artist: "Doug Duffey", title: "Get Up in the A.M.", verdict: "bad" },
        ],
        observations: [
            "Seulement quatre résultats et deux artistes distincts.",
            "Last.fm deep répète plusieurs morceaux des mêmes branches.",
            "Les scores sont très élevés malgré une affinité musicale non mesurée.",
        ],
        followUpRuns: [
            {
                label: "pre-evidence-refactor-2026-09-18",
                examples: [
                    { artist: "Doug Duffey", title: "Nothing Ventured, Nothing Gained", verdict: "bad" },
                    { artist: "Tõnu Naissoo", title: "Kevad", verdict: "acceptable" },
                    { artist: "Doug Duffey", title: "Workin' Man's Blues", verdict: "bad" },
                    { artist: "Tõnu Naissoo", title: "Komistades", verdict: "acceptable" },
                ],
                observations: [
                    "Quatre places occupées par seulement deux artistes.",
                    "Aucun des quatre candidats n'avait de similarité musicale, tag partagé ou preuve Discogs mesurée.",
                    "Les scores de 173 à 188 étaient surtout produits par retrieval relevance, origin, direction et un jitter pouvant dépasser +60.",
                    "Verdict humain : zéro bon/excellent, deux acceptables et deux mauvais.",
                ],
            },
            {
                label: "post-evidence-refactor-2026-09-18",
                examples: [
                    { artist: "Jerry Fuller", title: "Love Me Like That", verdict: "good" },
                    { artist: "Tõnu Naissoo", title: "Kevad", verdict: "acceptable" },
                    { artist: "Doug Duffey", title: "Nothing Ventured, Nothing Gained", verdict: "bad" },
                ],
                observations: [
                    "Le chemin Discogs structuré arrive premier avec une preuve strong et a été jugé bon.",
                    "Les chemins Last.fm de deuxième cercle sont maintenant classés credible/behavioral au lieu de path=none.",
                    "Un seul morceau par artiste est retenu en Surprends-moi.",
                    "Le jitter reste faible et ne domine plus le classement.",
                ],
            },
        ],
    },

    {
        id: "mia-love-me-right",
        seed: {
            artist: "Mia",
            title: "Love Me Right",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "mixed",
        examples: [
            {
                artist: "Jason Joshua & The Beholders",
                title: "Are You Ready?",
                verdict: "excellent",
                note: "Très apprécié malgré une faible affinité métadonnées.",
            },
            { artist: "Lea", title: "110 (Prolog)", verdict: "bad" },
            { artist: "Lea", title: "Elefant", verdict: "bad" },
            {
                artist: "Jason Joshua & The Beholders",
                title: "Poor Boy",
                verdict: "excellent",
            },
        ],
        observations: [
            "Le chemin Discogs indirect mène à une excellente découverte.",
            "Last.fm catalogue mène ici à deux recommandations très mauvaises.",
            "Seulement deux artistes distincts sur quatre résultats.",
            "La qualité du chemin de découverte semble plus informative que la similarité brute.",
        ],
        poolObservation: {
            beforeGate: {
                candidateCount: 56,
                uniqueArtistCount: 7,
            },
            afterGate: {
                candidateCount: 3,
                uniqueArtistCount: 2,
            },
            gateRejections: {
                lastfmTag: 0,
                tooManyListeners: 52,
                tooPopular: 0,
                unknownAudience: 1,
            },
        },
        followUpRuns: [
            {
                label: "post-lastfm-identity-fix-2026-09-18",
                examples: [
                    { artist: "Teleclere", title: "Affection / Defection", verdict: "bad" },
                    { artist: "Stevie Fontaine", title: "Right Girl Wrong Time", verdict: "excellent" },
                ],
                observations: [
                    "La contamination vers les artistes allemands a disparu après la vérification d'identité Last.fm.",
                    "Affection / Defection affichait 71 % d'affinité métadonnées mais a été jugé mauvais.",
                    "Right Girl Wrong Time affichait seulement 2 % d'affinité métadonnées mais a été jugé excellent.",
                    "La version Saxophone Instrumental était une variante du même morceau et ne doit pas compter comme découverte indépendante.",
                ],
            },
            {
                label: "post-evidence-refactor-2026-09-18",
                examples: [
                    { artist: "J. Parker Band", title: "Live Lady (TZ Edit)", verdict: "good" },
                    { artist: "Henrietta Thomas", title: "I Want You (Right Now)", verdict: "good" },
                    { artist: "Mister", title: "I Wanna Thank You", verdict: "excellent" },
                    { artist: "Jason Joshua & The Beholders", title: "Are You Ready?", verdict: "excellent" },
                ],
                observations: [
                    "Quatre recommandations sur quatre sont jugées positives après la refonte Evidence.",
                    "Trois recommandations partagent une branche Discogs proche, mais elles sont toutes jugées bonnes ou excellentes.",
                    "La concentration de branche ne doit donc pas être pénalisée brutalement sans preuve qu'elle dégrade la qualité.",
                    "Jason Joshua reste excellent malgré une faible affinité métadonnées, confirmant qu'un chemin structuré crédible peut compenser un faible overlap de tags.",
                ],
            },
        ],
    },

    {
        id: "leon-phal-jungle-jack-pleine-foret",
        seed: {
            artist: "Léon Phal & Jungle Jack",
            title: "Pleine Forêt",
        },
        direction: "surprise",
        obscurity: 100,
        overall: "regression",
        examples: [],
        observations: [
            "Cas de régression : une seed valide avec similarité directe pauvre doit pouvoir ouvrir un chemin catalogue vérifié.",
            "Une fiche Last.fm qui confirme Léon Phal peut servir d’ancre sans inventer un crédit Jungle Jack.",
            "L’invariant porte sur l’existence et la provenance des candidats, pas sur une liste de recommandations figée.",
        ],
    },
];
