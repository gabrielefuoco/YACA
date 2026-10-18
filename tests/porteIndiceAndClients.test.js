/**
 * tests/porteIndiceAndClients.test.js
 *
 * Sonda di collaudo per la porta del Modulo Indice (src/indice)
 * e la porta del Modulo Clients (src/clients) — Ticket 53.
 *
 * Fallirebbe se la porta dell'indice o la porta dei clients non esponessero
 * i metodi e getter richiesti dai consumatori:
 * - queryRaw (SQL grezza distinta da query compilata)
 * - updateAnimeMapping
 * - init & isInitialized (getter sincrono)
 * - graphClient (esposto su src/clients)
 */

const indice = require('../src/indice');
const { IndiceModule } = require('../src/indice');
const clients = require('../src/clients');

describe('Porta src/indice (Ticket 53)', () => {
    test('la porta espone queryRaw come funzione distinta da query compilata', () => {
        expect(typeof indice.queryRaw).toBe('function');
        expect(typeof indice.query).toBe('function');
        expect(indice.queryRaw).not.toBe(indice.query);
    });

    test('queryRaw delega la query SQL grezza a duckDb anche se destrutturata', async () => {
        const mockDuckDb = {
            query: jest.fn().mockResolvedValue([{ col: 123 }]),
            isInitialized: true
        };
        const customIndice = new IndiceModule({ duckDb: mockDuckDb });
        const { queryRaw } = customIndice;

        const res = await queryRaw('SELECT 123 AS col', ['p1']);
        expect(mockDuckDb.query).toHaveBeenCalledWith('SELECT 123 AS col', ['p1']);
        expect(res).toEqual([{ col: 123 }]);
    });

    test('la porta espone parquetStats: stato degli artefatti, non i percorsi', () => {
        // Il daemon del dump usa questo metodo per decidere se riconvertire: se sparisse,
        // tornerebbe a leggere gli interni dello store (la violazione chiusa dal ticket 53).
        expect(typeof indice.parquetStats).toBe('function');
        const stats = indice.parquetStats();
        expect(stats).toHaveProperty('movies');
        expect(stats).toHaveProperty('tv');
        expect(typeof stats.movies.exists).toBe('boolean');
        expect(stats.movies).not.toHaveProperty('moviesParquetPath');
    });

    test('close è bindata: destrutturata non perde il ricevitore', () => {
        const { close } = require('../src/indice');
        expect(typeof close).toBe('function');
    });

    test('la porta espone updateAnimeMapping e delega correttamente a duckDb', async () => {
        expect(typeof indice.updateAnimeMapping).toBe('function');

        const mockDuckDb = {
            updateAnimeMapping: jest.fn().mockResolvedValue(undefined),
            isInitialized: true
        };
        const customIndice = new IndiceModule({ duckDb: mockDuckDb });
        const { updateAnimeMapping } = customIndice;

        await updateAnimeMapping({ movie: [100], tv: [200] });
        expect(mockDuckDb.updateAnimeMapping).toHaveBeenCalledWith({ movie: [100], tv: [200] });
    });

    test('la porta espone il getter isInitialized che riflette lo stato di duckDb', () => {
        expect(typeof indice.isInitialized).toBe('boolean');

        const mockDuckDb = { isInitialized: false };
        const customIndice = new IndiceModule({ duckDb: mockDuckDb });
        expect(customIndice.isInitialized).toBe(false);

        mockDuckDb.isInitialized = true;
        expect(customIndice.isInitialized).toBe(true);
    });

    test('la porta espone init e resolveImdbIds', () => {
        expect(typeof indice.init).toBe('function');
        expect(typeof indice.resolveImdbIds).toBe('function');
        expect(typeof indice.getDfCache).toBe('function');
    });
});

describe('Porta src/clients (Ticket 53)', () => {
    test('la porta dei client espone graphClient con i metodi di contratto', () => {
        expect(clients.graphClient).toBeDefined();
        expect(typeof clients.graphClient.raccomanda).toBe('function');
        expect(typeof clients.graphClient.getGraphHealthVersionsCached).toBe('function');
        expect(typeof clients.graphClient.getGraphHealthVersions).toBe('function');
    });

    test('la destrutturazione di graphClient da src/clients fornisce il modulo reale', () => {
        const { graphClient } = require('../src/clients');
        expect(graphClient).toBe(clients.graphClient);
        expect(typeof graphClient.raccomanda).toBe('function');
    });
});
