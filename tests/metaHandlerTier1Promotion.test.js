/**
 * Ticket 42: aggancio della promozione Tier 2 → Tier 1 al percorso di apertura di un titolo.
 *
 * Qui si prova il contratto del *chiamante* (`metaHandler`), non quello dello scrittore: quando il
 * titolo non è in Tier 1 la promozione parte una volta sola con l'id giusto; quando è già in Tier 1
 * non parte; e se la promozione solleva, la scheda restituita è identica a quella di sempre.
 */
const path = require('path');

// La cache finale va neutralizzata: il test non deve scrivere su disco né riusare la scheda del
// titolo promosso fra un caso e l'altro (ogni test parte con cache fredda).
jest.mock('../src/cache/CacheManager', () => {
    return class FakeCacheManager {
        getWithStatus() { return Promise.resolve({ value: null, status: 'miss' }); }
        set() { return Promise.resolve(); }
    };
});

jest.mock('../src/id_mapping/id_cache', () => ({
    translateImdbToTmdb: jest.fn(async () => null)
}));

jest.mock('../src/data/animeMappingStore', () => ({
    resolveKitsu: jest.fn(() => null),
    resolveKitsuMovie: jest.fn(() => null),
    resolveTmdbFromKitsu: jest.fn(() => null),
    isAnimeTmdbId: jest.fn(() => false)
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(),
    fetchTmdbEpisodes: jest.fn(async () => []),
    createTmdbClient: jest.fn(() => ({}))
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbMetaDetails: jest.fn()
}));

jest.mock('../src/db/tier1LazyPromotion', () => ({
    schedulePromotion: jest.fn()
}));

const { metaHandler } = require('../src/handlers/metaHandler');
const { getTmdbMetaDetails } = require('../src/clients/tmdb');
const { getDuckDbMetaDetails } = require('../src/catalog/providers/DuckDbProvider');
const { schedulePromotion } = require('../src/db/tier1LazyPromotion');

const API_KEY = 'test-key';

/** Scheda live "vera": un oggetto nuovo a ogni chiamata, così i confronti sono fra valori. */
function schedaLive(type = 'movie') {
    return {
        id: type === 'movie' ? 'tmdb:999999' : 'tmdb:888888',
        type,
        name: 'Titolo del Tier 2',
        description: 'Descrizione.',
        poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
        genres: ['Drama']
    };
}

function userConfig() {
    return { apiKeys: { tmdb: API_KEY } };
}

/** Lascia correre le microtask della promozione fire-and-forget. */
function flushBackground() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Ticket 42: promozione lazy in Tier 1 da metaHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('un titolo solo Tier 2 (assente in DuckDB) promuove una volta sola, con l\'id giusto', async () => {
        // DuckDB non lo conosce → è un titolo che sta solo nel Tier 2.
        getDuckDbMetaDetails.mockResolvedValue(null);
        getTmdbMetaDetails.mockImplementation(async () => schedaLive('movie'));

        const res = await metaHandler({ type: 'movie', id: 'tmdb:999999' }, userConfig());

        expect(res.meta).not.toBeNull();
        expect(res.meta.id).toBe('tmdb:999999');
        expect(getTmdbMetaDetails).toHaveBeenCalledTimes(1);

        await flushBackground();
        expect(schedulePromotion).toHaveBeenCalledTimes(1);
        expect(schedulePromotion).toHaveBeenCalledWith({
            tmdbId: '999999',
            type: 'movie',
            apiKey: API_KEY
        });
    });

    test('un titolo già in Tier 1 (servito da DuckDB) non viene promosso', async () => {
        // DuckDB l'ha servito: è già materializzato, quindi è già in Tier 1. Nessuna promozione.
        const fromDb = { ...schedaLive('movie'), id: 'tmdb:777777' };
        getDuckDbMetaDetails.mockResolvedValue(fromDb);
        getTmdbMetaDetails.mockImplementation(async () => schedaLive('movie'));

        const res = await metaHandler({ type: 'movie', id: 'tmdb:777777' }, userConfig());

        expect(res.meta.id).toBe('tmdb:777777');
        expect(getTmdbMetaDetails).not.toHaveBeenCalled();

        await flushBackground();
        expect(schedulePromotion).not.toHaveBeenCalled();
    });

    test('una promozione che solleva non cambia la scheda restituita', async () => {
        getDuckDbMetaDetails.mockResolvedValue(null);
        getTmdbMetaDetails.mockImplementation(async () => schedaLive('movie'));
        schedulePromotion.mockImplementation(() => { throw new Error('file non scrivibile'); });

        const conErrore = await metaHandler({ type: 'movie', id: 'tmdb:999999' }, userConfig());

        // Stessa richiesta, promozione che non solleva: la scheda deve essere identica.
        schedulePromotion.mockImplementation(() => undefined);
        const senzaErrore = await metaHandler({ type: 'movie', id: 'tmdb:999999' }, userConfig());

        expect(conErrore.meta).toEqual(senzaErrore.meta);
        expect(conErrore).toEqual(senzaErrore);
        expect(conErrore.meta).not.toBeNull();
    });

    test('la promozione di una serie parte dal `type` Stremio, senza bloccare la risposta', async () => {
        getDuckDbMetaDetails.mockResolvedValue(null);
        getTmdbMetaDetails.mockImplementation(async () => schedaLive('series'));
        let promoChiamata = false;
        schedulePromotion.mockImplementation(() => { promoChiamata = true; });

        const res = await metaHandler({ type: 'series', id: 'tmdb:888888' }, userConfig());

        // Fire-and-forget: quando la scheda è già restituita la promozione può non essere partita.
        expect(res.meta.type).toBe('series');
        await flushBackground();
        expect(promoChiamata).toBe(true);
        expect(schedulePromotion).toHaveBeenCalledWith({
            tmdbId: '888888',
            type: 'series',
            apiKey: API_KEY
        });
    });
});

