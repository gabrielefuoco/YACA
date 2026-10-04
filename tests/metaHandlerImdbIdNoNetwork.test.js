/**
 * Misura quante richieste di rete si risparmiano quando l'id IMDb si legge dal dump.
 *
 * Qui `src/clients/tmdb.js` è **vero**: `resolveImdbId` gira per davvero, cache `tmdb_imdb_id`
 * compresa. A essere finto è solo il trasporto (`createAxiosClient`): ogni `get` è una richiesta
 * HTTP a TMDB e viene contato. Quindi i numeri qui sotto sono richieste di rete, non chiamate a
 * una funzione.
 *
 * Il confronto è lo stesso titolo (Friends, `tmdb:1668`) nelle due condizioni:
 *   - dentro il dump  ⇒ l'id IMDb è già nella colonna `imdb_id`: si deve fare ZERO richieste;
 *   - fuori dal dump  ⇒ coda lunga: si cade sulla cache dedicata, e a cache fredda una richiesta.
 *
 * Perché la scheda ha già `videos` e non `_numberOfSeasons`: così l'unica strada che potrebbe
 * chiedere qualcosa alla rete è la risoluzione dell'id IMDb (gli episodi non vengono riscaricati
 * e il conteggio resta pulito).
 */

// Richieste HTTP "verso TMDB" viste dal trasporto finto.
const mockHttpChiamate = [];

jest.mock('../src/utils/axiosClient', () => ({
    createAxiosClient: jest.fn(() => ({
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() }
        },
        get: jest.fn(async (url) => {
            mockHttpChiamate.push(url);
            // Risposta plausibile di `/tv/:id/external_ids`.
            return { data: { imdb_id: 'tt0108778' }, status: 200 };
        })
    }))
}));

// Cache finte ma vere nel loro contratto: `tmdb_imdb_id` parte **fredda**, quindi ogni chiamata a
// `resolveImdbId` che non trova l'id esce davvero in rete.
const mockStore = new Map();

jest.mock('../src/cache/CacheManager', () => {
    class FakeCacheManager {
        constructor(namespace) {
            this.namespace = namespace;
        }
        _store() {
            if (!mockStore.has(this.namespace)) mockStore.set(this.namespace, new Map());
            return mockStore.get(this.namespace);
        }
        async getWithStatus(key) {
            return this._store().has(key)
                ? { value: this._store().get(key), status: 'fresh' }
                : { value: undefined, status: 'miss' };
        }
        async set(key, value) {
            this._store().set(key, value);
        }
    }
    return FakeCacheManager;
});

// Il dump contiene 1668 (Friends). `inDump` si può spegnere per misurare il caso Tier 2.
let mockInDump = true;

jest.mock('../src/db/duckDbStore', () => ({
    isInitialized: true,
    query: jest.fn(async () => []),
    init: jest.fn(async () => {}),
    updateAnimeMapping: jest.fn(async () => {}),
    resolveImdbIds: jest.fn(async () => ({})),
    resolveTmdbToImdb: jest.fn(async (tmdbIds) => {
        const out = {};
        if (!mockInDump) return out;
        for (const raw of tmdbIds) {
            const key = String(Number(String(raw).replace(/^tmdb:/, '')));
            if (key === '1668') out[key] = 'tt0108778';
        }
        return out;
    })
}));

jest.mock('../src/id_mapping/id_cache', () => ({
    translateImdbToTmdb: jest.fn(async (imdbId) => ({ id: { 'tt0108778': '1668' }[imdbId] }))
}));

jest.mock('../src/data/animeMappingStore', () => ({
    resolveKitsu: jest.fn(() => null),
    resolveKitsuMovie: jest.fn(() => null),
    resolveTmdbFromKitsu: jest.fn(() => null),
    isAnimeTmdbId: jest.fn(() => false)
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbMetaDetails: jest.fn()
}));

jest.mock('../src/db/tier1LazyPromotion', () => ({
    schedulePromotion: jest.fn()
}));

const { metaHandler } = require('../src/handlers/metaHandler');
const duckDbStore = require('../src/db/duckDbStore');
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');

/**
 * Scheda come la produce il provider DuckDB per una serie, con la griglia episodi già dentro
 * (`videos`) e senza `_numberOfSeasons`: gli episodi non vengono riscaricati, così l'unica
 * richiesta possibile è quella dell'id IMDb.
 */
function schedaSerieTier1() {
    return {
        id: 'tmdb:1668',
        type: 'series',
        name: 'Friends',
        description: 'Descrizione.',
        poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
        behaviorHints: { hasScheduledVideos: true },
        videos: [
            { id: 'tmdb:1668:1:1', title: 'Primo episodio', season: 1, episode: 1 },
            { id: 'tmdb:1668:1:2', title: 'Secondo episodio', season: 1, episode: 2 }
        ],
        _isAnime: false
    };
}

function userConfig() {
    return { apiKeys: { tmdb: 'test-key' } };
}

describe("misura: quante richieste di rete si risparmiano con l'id IMDb dal dump", () => {
    beforeEach(() => {
        mockStore.clear();
        mockHttpChiamate.length = 0;
        mockInDump = true;
        getDuckDbMetaDetails.mockReset().mockImplementation(async () => schedaSerieTier1());
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('titolo nel dump (Tier 1): ZERO richieste di rete, id IMDb lo stesso', async () => {
        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());

        expect(mockHttpChiamate).toEqual([]);                // nessuna uscita in rete
        expect(duckDbStore.resolveTmdbToImdb).toHaveBeenCalledTimes(1);
        expect(res.meta.videos.map(v => v.id)).toEqual(['tt0108778:1:1', 'tt0108778:1:2']);
    });

    test('titolo fuori dal dump (Tier 2): una richiesta a /external_ids (il comportamento di prima)', async () => {
        mockInDump = false;

        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());

        expect(mockHttpChiamate).toEqual(['/tv/1668/external_ids']);
        // Stesso risultato: la correzione non cambia gli id, cambia solo da dove arrivano.
        expect(res.meta.videos.map(v => v.id)).toEqual(['tt0108778:1:1', 'tt0108778:1:2']);
    });

    test('la differenza è proprio la richiesta: stesso titolo, due condizioni', async () => {
        mockInDump = true;
        await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());
        const richiesteConDump = mockHttpChiamate.length;

        // Cache `tmdb_imdb_id` calda: la seconda richiesta senza dump non esce, quindi si
        // azzera tutto e si ripete con la cache fredda (l'unico caso in cui si paga).
        mockStore.clear();
        mockHttpChiamate.length = 0;
        mockInDump = false;
        await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());
        const richiesteSenzaDump = mockHttpChiamate.length;

        expect(richiesteConDump).toBe(0);
        expect(richiesteSenzaDump).toBe(1);
        // 1 − 0 = 1 richiesta risparmiata per titolo Tier 1 aperto a cache fredda.
        expect(richiesteSenzaDump - richiesteConDump).toBe(1);
    });
});