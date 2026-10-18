/**
 * Test per l'invariante del ticket 38 (ri-orientato nel Ticket 08):
 * Il pool non deve trasportare stringhe scalari; ogni elemento delle righe
 * del grafo è un oggetto strutturato con id, tmdbId, type e media_type coerenti col medium.
 */
const { HERO_STRATEGIES } = require('../src/pool');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const { annotationKeyFor } = require('../src/catalog');

describe('Invariante del ticket 38: il pool non porta stringhe scalari', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(library, 'semiDi').mockResolvedValue({
            seeds: new Map([['603', 3], ['314', 4]]),
            counts: { loved: 1, liked: 1, watched: 0, library: 0 }
        });
    });

    test('le righe del grafo per film consegnano oggetti con medium coerente', async () => {
        jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
            contratto: 1,
            versioni: { artefatto: 'art-test', ricetta: 'ric-test' },
            semi: { n: 1, da_catalogo: false },
            liste: [
                {
                    ruolo: 'il_tuo_mondo',
                    mondo: 1084,
                    descrizione: 'mondo 1084',
                    titoli: [{ tmdbId: 603, medium: 'movie', punteggio: 0.95 }]
                },
                {
                    ruolo: 'un_passo_fuori',
                    mondo: null,
                    descrizione: 'mondi vicini',
                    titoli: [{ tmdbId: 604, medium: 'movie', punteggio: 0.85 }]
                }
            ],
            motivi: []
        });

        const graphStrategy = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
        const assigned = {};
        await graphStrategy.run({
            userId: 'u1',
            context: 'p1',
            mediaType: 'movie',
            userConfig: {}
        }, { assigned, rawTraktResult: { traktAvailable: false } });

        const items = [...(assigned.yaca_mondi_movies || []), ...(assigned.yaca_passo_fuori_movies || [])];

        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(typeof item).toBe('object');
            expect(item).not.toBeNull();
            expect(typeof item.id).toBe('string');
            expect(item.id).toMatch(/^tmdb:\d+$/);
            expect(typeof item.tmdbId).toBe('number');
            expect(Number.isFinite(item.tmdbId)).toBe(true);
            expect(item.type).toBe('movie');
            expect(item.media_type).toBe('movie');
        }
    });

    test('le righe del grafo per serie consegnano oggetti con medium coerente (type=series, media_type=tv)', async () => {
        jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
            contratto: 1,
            versioni: { artefatto: 'art-test', ricetta: 'ric-test' },
            semi: { n: 2, da_catalogo: false },
            liste: [
                {
                    ruolo: 'il_tuo_mondo',
                    mondo: 4192,
                    descrizione: 'mondo 4192',
                    titoli: [{ tmdbId: 314, medium: 'series', punteggio: 0.92 }]
                },
                {
                    ruolo: 'un_passo_fuori',
                    mondo: null,
                    descrizione: 'mondi vicini',
                    titoli: [{ tmdbId: 1396, medium: 'series', punteggio: 0.88 }]
                }
            ],
            motivi: []
        });

        const graphStrategy = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
        const assigned = {};
        await graphStrategy.run({
            userId: 'u1',
            context: 'p1',
            mediaType: 'series',
            userConfig: {}
        }, { assigned, rawTraktResult: { traktAvailable: false } });

        const items = [...(assigned.yaca_mondi_series || []), ...(assigned.yaca_passo_fuori_series || [])];

        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(typeof item).toBe('object');
            expect(item).not.toBeNull();
            expect(typeof item.id).toBe('string');
            expect(item.id).toMatch(/^tmdb:\d+$/);
            expect(typeof item.tmdbId).toBe('number');
            expect(Number.isFinite(item.tmdbId)).toBe(true);
            expect(item.type).toBe('series');
        }
    });

    test('le righe uscite_nuove e nicchia_di_qualita consegnano oggetti strutturati coerenti', async () => {
        jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
            contratto: 1,
            versioni: { artefatto: 'art-test', ricetta: 'ric-test' },
            semi: { n: 2, da_catalogo: false },
            liste: [
                {
                    ruolo: 'il_tuo_mondo',
                    mondo: 1084,
                    descrizione: 'mondo 1084',
                    titoli: [{ tmdbId: 603, medium: 'movie', punteggio: 0.95 }]
                },
                {
                    ruolo: 'un_passo_fuori',
                    mondo: null,
                    descrizione: 'mondi vicini',
                    titoli: [{ tmdbId: 604, medium: 'movie', punteggio: 0.85 }]
                },
                {
                    ruolo: 'uscite_nuove',
                    mondo: 1084,
                    descrizione: 'uscite recenti',
                    da_comporre: true,
                    titoli: [{ tmdbId: 701, medium: 'movie', punteggio: 0.90 }]
                },
                {
                    ruolo: 'nicchia_di_qualita',
                    mondo: null,
                    descrizione: 'nicchia di qualità',
                    da_comporre: true,
                    titoli: [{ tmdbId: 702, medium: 'movie', punteggio: 0.80 }]
                }
            ],
            motivi: []
        });

        const graphStrategy = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
        const assigned = {};
        await graphStrategy.run({
            userId: 'u1',
            context: 'p1',
            mediaType: 'movie',
            userConfig: {}
        }, { assigned, rawTraktResult: { traktAvailable: false } });

        expect(assigned.yaca_uscite_nuove_movies).toHaveLength(1);
        expect(assigned.yaca_nicchia_di_qualita_movies).toHaveLength(1);

        const usciteItem = assigned.yaca_uscite_nuove_movies[0];
        expect(usciteItem.id).toBe('tmdb:701');
        expect(usciteItem.tmdbId).toBe(701);
        expect(usciteItem.type).toBe('movie');
        expect(usciteItem.media_type).toBe('movie');

        const nicchiaItem = assigned.yaca_nicchia_di_qualita_movies[0];
        expect(nicchiaItem.id).toBe('tmdb:702');
        expect(nicchiaItem.tmdbId).toBe(702);
        expect(nicchiaItem.type).toBe('movie');
        expect(nicchiaItem.media_type).toBe('movie');
    });

    test('annotationKeyFor normalizza serie/tv senza perdere il tipo', () => {
        // Item con media_type tv
        const k1 = annotationKeyFor({ id: 'tmdb:655', type: 'series', media_type: 'tv' });
        expect(k1).toEqual({ type: 'tv', id: 655 });

        // Item con solo type series
        const k2 = annotationKeyFor({ id: 'tmdb:655', type: 'series' });
        expect(k2).toEqual({ type: 'tv', id: 655 });

        // Item con media_type series
        const k3 = annotationKeyFor({ id: 'tmdb:655', media_type: 'series' });
        expect(k3).toEqual({ type: 'tv', id: 655 });

        // Id esteso tmdb:series:655
        const k4 = annotationKeyFor({ id: 'tmdb:series:655' });
        expect(k4).toEqual({ type: 'tv', id: 655 });

        // Item film
        const k5 = annotationKeyFor({ id: 'tmdb:603', type: 'movie', media_type: 'movie' });
        expect(k5).toEqual({ type: 'movie', id: 603 });
    });

    test('getEngineHybridCatalog risolve correttamente la baseId verso l ID hero con suffisso', async () => {
        const hybridRec = require('../src/pool/composer');
        const spy = jest.spyOn(hybridRec, 'getHybridCatalog').mockImplementation(async (catId) => {
            return [{ id: 'tmdb:100', type: catId.includes('series') ? 'series' : 'movie' }];
        });

        const { getEngineHybridCatalog } = require('../src/catalog/providers/HybridProvider');
        const userConfig = { userId: 'u1', activeProfileId: 'p1', apiKeys: {} };

        await getEngineHybridCatalog('yaca_mondi', 'series', 0, userConfig, 'tmdb_key', {});
        expect(spy).toHaveBeenLastCalledWith('yaca_mondi_series', 0, undefined, 'tmdb_key', 'u1', 'p1', expect.any(Object));

        await getEngineHybridCatalog('yaca_mondi', 'movie', 0, userConfig, 'tmdb_key', {});
        expect(spy).toHaveBeenLastCalledWith('yaca_mondi_movies', 0, undefined, 'tmdb_key', 'u1', 'p1', expect.any(Object));

        spy.mockRestore();
    });
});