// --- Il modulo di aggancio, per quello che fa tra una richiesta e l'altra ---
// Qui si prende il modulo *vero* (quello di cui sopra è mockato solo il richiamo dal metaHandler).
describe('tier1LazyPromotion: dedup e silenzio del memo', () => {
    const tmpDir = path.join(require('os').tmpdir(), `tier1lazy-${process.pid}-${Date.now()}`);

    /** Modulo reale, con memo fresco. */
    function moduloReale() {
        jest.resetModules();
        return jest.requireActual('../src/db/tier1LazyPromotion');
    }

    afterAll(() => {
        require('fs').rmSync(tmpDir, { recursive: true, force: true });
    });

    test('promuove una volta sola: la seconda apertura non riscarica niente', async () => {
        const fs = require('fs');
        fs.mkdirSync(tmpDir, { recursive: true });
        const { promoteOnOpen } = moduloReale();

        const dettagli = { id: 4242, title: 'Titolo', overview: 'x', vote_count: 500, vote_average: 7 };
        const fetchDetails = jest.fn(async () => dettagli);

        const primo = await promoteOnOpen({ tmdbId: '4242', type: 'movie', apiKey: API_KEY, dataDir: tmpDir, fetchDetails });
        const secondo = await promoteOnOpen({ tmdbId: '4242', type: 'movie', apiKey: API_KEY, dataDir: tmpDir, fetchDetails });

        expect(primo.scritto).toBe(true);
        expect(fetchDetails).toHaveBeenCalledTimes(1); // niente seconda chiamata TMDB
        expect(secondo.scritto).toBe(true);
        expect(fetchDetails).toHaveBeenCalledTimes(1);

        // Una sola riga nel JSONL: nessun duplicato.
        const righe = fs.readFileSync(path.join(tmpDir, 'master_movies.jsonl'), 'utf8').trim().split('\n');
        expect(righe).toHaveLength(1);
        expect(JSON.parse(righe[0]).id).toBe(4242);
    });

    test('un titolo già in Tier 1 non viene riscaricato né riscritto', async () => {
        const fs = require('fs');
        const { promoteOnOpen } = moduloReale();

        const fetchDetails = jest.fn(async () => ({ id: 4242, title: 'Titolo', overview: 'x' }));
        const esito = await promoteOnOpen({ tmdbId: '4242', type: 'movie', apiKey: API_KEY, dataDir: tmpDir, fetchDetails });

        expect(esito.scritto).toBe(false);
        expect(esito.motivo).toContain('già nel Tier 1');
        expect(fetchDetails).not.toHaveBeenCalled();
        expect(fs.readFileSync(path.join(tmpDir, 'master_movies.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
    });

    test('`schedulePromotion` non solleva e non lascia rejection non gestite', async () => {
        const { schedulePromotion } = moduloReale();

        // Un id non numerico fa fallire la normalizzazione *dentro* la promise: nessuna
        // rejection deve arrivare al chiamante, che sul percorso caldo non può farne nulla.
        const esito = await schedulePromotion({ tmdbId: 'non-un-id', type: 'movie', apiKey: API_KEY, dataDir: tmpDir });
        expect(esito.scritto).toBe(false);
        expect(esito.motivo).toContain('errore');
    });
});