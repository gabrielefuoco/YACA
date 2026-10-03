/**
 * La risposta non deve essere l'oggetto che sta in cache.
 *
 * La chiave di `finalMetaCache` è `meta_<tmdbId>_<type>`: non contiene la forma con cui è
 * arrivata la richiesta, quindi `tt0108778` e `tmdb:1668` leggono e scrivono **la stessa
 * voce**, per riferimento. Scrivere `meta.id` o `behaviorHints.defaultVideoId` su quell'oggetto
 * significa che la richiesta successiva, con l'altra forma, eredita i segni della prima:
 * `defaultVideoId` è il campo con cui Stremio sceglie il video da aprire, quindi un valore nella
 * forma sbagliata fa aprire l'episodio sbagliato (o fa rispondere una sola fonte).
 *
 * Qui la cache è finta ma **conserva il riferimento**, che è la condizione in cui il guasto si
 * manifesta: se la finta copiasse il valore, non si starebbe provando niente. L'oggetto in
 * cache è quindi quello che i provider hanno costruito, ed è su quello che si asserisce.
 */

// Cache in memoria condivisa da tutte le istanze (namespace → Map), per valore e per
// riferimento come fa `CacheManager`: mutare il valore restituito avvelena davvero la cache.
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
            // Per riferimento, come la cache vera: nessuna copia qui dentro.
            this._store().set(key, value);
        }
    }
    return FakeCacheManager;
});

jest.mock('../src/id_mapping/id_cache', () => ({
    translateImdbToTmdb: jest.fn(async (imdbId) => ({ id: { 'tt0108778': '1668' }[imdbId] }))
}));

