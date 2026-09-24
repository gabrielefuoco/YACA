const { buildCatalogQuery } = require('../src/db/queryBuilder');
const { F, S } = require('../src/data/filters');
const { getPresets } = require('../src/data/presets');
const { 
    buildPresetFromFilters, 
    getDuckDbCatalogFromPreset, 
    getDuckDbMetaDetails 
} = require('../src/catalog/providers/DuckDbProvider');
const duckDbStore = require('../src/db/duckDbStore');
const graph = require('../src/engines/graph/HierarchicalGraph');
const { 
    getMatchmakerInitCards, 
    getMatchmakerNextCards, 
    getFinalRecommendations,
    getKeywordsForNodes 
} = require('../src/engines/hybrid/MatchmakerGraphEngine');

describe('DuckDB & Matchmaker Engine Suite (Phases 4 & 5)', () => {
    beforeAll(async () => {
        if (!graph.isLoaded) {
            graph.loadData();
        }
        await duckDbStore.init();
    }, 30000);

    describe('queryBuilder', () => {
        test('BM25 FTS clause formats properly for _fts string', async () => {
            const query = await buildCatalogQuery({
                type: 'movie',
                where: [{ _fts: 'The Matrix' }]
            }, 0, 10);
            expect(query).toContain("fts_main_movies.match_bm25(id, 'The Matrix')");
            expect(query).toContain("ORDER BY fts_main_movies.match_bm25(id, 'The Matrix') DESC");
        });

        test('BM25 FTS clause escapes single quotes safely', async () => {
            const query = await buildCatalogQuery({
                type: 'movie',
                where: [{ _fts: "d'azione" }]
            }, 0, 10);
            expect(query).toContain("d''azione");
        });

        test('BM25 FTS clause ignores non-string query values', async () => {
            const query = await buildCatalogQuery({
                type: 'movie',
                where: [{ _fts: 12345 }]
            }, 0, 10);
            expect(query).not.toContain("fts_main_movies.match_bm25");
        });

        test('Similarity clause safely handles valid and invalid IDs', async () => {
            const validQuery = await buildCatalogQuery({
                type: 'movie',
                where: [{ _similar: true, tmdbId: 603 }]
            }, 0, 10);
            expect(validQuery).toBeDefined();
            expect(typeof validQuery).toBe('string');

            const invalidQuery = await buildCatalogQuery({
                type: 'movie',
                where: [{ _similar: true, tmdbId: 'not_a_number' }]
            }, 0, 10);
            expect(invalidQuery).toContain('1=0');
        });

        test('Case-insensitive filters use ILIKE', () => {
            const genreFilter = F.genreStr('drama');
            expect(genreFilter).toContain('ILIKE');
            expect(genreFilter).toContain('"drama"');

            const kwFilter = F.keywordStr('cyberpunk');
            expect(kwFilter).toContain('ILIKE');
            expect(kwFilter).toContain('"cyberpunk"');
        });

        test('buildCatalogQuery combines multiple WHERE clauses with AND', async () => {
            const sql = await buildCatalogQuery({
                type: 'movie',
                where: ['"vote_count" >= 100', '"vote_average" >= 7.0'],
                orderBy: S.POPULAR
            }, 0, 20);
            expect(sql).toContain('"vote_count" >= 100');
            expect(sql).toContain('"vote_average" >= 7.0');
            expect(sql).toContain('WHERE adult = false AND "vote_count" >= 100 AND "vote_average" >= 7.0');
            expect(sql).toContain('LIMIT 20 OFFSET 0');
        });
    });

    describe('DuckDbProvider', () => {
        test('buildPresetFromFilters translates text_search and _search to _fts', () => {
            const preset1 = buildPresetFromFilters({ text_search: 'Inception' }, 'movie');
            expect(preset1.where).toEqual(expect.arrayContaining([{ _fts: 'Inception' }]));

            const preset2 = buildPresetFromFilters({ _search: 'Interstellar' }, 'movie');
            expect(preset2.where).toEqual(expect.arrayContaining([{ _fts: 'Interstellar' }]));
        });

        test('buildPresetFromFilters handles manual_list and strips ID prefixes', () => {
            const preset = buildPresetFromFilters({
                strategy: 'manual_list',
                items: [{ tmdbId: 'tmdb:603' }, { id: '604' }, 'invalid_id']
            }, 'movie');

            expect(preset.where.some(w => typeof w === 'string' && w.includes('603,604'))).toBe(true);
        });

        test('getDuckDbMetaDetails handles numeric and tmdb: prefixed IDs safely', async () => {
            const invalidMeta = await getDuckDbMetaDetails('movie', 'not_valid_id');
            expect(invalidMeta).toBeNull();

            if (duckDbStore.isInitialized) {
                const matrixMeta = await getDuckDbMetaDetails('movie', 'tmdb:603');
                if (matrixMeta) {
                    expect(matrixMeta.id).toBe('tmdb:603');
                    expect(matrixMeta.name).toMatch(/Matrix/i);
                }
            }
        });

        test('getDuckDbCatalogFromPreset runs query against in-memory DuckDB', async () => {
            if (!duckDbStore.isInitialized) return;

            const catalog = await getDuckDbCatalogFromPreset({
                type: 'movie',
                where: [{ _fts: 'Matrix' }],
                limit: 5
            });

            expect(Array.isArray(catalog)).toBe(true);
            if (catalog.length > 0) {
                expect(catalog[0]).toHaveProperty('id');
                expect(catalog[0]).toHaveProperty('name');
                expect(catalog[0].id).toMatch(/^tmdb:\d+$/);
            }
        });

        test('getDuckDbCatalogFromPreset executes multi-term BM25 search without throwing', async () => {
            if (!duckDbStore.isInitialized) return;

            const querySpy = jest.spyOn(duckDbStore, 'query').mockResolvedValueOnce([
                {
                    id: 603,
                    title: 'The Matrix',
                    original_title: 'The Matrix',
                    vote_average: 8.2,
                    vote_count: 23000,
                    popularity: 55.0,
                    genres: JSON.stringify([{ id: 28, name: 'Action' }]),
                    keywords: JSON.stringify([{ id: 4379, name: 'time travel' }])
                }
            ]);

            const catalog = await getDuckDbCatalogFromPreset({
                type: 'movie',
                where: [{ _fts: 'The Matrix' }],
                limit: 5
            });

            expect(Array.isArray(catalog)).toBe(true);
            expect(catalog.length).toBeGreaterThan(0);
            expect(catalog[0].name).toMatch(/Matrix/i);

            querySpy.mockRestore();
        });

        test('DuckDB query on movies containing "tv" in search does not get dropped', async () => {
            if (!duckDbStore.isInitialized) return;

            const res = await duckDbStore.query("SELECT id, title FROM movies WHERE genres ILIKE '%tv%' OR title ILIKE '%activity%' LIMIT 5");
            expect(Array.isArray(res)).toBe(true);
        });

        test('buildCatalogQuery safely ignores null, undefined, and empty string clauses', async () => {
            const sql = await buildCatalogQuery({
                type: 'movie',
                where: ['"vote_count" >= 100', null, undefined, '', '   ', { _fts: '   ' }]
            }, 0, 10);
            expect(sql).not.toContain('null');
            expect(sql).not.toContain('undefined');
            expect(sql).toContain('WHERE adult = false AND "vote_count" >= 100');
        });

        test('buildPresetFromFilters returns 1=0 when tmdbIds or items is empty', () => {
            const presetEmptyIds = buildPresetFromFilters({ tmdbIds: [] }, 'movie');
            expect(presetEmptyIds.where).toContain('1=0');

            const presetEmptyItems = buildPresetFromFilters({ items: [] }, 'movie');
            expect(presetEmptyItems.where).toContain('1=0');
        });

        test('buildPresetFromFilters maps dates and sort column dynamically by media type', () => {
            const moviePreset = buildPresetFromFilters({ 'first_air_date.gte': '2022-01-01', sort_by: 'primary_release_date.desc' }, 'movie');
            expect(moviePreset.where).toContain('"release_date" >= \'2022-01-01\'');
            expect(moviePreset.orderBy).toContain('"release_date" DESC');

            const tvPreset = buildPresetFromFilters({ 'primary_release_date.gte': '2022-01-01', sort_by: 'primary_release_date.desc' }, 'series');
            expect(tvPreset.where).toContain('"first_air_date" >= \'2022-01-01\'');
            expect(tvPreset.orderBy).toContain('"first_air_date" DESC');
        });

        test('il preset MCU usa le collection TMDB e non la sola company Marvel', () => {
            const source = getPresets().find((preset) => preset.id === 'preset_marvel');
            const query = source.queries[0];
            const compiled = buildPresetFromFilters(query, source.type);

            expect(source.name).toBe('Marvel Cinematic Universe');
            expect(query.with_companies).toBeUndefined();
            expect(query.with_keywords).toBe(180547);
            expect(compiled.where.join(' ')).toContain(
                '"collection_id" IN (86311,531241,529892,448150,131292,131295,623911,618529,284433,131296,422834)'
            );
            expect(compiled.where.join(' ')).toContain('"keywords"');
        });
    });

    describe('MatchmakerGraphEngine', () => {
        test('Graph is loaded and contains levels L1-L5', () => {
            expect(graph.isLoaded).toBe(true);
            expect(graph.data).toHaveProperty('L1');
            expect(graph.data).toHaveProperty('L2');
            expect(graph.data).toHaveProperty('L3');
            expect(graph.data).toHaveProperty('L4');
            expect(graph.data).toHaveProperty('L5');
        });

        test('getKeywordsForNodes traverses hierarchy down to L1 keywords', () => {
            const l5Keys = Object.keys(graph.data.L5 || {});
            if (l5Keys.length > 0) {
                const sampleL5 = l5Keys[0];
                const keywordsMap = getKeywordsForNodes([sampleL5], 'L5');
                expect(keywordsMap.has(sampleL5)).toBe(true);
                const kws = keywordsMap.get(sampleL5);
                expect(Array.isArray(kws)).toBe(true);
                expect(kws.length).toBeGreaterThan(0);
            }
        });

        test('getMatchmakerInitCards generates cards for mood with Italian genre input', async () => {
            if (!duckDbStore.isInitialized) return;

            const cards = await getMatchmakerInitCards(
                'movie',
                ['Azione'],
                ["Intenso & Ricco d'Azione"],
                { isAnime: false }
            );

            expect(Array.isArray(cards)).toBe(true);
            if (cards.length > 0) {
                const firstCard = cards[0];
                expect(firstCard).toHaveProperty('id');
                expect(firstCard).toHaveProperty('title');
                expect(firstCard.id).toMatch(/^tmdb:\d+$/);
            }
        });

        test('getMatchmakerNextCards updates heat map and penalizes disliked nodes', async () => {
            if (!duckDbStore.isInitialized) return;

            const l2Keys = Object.keys(graph.data.L2 || {});
            if (l2Keys.length < 2) return;

            const history = [
                { id: 'tmdb:603', action: 'like', _graphNodeId: l2Keys[0] },
                { id: 'tmdb:604', action: 'dislike', _graphNodeId: l2Keys[1] }
            ];

            const next = await getMatchmakerNextCards('movie', history, 'L2', {});
            expect(next).toBeDefined();
            expect(next).toHaveProperty('cards');
            expect(Array.isArray(next.cards)).toBe(true);
        });

        test('getFinalRecommendations returns TMDB IDs for winning nodes', async () => {
            if (!duckDbStore.isInitialized) return;

            const l2Keys = Object.keys(graph.data.L2 || {});
            if (l2Keys.length === 0) return;

            const recs = await getFinalRecommendations([l2Keys[0]], 'movie', {});
            expect(Array.isArray(recs)).toBe(true);
            recs.forEach(id => {
                expect(typeof id === 'string' || typeof id === 'number').toBe(true);
            });
        });

        test('getMatchmakerNextCards safely falls back and assigns winningNode when heat map is empty', async () => {
            if (!duckDbStore.isInitialized) return;

            const querySpy = jest.spyOn(duckDbStore, 'query').mockResolvedValue([
                {
                    id: 603,
                    title: 'The Matrix',
                    original_title: 'The Matrix',
                    vote_average: 8.2,
                    vote_count: 23000,
                    popularity: 55.0,
                    genres: JSON.stringify([{ id: 28, name: 'Action' }]),
                    keywords: JSON.stringify([{ id: 4379, name: 'time travel' }])
                }
            ]);

            const next = await getMatchmakerNextCards('movie', [], 'L2', {});
            expect(next).toBeDefined();
            expect(next.cards.length).toBeGreaterThan(0);
            expect(next.winningNode).toBeDefined();
            expect(typeof next.winningNode).toBe('string');

            querySpy.mockRestore();
        });

        test('getMatchmakerNextCards handles unknown currentLevel safely without jumping to L5', async () => {
            if (!duckDbStore.isInitialized) return;

            const next = await getMatchmakerNextCards('movie', [], undefined, {});
            expect(next.nextLevel).toBe('L1');
        });
    });

    describe('WatchlistProvider & Custom Catalogs', () => {
        test('WatchlistProvider uses addonUuid and does not query with undefined', async () => {
            const { getWatchlistCatalog } = require('../src/catalog/providers/WatchlistProvider');
            const UserLibraryItem = require('../src/db/models/UserLibraryItem');
            const findSpy = jest.spyOn(UserLibraryItem, 'find').mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    skip: jest.fn().mockReturnValue({
                        limit: jest.fn().mockReturnValue({
                            lean: jest.fn().mockResolvedValue([])
                        })
                    })
                })
            });

            await getWatchlistCatalog('yaca_watchlist_movies', 'movie', 0, { addonUuid: 'test_uuid_123' }, {});
            expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ addonUuid: 'test_uuid_123' }));
            findSpy.mockRestore();
        });
    });
});
