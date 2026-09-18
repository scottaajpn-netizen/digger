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
export type DiscoveryBenchmarkCase = {
    id: string;
    seed: {
        artist: string;
        title: string;
    };
    direction: "surprise";
    obscurity: 100;
    overall: "excellent" | "good" | "mixed" | "bad";
    examples: BenchmarkExample[];
    observations: string[];
    poolObservation?: BenchmarkPoolObservation;
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
    },
];
