const ProfileScorer = require('../src/profile/ProfileScorer');

describe('ProfileScorer - Multi-vector scoring with clusters', () => {
    const animeItem = {
        id: 101,
        genre_ids: [16], // Animation
        keywords: [{ id: 2001, name: 'anime' }],
        vote_average: 8.0,
        vote_count: 5000
    };

    const horrorItem = {
        id: 202,
        genre_ids: [27], // Horror
        keywords: [{ id: 3001, name: 'ghost' }],
        vote_average: 8.0,
        vote_count: 5000
    };

    // Profilo a vettore singolo diluito (baricentro 50% animazione, 50% horror)
    const singleVectorProfile = {
        compiledVectors: {
            V_final: {
                'g:16': 50,
                'k:2001': 50,
                'g:27': 50,
                'k:3001': 50
            }
        }
    };

    // Profilo multi-vettore: due cluster specializzati a 100 ciascuno
    const multiVectorProfile = {
        compiledVectors: {
            V_final: {
                'g:16': 50,
                'k:2001': 50,
                'g:27': 50,
                'k:3001': 50
            },
            V_clusters: [
                {
                    vector: { 'g:16': 50, 'k:2001': 50 },
                    mass: 500,
                    seeds: [101]
                },
                {
                    vector: { 'g:27': 50, 'k:3001': 50 },
                    mass: 500,
                    seeds: [202]
                }
            ]
        }
    };

    it('calculateBaseItemMatch achieves higher or equal match for cluster-aligned items vs diluted single vector', () => {
        // Con V_clusters: animeItem matcha cluster 0 con affinità 50 + 50 = 100
        // mentre nel baricentro V_final il peso per chiave era lo stesso ma disperso
        const multiScoreAnime = ProfileScorer.calculateBaseItemMatch(animeItem, multiVectorProfile, { tmdbWeight: 0, traktWeight: 1 });
        const singleScoreAnime = ProfileScorer.calculateBaseItemMatch(animeItem, singleVectorProfile, { tmdbWeight: 0, traktWeight: 1 });

        expect(multiScoreAnime).toBeGreaterThanOrEqual(singleScoreAnime);
        expect(multiScoreAnime).toBeGreaterThan(0);

        const multiScoreHorror = ProfileScorer.calculateBaseItemMatch(horrorItem, multiVectorProfile, { tmdbWeight: 0, traktWeight: 1 });
        const singleScoreHorror = ProfileScorer.calculateBaseItemMatch(horrorItem, singleVectorProfile, { tmdbWeight: 0, traktWeight: 1 });

        expect(multiScoreHorror).toBeGreaterThanOrEqual(singleScoreHorror);
        expect(multiScoreHorror).toBeGreaterThan(0);
    });

    it('uses max_k over clusters and soft-cap per cluster', () => {
        // Profilo con 3 cluster con livelli differenti di affinità
        const profileWith3Clusters = {
            compiledVectors: {
                V_final: { 'g:16': 10 },
                V_clusters: [
                    { vector: { 'g:16': 10 }, mass: 100, seeds: [1] },
                    { vector: { 'g:16': 80 }, mass: 800, seeds: [2] },
                    { vector: { 'g:27': 80 }, mass: 400, seeds: [3] }
                ]
            }
        };

        const score = ProfileScorer.calculateBaseItemMatch(animeItem, profileWith3Clusters, { tmdbWeight: 0, traktWeight: 1 });
        // Il cluster 1 ha g:16=80, soft-cap = 10 * (1 - exp(-80/25)) = 9.59
        // Il cluster 0 ha g:16=10, soft-cap = 10 * (1 - exp(-10/25)) = 3.29
        // Il cluster 2 ha g:16=0
        // max_k deve selezionare il punteggio del cluster 1 (~9.59)
        expect(score).toBeGreaterThan(9.0);
    });

    it('falls back seamlessly to V_final when V_clusters is empty or not provided', () => {
        const coldProfile = {
            compiledVectors: {
                V_final: { 'g:16': 40 }
            }
        };

        const scoreA = ProfileScorer.calculateBaseItemMatch(animeItem, coldProfile);
        const scoreB = ProfileScorer.calculateBaseItemMatch(animeItem, {
            compiledVectors: { V_final: { 'g:16': 40 }, V_clusters: [] }
        });

        expect(scoreA).toEqual(scoreB);
    });

    it('calculateLightScore correctly uses max thematic affinity across clusters', () => {
        const lightItem = {
            id: 101,
            genre_ids: [16],
            vote_average: 7.5,
            vote_count: 2000
        };

        const score = ProfileScorer.calculateLightScore(lightItem, multiVectorProfile);
        expect(score).toBeGreaterThan(0);

        const scoreFallback = ProfileScorer.calculateLightScore(lightItem, singleVectorProfile);
        expect(score).toBeGreaterThanOrEqual(scoreFallback);
    });

    it('weights cluster contribution by cluster mass so small focused clusters do not overwhelm dominant clusters', () => {
        const itemDominant = {
            id: 301,
            genre_ids: [16], // Animation
            vote_average: 8.0,
            vote_count: 5000
        };
        const itemNiche = {
            id: 302,
            genre_ids: [27], // Horror
            vote_average: 8.0,
            vote_count: 5000
        };

        // Dominant cluster (mass 5000) has modest key weight 20
        // Tiny cluster (mass 200) has high key weight 80 (due to sharp concentration)
        const profile = {
            compiledVectors: {
                V_final: { 'g:16': 40, 'g:27': 5 },
                V_clusters: [
                    { vector: { 'g:16': 20 }, mass: 5000, seeds: [1] },
                    { vector: { 'g:27': 80 }, mass: 200, seeds: [2] }
                ]
            }
        };

        const scoreDominant = ProfileScorer.calculateBaseItemMatch(itemDominant, profile, { tmdbWeight: 0, traktWeight: 1 });
        const scoreNiche = ProfileScorer.calculateBaseItemMatch(itemNiche, profile, { tmdbWeight: 0, traktWeight: 1 });

        // Item aligning with dominant cluster (mass 5000, weight 1.0) must score higher
        // than item aligning with tiny cluster (mass 200, weight 200/5000 = 0.04)
        expect(scoreDominant).toBeGreaterThan(scoreNiche);
    });
});

