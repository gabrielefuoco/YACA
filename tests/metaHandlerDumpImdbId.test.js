/**
 * L'id IMDb degli episodi si legge **dal dump**, non dalla rete.
 *
 * CONTESTO: gli id degli episodi devono essere in forma IMDb (`tt…:S:E`) perché gli addon di
 * streaming non capiscono `tmdb:` (vedi `metaHandlerEpisodeIds.test.js`). Per ottenere l'id IMDb
 * da un id TMDB la correzione usa `resolveImdbId`, che passa dalla cache `tmdb_imdb_id` e che
 * **al primo giro chiama TMDB via rete** (`/external_ids`).
 *
 * L'umano ha contestato questo, ed è nel giusto: «non usavamo già duckdb per l'id tmdb? il
 * senso di avere un dump di tmdb è proprio quello di non dover fare mai richieste di rete».
 *
 * Il dump ha la colonna `imdb_id` (è già usata da `resolveImdbIds`, nel verso opposto). Quindi
 * per un titolo **Tier 1** l'id IMDb è già in casa: chiederlo alla rete è una richiesta che il
 * dump rende inutile. Solo la coda lunga (Tier 2, non nel dump) ricade sulla cache e quindi,
 * se proprio serve, sulla rete.
 *
 * Qui si prova il contratto di `metaHandler`: `resolveImdbId` **non** viene chiamato quando il
 * dump risponde, e viene chiamato quando il dump non c'è.
 */

// Cache in memoria condivisa (namespace → Map), per riferimento come fa `CacheManager`: se la
// finta copiasse il valore, la prova «l'array in cache non è stato avvelenato» non avrebbe senso.
const mockStore = new Map();

const mockEpisodesCache = new Map();

// `resolveImdbId` è la strada con la rete: qui si conta quante volte viene percorsa.
const mockImdbIds = new Map();

// Finto DuckDB: `resolveTmdbToImdb` è il verso opposto di `resolveImdbIds` (TMDB → IMDb) e legge
// la colonna `imdb_id` dei parquet. Si simula un dump con dentro solo 1668 (Friends): tutto il
// resto è coda lunga.
const mockDump = new Map([['1668', 'tt0108778']]);

jest.mock('../src/db/duckDbStore', () => ({
    isInitialized: true,
    query: jest.fn(async () => []),
    init: jest.fn(async () => {}),
    updateAnimeMapping: jest.fn(async () => {}),
    resolveImdbIds: jest.fn(async () => ({})),
    resolveTmdbToImdb: jest.fn(async (tmdbIds) => {
        const out = {};
        for (const raw of tmdbIds) {
            const key = String(Number(String(raw).replace(/^tmdb:/, '')));
            if (mockDump.has(key)) out[key] = mockDump.get(key);
        }
        return out;
    })
}));

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

jest.mock('../src/id_mapping/id_cache', () => ({
    translateImdbToTmdb: jest.fn(async (imdbId) => ({ id: { 'tt0108778': '1668', 'tt0098800': '999' }[imdbId] }))
}));

jest.mock('../src/data/animeMappingStore', () => ({
    resolveKitsu: jest.fn(() => null),
    resolveKitsuMovie: jest.fn(() => null),
    resolveTmdbFromKitsu: jest.fn(() => null),
    isAnimeTmdbId: jest.fn(() => false)
}));

// Copia fedele di `fetchTmdbEpisodes`: id IMDb quando c'è, altrimenti la forma nativa, e dalla
// seconda volta in poi restituisce l'array già in cache (che è quello che va tenuto intatto).
jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(async () => null),
    createTmdbClient: jest.fn(() => ({})),
    resolveImdbId: jest.fn(async (tmdbId) => (mockImdbIds.has(String(tmdbId)) ? mockImdbIds.get(String(tmdbId)) : null)),
    fetchTmdbEpisodes: jest.fn(async (client, tmdbId, totalSeasons, imdbId) => {
        const key = String(tmdbId);
        if (mockEpisodesCache.has(key)) return mockEpisodesCache.get(key);

        const videos = [
            { id: imdbId ? `${imdbId}:1:1` : `tmdb:${tmdbId}:1:1`, title: 'Primo episodio', season: 1, episode: 1 },
            { id: imdbId ? `${imdbId}:1:2` : `tmdb:${tmdbId}:1:2`, title: 'Secondo episodio', season: 1, episode: 2 }
        ];
        mockEpisodesCache.set(key, videos);
        return videos;
    })
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbMetaDetails: jest.fn()
}));

jest.mock('../src/db/tier1LazyPromotion', () => ({
    schedulePromotion: jest.fn()
}));

const { metaHandler } = require('../src/handlers/metaHandler');
const { resolveImdbId } = require('../src/clients/tmdb');
const duckDbStore = require('../src/db/duckDbStore');
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const animeMappingStore = require('../src/data/animeMappingStore');

const ID_IMDB = 'tt0108778';
const ID_TMDB = 'tmdb:1668';
/** Tier 2: assente dal dump per costruzione (il finto DuckDB conosce solo 1668). */
const ID_TMDB_TIER2 = 'tmdb:2000';

