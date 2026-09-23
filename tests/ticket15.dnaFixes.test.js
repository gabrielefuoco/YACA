const ProfileScorer = require('../src/profile/ProfileScorer');
const { G, F } = require('../src/data/filters');
const { computeTopGenres, computeTopKeywords } = require('../src/engines/hybrid/scoringEngine');
const HierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');

describe('Ticket 15: Fix DNA e Ordinamento Cataloghi', () => {

    beforeAll(() => {
        if (!HierarchicalGraph.isLoaded) {
            HierarchicalGraph.loadData();
        }
    });

    describe('BUG-DNA-1: Determinismo selezione keywords', () => {
        it('getKeywordsForNodes restituisce lo stesso set ordinato su chiamate ripetute', () => {
            // Verifica che il grafo gerarchico e i nodi L2 con >30/50 keyword diano risultati identici
            const nodeIds = ['t_0']; // t_0 ha >50 keyword nel grafo
            const res1 = HierarchicalGraph.getKeywordsForNodes(nodeIds, 'L2');
            const res2 = HierarchicalGraph.getKeywordsForNodes(nodeIds, 'L2');

            expect(res1.get('t_0')).toEqual(res2.get('t_0'));
            expect(res1.get('t_0').length).toBeLessThanOrEqual(50);
        });

        it('ordinamento per id / alfabetico è stabile e deterministico', () => {
            const sampleKeywords = ['321', '12', '100', '45', '789', '2'];
            const sorted1 = [...sampleKeywords].sort((a, b) => {
                const numA = Number(a);
                const numB = Number(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a).localeCompare(String(b));
            });
            const sorted2 = [...sampleKeywords].sort((a, b) => {
                const numA = Number(a);
                const numB = Number(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(a).localeCompare(String(b));
            });
            expect(sorted1).toEqual(sorted2);
            expect(sorted1).toEqual(['2', '12', '45', '100', '321', '789']);
        });
    });

    describe('BUG-DNA-7: Tie-breaker deterministico nei sort', () => {
        it('elementi a parità di score vengono ordinati per ID crescente', () => {
            const items = [
                { data: { id: 7005 }, score: 8.5 },
                { data: { id: 7001 }, score: 8.5 },
                { data: { id: 7003 }, score: 8.5 },
                { data: { id: 7002 }, score: 9.0 }
            ];

            const sorted = items.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const idA = a.data?.id ?? '';
                const idB = b.data?.id ?? '';
                const numA = Number(idA);
                const numB = Number(idB);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return String(idA).localeCompare(String(idB));
            });

            expect(sorted[0].data.id).toBe(7002); // score 9.0
            expect(sorted[1].data.id).toBe(7001); // score 8.5, min id
            expect(sorted[2].data.id).toBe(7003); // score 8.5
            expect(sorted[3].data.id).toBe(7005); // score 8.5, max id
        });
    });

    describe('BUG-DNA-3: Mappa simmetrica e multipla TV ↔ Film', () => {
        it('la mappa _tvToMovie include sia Action (28) che Adventure (12) per 10759', () => {
            expect(G._tvToMovie[10759]).toEqual([28, 12]);
        });

        it('la mappa _tvToMovie include sia Sci-Fi (878) che Fantasy (14) per 10765', () => {
            expect(G._tvToMovie[10765]).toEqual([878, 14]);
        });

        it('la mappa _tvToMovie include War (10752) per 10768', () => {
            expect(G._tvToMovie[10768]).toEqual([10752]);
        });

        it('G.getEquivalentGenreIds è simmetrico e bidirezionale', () => {
            expect(G.getEquivalentGenreIds(10759).sort()).toEqual([12, 28]);
            expect(G.getEquivalentGenreIds(28)).toEqual([10759]);
            expect(G.getEquivalentGenreIds(12)).toEqual([10759]);

            expect(G.getEquivalentGenreIds(10765).sort()).toEqual([14, 878]);
            expect(G.getEquivalentGenreIds(878)).toEqual([10765]);
            expect(G.getEquivalentGenreIds(14)).toEqual([10765]);

            expect(G.getEquivalentGenreIds(10768)).toEqual([10752]);
            expect(G.getEquivalentGenreIds(10752)).toEqual([10768]);
        });

        it('mapGenre e mapGenres gestiscono correttamente la conversione multipla', () => {
            expect(G.mapGenre(10759, 'movie')).toEqual([28, 12]);
            expect(G.mapGenres([10759], 'movie')).toEqual([28, 12]);
            expect(G.mapGenres(['10759'], 'movie')).toEqual([28, 12]);
            expect(G.mapGenres([28, 12], 'tv')).toEqual([10759, 10759]);
        });
    });

    describe('BUG-DNA-2: Cross-mapping in computeDnaMultiplier e getVectorScore', () => {
        it('computeDnaMultiplier NON penalizza a 0.1x una serie TV (10759) con DNA Film Azione (28)', () => {
            const tvItem = { id: 7001, genre_ids: [10759] };
            const dnaFilters = [{ type: 'genre', id: 28 }]; // Azione Film

            const multiplier = ProfileScorer.computeDnaMultiplier(tvItem, dnaFilters);
            expect(multiplier).toBe(1.0);
        });

        it('computeDnaMultiplier NON penalizza a 0.1x una serie TV (10759) con DNA Film Avventura (12)', () => {
            const tvItem = { id: 7001, genre_ids: [10759] };
            const dnaFilters = [{ type: 'genre', id: 12 }]; // Avventura Film

            const multiplier = ProfileScorer.computeDnaMultiplier(tvItem, dnaFilters);
            expect(multiplier).toBe(1.0);
        });

        it('computeDnaMultiplier NON penalizza a 0.1x un Film Azione (28) con DNA Serie TV (10759)', () => {
            const movieItem = { id: 550, genre_ids: [28] };
            const dnaFilters = [{ type: 'genre', id: 10759 }]; // Action & Adventure TV

            const multiplier = ProfileScorer.computeDnaMultiplier(movieItem, dnaFilters);
            expect(multiplier).toBe(1.0);
        });

        it('computeDnaMultiplier NON penalizza a 0.1x una serie TV Sci-Fi/Fantasy (10765) con DNA Film Fantasy (14)', () => {
            const tvItem = { id: 7002, genre_ids: [10765] };
            const dnaFilters = [{ type: 'genre', id: 14 }]; // Fantasy Film

            const multiplier = ProfileScorer.computeDnaMultiplier(tvItem, dnaFilters);
            expect(multiplier).toBe(1.0);
        });

        it('computeDnaMultiplier applica 0.1x se i generi sono realmente non correlati', () => {
            const tvItem = { id: 7003, genre_ids: [35] }; // Comedy
            const dnaFilters = [{ type: 'genre', id: 27 }]; // Horror

            const multiplier = ProfileScorer.computeDnaMultiplier(tvItem, dnaFilters);
            expect(multiplier).toBe(0.1);
        });

        it('getVectorScore riconosce sia Action (28) che Adventure (12) per serie TV (10759)', () => {
            const vAction = { 'g:28': 8.0 };
            const vAdventure = { 'g:12': 8.0 };

            expect(ProfileScorer.getVectorScore(vAction, 'g', 10759)).toBe(8.0);
            expect(ProfileScorer.getVectorScore(vAdventure, 'g', 10759)).toBe(8.0);
        });

        it('getVectorScore riconosce sia Sci-Fi (878) che Fantasy (14) per serie TV (10765)', () => {
            const vSciFi = { 'g:878': 7.5 };
            const vFantasy = { 'g:14': 7.5 };

            expect(ProfileScorer.getVectorScore(vSciFi, 'g', 10765)).toBe(7.5);
            expect(ProfileScorer.getVectorScore(vFantasy, 'g', 10765)).toBe(7.5);
        });

        it('lo score VSM di una serie TV 10759 non crolla per profilo amante di Adventure (g:12)', () => {
            const tvItem = {
                id: 7001,
                genre_ids: [10759],
                genres: [{ id: 10759, name: 'Action & Adventure' }],
                vote_average: 7.5,
                vote_count: 500
            };

            const profileAction = {
                compiledVectors: { V_final: { 'g:28': 8.0 } },
                tmdbWeight: 1.0,
                traktWeight: 1.0
            };

            const profileAdventure = {
                compiledVectors: { V_final: { 'g:12': 8.0 } },
                tmdbWeight: 1.0,
                traktWeight: 1.0
            };

            const scoreAction = ProfileScorer.calculateBaseItemMatch(tvItem, profileAction);
            const scoreAdventure = ProfileScorer.calculateBaseItemMatch(tvItem, profileAdventure);

            // Entrambi devono riconoscere l'affinità (~4.89) e non essere penalizzati da alien ratio (1.18)
            expect(scoreAdventure).toBeGreaterThan(4.0);
            expect(Math.abs(scoreAction - scoreAdventure)).toBeLessThan(0.01);
        });
    });

    describe('BUG-DNA-4: Nessuna diluizione nei profili freddi', () => {
        it('un profilo freddo (V_final vuoto, profileMatch = 0) riceve lo score bayesiano pieno, non dimezzato', () => {
            const godfatherMovie = {
                id: 238,
                title: 'The Godfather',
                genre_ids: [18, 80],
                vote_average: 8.7,
                vote_count: 20000
            };

            const coldProfile = {
                compiledVectors: { V_final: {} },
                tmdbWeight: 1.0,
                traktWeight: 1.0
            };

            const score = ProfileScorer.calculateBaseItemMatch(godfatherMovie, coldProfile);

            // Bayesian score con m=1000, C=6.5:
            // ((20000 / 21000) * 8.7) + ((1000 / 21000) * 6.5) = 8.285 + 0.309 = 8.595 (approx ~8.6)
            // Prima del fix: score veniva diviso per 2.0 = ~4.3 (dimezzato)
            // Dopo il fix: score è l'intero punteggio bayesiano (> 8.0)
            expect(score).toBeGreaterThan(8.0);
        });

        it('con profileMatch = 0 lo score finale è uguale al bayesianScore puro', () => {
            const { BAYESIAN_MIN_VOTES, BAYESIAN_MEAN_VOTE } = require('../src/config');
            const movie = {
                id: 1,
                genre_ids: [18],
                vote_average: 8.0,
                vote_count: 1000
            };

            const coldProfile = {
                compiledVectors: { V_final: {} }
            };

            const score = ProfileScorer.calculateBaseItemMatch(movie, coldProfile);
            const expectedBayesian = ((1000 / (1000 + BAYESIAN_MIN_VOTES)) * 8.0) + ((BAYESIAN_MIN_VOTES / (1000 + BAYESIAN_MIN_VOTES)) * BAYESIAN_MEAN_VOTE);
            expect(score).toBeCloseTo(expectedBayesian, 4);
        });
    });
});
