/**
 * Test per l'invariante del ticket 38:
 * Il pool non deve trasportare stringhe scalari; ogni elemento delle righe
 * del grafo è un oggetto strutturato con id, tmdbId, type e media_type coerenti col medium.
 */
const { righePerStremio } = require('../src/engines/bolle/raccomanda');
const { annotationKeyFor } = require('../src/handlers/catalogHandler');

const STORIA = [
    { tmdbId: 314, type: 'tv', episodesWatched: 172, signals: [{ type: 'loved' }] },
    { tmdbId: 1396, type: 'tv', episodesWatched: 214, signals: [{ type: 'watched' }] },
    { tmdbId: 603, type: 'movie', signals: [{ type: 'liked' }] },
];

describe('Invariante del ticket 38: il pool non porta stringhe scalari', () => {
    test('le righe del grafo per film consegnano oggetti con medium coerente', () => {
        const righe = righePerStremio(STORIA, { mediaType: 'movie' });
        const items = [...(righe.yaca_mondi_movies || []), ...(righe.yaca_passo_fuori_movies || [])];

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

    test('le righe del grafo per serie consegnano oggetti con medium coerente (type=series, media_type=tv)', () => {
        const righe = righePerStremio(STORIA, { mediaType: 'series' });
        const items = [...(righe.yaca_mondi_series || []), ...(righe.yaca_passo_fuori_series || [])];

        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(typeof item).toBe('object');
            expect(item).not.toBeNull();
            expect(typeof item.id).toBe('string');
            expect(item.id).toMatch(/^tmdb:\d+$/);
            expect(typeof item.tmdbId).toBe('number');
            expect(Number.isFinite(item.tmdbId)).toBe(true);
            expect(item.type).toBe('series');
            expect(item.media_type).toBe('tv');
        }
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
        const hybridRec = require('../src/engines/hybridRecommendations');
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

