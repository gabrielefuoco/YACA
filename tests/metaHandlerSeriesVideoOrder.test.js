/**
 * Aprendo una serie, Stremio non deve aprirti nessun episodio: deve darti la lista.
 *
 * DECISIONE DELL'UOMO, testuale: «stremio non deve aprirmi nessun episodio quando apro una serie.
 * deve darmi la lista e basta. è l'user che sceglie che episodio vedere».
 *
 * Due cose ne seguono, ed è quello che qui si prova:
 *  1. nessun `behaviorHints.defaultVideoId` sulle serie (sui film c'è, e resta: lì il video è
 *     uno solo e non è una scelta; sulle serie sarebbe esattamente la scelta imposta da evitare);
 *  2. gli episodi di **stagione 0** (gli speciali) vanno in **fondo** alla lista, non tolti.
 *
 * PERCHÉ LA STAGIONE 0: `fetchTmdbEpisodes` riempie le stagioni in ordine 0..N, quindi la lista
 * comincia dagli speciali. Verificato su dati veri il 03/10/2026: Game of Thrones ha 314 voci
 * in stagione 0, Friends 39 su 267 — in gran parte duplicati e robaccia, e finivano in cima.
 *
 * La trappola già pagata cara: `meta.videos` è l'array conservato in cache (`tvEpisodesCache`,
 * e per riferimento dentro `finalMetaCache`). Il finto `CacheManager` qui conserva il riferimento
 * come fa quello vero, quindi una riordinazione fatta *sull'oggetto ricevuto* si vedrebbe.
 */

// Cache in memoria condivisa (namespace → Map), per valore e per riferimento come `CacheManager`.
const mockStore = new Map();

// Finto `tvEpisodesCache`: senza questo la prova sarebbe vuota (gli episodi verrebbero rifatti
// a ogni richiesta e non ci sarebbe nulla in cache da inquinare).
const mockEpisodesCache = new Map();

const mockImdbIds = new Map();

