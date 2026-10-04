/**
 * Gli id degli episodi sono in forma IMDb (`tt…:S:E`) quando l'id IMDb è noto.
 *
 * L'umano apre le serie dai **nostri** cataloghi, che danno id `tmdb:` (misurato in
 * produzione il 03/10/2026: 20 card su 20). Stremio poi chiede gli stream agli altri addon
 * con gli id che trova in `meta.videos`, e gli addon non capiscono `tmdb:`: misurato su
 * Torrentio, `tt0108778:1:1` dà 53 stream e `tmdb:1668:1:1` ne dà 0. Sintomo: "una sorgente
 * su tre" e, cliccando un episodio, sempre lo stesso.
 *
 * Quindi: la forma degli id degli episodi è **IMDb quando l'id IMDb si conosce**, qualunque
 * forma abbia usato la richiesta; `meta.id` invece resta la forma della richiesta (su quell'id
 * Stremio tiene libreria e stato "visto" del titolo). Se l'id IMDb non si conosce, gli episodi
 * restano nella forma della richiesta: non si inventa niente.
 *
 * Qui si prova il contratto di `metaHandler` con la cache degli episodi **piena**, cioè nel
 * caso che oggi si rompe: `fetchTmdbEpisodes` restituisce sempre lo stesso array (come
 * `tvEpisodesCache`), con id `tmdb:` — l'id IMDb si perde, perché arriva dai dati TMDB via
 * `append_to_response`, chiesti solo a cache vuota.
 */

// Cache in memoria condivisa da tutte le istanze (namespace → Map), per valore e per
// riferimento esattamente come fa `CacheManager`: mutare il valore restituito avvelena la
// cache, ed è proprio quello che il test deve smentire. Il `Map` si cerca a ogni operazione
// (non si tiene un riferimento dalla costruzione) così `mockStore.clear()` nel `beforeEach`
// azzera davvero tutte le cache, e ogni test parte da cache fredda.
const mockStore = new Map();

// Finto `tvEpisodesCache`: senza questo, ogni richiesta ricreerebbe gli episodi e la prova
// della cache avvelenata non avrebbe senso.
const mockEpisodesCache = new Map();

// Finto `imdbIdCache` (`tmdb_imdb_id`, la cache dedicata all'id IMDb): `resolveImdbId` è la
// sola sorgente ammessa per l'id degli episodi, e su questa mappa si decide se è noto o no.
const mockImdbIds = new Map();

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
            // Per riferimento, come la cache vera: nessuna copia qui dentro.
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

