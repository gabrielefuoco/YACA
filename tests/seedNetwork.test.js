const catalogStrategies = require('../src/engines/hybrid/catalogStrategies');
const {
    collectRealSeeds,
    enforceMaxStrandRun,
    SEED_SIGNAL_WEIGHTS,
    SEED_NETWORK_TARGET_SIZE,
    buildHybridCatalog
} = catalogStrategies;
const { calculateHybridScore } = require('../src/engines/hybrid/scoringEngine');
const ProfileScorer = require('../src/profile/ProfileScorer');
const WatchHistory = require('../src/models/WatchHistory');
const UserAccount = require('../src/db/models/UserAccount');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');
const dataFetchers = require('../src/engines/hybrid/dataFetchers');

// Mock Mongoose models to avoid buffering timeouts (~10s per suite)
jest.mock('../src/models/WatchHistory', () => ({
    find: jest.fn()
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/UserLibraryItem', () => ({
    find: jest.fn()
}));

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
    getTmdbMovieDetails: jest.fn()
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromPreset: jest.fn(),
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbMetaDetails: jest.fn()
    };
});

jest.mock('../src/engines/hybrid/dataFetchers', () => ({
    fetchProfileContext: jest.fn(),
    fetchTraktRecommendationsRaw: jest.fn(),
    fetchTraktRecommendationsRawDetailed: jest.fn(),
    fetchPopularFallbackIds: jest.fn(),
    fetchTopRatedPeriodFallbackIds: jest.fn(),
    fetchUndiscoveredFallbackIds: jest.fn(),
    fetchHiddenGemsFallbackIds: jest.fn(),
    fetchRecentHistory: jest.fn(),
    getImpressionMap: jest.fn().mockResolvedValue(new Map()),
    calculateImpressionPenalty: jest.fn().mockReturnValue(1.0)
}));

