/**
 * Id degli episodi = forma con cui è arrivata la richiesta.
 *
 * Friends aperta in Stremio mostrava una sola fonte di stream e qualunque episodio scelto
 * dava sempre lo stesso: gli id dei video erano `tmdb:1668:S:E` anche quando la richiesta
 * era `tt0108778`, perché l'id IMDb si perde (arriva da `external_ids`, chiesto solo a cache
 * vuota) e Stremio poi cerca gli stream con quegli id.
 *
 * Qui si prova il contratto di `metaHandler` con la cache degli episodi **piena**, cioè nel
 * caso che oggi si rompe: `fetchTmdbEpisodes` restituisce sempre lo stesso array (come
 * `tvEpisodesCache`) e la seconda richiesta, con l'altra forma, deve ricevere la sua.
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
    resolveTmdbFromKitsu: jest.fn(() => null)
}));

// Copia fedele di `fetchTmdbEpisodes`: usa `imdbId` solo quando è disponibile e, dalla
// seconda chiamata in poi, restituisce l'array già in cache (id `tmdb:`).
jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(async () => null),
    createTmdbClient: jest.fn(() => ({})),
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
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const animeMappingStore = require('../src/data/animeMappingStore');

const ID_IMDB = 'tt0108778';
const ID_TMDB = 'tmdb:1668';

/** Scheda serie in Tier 1 (DuckDB): senza id IMDb, come nella realtà dei titoli in catalogo. */
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

describe('metaHandler: gli id degli episodi seguono la forma della richiesta', () => {
    beforeEach(() => {
        mockStore.clear();
        mockEpisodesCache.clear();
        getDuckDbMetaDetails.mockReset();
        animeMappingStore.resolveKitsu.mockReset().mockReturnValue(null);
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('una serie aperta con l\'id IMDb riceve episodi con l\'id IMDb', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_IMDB }, userConfig());

        expect(res.meta.id).toBe(ID_IMDB);
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tt0108778:1:1',
            'tt0108778:1:2'
        ]);
    });

    test('una serie aperta con tmdb: riceve episodi tmdb: (invariato)', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        const res = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());

        expect(res.meta.id).toBe(ID_TMDB);
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);
    });

    test('la seconda richiesta con l\'altra forma riceve la sua: la cache non è avvelenata', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie());

        // 1) apertura IMDb: gli episodi devono diventare tt…
        const imdb = await metaHandler({ type: 'series', id: ID_IMDB }, userConfig());
        expect(imdb.meta.videos[0].id).toBe('tt0108778:1:1');

        // 2) stessa serie aperta con tmdb: gli id devono tornare tmdb:, non tt…
        const tmdb = await metaHandler({ type: 'series', id: ID_TMDB }, userConfig());
        expect(tmdb.meta.videos.map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);

        // 3) e riaprendo con l'IMDb tornano tt…: nessuna contaminazione fra le due forme.
        const imdbDiNuovo = await metaHandler({ type: 'series', id: ID_IMDB }, userConfig());
        expect(imdbDiNuovo.meta.videos[0].id).toBe('tt0108778:1:1');

        // La cache degli episodi conserva ancora la forma nativa: è la prova che la
        // riscrittura è avvenuta su una copia e non sull'oggetto in cache.
        expect(mockEpisodesCache.get('1668').map(v => v.id)).toEqual([
            'tmdb:1668:1:1',
            'tmdb:1668:1:2'
        ]);
    });

    test('gli anime restano come sono: gli id Kitsu e il fallback nativo non vengono toccati', async () => {
        // Solo il primo episodio è mappato su Kitsu; il secondo resta sull'id nativo TMDB.
        animeMappingStore.resolveKitsu.mockImplementation((tmdbId, season, episode) =>
            episode === 1 ? { success: true, kitsuId: '9876', kitsuEpisode: 5 } : { success: false }
        );
        getDuckDbMetaDetails.mockImplementation(async () => schedaSerie({ anime: true, tmdbId: '999' }));

        const res = await metaHandler({ type: 'series', id: 'tt0098800' }, userConfig());

        expect(res.meta.id).toBe('tt0098800');
        expect(res.meta.videos.map(v => v.id)).toEqual([
            'kitsu:9876:5',   // percorso anime: non riscritto
            'tmdb:999:1:2'    // fallback nativo: non riscritto
        ]);
    });
});