// Copia fedele di `fetchTmdbEpisodes`: usa `imdbId` solo quando è disponibile e, dalla
// seconda chiamata in poi, restituisce l'array già in cache (id `tmdb:`).
jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(async () => null),
    createTmdbClient: jest.fn(() => ({})),
    resolveImdbId: jest.fn(async (tmdbId) => (mockImdbIds.has(String(tmdbId)) ? mockImdbIds.get(String(tmdbId)) : null)),
    fetchTmdbEpisodes: jest.fn(async (client, tmdbId, totalSeasons, imdbId) => {
        const key = String(tmdbId);
        if (mockEpisodesCache.has(key)) return mockEpisodesCache.get(key);

        const videos = [
            {
                id: imdbId ? `${imdbId}:1:1` : `tmdb:${tmdbId}:1:1`,
                title: 'Primo episodio',
                season: 1,
                episode: 1,
                thumbnail: 'https://image.tmdb.org/t/p/w500/still-1.jpg'
            },
            {
                id: imdbId ? `${imdbId}:1:2` : `tmdb:${tmdbId}:1:2`,
                title: 'Secondo episodio',
                season: 1,
                episode: 2,
                thumbnail: 'https://image.tmdb.org/t/p/w500/still-2.jpg'
            }
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
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const animeMappingStore = require('../src/data/animeMappingStore');

const ID_IMDB = 'tt0108778';
const ID_TMDB = 'tmdb:1668';
const CACHE_NS = 'final_meta_cache';
const CACHE_KEY = 'meta_1668_series';

/** Scheda serie in Tier 1 (DuckDB): l'id è quello nativo, senza id IMDb. */
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

/** L'oggetto che `finalMetaCache` ha davvero in mano, per riferimento. */
function inCache(key = CACHE_KEY) {
    return mockStore.get(CACHE_NS).get(key);
}

describe('metaHandler: gli id degli episodi sono IMDb quando l\'id IMDb è noto', () => {
    beforeEach(() => {
        mockStore.clear();
        mockEpisodesCache.clear();
        mockImdbIds.clear();
        getDuckDbMetaDetails.mockReset();
        resolveImdbId.mockClear();
        animeMappingStore.resolveKitsu.mockReset().mockReturnValue(null);
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('aperta con tmdb: (come dai nostri cataloghi) → episodi tt…, ma meta.id resta tmdb:', async () => {
        mockImdbIds.set('1668', ID_IMDB);
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());

        // `meta.id` non si tocca: su quell'id Stremio tiene libreria e stato "visto".
        expect(res.meta.id).toBe(ID_TMDB);
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);
        // Nessun altro campo dei video è stato toccato.
        expect(res.meta.videos[0]).toEqual({
            id: 'tt0108778:1:1',
            title: 'Primo episodio',
            season: 1,
            episode: 1,
            thumbnail: 'https://image.tmdb.org/t/p/w500/still-1.jpg'
        });
        expect(resolveImdbId).toHaveBeenCalledWith('1668', 'tv', 'test-key');
    });

    test('aperta con l\'id IMDb → episodi tt… (invariato)', async () => {
        mockImdbIds.set('1668', ID_IMDB);
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_IMDB }, userConfig());

        expect(res.meta.id).toBe(ID_IMDB);
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);
        // L'id IMDb è già nella richiesta: nessuna risoluzione (e nessuna rete) serve.
        expect(resolveImdbId).not.toHaveBeenCalled();
    });

    test('id IMDb non noto → gli episodi restano nella forma della richiesta (ripiego)', async () => {
        // `mockImdbIds` vuota: la cache dedicata non ha l'id (assente davvero, o non ancora
        // risolto). Niente da inventare: gli id restano quelli che hanno.
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());

        expect(res.meta.id).toBe(ID_TMDB);
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);
        expect(resolveImdbId).toHaveBeenCalledTimes(1); // si è provato, una volta: è in cache
    });

    test('la cache non viene avvelenata: id IMDb in cache, id nativi intatti', async () => {
        mockImdbIds.set('1668', ID_IMDB);
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        // 1) apertura `tmdb:` dal catalogo → gli episodi escono in forma IMDb.
        const daCatalogo = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());
        expect(daCatalogo.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);

        // 2) l'array degli episodi in `tvEpisodesCache` è lo stesso oggetto che i provider
        //    hanno prodotto: se la riscrittura fosse avvenuta su ricevuto, qui sarebbe tt…
        const episodiInCache = mockEpisodesCache.get('1668');
        expect(episodiInCache.map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);

        // 3) e la scheda in `finalMetaCache` conserva i suoi video nativi: le due richieste
        //    successive (l'altra forma, e un id con suffisso) non devono trovarci dentro tt…
        const cached = inCache();
        expect(cached.videos).toBe(episodiInCache);
        expect(cached.videos.map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);

        // 4) riaprendo con l'altra forma la risposta è coerente con la richiesta su `meta.id`
        //    e gli episodi restano in forma IMDb: nessuna contaminazione fra le due forme.
        const daImdb = await metaHandler({ type: 'series', id: ID_IMDB }, userConfig());
        expect(daImdb.meta.id).toBe(ID_IMDB);
        expect(daImdb.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);

        // 5) e la risposta non è letteralmente l'oggetto in cache.
        expect(daImdb.meta).not.toBe(cached);
        expect(daImdb.meta.videos[0]).not.toBe(episodiInCache[0]);
    });

    test('gli anime restano come sono: gli id Kitsu e il fallback nativo non vengono toccati', async () => {
        // Solo il primo episodio è mappato su Kitsu; il secondo resta sull'id nativo TMDB.
        animeMappingStore.resolveKitsu.mockImplementation((tmdbId, season, episode) =>
            episode === 1 ? { success: true, kitsuId: '9876', kitsuEpisode: 5 } : { success: false }
        );
        mockImdbIds.set('999', 'tt0098800');
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({ anime: true, tmdbId: '999' }));

        const res = await metaHandler({ type: 'series', id: 'tt0098800' }, userConfig());

        expect(res.meta.id).toBe('tt0098800');
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'kitsu:9876:5',   // percorso anime: non riscritto
            'tmdb:999:1:2'    // fallback nativo: non riscritto
        ]);

        // Anche aperta dal catalogo (`tmdb:`) l'anime resta su Kitsu, e l'id IMDb non viene
        // nemmeno cercato: sugli anime la forma degli id è un'altra strada.
        animeMappingStore.resolveKitsu.mockClear();
        animeMappingStore.resolveKitsu.mockImplementation((tmdbId, season, episode) =>
            episode === 1 ? { success: true, kitsuId: '9876', kitsuEpisode: 5 } : { success: false }
        );
        mockStore.clear();
        mockEpisodesCache.clear();
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({ anime: true, tmdbId: '999' }));

        const daTmdb = await metaHandler({ type: 'series', id: 'tmdb:999' }, userConfig());

        expect(daTmdb.meta.id).toBe('tmdb:999');
        expect(daTmdb.meta.videos.map(v => v.id)).toEqual([
            'kitsu:9876:5',
            'tmdb:999:1:2'
        ]);
        expect(resolveImdbId).not.toHaveBeenCalled();
    });
});