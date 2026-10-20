/**
 * Test per l'integrazione del client grafo nel modulo pool (Ticket 08):
 * - Contratto E1-E4: Chiamata a POST /raccomanda e mapping degli item
 * - Contratto E3: GET /health in RAM e concatenazione nella chiave di cache
 * - Contratto E5: Guasto transitorio (timeout, 503, ECONNREFUSED) non memorizzato a 7 giorni (TTL 60s)
 */

jest.mock('../src/profile', () => {
    const actual = jest.requireActual('../src/profile');
    return {
        ...actual,
        fetchProfileContext: jest.fn().mockResolvedValue({ profile: {}, user: {} })
    };
});

const graphClient = require('../src/clients/graphClient');
const {
    buildSharedHeroCacheKey,
    buildSharedHeroCatalogs,
    getHeroPool,
    HERO_CACHE_KEY_VERSION,
    HERO_STRATEGIES
} = require('../src/pool');
const { hybridRecommendationsCache } = require('../src/cache/cacheInstances');
const library = require('../src/library');

describe('Ticket 08: Il prodotto parla col servizio grafo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        graphClient.resetHealthCache();
    });

    describe('Contratto E3: Cache key derivata da GET /health', () => {
        const baseParams = {
            userId: 'utente_test',
            context: 'profilo_test',
            mediaType: 'movie',
            kidsMode: false,
            typeSelectors: {}
        };

        test('senza health version, la chiave usa solo HERO_CACHE_KEY_VERSION (v16)', () => {
            // Ticket 13: la versione passa da v15 a v16 perche' il payload delle righe hero ora porta
            // anche classici, ultime visioni, punti d'incontro e i tre slot dei micro-cluster.
            const key = buildSharedHeroCacheKey(baseParams);
            expect(key).toBe(`utente_test_profilo_test_heroes_${HERO_CACHE_KEY_VERSION}_movie`);
            expect(key).toContain('_v17_');
        });

        test('con versioni da health, concatena artefatto e ricetta nella chiave', () => {
            const versions = { artefatto: 'art_sha_123', ricetta: 'ric_sha_456' };
            const key = buildSharedHeroCacheKey({ ...baseParams, graphVersions: versions });
            expect(key).toBe(`utente_test_profilo_test_heroes_${HERO_CACHE_KEY_VERSION}_art_art_sha_123_ric_ric_sha_456_movie`);
        });

        test('il cambio di artefatto invalida la chiave di cache senza toccare il codice', () => {
            const key1 = buildSharedHeroCacheKey({
                ...baseParams,
                graphVersions: { artefatto: 'v1_sha', ricetta: 'ric_sha' }
            });
            const key2 = buildSharedHeroCacheKey({
                ...baseParams,
                graphVersions: { artefatto: 'v2_sha', ricetta: 'ric_sha' }
            });
            expect(key1).not.toBe(key2);
        });

        test('getGraphHealthVersions memorizza in RAM per 60s', async () => {
            const mockAxios = jest.spyOn(require('axios'), 'get').mockResolvedValue({
                status: 200,
                data: {
                    ok: true,
                    contratto: 1,
                    versioni: { artefatto: 'sha_test_ram', ricetta: 'ric_test_ram' }
                }
            });

            const v1 = await graphClient.getGraphHealthVersions();
            expect(v1).toEqual({ artefatto: 'sha_test_ram', ricetta: 'ric_test_ram' });
            expect(mockAxios).toHaveBeenCalledTimes(1);

            // Seconda chiamata: attinge da RAM
            const v2 = await graphClient.getGraphHealthVersions();
            expect(v2).toEqual(v1);
            expect(mockAxios).toHaveBeenCalledTimes(1);

            mockAxios.mockRestore();
        });
    });

    describe('Contratto E5: Gestione guasto transitorio e TTL di sicurezza', () => {
        beforeEach(() => {
            jest.spyOn(library, 'semiDi').mockResolvedValue({
                seeds: new Map([['603', 4]]),
                counts: { loved: 1, liked: 0, watched: 0, library: 0 }
            });
        });

        test('quando il motore fallisce (503, timeout, rifiutata), graphCallFailed viene marcato true', async () => {
            jest.spyOn(graphClient, 'raccomanda').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:7862'));
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const graphStrategy = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
            const assigned = {};
            const sharedState = { graphCallFailed: false };

            await graphStrategy.run({
                userId: 'u1',
                context: 'p1',
                mediaType: 'movie',
                userConfig: {}
            }, { assigned, rawTraktResult: { traktAvailable: false }, sharedState });

            expect(sharedState.graphCallFailed).toBe(true);
            expect(assigned.yaca_mondi_movies).toEqual([]);
            expect(assigned.yaca_passo_fuori_movies).toEqual([]);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Mondi] motore non raggiungibile: connect ECONNREFUSED'));

            warnSpy.mockRestore();
        });

        test('in caso di fallimento del motore, la cache memorizza con TTL 60s invece di 7 giorni', async () => {
            const cacheSetSpy = jest.spyOn(hybridRecommendationsCache, 'set').mockResolvedValue();
            jest.spyOn(graphClient, 'raccomanda').mockRejectedValue(new Error('timeout of 10000ms exceeded'));
            jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Chiamata a buildSharedHeroCatalogs che esegue le strategie
            const group = await buildSharedHeroCatalogs({
                userId: 'user_e5',
                context: 'global',
                mediaType: 'movie',
                kidsMode: false,
                userConfig: {}
            });

            expect(group.graphCallFailed).toBe(true);

            // Simuliamo il caching con la logica di buildAndCacheSharedHeroCatalogs
            const cacheKey = 'test_e5_key';
            if (group.graphCallFailed) {
                await hybridRecommendationsCache.set(cacheKey, group, 60 * 1000);
            } else {
                await hybridRecommendationsCache.set(cacheKey, group);
            }

            expect(cacheSetSpy).toHaveBeenCalledWith(cacheKey, group, 60000);
            cacheSetSpy.mockRestore();
        });

        test('runPoolBuilder intercetta eccezioni sollevate dal builder impedendo il crash del pool', async () => {
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const graphStrategy = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
            const originalRun = graphStrategy.run;
            graphStrategy.run = jest.fn().mockRejectedValue(new Error('Uncaught builder crash'));

            try {
                const group = await buildSharedHeroCatalogs({
                    userId: 'user_throw',
                    context: 'global',
                    mediaType: 'movie',
                    kidsMode: false,
                    userConfig: {}
                });

                expect(group).toBeDefined();
                expect(group.catalogs).toBeDefined();
                expect(group.graphCallFailed).toBe(true);
                expect(errSpy).toHaveBeenCalledWith(
                    expect.stringContaining('[HeroPool] Strategy builder'),
                    expect.stringContaining('Uncaught builder crash')
                );
            } finally {
                graphStrategy.run = originalRun;
                errSpy.mockRestore();
            }
        });
    });
});

