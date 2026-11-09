/**
 * Invariante del ticket 38 (ri-orientato): il pool non deve trasportare stringhe scalari.
 *
 * Ogni elemento delle righe servite è un oggetto strutturato con id, tmdbId, type e
 * media_type coerenti col medium. Le righe editoriali (`yaca_mondi_*`, `uscite_nuove`,
 * `nicchia_di_qualita`) non esistono più: la verifica ora si applica agli **scaffali**
 * del grafo, che sono le uniche righe che il manifest dichiara.
 */
jest.mock('../src/anime', () => {
    const actual = jest.requireActual('../src/anime');
    return { ...actual, isAnimeContent: jest.fn(() => false) };
});

const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const cache = require('../src/cache');
const { shelvesCache } = require('../src/cache/cacheInstances');
const { HERO_STRATEGIES } = require('../src/pool');

async function eseguiCon({ mediaType, shelf }) {
    jest.clearAllMocks();
    jest.spyOn(cache, 'leggi').mockResolvedValue({ value: null, status: 'miss' });
    jest.spyOn(cache, 'scrivi').mockResolvedValue(undefined);
    if (typeof shelvesCache?.clear === 'function') shelvesCache.clear();
    jest.spyOn(library, 'semiDi').mockResolvedValue({
        seeds: new Map([['603', 4]]),
        counts: { loved: 1, liked: 1, watched: 0, library: 0 }
    });
    jest.spyOn(graphClient, 'getGraphHealthVersions').mockResolvedValue({ artefatto: 'a', ricetta: 'r' });
    jest.spyOn(graphClient, 'scaffali').mockResolvedValue({
        contratto: 1,
        versioni: { artefatto: 'a', ricetta: 'r' },
        scaffali: [shelf]
    });

    const strategia = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
    const assigned = {};
    await strategia.run(
        { userId: 'u1', context: 'p1', mediaType, userConfig: {} },
        { assigned, rawTraktResult: { traktAvailable: false } }
    );
    return assigned;
}

describe('Invariante: nessuna stringa scalare nelle righe servite', () => {
    test('uno scaffale film consegna oggetti con medium coerente', async () => {
        const assigned = await eseguiCon({
            mediaType: 'movie',
            shelf: {
                catalog_id: 'yaca_603_movie',
                nome: 'Prova (film)',
                medium: 'movie',
                titoli: [{ key: 'movie:603', tmdbId: 603, medium: 'movie', punteggio: 0.9 }]
            }
        });

        const items = assigned['yaca_603_movie'] || [];
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(typeof item).toBe('object');
            expect(item).not.toBeNull();
            expect(item.id).toMatch(/^tmdb:\d+$/);
            expect(typeof item.tmdbId).toBe('number');
            expect(item.type).toBe('movie');
            expect(item.media_type).toBe('movie');
        }
    });

    test('uno scaffale serie consegna type=series e media_type=tv', async () => {
        const assigned = await eseguiCon({
            mediaType: 'series',
            shelf: {
                catalog_id: 'yaca_314_series',
                nome: 'Prova (serie)',
                medium: 'series',
                titoli: [{ key: 'tv:314', tmdbId: 314, medium: 'series', punteggio: 0.9 }]
            }
        });

        const items = assigned['yaca_314_series'] || [];
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) {
            expect(typeof item).toBe('object');
            expect(item.id).toMatch(/^tmdb:\d+$/);
            expect(item.type).toBe('series');
            expect(item.media_type).toBe('tv');
        }
    });
});
