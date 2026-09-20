import test from "node:test";
import assert from "node:assert/strict";

import { discoveryBenchmark } from "./fixtures/discovery-benchmark";

function measureCandidatePool(
    candidates: Array<{
        artist: string;
        origin?: string;
    }>,
) {
    const candidateCount = candidates.length;

    const artistCounts = candidates.reduce<Record<string, number>>(
        (counts, candidate) => {
            const artist = candidate.artist.trim().toLowerCase();

            counts[artist] = (counts[artist] ?? 0) + 1;

            return counts;
        },
        {},
    );

    const uniqueArtistCount = Object.keys(artistCounts).length;

    const maxTracksPerArtist = Math.max(
        0,
        ...Object.values(artistCounts),
    );

    const originCounts = candidates.reduce<Record<string, number>>(
        (counts, candidate) => {
            if (!candidate.origin) return counts;

            counts[candidate.origin] =
                (counts[candidate.origin] ?? 0) + 1;

            return counts;
        },
        {},
    );

    const dominantOriginCount = Math.max(
        0,
        ...Object.values(originCounts),
    );

    return {
        candidateCount,
        uniqueArtistCount,

        artistCoverageRatio:
            candidateCount === 0
                ? 0
                : uniqueArtistCount / candidateCount,

        maxTracksPerArtist,

        dominantArtistRatio:
            candidateCount === 0
                ? 0
                : maxTracksPerArtist / candidateCount,

        originCounts,

        dominantOriginRatio:
            candidateCount === 0
                ? 0
                : dominantOriginCount / candidateCount,
    };
}

test("artist coverage measures branches rather than track volume", () => {
    const candidates = [
        { artist: "Artist A", origin: "lastfm-crate" },
        { artist: "Artist A", origin: "lastfm-crate" },
        { artist: "Artist A", origin: "lastfm-crate" },
        { artist: "Artist B", origin: "discogs-label" },
        { artist: "Artist B", origin: "discogs-label" },
        { artist: "Artist C", origin: "listenbrainz" },
    ];

    const metrics = measureCandidatePool(candidates);

    assert.deepEqual(metrics, {
        candidateCount: 6,
        uniqueArtistCount: 3,
        artistCoverageRatio: 0.5,
        maxTracksPerArtist: 3,
        dominantArtistRatio: 0.5,
        originCounts: {
            "lastfm-crate": 3,
            "discogs-label": 2,
            listenbrainz: 1,
        },
        dominantOriginRatio: 0.5,
    });
});
function summarizeBenchmark() {
    const examples = discoveryBenchmark.flatMap(
        benchmarkCase => benchmarkCase.examples,
    );

    const verdictCounts = examples.reduce<Record<string, number>>(
        (counts, example) => {
            counts[example.verdict] =
                (counts[example.verdict] ?? 0) + 1;

            return counts;
        },
        {},
    );

    const positiveCount =
        (verdictCounts.excellent ?? 0) +
        (verdictCounts.good ?? 0);

    const badCount = verdictCounts.bad ?? 0;

    const knownCount = examples.filter(
        example => example.known === true,
    ).length;

    return {
        cases: discoveryBenchmark.length,
        recommendations: examples.length,
        verdictCounts,
        positiveCount,
        badCount,
        knownCount,
        positiveRatio:
            examples.length === 0
                ? 0
                : positiveCount / examples.length,
        badRatio:
            examples.length === 0
                ? 0
                : badCount / examples.length,
    };
}
test("benchmark baseline summarizes human verdicts", () => {
    const baseline = summarizeBenchmark();

    assert.equal(baseline.cases, 11);
    assert.equal(baseline.recommendations, 66);

    console.log("[BENCHMARK BASELINE]", baseline);
});


test("Pleine Forêt separates relevance from novelty for known artist-hop results", () => {
    const benchmarkCase = discoveryBenchmark.find(
        item => item.id === "leon-phal-jungle-jack-pleine-foret",
    );
    assert.ok(benchmarkCase);

    const reviewed = benchmarkCase.followUpRuns
        ?.flatMap(run => run.examples)
        .filter(example =>
            ["Veust", "Huntrill"].includes(example.artist),
        ) ?? [];

    assert.equal(reviewed.length, 2);
    for (const example of reviewed) {
        assert.equal(example.verdict, "good");
        assert.equal(example.known, true);
    }
});


test("Pleine Forêt stores taste, coherence and novelty as separate human axes", () => {
    const benchmarkCase = discoveryBenchmark.find(
        item => item.id === "leon-phal-jungle-jack-pleine-foret",
    );
    assert.ok(benchmarkCase);

    const reviews = benchmarkCase.followUpRuns
        ?.flatMap(run => run.examples) ?? [];

    const veust = reviews.find(
        example => example.artist === "Veust" && example.title === "4 Chemins",
    );
    assert.ok(veust);
    assert.equal(veust.coherence, "strong");
    assert.equal(veust.taste, "like");
    assert.equal(veust.known, true);

    const piotr = reviews.find(
        example => example.artist === "Piotr Wiese" && example.title === "Emptiness",
    );
    assert.ok(piotr);
    assert.equal(piotr.coherence, "weak");
    assert.equal(piotr.taste, "like");
    assert.equal(piotr.known, undefined);

    const ashley = reviews.find(
        example =>
            example.artist === "Ashley Henry" &&
            example.title === "Star child (feat. Judi Jackson)",
    );
    assert.ok(ashley);
    assert.equal(ashley.coherence, "weak");
    assert.equal(ashley.taste, "like");
    assert.equal(ashley.known, undefined);
});