jest.mock('../src/data/animeMappingStore', () => ({
    resolveKitsu: jest.fn(() => null),
    resolveKitsuMovie: jest.fn(() => null),
    resolveTmdbFromKitsu: jest.fn(() => null),
    isAnimeTmdbId: jest.fn(() => false)
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(async () => null),
    createTmdbClient: jest.fn(() => ({})),
    fetchTmdbEpisodes: jest.fn(async () => [])
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
const CACHE_NS = 'final_meta_cache';
const CACHE_KEY = 'meta_1668_movie';

function userConfig() {
    return { apiKeys: { tmdb: 'test-key' } };
}

/**
 * Scheda film "live": come quella che restituisce `toStremioMetaItem`, l'id è l'IMDb quando
 * `external_ids` c'era e `behaviorHints.defaultVideoId` nasce con quell'id.
 */
function schedaFilm({ imdb = true, anime = false } = {}) {
    return {
        id: imdb ? ID_IMDB : ID_TMDB,
        imdb_id: imdb ? ID_IMDB : undefined,
        _tmdbId: '1668',
        type: 'movie',
        name: 'Inseparabili',
        description: 'Descrizione.',
        poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
        genre_ids: anime ? [16] : [18, 35],
        behaviorHints: { defaultVideoId: imdb ? ID_IMDB : ID_TMDB },
        _isAnime: anime
    };
}

/** L'oggetto che la cache finta ha davvero in mano, per riferimento. */
function inCache(key = CACHE_KEY) {
    return mockStore.get(CACHE_NS).get(key);
}

describe('metaHandler: la risposta non è l\'oggetto in cache', () => {
    beforeEach(() => {
        mockStore.clear();
        getDuckDbMetaDetails.mockReset();
        animeMappingStore.resolveKitsu.mockReset().mockReturnValue(null);
        animeMappingStore.resolveKitsuMovie.mockReset().mockReturnValue(null);
        animeMappingStore.resolveTmdbFromKitsu.mockReset().mockReturnValue(null);
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('tmdb: → tt… → tmdb: sulla stessa voce: ogni risposta col proprio id', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaFilm());

        const tmdb1 = await metaHandler({ type: 'movie', id: ID_TMDB }, userConfig());
        expect(tmdb1.meta.id).toBe(ID_TMDB);
        // Su richiesta `tmdb:` l'IMDb risolto va tenuto in defaultVideoId (compatibilità streaming).
        expect(tmdb1.meta.behaviorHints.defaultVideoId).toBe(ID_IMDB);

        const imdb = await metaHandler({ type: 'movie', id: ID_IMDB }, userConfig());
        expect(imdb.meta.id).toBe(ID_IMDB);
        expect(imdb.meta.behaviorHints.defaultVideoId).toBe(ID_IMDB);

        const tmdb2 = await metaHandler({ type: 'movie', id: ID_TMDB }, userConfig());
        expect(tmdb2.meta.id).toBe(ID_TMDB);
        expect(tmdb2.meta.behaviorHints.defaultVideoId).toBe(ID_IMDB);

        // Le tre richieste hanno tutte colpito la *stessa* voce di cache: è il motivo per cui
        // la contaminazione sarebbe visibile (una copia per forma di id la renderebbe innocua).
        expect(mockStore.get(CACHE_NS).size).toBe(1);
        expect(tmdb1.meta).toEqual(tmdb2.meta); // stessa risposta per la stessa forma di richiesta
    });

    test('l\'oggetto in cache non viene mutato dall\'elaborazione della richiesta', async () => {
        getDuckDbMetaDetails.mockImplementation(async () => schedaFilm());

        await metaHandler({ type: 'movie', id: ID_TMDB }, userConfig());

        // L'ingresso di cache, per riferimento, e il suo stato subito dopo la prima richiesta.
        const cached = inCache();
        const snapshot = JSON.parse(JSON.stringify(cached));
        expect(cached.id).toBe(ID_IMDB);

        await metaHandler({ type: 'movie', id: ID_IMDB }, userConfig());
        await metaHandler({ type: 'movie', id: `${ID_TMDB}_ita_offset` }, userConfig());

        // Asserito direttamente sull'oggetto che la cache finta ha in mano: `id` e
        // `defaultVideoId` devono essere rimasti quelli di quando la scheda è stata scritta,
        // senza il `_ita_offset` e senza la forma della richiesta elaborata dopo.
        expect(cached).toEqual(snapshot);
        expect(cached.id).toBe(ID_IMDB);
        expect(cached.behaviorHints.defaultVideoId).toBe(ID_IMDB);

        // E la risposta non è letteralmente quell'oggetto.
        const res = await metaHandler({ type: 'movie', id: ID_IMDB }, userConfig());
        expect(res.meta).not.toBe(cached);
        expect(res.meta.behaviorHints).not.toBe(cached.behaviorHints);
    });

    test('defaultVideoId non resta appiccicoso sulla forma della richiesta precedente', async () => {
        // Film anime aperto da Kitsu: la scheda in cache porta l'id Kitsu in defaultVideoId.
        // Senza la correzione la richiesta `kitsu:` riscrive l'id *nella voce di cache*, e la
        // richiesta successiva con `tmdb:` non riconosce più l'id IMDb: Stremio aprirebbe
        // il video Kitsu cercando stream con id `tmdb:` (una sola fonte / episodio sbagliato).
        animeMappingStore.resolveTmdbFromKitsu.mockReturnValue('1668');
        animeMappingStore.resolveKitsuMovie.mockReturnValue('1400');
        getDuckDbMetaDetails.mockImplementation(async () => schedaFilm({ anime: true }));

        const daKitsu = await metaHandler({ type: 'movie', id: 'kitsu:1400' }, userConfig());
        expect(daKitsu.meta.id).toBe('kitsu:1400');
        expect(daKitsu.meta.behaviorHints.defaultVideoId).toBe('kitsu:1400');

        const cached = inCache();
        expect(cached.id).toBe(ID_IMDB); // l'id della voce di cache non è il kitsu: della richiesta

        const daTmdb = await metaHandler({ type: 'movie', id: ID_TMDB }, userConfig());
        expect(daTmdb.meta.id).toBe(ID_TMDB);
        expect(daTmdb.meta.behaviorHints.defaultVideoId).toBe(ID_IMDB);
    });

    test('il boundary anime scrive il marker sulla risposta, non sull\'ingresso', () => {
        // `normalizeAnimeMarker` scrive `_isAnime` sull\'oggetto che riceve: qui l\'ingresso è un
        // oggetto in cache (per esempio una entry venuta da Redis, senza marker), e non deve
        // accorgersi del passaggio.
        const { buildResponseMeta } = require('../src/handlers/metaHandler');
        animeMappingStore.isAnimeTmdbId.mockReturnValue(false);
        const ingresso = { id: ID_IMDB, type: 'movie', name: 'Inseparabili', genre_ids: [18] };
        const snapshot = JSON.parse(JSON.stringify(ingresso));

        const res = buildResponseMeta(ingresso, { requestedId: ID_TMDB, originalId: ID_TMDB, type: 'movie' });

        expect(res._isAnime).toBe(false);
        expect(res.id).toBe(ID_TMDB);
        expect(ingresso).toEqual(snapshot);
        expect(Object.prototype.hasOwnProperty.call(ingresso, '_isAnime')).toBe(false);
    });
});
