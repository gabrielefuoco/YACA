const mockCacheStore = new Map();

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn(async key => {
            const value = mockCacheStore.get(key);
            return value === undefined
                ? { value: null, status: 'miss' }
                : { value, status: 'fresh' };
        }),
        set: jest.fn(async (key, value) => mockCacheStore.set(key, value)),
        delete: jest.fn(async key => mockCacheStore.delete(key)),
        clear: jest.fn(async () => mockCacheStore.clear())
    }
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));

jest.mock('../src/models/RecommendationImpression', () => ({
    bulkWrite: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/models/WatchHistory', () => {
    const emptyQuery = () => {
        const q = {};
        q.sort = () => q;
        q.limit = () => q;
        q.select = () => q;
        q.lean = () => Promise.resolve([]);
        q.then = (resolve, reject) => Promise.resolve([]).then(resolve, reject);
        return q;
    };
    return { find: jest.fn(emptyQuery), findOne: jest.fn(emptyQuery), countDocuments: jest.fn().mockResolvedValue(0) };
});

jest.mock('../src/db/models/UserLibraryItem', () => ({
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    countDocuments: jest.fn().mockResolvedValue(0)
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: { get: jest.fn() },
    smartTraktRefresh: jest.fn()
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn(),
    createTmdbClient: jest.fn(),
    prioritizeLocalizedImages: jest.fn(items => items || [])
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn(),
        getDuckDbCatalogFromFilters: jest.fn(),
        getDuckDbCatalogFromPreset: jest.fn()
    };
});

jest.mock('../src/engines/graph/HierarchicalGraph', () => {
    const actual = jest.requireActual('../src/engines/graph/HierarchicalGraph');
    return {
        ...actual,
        loadData: jest.fn().mockResolvedValue(true),
        getTopKeywordsForNode: jest.fn().mockReturnValue([]),
        getTopKeywordsForNodes: jest.fn().mockReturnValue([]),
        vectorizeKeywords: jest.fn().mockReturnValue({})
    };
});

const TasteProfile = require('../src/models/TasteProfile');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const ProfileScorer = require('../src/profile/ProfileScorer');
const { computeAnimeScoreMultiplier, resolveAnimePolicy } = require('../src/engines/hybrid/animePolicy');
const {
    getDuckDbMetaDetails,
    getDuckDbCatalogFromFilters,
    getDuckDbCatalogFromPreset
} = require('../src/catalog/providers/DuckDbProvider');
const {
    buildTopGenresMixCatalog,
    buildHiddenGemsCatalog,
    finalizeHeroQualityCandidates
} = require('../src/engines/hybrid/catalogStrategies');
const { normalizeAnimeMarker } = require('../src/utils/animeIdentity');

describe('Issue 17 - Hero Seam Anime (4 Leve TDD)', () => {
    // Fixtures
    const mkAnime = (id, subGenre = 28, score = 8.0) => ({
        id,
        title: `Anime Movie ${id}`,
        name: `Anime Movie ${id}`,
        original_language: 'ja',
        genre_ids: subGenre ? [16, subGenre] : [16],
        genres: subGenre ? [{ id: 16, name: 'Animation' }, { id: subGenre, name: 'Sub' }] : [{ id: 16, name: 'Animation' }],
        vote_count: 5000,
        vote_average: score,
        popularity: 120,
        keywords: [{ id: 210024, name: 'anime' }],
        release_date: '2020-01-01'
    });

    const mkLiveAction = (id, genre = 28, score = 7.5) => ({
        id,
        title: `Live Action ${id}`,
        name: `Live Action ${id}`,
        original_language: 'en',
        genre_ids: [genre, 18],
        genres: [{ id: genre, name: 'Genre' }, { id: 18, name: 'Drama' }],
        vote_count: 15000,
        vote_average: score,
        popularity: 150,
        keywords: [{ id: 100, name: 'action' }],
        release_date: '2019-01-01'
    });

    const mockItems = {};
    // 20 anime (mix di action 28, fantasy 14, romance 10749, scifi 878)
    for (let i = 1; i <= 5; i++) mockItems[`10${i}`] = mkAnime(100 + i, 28, 8.5);
    for (let i = 1; i <= 5; i++) mockItems[`11${i}`] = mkAnime(110 + i, 14, 8.4);
    for (let i = 1; i <= 5; i++) mockItems[`12${i}`] = mkAnime(120 + i, 10749, 8.3);
    for (let i = 1; i <= 5; i++) mockItems[`13${i}`] = mkAnime(130 + i, 878, 8.2);

    // 10 live action blockbuster
    for (let i = 1; i <= 10; i++) mockItems[`20${i}`] = mkLiveAction(200 + i, 28, 7.8);

    const toStoreRow = (it) => ({
        id: `tmdb:${it.id}`,
        _tmdbId: it.id,
        type: 'movie',
        name: it.title,
        vote_average: it.vote_average,
        vote_count: it.vote_count,
        popularity: it.popularity,
        genre_ids: it.genre_ids,
        original_language: it.original_language,
        overview: it.overview || '',
        rawTMDB: it
    });

    beforeEach(() => {
        mockCacheStore.clear();
        jest.clearAllMocks();

        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                userId: 'otaku_user',
                addonUuid: 'addon_uuid',
                apiKeys: { trakt: 'trakt_token', tmdb: 'tmdb_key' }
            })
        });

        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                uuid: 'addon_uuid',
                userId: 'otaku_user',
                apiKeys: { trakt: 'trakt_token', tmdb: 'tmdb_key' },
                profiles: [{
                    id: '1c1da0af',
                    settings: { kidsMode: false, typeSelectors: { film: false, serie: false, anime: null } }
                }]
            })
        });

        // Profilo Otaku Hardcore: anime: null ma DNA dominato da animazione (quota ~39% -> FAVORED)
        TasteProfile.findOne.mockImplementation(({ context }) => Promise.resolve({
            owner: 'otaku_user',
            context,
            compiledVectors: {
                V_final: { 'g:16': 15, 'g:28': 10, 'g:14': 8, 'g:18': 5, 'k:210024': 8 }
            },
            settings: { typeSelectors: { anime: null } },
            lastUpdated: new Date()
        }));

        getDuckDbMetaDetails.mockImplementation(async (id) => {
            const item = mockItems[String(id)];
            return item ? toStoreRow(item) : null;
        });

        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const whereStr = JSON.stringify(preset.where || []);
            const all = Object.values(mockItems);
            if (whereStr.includes('original_language') || whereStr.includes('anime_mappings')) {
                return all.filter(it => it.original_language === 'ja' || it.genre_ids.includes(16)).map(toStoreRow);
            }
            if (whereStr.includes('NOT')) {
                return all.filter(it => it.original_language !== 'ja' && !it.genre_ids.includes(16)).map(toStoreRow);
            }
            return all.map(toStoreRow);
        });

        getDuckDbCatalogFromFilters.mockImplementation(async (filters) => {
            const all = Object.values(mockItems);
            if (filters.isAnime) {
                return all.filter(it => it.original_language === 'ja' || it.genre_ids.includes(16)).map(toStoreRow);
            }
            if (filters.notAnime) {
                return all.filter(it => it.original_language !== 'ja' && !it.genre_ids.includes(16)).map(toStoreRow);
            }
            return all.map(toStoreRow);
        });
    });

    // =========================================================================
    // Leva 1: Clausola anime nel canale Generi Primari sotto favored
    // =========================================================================
    describe('Leva 1: Clausola anime nel Canale Generi Primari sotto favored', () => {
        test('invia clausola F.anime a DuckDB per i Generi Primari quando la policy è favored', async () => {
            const presetsCalled = [];
            getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
                presetsCalled.push(preset);
                return Object.values(mockItems).map(toStoreRow);
            });

            await buildTopGenresMixCatalog('otaku_user', '1c1da0af', 'tmdb_key', 'movie', false, null);

            // Verifica che tra le chiamate a DuckDB per Generi Primari ci sia la clausola F.anime
            const genreChannelPresets = presetsCalled.filter(p => {
                const whereStr = JSON.stringify(p.where || []);
                return whereStr.includes('vote_count') || whereStr.includes('popularity');
            });

            expect(genreChannelPresets.length).toBeGreaterThan(0);
            for (const preset of genreChannelPresets) {
                const whereStr = JSON.stringify(preset.where || []);
                // Deve includere il marker F.anime (lingua ja o anime_mappings)
                const hasAnimeClause = whereStr.includes('anime_mappings') || (whereStr.includes('original_language') && whereStr.includes('ja'));
                expect(hasAnimeClause).toBe(true);
            }
        });
    });

    // =========================================================================
    // Leva 2: Strand dedicato per gli anime e sblocco cap
    // =========================================================================
    describe('Leva 2: Strand dedicato per gli anime', () => {
        test('ProfileScorer.getItemNarrativeStrand differenzia gli anime per sotto-filone/genere', () => {
            const actionAnime = mkAnime(1, 28);
            const romanceAnime = mkAnime(2, 10749);
            const fantasyAnime = mkAnime(3, 14);
            const pureAnime = mkAnime(4, null); // solo 16

            expect(ProfileScorer.getItemNarrativeStrand(actionAnime)).toBe('strand:anime:28');
            expect(ProfileScorer.getItemNarrativeStrand(romanceAnime)).toBe('strand:anime:10749');
            expect(ProfileScorer.getItemNarrativeStrand(fantasyAnime)).toBe('strand:anime:14');
            expect(ProfileScorer.getItemNarrativeStrand(pureAnime)).toBe('strand:anime');
        });

        test('applyDiversityCaps accetta più di 3 anime complessivi appartenenti a filoni diversi', () => {
            const items = [
                mkAnime(1, 28), mkAnime(2, 28), mkAnime(3, 28), // 3 action anime
                mkAnime(4, 14), mkAnime(5, 14), mkAnime(6, 14), // 3 fantasy anime
                mkAnime(7, 10749), mkAnime(8, 10749)            // 2 romance anime
            ];

            const capped = ProfileScorer.applyDiversityCaps(items, { genre: 10, director: 3, strand: 3 });
            // Con strand unificato ne sarebbero passati solo 3. Con filoni differenziati passano tutti e 8!
            expect(capped.length).toBe(8);
        });

        test('finalizeHeroQualityCandidates non penalizza con overflow anime di filoni differenti', () => {
            const scoredPool = [
                { data: mkAnime(1, 28), score: 9.0 },
                { data: mkAnime(2, 28), score: 8.9 },
                { data: mkAnime(3, 28), score: 8.8 },
                { data: mkAnime(4, 14), score: 8.7 },
                { data: mkAnime(5, 14), score: 8.6 },
                { data: mkAnime(6, 14), score: 8.5 },
                { data: mkLiveAction(1, 28), score: 7.0 }
            ];

            const result = finalizeHeroQualityCandidates(scoredPool, { genre: 10, director: 3, strand: 3, highMatchThreshold: 3.8 }, 6);
            expect(result.length).toBe(6);
            const animeCount = result.filter(r => (r.data || r).genre_ids.includes(16)).length;
            expect(animeCount).toBe(6);
        });
    });

    // =========================================================================
    // Leva 3: Moltiplicatore simmetrico
    // =========================================================================
    describe('Leva 3: Moltiplicatore simmetrico sotto favored', () => {
        test('computeAnimeScoreMultiplier assegna ×1.15 ad anime e ×0.85 a non-anime sotto favored', () => {
            const anime = mkAnime(1);
            const liveAction = mkLiveAction(1);

            const animeMult = computeAnimeScoreMultiplier(anime, 'favored');
            const liveMult = computeAnimeScoreMultiplier(liveAction, 'favored');

            expect(animeMult).toBe(1.15);
            expect(liveMult).toBe(0.85);

            // Verifica simmetria esatta rispetto a 1.00: delta = 0.15
            expect(Math.round((animeMult - 1.0) * 100)).toBe(15);
            expect(Math.round((1.0 - liveMult) * 100)).toBe(15);
        });
    });

    // =========================================================================
    // Leva 4: Fix dei due fallback con effectiveTypeSelectors
    // =========================================================================
    describe('Leva 4: Fix dei due fallback con effectiveTypeSelectors', () => {
        test('il fallback da candidatePool.length === 0 riceve effectiveTypeSelectors (isAnime: true) per profilo anime con anime: null', async () => {
            // Profilo anime-only da DNA ma con settings anime: null
            TasteProfile.findOne.mockImplementation(({ context }) => Promise.resolve({
                owner: 'otaku_user',
                context,
                compiledVectors: {
                    V_final: { 'g:16': 30, 'g:28': 5 }
                },
                settings: { typeSelectors: { anime: null } },
                lastUpdated: new Date()
            }));

            // Svuotiamo il pool per forzare il fallback 1 (candidatePool.length === 0)
            getDuckDbCatalogFromPreset.mockResolvedValue([]);

            let capturedFilters = null;
            getDuckDbCatalogFromFilters.mockImplementation(async (filters) => {
                capturedFilters = filters;
                return [toStoreRow(mkAnime(999))];
            });

            await buildTopGenresMixCatalog('otaku_user', '1c1da0af', 'tmdb_key', 'movie', false, null);

            expect(capturedFilters).not.toBeNull();
            // Prima del fix, passava typeSelectors grezzo (anime: null) -> isAnime non impostato.
            // Con il fix, passa effectiveTypeSelectors (anime: 'only') -> isAnime: true!
            expect(capturedFilters.isAnime).toBe(true);
        });

        test('il fallback da finalItems.length === 0 riceve effectiveTypeSelectors (isAnime: true) quando tutti gli item vengono filtrati', async () => {
            TasteProfile.findOne.mockImplementation(({ context }) => Promise.resolve({
                owner: 'otaku_user',
                context,
                compiledVectors: {
                    V_final: { 'g:16': 30, 'g:28': 5 }
                },
                settings: { typeSelectors: { anime: null } },
                lastUpdated: new Date()
            }));

            // Il pool restituisce un item che non passa il filtro qualitativo (vote_count troppo basso)
            const lowQualityItem = {
                id: 888,
                title: 'Low Quality',
                genre_ids: [16],
                vote_count: 5, // < minVotes(1000) e floor
                vote_average: 2.0,
                popularity: 1,
                original_language: 'ja'
            };
            getDuckDbCatalogFromPreset.mockResolvedValue([toStoreRow(lowQualityItem)]);

            let capturedFilters = null;
            getDuckDbCatalogFromFilters.mockImplementation(async (filters) => {
                capturedFilters = filters;
                return [toStoreRow(mkAnime(999))];
            });

            await buildTopGenresMixCatalog('otaku_user', '1c1da0af', 'tmdb_key', 'movie', false, null);

            expect(capturedFilters).not.toBeNull();
            expect(capturedFilters.isAnime).toBe(true);
        });
    });

    // =========================================================================
    // Criterio di Accettazione: Quota Anime >= 80% su profilo Otaku con anime: null
    // =========================================================================
    describe('Criterio di Accettazione: Quota Anime >= 80%', () => {
        test('un profilo con DNA anime e anime: null ottiene >= 80% anime in True Blend', async () => {
            const result = await buildTopGenresMixCatalog(
                'otaku_user',
                '1c1da0af',
                'tmdb_key',
                'movie',
                false,
                null // anime: null
            );

            expect(result.length).toBeGreaterThan(0);
            const animeItems = result.filter(item => {
                const fixture = mockItems[String(item.id)];
                return fixture && fixture.genre_ids.includes(16) && fixture.original_language === 'ja';
            });

            const animePercentage = (animeItems.length / result.length) * 100;
            expect(animePercentage).toBeGreaterThanOrEqual(80);
        });

        test('un profilo con DNA non-anime non peggiora (quota anime rimane bassa)', async () => {
            // Configura profilo live-action (quota animazione 0)
            TasteProfile.findOne.mockImplementation(({ context }) => Promise.resolve({
                owner: 'liveaction_user',
                context,
                compiledVectors: {
                    V_final: { 'g:28': 20, 'g:12': 15, 'g:18': 10, 'g:53': 8 }
                },
                settings: { typeSelectors: { anime: null } },
                lastUpdated: new Date()
            }));

            const result = await buildTopGenresMixCatalog(
                'liveaction_user',
                '1c1da0af',
                'tmdb_key',
                'movie',
                false,
                null
            );

            expect(result.length).toBeGreaterThan(0);
            const animeItems = result.filter(item => {
                const fixture = mockItems[String(item.id)];
                return fixture && fixture.genre_ids.includes(16) && fixture.original_language === 'ja';
            });

            const animePercentage = (animeItems.length / result.length) * 100;
            // Profilo non-anime deve avere quota anime bassa (<= 20%)
            expect(animePercentage).toBeLessThanOrEqual(20);
        });
    });
});