describe('Ticket 13: Seed Network con seed reali', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default chainable mocks for mongoose models
        WatchHistory.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
        });
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null)
        });
        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
        });
        DuckDbProvider.getDuckDbMetaDetails.mockResolvedValue(undefined);
        DuckDbProvider.getDuckDbCatalogFromPreset.mockResolvedValue([]);
        DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValue([]);
        dataFetchers.fetchTopRatedPeriodFallbackIds.mockResolvedValue([]);
        dataFetchers.fetchPopularFallbackIds.mockResolvedValue([]);
        dataFetchers.fetchTraktRecommendationsRaw.mockResolvedValue([]);
        dataFetchers.fetchTraktRecommendationsRawDetailed.mockResolvedValue([]);
    });

    // =========================================================================
    // Area a: Pesi e scelta dei seed (collectRealSeeds e fallback)
    // =========================================================================
    describe('Area a: Pesi e scelta dei seed (collectRealSeeds)', () => {
        test('definisce la mappa corretta dei pesi SEED_SIGNAL_WEIGHTS: loved 4, liked 3, watched 2, library 1', () => {
            expect(SEED_SIGNAL_WEIGHTS).toBeDefined();
            expect(SEED_SIGNAL_WEIGHTS.loved).toBe(4);
            expect(SEED_SIGNAL_WEIGHTS.liked).toBe(3);
            expect(SEED_SIGNAL_WEIGHTS.watched).toBe(2);
            expect(SEED_SIGNAL_WEIGHTS.library).toBe(1);
            expect(SEED_SIGNAL_WEIGHTS.trakt).toBe(3);
            expect(SEED_SIGNAL_WEIGHTS.dna).toBe(2);
        });

        test('collectRealSeeds estrae e pesa correttamente i segnali loved(4), liked(3), watched(2)', async () => {
            const historyDocs = [
                {
                    tmdbId: 101,
                    type: 'movie',
                    signals: [{ type: 'loved', at: new Date('2026-09-01T10:00:00Z') }]
                },
                {
                    tmdbId: 102,
                    type: 'movie',
                    signals: [{ type: 'liked', at: new Date('2026-09-02T10:00:00Z') }]
                },
                {
                    tmdbId: 103,
                    type: 'movie',
                    signals: [{ type: 'watched', at: new Date('2026-09-03T10:00:00Z') }]
                },
                {
                    tmdbId: 104,
                    type: 'movie',
                    lastWatchedAt: new Date('2026-09-04T10:00:00Z') // Senza signals espliciti -> fallback su watched
                }
            ];
            WatchHistory.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(historyDocs)
            });

            const { seeds, counts } = await collectRealSeeds({
                userId: 'user_1',
                context: 'profile_1',
                mediaType: 'movie'
            });

            expect(seeds.get('101')).toBe(4); // loved: peso costante
            expect(seeds.get('102')).toBe(3); // liked: peso costante
            // watched (ticket 20/E): il peso 2 decade col tempo, quindi non è un numero fisso — le
            // date di questa fixture sono assolute e il decadimento le legge rispetto ad «adesso».
            // Si asserisce il contratto: fra il pavimento (2 × 0.20) e il peso pieno, e il più
            // recente pesa più del più vecchio.
            expect(seeds.get('103')).toBeGreaterThanOrEqual(0.4);
            expect(seeds.get('103')).toBeLessThanOrEqual(2);
            expect(seeds.get('104')).toBeGreaterThan(seeds.get('103'));
            expect(counts).toEqual({ loved: 1, liked: 1, watched: 2, library: 0 });
        });

        test('collectRealSeeds accumula i pesi per un singolo item con segnali multipli (loved + watched decaduto)', async () => {
            const historyDocs = [
                {
                    tmdbId: 200,
                    type: 'movie',
                    signals: [
                        { type: 'loved', at: new Date('2026-09-05T10:00:00Z') },
                        { type: 'watched', at: new Date('2026-09-05T12:00:00Z') }
                    ]
                }
            ];
            WatchHistory.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(historyDocs)
            });

            const { seeds, counts } = await collectRealSeeds({
                userId: 'user_1',
                context: 'profile_1',
                mediaType: 'movie'
            });

            // loved 4 + watched decaduto: il contributo watched sta fra 0.4 (pavimento) e 2 (peso
            // pieno), quindi la somma sta fra 4.4 e 6 — non è più esattamente 6.
            expect(seeds.get('200')).toBeGreaterThanOrEqual(4.4);
            expect(seeds.get('200')).toBeLessThanOrEqual(6);
            expect(counts.loved).toBe(1);
            expect(counts.watched).toBe(1);
        });

        test('filtra rigorosamente per mediaType (movie vs series/tv/anime)', async () => {
            const historyDocs = [
                { tmdbId: 10, type: 'movie', signals: [{ type: 'loved' }] },
                { tmdbId: 20, type: 'tv', signals: [{ type: 'loved' }] },
                { tmdbId: 30, type: 'series', signals: [{ type: 'liked' }] },
                { tmdbId: 40, type: 'anime', signals: [{ type: 'watched' }] }
            ];
            WatchHistory.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue(historyDocs)
            });

            // Richiesta movie: accetta solo tmdbId 10
            const movieResult = await collectRealSeeds({
                userId: 'user_1',
                context: 'profile_1',
                mediaType: 'movie'
            });
            expect(Array.from(movieResult.seeds.keys())).toEqual(['10']);

            // Richiesta series: accetta tv, series e anime (20, 30, 40)
            const seriesResult = await collectRealSeeds({
                userId: 'user_1',
                context: 'profile_1',
                mediaType: 'series'
            });
            expect(Array.from(seriesResult.seeds.keys()).sort()).toEqual(['20', '30', '40'].sort());
        });

        test('rispetta i cap di loved/liked/library; watched non ha più tetto: entra tutta col peso decaduto', async () => {
            // Genera 25 item loved con timestamp crescenti (1 = più vecchio, 25 = più recente)
            const lovedSignals = Array.from({ length: 25 }, (_, i) => ({
                tmdbId: 1000 + i,
                type: 'movie',
                signals: [{ type: 'loved', at: new Date(2026, 0, i + 1).toISOString() }]
            }));
            // Genera 20 item watched con timestamp crescenti
            const watchedSignals = Array.from({ length: 20 }, (_, i) => ({
                tmdbId: 2000 + i,
                type: 'movie',
                signals: [{ type: 'watched', at: new Date(2026, 1, i + 1).toISOString() }]
            }));

            WatchHistory.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([...lovedSignals, ...watchedSignals])
            });

            const { seeds, counts } = await collectRealSeeds({
                userId: 'user_1',
                context: 'profile_1',
                mediaType: 'movie'
            });

            expect(counts.loved).toBe(20); // Cap a 20
            // Nessun tetto sui visti: il taglio a 15 è stato rimosso dal ticket 20/E, perché
            // rendeva identiche le liste di chi ha visto 50 e chi ne ha visti 100.
            expect(counts.watched).toBe(20);

            // I 5 loved più vecchi (1000..1004) devono essere stati scartati
            for (let i = 0; i < 5; i++) {
                expect(seeds.has(String(1000 + i))).toBe(false);
            }
            // I 20 loved più recenti (1005..1024) devono essere presenti
            for (let i = 5; i < 25; i++) {
                expect(seeds.has(String(1000 + i))).toBe(true);
            }

            // Tutti i 20 watched entrano (nessun tetto): a differenziarli è il peso decaduto,
            // non un taglio.
            for (let i = 0; i < 20; i++) {
                expect(seeds.has(String(2000 + i))).toBe(true);
            }
            // Qui NON si asserisce l'ordine fra recente e vecchio: le date di questa fixture
            // (febbraio) sono tutte oltre le ~140 giornate in cui il decadimento distingue, e dal
            // pavimento in giù i pesi coincidono (0.20). È il prezzo dichiarato del pavimento:
            // garantisce che una visione vecchia non sparisca, non che pesi meno di un'altra
            // ugualmente vecchia. L'ordinamento del decadimento è verificato sopra, con date
            // dentro la finestra.
        });

        test('Gate libreria-su-history: se WatchHistory è vuota, UserLibraryItem NON viene interrogato (mat_cold_static)', async () => {
            WatchHistory.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([])
            });

            const result = await collectRealSeeds({
                userId: 'cold_user',
                context: 'mat_cold_static',
                mediaType: 'movie',
                user: { uuid: 'addon_uuid_cold' }
            });

            expect(UserLibraryItem.find).not.toHaveBeenCalled();
            expect(result.counts.library).toBe(0);
            expect(result.seeds.size).toBe(0);
        });

        test('Gate libreria-su-history: se WatchHistory ha item, UserLibraryItem viene letto con filtro corretto e peso 1', async () => {
            WatchHistory.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { tmdbId: 1, type: 'movie', signals: [{ type: 'watched', at: new Date() }] }
                ])
            });

            const libraryDocs = [
                { tmdbId: 301, type: 'movie', removed: false, addedAt: new Date('2026-08-01') },
                { tmdbId: 302, type: 'movie', removed: false, addedAt: new Date('2026-08-02') },
                { tmdbId: 303, type: 'series', removed: false, addedAt: new Date('2026-08-03') } // mediaType diverso
            ];

            const mockLibraryFind = jest.fn().mockResolvedValue(libraryDocs);
            UserLibraryItem.find.mockReturnValue({ lean: mockLibraryFind });

            const result = await collectRealSeeds({
                userId: 'active_user',
                context: 'profile_active',
                mediaType: 'movie',
                user: { addonUuid: 'uuid_active' }
            });

            expect(UserLibraryItem.find).toHaveBeenCalledWith({
                addonUuid: 'uuid_active',
                removed: { $ne: true },
                tmdbId: { $exists: true, $ne: null }
            });

            expect(result.counts.library).toBe(2);
            expect(result.seeds.get('301')).toBe(1);
            expect(result.seeds.get('302')).toBe(1);
            expect(result.seeds.has('303')).toBe(false); // Ignorato per mediaType
        });

        test('Fallback legacy: in buildHybridCatalog, AddonConfig loved/liked (4/3) si attivano SOLO se realSeeds è vuoto', async () => {
            // Caso 1: WatchHistory vuota -> realSeeds vuoto -> fallback su user.profiles[].loved/liked
            dataFetchers.fetchProfileContext.mockResolvedValueOnce({
                profile: { compiledVectors: { V_final: {} } },
                user: {
                    profiles: [{ id: 'ctx_legacy', loved: [801], liked: [802] }]
                }
            });
            WatchHistory.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([])
            });
            DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 901, title: 'Item from Legacy Seed', genre_ids: [18], vote_count: 500, vote_average: 7.0 }
            ]);

            const legacyResult = await buildHybridCatalog('user1', 'ctx_legacy', null, 'tmdb_key', 'movie');
            expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
                expect.objectContaining({ similar_to: expect.stringMatching(/801|802/) }),
                'movie',
                0,
                80,
                expect.any(Object)
            );
            expect(legacyResult.length).toBeGreaterThan(0);

            // Caso 2: WatchHistory contiene già un seed reale -> fallback legacy NON viene applicato
            DuckDbProvider.getDuckDbCatalogFromFilters.mockClear();
            dataFetchers.fetchProfileContext.mockResolvedValueOnce({
                profile: { compiledVectors: { V_final: {} } },
                user: {
                    profiles: [{ id: 'ctx_active', loved: [99999] }] // Legacy seed da NON usare
                }
            });
            WatchHistory.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([
                    { tmdbId: 777, type: 'movie', signals: [{ type: 'watched', at: new Date() }] }
                ])
            });
            DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 902, title: 'Item from Real Seed', genre_ids: [18], vote_count: 500, vote_average: 7.0 }
            ]);

            await buildHybridCatalog('user1', 'ctx_active', null, 'tmdb_key', 'movie');
            // La query DuckDB deve interrogare similar_to: 777 e MAI 99999
            expect(DuckDbProvider.getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
                expect.objectContaining({ similar_to: '777' }),
                'movie',
                0,
                80,
                expect.any(Object)
            );
            expect(DuckDbProvider.getDuckDbCatalogFromFilters).not.toHaveBeenCalledWith(
                expect.objectContaining({ similar_to: '99999' }),
                expect.anything(),
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
        });
    });

    // =========================================================================
    // Area b: calculateHybridScore
    // =========================================================================
    describe('Area b: calculateHybridScore (proprietà matematiche e convergenza)', () => {
        const topGenres = [28, 12];
        const itemGenres = [28];

        test('è monotona strettamente crescente rispetto al count per un pool fissato', () => {
            const counts = [1, 2, 3, 5, 8, 12, 16, 20];
            const poolMap = new Map();
            counts.forEach((c, idx) => poolMap.set(100 + idx, c));

            const scores = counts.map((c, idx) => {
                const item = { tmdbId: 100 + idx, position: null };
                return calculateHybridScore(item, poolMap, topGenres, itemGenres);
            });

            for (let i = 0; i < scores.length - 1; i++) {
                expect(scores[i + 1]).toBeGreaterThan(scores[i]);
            }
        });

        test('è saturante: presenta rendimenti marginali decrescenti (concavità logaritmica)', () => {
            const poolMap = new Map([
                [1, 1], [2, 2], [3, 3],
                [8, 8], [9, 9], [10, 10], [20, 20]
            ]);

            const scoreAt = (cnt) => calculateHybridScore(
                { tmdbId: cnt, position: null },
                poolMap,
                [],
                []
            );

            const delta1to2 = scoreAt(2) - scoreAt(1);
            const delta2to3 = scoreAt(3) - scoreAt(2);
            const delta9to10 = scoreAt(10) - scoreAt(9);

            // Il guadagno marginale da 1 a 2 deve essere maggiore di quello da 2 a 3
            expect(delta1to2).toBeGreaterThan(delta2to3);
            // Il guadagno marginale all'inizio della curva deve superare nettamente quello in saturazione
            expect(delta2to3).toBeGreaterThan(delta9to10);
        });

        test('evita il collasso esponenziale del vecchio algoritmo (count=7 loved+liked produce un punteggio solido)', () => {
            const poolMap = new Map([
                [1, 1],
                [2, 2],
                [3, 3],
                [7, 7], // loved (4) + liked (3)
                [15, 15]
            ]);

            const score1 = calculateHybridScore({ tmdbId: 1, position: null }, poolMap, [], []);
            const score3 = calculateHybridScore({ tmdbId: 3, position: null }, poolMap, [], []);
            const score7 = calculateHybridScore({ tmdbId: 7, position: null }, poolMap, [], []);

            // Nel vecchio algoritmo (100 / 2^(count-1)), count=7 produceva Math.floor(100 / 64) = 1.
            // Con la nuova curva, count=7 deve essere decisamente maggiore di count=1 e count=3
            expect(score7).toBeGreaterThan(score3);
            expect(score7).toBeGreaterThan(score1);
            // La componente count normalizzata logaritmica per count=7 con maxCount=15 vale ~75% del massimo
            expect(score7).toBeGreaterThan(60);

            // Nel caso in cui count=7 sia il massimo del pool, il punteggio della componente deve essere esattamente 100
            const singleMaxMap = new Map([[7, 7]]);
            const maxScore = calculateHybridScore({ tmdbId: 7, position: null }, singleMaxMap, [], []);
            expect(maxScore).toBe(100);
        });

        test('applica correttamente il bonus posizione decrescente (50 - pos) e nessun bonus oltre soglia o con null', () => {
            const poolMap = new Map([[1, 5]]);
            const baseScore = calculateHybridScore({ tmdbId: 1, position: null }, poolMap, [], []);

            const scorePos0 = calculateHybridScore({ tmdbId: 1, position: 0 }, poolMap, [], []);
            const scorePos10 = calculateHybridScore({ tmdbId: 1, position: 10 }, poolMap, [], []);
            const scorePos49 = calculateHybridScore({ tmdbId: 1, position: 49 }, poolMap, [], []);
            const scorePos50 = calculateHybridScore({ tmdbId: 1, position: 50 }, poolMap, [], []);
            const scorePos100 = calculateHybridScore({ tmdbId: 1, position: 100 }, poolMap, [], []);

            expect(scorePos0 - baseScore).toBe(50);
            expect(scorePos10 - baseScore).toBe(40);
            expect(scorePos49 - baseScore).toBe(1);
            expect(scorePos50 - baseScore).toBe(0);
            expect(scorePos100 - baseScore).toBe(0);

            expect(scorePos0).toBeGreaterThan(scorePos10);
            expect(scorePos10).toBeGreaterThan(scorePos49);
            expect(scorePos50).toBe(baseScore);
        });
    });

    // =========================================================================
    // Area c: enforceMaxStrandRun
    // =========================================================================
    describe('Area c: enforceMaxStrandRun (cap run filone e shifting)', () => {
        function itemWithStrand(id, strand) {
            // Configura genre/keywords/title per simulare i filoni noti di ProfileScorer
            if (strand === 'strand:true_crime_doc') {
                return { id, genre_ids: [99, 80], title: `CrimeDoc ${id}` };
            }
            if (strand === 'strand:anime') {
                return { id, genre_ids: [16], original_language: 'ja', title: `Anime ${id}` };
            }
            if (strand === 'genre:35') {
                return { id, genre_ids: [35], title: `Comedy ${id}` };
            }
            if (strand === 'genre:18') {
                return { id, genre_ids: [18], title: `Drama ${id}` };
            }
            return { id, genre_ids: [28], title: `Action ${id}` };
        }

        function getConsecutiveStrandRuns(items) {
            const runs = [];
            let current = null;
            let count = 0;
            for (const item of items) {
                const strand = ProfileScorer.getItemNarrativeStrand(item);
                if (strand === current) {
                    count++;
                } else {
                    if (current !== null) runs.push({ strand: current, count });
                    current = strand;
                    count = 1;
                }
            }
            if (current !== null) runs.push({ strand: current, count });
            return runs;
        }

        test('nessun run consecutivo supera maxRun', () => {
            const input = [
                itemWithStrand(1, 'strand:anime'),
                itemWithStrand(2, 'strand:anime'),
                itemWithStrand(3, 'strand:anime'),
                itemWithStrand(4, 'strand:anime'),
                itemWithStrand(5, 'strand:true_crime_doc'),
                itemWithStrand(6, 'strand:anime'),
                itemWithStrand(7, 'genre:35'),
                itemWithStrand(8, 'genre:35'),
                itemWithStrand(9, 'genre:35'),
                itemWithStrand(10, 'genre:35')
            ];

            const result = enforceMaxStrandRun(input, 3);
            const runs = getConsecutiveStrandRuns(result);

            for (const run of runs) {
                expect(run.count).toBeLessThanOrEqual(3);
            }
        });

        test('sposta in avanti la prima alternativa diversa per spezzare il run preservando gli elementi', () => {
            // 4 anime seguiti da 1 comedy e un altro anime
            const input = [
                itemWithStrand(1, 'strand:anime'),
                itemWithStrand(2, 'strand:anime'),
                itemWithStrand(3, 'strand:anime'),
                itemWithStrand(4, 'strand:anime'),
                itemWithStrand(5, 'genre:35'),
                itemWithStrand(6, 'strand:anime')
            ];

            const result = enforceMaxStrandRun(input, 3);

            // Per maxRun = 3, l'item 5 (Comedy) viene spostato prima dell'item 4 per spezzare il run
            expect(result.map(i => i.id)).toEqual([1, 2, 3, 5, 4, 6]);
            // Tutti i 6 item sono conservati
            expect(result.length).toBe(6);
            // I run di anime sono 3 e poi 2
            const runs = getConsecutiveStrandRuns(result);
            expect(runs).toEqual([
                { strand: 'strand:anime', count: 3 },
                { strand: 'genre:35', count: 1 },
                { strand: 'strand:anime', count: 2 }
            ]);
        });

        test('scarta gli item in eccesso quando non esistono alternative diverse disponibili', () => {
            // 5 anime consecutivi senza alcun elemento di altro filone
            const input = [
                itemWithStrand(1, 'strand:anime'),
                itemWithStrand(2, 'strand:anime'),
                itemWithStrand(3, 'strand:anime'),
                itemWithStrand(4, 'strand:anime'),
                itemWithStrand(5, 'strand:anime')
            ];

            const result = enforceMaxStrandRun(input, 3);

            expect(result.map(i => i.id)).toEqual([1, 2, 3]);
            expect(result.length).toBe(3);
        });

        test('nessun duplicato e nessun item inventato nel risultato', () => {
            const input = [
                itemWithStrand(1, 'genre:35'),
                itemWithStrand(2, 'genre:35'),
                itemWithStrand(3, 'genre:35'),
                itemWithStrand(4, 'genre:35'),
                itemWithStrand(5, 'genre:18'),
                itemWithStrand(6, 'genre:18'),
                itemWithStrand(7, 'genre:18'),
                itemWithStrand(8, 'genre:18'),
                itemWithStrand(9, 'strand:true_crime_doc'),
                itemWithStrand(10, 'genre:35')
            ];

            const result = enforceMaxStrandRun(input, 2);
            const resultIds = result.map(i => i.id);
            const inputIds = input.map(i => i.id);

            // Tutti gli ID del risultato appartengono all'input
            for (const id of resultIds) {
                expect(inputIds).toContain(id);
            }
            // Nessun duplicato
            expect(new Set(resultIds).size).toBe(resultIds.length);
            // Lunghezza <= input
            expect(result.length).toBeLessThanOrEqual(input.length);
        });

        test('caso mono-filone (pool tutto di un singolo topos/genere): accorcia a maxRun mantenendo l\'ordine originale', () => {
            // Simula il caso citato nel report: pool tutto L2:t_19 (es. 10 item comedy)
            const input = Array.from({ length: 10 }, (_, i) => itemWithStrand(i + 1, 'genre:35'));

            const result = enforceMaxStrandRun(input, 3);

            expect(result.length).toBe(3);
            expect(result.map(i => i.id)).toEqual([1, 2, 3]);
        });

        test('gestisce input brevi o non validi senza alterazioni', () => {
            expect(enforceMaxStrandRun([])).toEqual([]);
            expect(enforceMaxStrandRun(null)).toEqual([]);
            const short = [itemWithStrand(1, 'genre:35'), itemWithStrand(2, 'genre:35')];
            expect(enforceMaxStrandRun(short, 3)).toEqual(short);
        });
    });

    // =========================================================================
    // Area d: buildSeedNetworkFill (e pipeline di refill Seed Network)
    // =========================================================================
    describe('Area d: buildSeedNetworkFill (refill profilo freddo)', () => {
        test('rileva che buildSeedNetworkFill non è esportata direttamente in module.exports', () => {
            // Segnala come discrepanza architetturale: a differenza di collectRealSeeds
            // ed enforceMaxStrandRun, buildSeedNetworkFill è rimasta privata nel modulo.
            expect(catalogStrategies.buildSeedNetworkFill).toBeUndefined();
        });

        test('il fill NON interviene se il catalogo ha già raggiunto la dimensione target (>= 100)', async () => {
            dataFetchers.fetchProfileContext.mockResolvedValueOnce({
                profile: { compiledVectors: { V_final: {} } },
                user: { uuid: 'u1' }
            });
            WatchHistory.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([
                    { tmdbId: 10, type: 'movie', signals: [{ type: 'loved' }] }
                ])
            });

            // Restituisce 120 candidati diversificati da DuckDb: superano i 100 rispettando i cap di genere e regista
            const similarPool = Array.from({ length: 120 }, (_, i) => ({
                id: 1000 + i,
                title: `Candidate ${i}`,
                genre_ids: [1000 + i],
                credits: { crew: [{ id: 5000 + i, job: 'Director' }] },
                vote_count: 500,
                vote_average: 7.0
            }));
            DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValueOnce(similarPool);

            await buildHybridCatalog('user1', 'ctx1', null, 'tmdb_key', 'movie');

            // Non deve interrogare il fallback top-rated per il fill
            expect(dataFetchers.fetchTopRatedPeriodFallbackIds).not.toHaveBeenCalled();
            expect(DuckDbProvider.getDuckDbMetaDetails).not.toHaveBeenCalled();
        });

        test('usa il fallback top-rated idratato con getDuckDbMetaDetails quando il catalogo è < 100', async () => {
            dataFetchers.fetchProfileContext.mockResolvedValueOnce({
                profile: { compiledVectors: { V_final: {} } },
                user: { uuid: 'u1' }
            });
            WatchHistory.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([
                    { tmdbId: 10, type: 'movie', signals: [{ type: 'loved' }] }
                ])
            });

            // DuckDb simile restituisce solo 2 item
            DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 101, title: 'Item 101', genre_ids: [18], vote_count: 500, vote_average: 7.0 },
                { id: 102, title: 'Item 102', genre_ids: [35], vote_count: 500, vote_average: 7.0 }
            ]);

            // Fallback top-rated fornisce nuovi ID
            dataFetchers.fetchTopRatedPeriodFallbackIds.mockResolvedValueOnce(['501', '502', '503']);

            // Mock idratazione con DuckDbProvider.getDuckDbMetaDetails
            DuckDbProvider.getDuckDbMetaDetails.mockImplementation(async (id) => {
                if (id === '501') {
                    return {
                        rawTMDB: { id: 501, title: 'TopRated 501', genre_ids: [18], vote_count: 1000, vote_average: 8.0 }
                    };
                }
                if (id === '502') {
                    // Sotto il pavimento di qualità (vote_average < 6.0) -> scartato
                    return {
                        rawTMDB: { id: 502, title: 'Low Quality 502', genre_ids: [18], vote_count: 1000, vote_average: 5.2 }
                    };
                }
                if (id === '503') {
                    return {
                        rawTMDB: { id: 503, title: 'TopRated 503', genre_ids: [35], vote_count: 800, vote_average: 7.5 }
                    };
                }
                return undefined;
            });

            const result = await buildHybridCatalog('user1', 'ctx1', null, 'tmdb_key', 'movie');

            // 5° argomento: typeSelectors (null quando il profilo non ne ha) — ticket 31
            expect(dataFetchers.fetchTopRatedPeriodFallbackIds).toHaveBeenCalledWith('tmdb_key', 'movie', 160, false, null);
            expect(DuckDbProvider.getDuckDbMetaDetails).toHaveBeenCalledWith('501', 'movie');
            expect(DuckDbProvider.getDuckDbMetaDetails).toHaveBeenCalledWith('502', 'movie');
            expect(DuckDbProvider.getDuckDbMetaDetails).toHaveBeenCalledWith('503', 'movie');

            const resultIds = result.map(i => i.id);
            expect(resultIds).toContain('101');
            expect(resultIds).toContain('102');
            expect(resultIds).toContain('501'); // Entrato dal fill
            expect(resultIds).not.toContain('502'); // Rifiutato dal pavimento qualità
            expect(resultIds).toContain('503'); // Entrato dal fill
        });

        test('se getDuckDbMetaDetails ritorna undefined o fallisce, il fill non esplode e preserva il catalogo esistente', async () => {
            dataFetchers.fetchProfileContext.mockResolvedValueOnce({
                profile: { compiledVectors: { V_final: {} } },
                user: { uuid: 'u1' }
            });
            WatchHistory.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([
                    { tmdbId: 10, type: 'movie', signals: [{ type: 'loved' }] }
                ])
            });

            DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 201, title: 'Item 201', genre_ids: [18], vote_count: 500, vote_average: 7.0 }
            ]);

            dataFetchers.fetchTopRatedPeriodFallbackIds.mockResolvedValueOnce(['601', '602']);

            // 601 ritorna undefined, 602 lancia errore
            DuckDbProvider.getDuckDbMetaDetails
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('DuckDb IO error'));

            const result = await buildHybridCatalog('user1', 'ctx1', null, 'tmdb_key', 'movie');

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.map(i => i.id)).toEqual(['201']);
        });

        test('dopo il fill vengono riapplicati i cap di qualità ed enforceMaxStrandRun', async () => {
            dataFetchers.fetchProfileContext.mockResolvedValueOnce({
                profile: { compiledVectors: { V_final: {} } },
                user: { uuid: 'u1' }
            });
            WatchHistory.find.mockReturnValueOnce({
                lean: jest.fn().mockResolvedValue([
                    { tmdbId: 10, type: 'movie', signals: [{ type: 'loved' }] }
                ])
            });

            // 2 item iniziali anime
            DuckDbProvider.getDuckDbCatalogFromFilters.mockResolvedValueOnce([
                { id: 701, title: 'Anime 1', genre_ids: [16], original_language: 'ja', vote_count: 500, vote_average: 7.5 },
                { id: 702, title: 'Anime 2', genre_ids: [16], original_language: 'ja', vote_count: 500, vote_average: 7.5 }
            ]);

            // Il fill fornisce altri 5 anime consecutivi (totale 7 anime) e 1 comedy
            dataFetchers.fetchTopRatedPeriodFallbackIds.mockResolvedValueOnce([
                '703', '704', '705', '706', '707', '801'
            ]);

            DuckDbProvider.getDuckDbMetaDetails.mockImplementation(async (id) => {
                if (id === '801') {
                    return {
                        rawTMDB: { id: 801, title: 'Comedy 1', genre_ids: [35], vote_count: 500, vote_average: 7.5 }
                    };
                }
                return {
                    rawTMDB: { id: Number(id), title: `Anime ${id}`, genre_ids: [16], original_language: 'ja', vote_count: 500, vote_average: 7.5 }
                };
            });

            const result = await buildHybridCatalog('user1', 'ctx1', null, 'tmdb_key', 'movie');

            // Verifica che dopo il fill enforceMaxStrandRun non lasci più di 3 anime consecutivi
            let maxAnimeRun = 0;
            let currentAnimeRun = 0;
            for (const item of result) {
                // Item con id 801 è comedy, gli altri sono anime (16, ja)
                if (item.id !== '801') {
                    currentAnimeRun++;
                    if (currentAnimeRun > maxAnimeRun) maxAnimeRun = currentAnimeRun;
                } else {
                    currentAnimeRun = 0;
                }
            }

            expect(maxAnimeRun).toBeLessThanOrEqual(3);
        });
    });
});