jest.mock('../src/db/duckDbStore', () => ({
    isInitialized: true,
    query: jest.fn(async () => []),
    init: jest.fn(async () => {}),
    updateAnimeMapping: jest.fn(async () => {}),
    resolveImdbIds: jest.fn(async () => ({})),
    // Nessun titolo nel dump: qui si prova l'ordine, non la fonte dell'id IMDb.
    resolveTmdbToImdb: jest.fn(async () => ({}))
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

/**
 * Copia fedele di `fetchTmdbEpisodes` nella sua forma reale: le stagioni vengono riempite in
 * ordine 0..N, quindi la lista prodotta comincia dagli speciali (è il difetto da correggere),
 * e dalla seconda volta in poi restituisce l'array già in cache.
 */
jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(async () => null),
    createTmdbClient: jest.fn(() => ({})),
    resolveImdbId: jest.fn(async (tmdbId) => (mockImdbIds.has(String(tmdbId)) ? mockImdbIds.get(String(tmdbId)) : null)),
    fetchTmdbEpisodes: jest.fn(async (client, tmdbId) => {
        const key = String(tmdbId);
        if (mockEpisodesCache.has(key)) return mockEpisodesCache.get(key);

        const tmdb = String(tmdbId);
        const videos = [];
        // Stagione 0 (speciali): 3 voci, in scala sui 314 di Game of Thrones.
        for (let ep = 1; ep <= 3; ep++) {
            videos.push({ id: `tmdb:${tmdb}:0:${ep}`, title: `Speciale ${ep}`, season: 0, episode: ep });
        }
        // Stagioni 1 e 2: l'ordine reale è stagione, poi episodio.
        for (const season of [1, 2]) {
            const numeroEpisodi = season === 1 ? 4 : 2;
            for (let ep = 1; ep <= numeroEpisodi; ep++) {
                videos.push({ id: `tmdb:${tmdb}:${season}:${ep}`, title: `S${season}E${ep}`, season, episode: ep });
            }
        }

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
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const animeMappingStore = require('../src/data/animeMappingStore');

const CACHE_NS = 'final_meta_cache';
const CACHE_KEY = 'meta_1668_series';

function schedaSerie({ anime = false, tmdbId = '1668', behaviorHints = { hasScheduledVideos: true } } = {}) {
    return {
        id: `tmdb:${tmdbId}`,
        type: 'series',
        name: anime ? 'Cowboy Bebop' : 'Friends',
        description: 'Descrizione.',
        poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
        _numberOfSeasons: 2,
        behaviorHints,
        _isAnime: anime
    };
}

function userConfig() {
    return { apiKeys: { tmdb: 'test-key' } };
}

/** L'oggetto che `finalMetaCache` ha davvero in mano, per riferimento. */
function inCache(key = CACHE_KEY) {
    return mockStore.get(CACHE_NS).get(key);
}

describe('metaHandler: aprendo una serie non viene imposto nessun episodio', () => {
    beforeEach(() => {
        mockStore.clear();
        mockEpisodesCache.clear();
        mockImdbIds.clear();
        getDuckDbMetaDetails.mockReset();
        animeMappingStore.resolveKitsu.mockReset().mockReturnValue(null);
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('la lista comincia dal primo episodio vero: gli speciali sono in fondo', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());

        // La lista è completa: nessuno perso, nessuno duplicato.
        expect(res.meta.videos).toHaveLength(9);
        // Il primo elemento — quello che Stremio aprirebbe in mancanza di un default — è S1E1.
        expect(res.meta.videos[0]).toMatchObject({ season: 1, episode: 1 });
        // Gli speciali ci sono tutti, e sono in fondo, nell'ordine in cui erano.
        const inCoda = res.meta.videos.slice(-3);
        expect(inCoda.map(v => v.id)).toEqual([
            'tmdb:1668:0:1',
            'tmdb:1668:0:2',
            'tmdb:1668:0:3'
        ]);
        expect(res.meta.videos.filter(v => v.season === 0)).toHaveLength(3);
        // L'ordine delle altre stagioni è invariato (stagione, poi episodio: 0 → 1 → 2 → 3 → 1 → 2).
        expect(res.meta.videos.slice(0, 6).map(v => `${v.season}:${v.episode}`))
            .toEqual(['1:1', '1:2', '1:3', '1:4', '2:1', '2:2']);
    });

    test('nessun episodio imposto: la risposta non ha defaultVideoId', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());

        expect(res.meta.behaviorHints.defaultVideoId).toBeUndefined();
        expect('defaultVideoId' in (res.meta.behaviorHints || {})).toBe(false);
    });

    test('nemmeno se la voce in cache ne porta uno (entry vecchia): la risposta no', async () => {
        // Difensivo: nessun codice scrive `defaultVideoId` sulle serie, ma una voce arrivata da
        // una versione precedente potrebbe portarlo. La decisione è che Stremio non apra nulla:
        // quindi la risposta non lo espone — e l'oggetto in cache resta com'era.
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({
            behaviorHints: { hasScheduledVideos: true, defaultVideoId: 'tmdb:1668:0:1' }
        }));

        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());

        expect(res.meta.behaviorHints.defaultVideoId).toBeUndefined();
        expect(inCache().behaviorHints.defaultVideoId).toBe('tmdb:1668:0:1');
    });

    test('la cache non viene avvelenata: l\'array degli episodi resta com\'era', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());
        expect(res.meta.videos[0]).toMatchObject({ season: 1, episode: 1 });

        // L'array che `tvEpisodesCache` ha davvero in mano è lo stesso che i provider hanno
        // prodotto: la riordinazione è avvenuta su un array NUOVO, non su quello di cache.
        const inCacheEpisodes = mockEpisodesCache.get('1668');
        expect(inCacheEpisodes[0]).toMatchObject({ season: 0, episode: 1 });
        expect(res.meta.videos).not.toBe(inCacheEpisodes);

        // E l'ingresso di `finalMetaCache` conserva la sua lista e i suoi campi.
        const cached = inCache();
        expect(cached.videos).toBe(inCacheEpisodes);
        expect(cached.videos.map(v => v.id)).toEqual([
            'tmdb:1668:0:1', 'tmdb:1668:0:2', 'tmdb:1668:0:3',
            'tmdb:1668:1:1', 'tmdb:1668:1:2', 'tmdb:1668:1:3', 'tmdb:1668:1:4',
            'tmdb:1668:2:1', 'tmdb:1668:2:2'
        ]);
    });

    test('id IMDb noto: gli id diventano tt…, e gli speciali restano in fondo', async () => {
        mockImdbIds.set('1668', 'tt0108778');
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: 'tmdb:1668' }, userConfig());

        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1', 'tt0108778:1:2', 'tt0108778:1:3', 'tt0108778:1:4',
            'tt0108778:2:1', 'tt0108778:2:2',
            'tt0108778:0:1', 'tt0108778:0:2', 'tt0108778:0:3'
        ]);
        expect(res.meta.behaviorHints.defaultVideoId).toBeUndefined();
    });

    test('gli anime restano identici: il loro ordine non si tocca', async () => {
        // Sui anime la lista segue il percorso Kitsu e oggi comincia dagli speciali: qui non si
        // cambia niente (l\'ordine di oggi è voluto, e gli id `kitsu:` restano al loro posto).
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({ anime: true, tmdbId: '999' }));

        const res = await metaHandler({ type: 'series', id: 'tmdb:999' }, userConfig());

        expect(res.meta.videos.map(v => `${v.season}:${v.episode}`)).toEqual([
            '0:1', '0:2', '0:3', '1:1', '1:2', '1:3', '1:4', '2:1', '2:2'
        ]);
        expect(res.meta.behaviorHints.defaultVideoId).toBeUndefined();
    });

    test('serie senza speciali: la lista non viene toccata (stesso array)', async () => {
        const { buildResponseMeta } = require('../src/handlers/metaHandler');
        animeMappingStore.isAnimeTmdbId.mockReturnValue(false);
        const ingresso = {
            id: 'tmdb:1668',
            type: 'series',
            name: 'Friends',
            behaviorHints: { hasScheduledVideos: true },
            videos: [
                { id: 'tmdb:1668:1:1', season: 1, episode: 1 },
                { id: 'tmdb:1668:1:2', season: 1, episode: 2 }
            ]
        };

        const res = buildResponseMeta(ingresso, { requestedId: 'tmdb:1668', originalId: 'tmdb:1668', type: 'series' });

        expect(res.videos).toBe(ingresso.videos);
        expect(ingresso.videos.map(v => v.id)).toEqual(['tmdb:1668:1:1', 'tmdb:1668:1:2']);
    });

    test('i film non hanno video: nessuna lista, nessun episodio', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => ({
            id: 'tt0120631',
            type: 'movie',
            name: 'Inseparabili',
            description: 'Descrizione.',
            poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
            behaviorHints: { defaultVideoId: 'tt0120631' },
            _isAnime: false
        }));

        const res = await metaHandler({ type: 'movie', id: 'tmdb:27205' }, userConfig());

        expect(res.meta.videos).toBeUndefined();
        // Sul film `defaultVideoId` resta: lì il video è uno solo, non è una scelta imposta.
        expect(res.meta.behaviorHints.defaultVideoId).toBe('tt0120631');
    });
});