function schedaSerie({ anime = false, tmdbId = '1668' } = {}) {
    return {
        id: `tmdb:${tmdbId}`,
        type: 'series',
        name: anime ? 'Cowboy Bebop' : 'Friends',
        description: 'Descrizione.',
        poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
        _numberOfSeasons: 1,
        _isAnime: anime
    };
}

function userConfig() {
    return { apiKeys: { tmdb: 'test-key' } };
}

describe("metaHandler: l'id IMDb degli episodi si legge dal dump", () => {
    beforeEach(() => {
        mockStore.clear();
        mockEpisodesCache.clear();
        mockImdbIds.clear();
        getDuckDbMetaDetails.mockReset();
        resolveImdbId.mockClear();
        duckDbStore.resolveTmdbToImdb.mockClear();
        duckDbStore.resolveTmdbToImdb.mockImplementation(async (tmdbIds) => {
            const out = {};
            for (const raw of tmdbIds) {
                const key = String(Number(String(raw).replace(/^tmdb:/, '')));
                if (mockDump.has(key)) out[key] = mockDump.get(key);
            }
            return out;
        });
        animeMappingStore.resolveKitsu.mockReset().mockReturnValue(null);
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('titolo Tier 1 (nel dump): id IMDb dagli episodi senza passare dalla rete', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());

        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);
        // Il dump è stato consultato, sulla tabella giusta e con l'id giusto.
        expect(duckDbStore.resolveTmdbToImdb).toHaveBeenCalledWith(['1668'], 'tv');
        // E la strada con la rete non è stata percorsa: zero chiamate, quindi zero richieste.
        expect(resolveImdbId).not.toHaveBeenCalled();
    });

    test('titolo fuori dal dump (Tier 2): si cade sulla cache dedicata, come prima', async () => {
        // Il finto DuckDB non conosce 2000 ⇒ coda lunga: il percorso è quello di sempre.
        mockImdbIds.set('2000', 'tt0123456');
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({ tmdbId: '2000' }));

        const res = await metaHandler({ type: 'series', id: ID_TMDB_TIER2 }, userConfig());

        expect(duckDbStore.resolveTmdbToImdb).toHaveBeenCalledWith(['2000'], 'tv');
        expect(resolveImdbId).toHaveBeenCalledTimes(1);   // una volta sola: poi è in cache
        expect(resolveImdbId).toHaveBeenCalledWith('2000', 'tv', 'test-key');
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0123456:1:1',
            'tt0123456:1:2'
        ]);
    });

    test('il dump non risponde e la rete non c\'è: si comporta come prima, senza errori', async () => {
        duckDbStore.resolveTmdbToImdb.mockRejectedValue(new Error('parquet non raggiungibile'));
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());

        expect(res.meta).not.toBeNull();
        expect(resolveImdbId).toHaveBeenCalledTimes(1);
        // Nessun id IMDb da nessuna parte: gli episodi restano nella forma della richiesta,
        // e non si inventa niente.
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);
    });

    test('richiesta già in forma IMDb: nessuna lettura, nessuna rete', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_IMDB }, userConfig());

        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);
        expect(duckDbStore.resolveTmdbToImdb).not.toHaveBeenCalled();
        expect(resolveImdbId).not.toHaveBeenCalled();
    });

    test('sugli anime non si guarda niente: ne il dump né la rete', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({ anime: true, tmdbId: '999' }));

        const res = await metaHandler({ type: 'series', id: 'tmdb:999' }, userConfig());

        expect(res.meta.videos.map(v => v.id)).toEqual(['tmdb:999:1:1', 'tmdb:999:1:2']);
        expect(duckDbStore.resolveTmdbToImdb).not.toHaveBeenCalled();
        expect(resolveImdbId).not.toHaveBeenCalled();
    });

    test('i film non hanno episodi: nessuna lettura del dump, nessuna rete', async () => {
        // Sui film `resolveImdbIdPerEpisodi` esce subito (non c'è `videos`): l'id IMDb serve
        // solo per la forma degli id degli episodi, e un film non ne ha. Niente dump, niente rete.
        mockDump.set('27205', 'tt0120631'); // Inseparabili, film
        try {
            getDuckDbMetaDetails.mockImplementation(async () => ({
                id: 'tmdb:27205',
                type: 'movie',
                name: 'Inseparabili',
                description: 'Descrizione.',
                poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
                behaviorHints: { defaultVideoId: 'tmdb:27205' },
                _isAnime: false
            }));

            const res = await metaHandler({ type: 'movie', id: 'tmdb:27205' }, userConfig());

            expect(res.meta.behaviorHints.defaultVideoId).toBe('tmdb:27205'); // invariato
            expect(duckDbStore.resolveTmdbToImdb).not.toHaveBeenCalled();
            expect(resolveImdbId).not.toHaveBeenCalled();
        } finally {
            mockDump.delete('27205');
        }
    });
});