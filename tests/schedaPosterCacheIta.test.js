/**
 * tests/schedaPosterCacheIta.test.js
 *
 * LA SCHEDA DEI TITOLI DOPPIATI: il poster deve arrivare dalla cache, non da TMDB.
 *
 * Il buco (misurato in produzione il 03/10/2026): i file in cache con badge esistono **solo**
 * per i titoli doppiati (`tmdb-movie-27205_ITA.jpg`), ma la scheda non sapeva che Inception è
 * doppiato — quel dato arriva solo dai cataloghi (`applyPostCacheBadges` → `itaAnnotations`).
 * Il formatter cercava quindi il file liscio, non lo trovava e ripiegava sul poster di TMDB:
 * proprio sui titoli italiani la scheda mostrava un poster senza badge e senza voto, mentre la
 * griglia li aveva entrambi.
 *
 * Qui il percorso è quello vero, dalla rotta in giù: la richiesta HTTP a `/:userHandle/meta/...`
 * passa per `metaHandler`, per le annotazioni ITA (file finto in un tmp dir) e per il formatter;
 * la cartella dei poster è un tmp dir con dentro file finti (al formatter basta che il file
 * esista e non sia vuoto). Niente rete: TMDB, DuckDB e Redis sono finti, il router è quello vero.
 *
 * I cinque casi sono quelli del buco; gli ultimi due sono i degradi richiesti (cartella della
 * cache assente, file delle annotazioni assente). In tutti: la scheda non contiene mai
 * `easyratingsdb`, e per il titolo doppiato **non compare nulla di nuovo** a schermo: nessun
 * badge testuale, nessuna rotta `/images/poster/...` — cambia solo il poster.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const axios = require('axios');

jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(async () => ({ apiKeys: { tmdb: 'test-key' }, profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' }))
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMetaDetails: jest.fn(async () => null),
    createTmdbClient: jest.fn(() => ({})),
    fetchTmdbEpisodes: jest.fn(async () => [])
}));

jest.mock('../src/db/tier1LazyPromotion', () => ({
    schedulePromotion: jest.fn()
}));

/**
 * TICKET 50 — lo stato anime entra dalla stessa porta dei cataloghi. `mockAiringSnapshot` deve
 * avere il prefisso `mock`: jest non permette alle fabbriche di `jest.mock` di chiudere su nomi
 * esterni al modulo.
 */
let mockAiringSnapshot = null;
jest.mock('../src/data/animeAiringState', () => ({
    ...jest.requireActual('../src/data/animeAiringState'),
    getSnapshot: jest.fn(async () => mockAiringSnapshot || { docs: [], byTmdbId: new Map() })
}));

const mockSchedeInCassa = new Map();

// I provider restituiscono schede già costruite: nessuna query, nessun parquet. Il resto del
// modulo resta vero (`stremio.js` lo richiede anche per altri cataloghi: si finge solo la lettura).
jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    ...jest.requireActual('../src/catalog/providers/DuckDbProvider'),
    getDuckDbMetaDetails: jest.fn(async (tmdbId, type) => mockSchedeInCassa.get(`${tmdbId}_${type}`) || null)
}));

const stremioRouter = require('../src/api/stremio');
const itaAnnotations = require('../src/data/itaAnnotations');
const animeAiringState = require('../src/data/animeAiringState');
const animeMappingStore = require('../src/data/animeMappingStore');

const HOST_HANDLE = 'prova';
const POSTER_TMDB = id => `https://image.tmdb.org/t/p/w500/poster-${id}.jpg`;

// Coppie (id TMDB, tipo): ognuna una scheda diversa, così nessuna cache dell'altra
// (`finalMetaCache` è per `meta_<id>_<tipo>`) può mascherare un caso.
const DOPPIATO_CON_FILE = { id: 27205, type: 'movie', nome: 'Inception' };   // tmdb-movie-27205_ITA.jpg
const DOPPIATO_SENZA_FILE = { id: 27206, type: 'movie', nome: 'Interstellar' };
const NON_DOPPIATO_CON_FILE = { id: 1396, type: 'series', nome: 'Breaking Bad' }; // tmdb-tv-1396.jpg
const NON_DOPPIATO_SENZA_FILE = { id: 1397, type: 'series', nome: 'Better Call Saul' };
const SENZA_ALTRO = { id: 4242, type: 'movie', nome: 'Matrix' };

// TICKET 50: *Jin-Roh* è un film annotato `tv` dal writer. `tmdb-movie-823_ITA.jpg` è il file che
// la scheda deve cercare; `tmdb-movie-1399_ITA.jpg` è la trappola (badge di una serie qualunque su
// un film estraneo) e non deve mai essere servita.
const FILM_ANIME = { id: 823, type: 'movie', nome: 'Jin-Roh: The Wolf Brigade' };
const FILM_ESTRANEO = { id: 1399, type: 'movie', nome: 'Film con id di una serie' };
const FILM_SENZA_STATO = { id: 8231, type: 'movie', nome: 'Altro film anime' };
const FILM_SENZA_MAPPA = { id: 8232, type: 'movie', nome: 'Film anime senza mappa' };

/** Scheda come la consegna `getDuckDbMetaDetails`: id `tmdb:` e `_tmdbId`. */
function scheda({ id, type, nome, extra = {} }) {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type,
        name: nome,
        poster: POSTER_TMDB(id),
        posterShape: 'poster',
        background: `https://image.tmdb.org/t/p/original/backdrop-${id}.jpg`,
        description: 'Descrizione.',
        releaseInfo: '2010',
        imdbRating: '8.4',
        original_language: 'en',
        genre_ids: [28],
        behaviorHints: type === 'movie' ? { defaultVideoId: `tmdb:${id}` } : { hasScheduledVideos: true },
        rawTMDB: { id, original_language: 'en' },
        ...extra
    };
}

for (const c of [DOPPIATO_CON_FILE, DOPPIATO_SENZA_FILE, NON_DOPPIATO_CON_FILE, NON_DOPPIATO_SENZA_FILE, SENZA_ALTRO, FILM_ANIME, FILM_ESTRANEO, FILM_SENZA_STATO, FILM_SENZA_MAPPA]) {
    mockSchedeInCassa.set(`${c.id}_${c.type}`, scheda(c));
}

let rootDir;
let cacheDir;
let annotationsFile;
let server;
let baseUrl;

const precedenteCacheDir = process.env.ERDB_CACHE_DIR;
const precedenteAnnotations = process.env.ITA_ANNOTATIONS_PATH;

beforeAll((done) => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-scheda-ita-'));
    cacheDir = path.join(rootDir, 'erdb-cache');
    fs.mkdirSync(cacheDir);

    // File finti: conta solo che esistano e non siano vuoti (è tutto ciò che il formatter guarda).
    fs.writeFileSync(path.join(cacheDir, 'tmdb-movie-27205_ITA.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    fs.writeFileSync(path.join(cacheDir, 'tmdb-tv-1396.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    fs.writeFileSync(path.join(cacheDir, 'tmdb-movie-823_ITA.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    fs.writeFileSync(path.join(cacheDir, 'tmdb-movie-1399_ITA.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    annotationsFile = path.join(rootDir, 'ita_annotations.jsonl');
    process.env.ERDB_CACHE_DIR = cacheDir;
    process.env.ITA_ANNOTATIONS_PATH = annotationsFile;

    const app = express();
    app.use(stremioRouter);
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        done();
    });
});

afterAll((done) => {
    if (precedenteCacheDir === undefined) delete process.env.ERDB_CACHE_DIR;
    else process.env.ERDB_CACHE_DIR = precedenteCacheDir;
    if (precedenteAnnotations === undefined) delete process.env.ITA_ANNOTATIONS_PATH;
    else process.env.ITA_ANNOTATIONS_PATH = precedenteAnnotations;
    itaAnnotations.reset();
    fs.rmSync(rootDir, { recursive: true, force: true });
    if (server) server.close(() => done());
    else done();
});

/** Il file delle annotazioni, nelle tre forme che il contratto ammette. */
function annotazioni(righe) {
    fs.writeFileSync(annotationsFile, righe.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    itaAnnotations.reset();
}

/** Apre davvero la scheda: HTTP → router → metaHandler → formatter. */
async function apriScheda({ id, type }) {
    const res = await axios.get(`${baseUrl}/${HOST_HANDLE}/meta/${type}/${encodeURIComponent(`tmdb:${id}`)}.json`, {
        validateStatus: () => true
    });
    expect(res.status).toBe(200);
    expect(res.data.meta).toBeTruthy();
    return res.data.meta;
}

/** Rete di sicurezza: nessun campo della scheda può passare da ERDB pubblico. */
function senzaErdb(meta) {
    expect(JSON.stringify(meta)).not.toContain('easyratingsdb');
}

describe('Scheda: il poster dei titoli doppiati viene dalla cache', () => {
    test('doppiato con il file `_ITA` in cache → il file, non il poster di TMDB', async () => {
        annotazioni([{ t: 'movie', id: DOPPIATO_CON_FILE.id, ita: true }]);
        const meta = await apriScheda(DOPPIATO_CON_FILE);
        expect(meta.poster).toBe(`${baseUrl}/erdb-poster/tmdb-movie-27205_ITA.jpg`);
        senzaErdb(meta);
    });

    test('doppiato SENZA il file in cache → poster di TMDB, nessuna eccezione', async () => {
        annotazioni([{ t: 'movie', id: DOPPIATO_SENZA_FILE.id, ita: true }]);
        const meta = await apriScheda(DOPPIATO_SENZA_FILE);
        expect(meta.poster).toBe(POSTER_TMDB(DOPPIATO_SENZA_FILE.id));
        senzaErdb(meta);
    });

    test('NON doppiato con il file liscio in cache → il file liscio', async () => {
        // `ita: null` = omonimia irrisolta: come `false`, non è doppiato (stessa regola dei cataloghi).
        annotazioni([{ t: 'tv', id: NON_DOPPIATO_CON_FILE.id, ita: null }]);
        const meta = await apriScheda(NON_DOPPIATO_CON_FILE);
        expect(meta.poster).toBe(`${baseUrl}/erdb-poster/tmdb-tv-1396.jpg`);
        senzaErdb(meta);
    });

    test('NON doppiato e nessun file → poster di TMDB', async () => {
        annotazioni([]); // nessuna traccia di doppiaggio
        const meta = await apriScheda(NON_DOPPIATO_SENZA_FILE);
        expect(meta.poster).toBe(POSTER_TMDB(NON_DOPPIATO_SENZA_FILE.id));
        senzaErdb(meta);
    });

    test('la correzione non mostra nulla di nuovo: niente badge, nome intatto', async () => {
        annotazioni([{ t: 'movie', id: DOPPIATO_CON_FILE.id, ita: true }]);
        const meta = await apriScheda(DOPPIATO_CON_FILE);
        const json = JSON.stringify(meta);
        // Il badge ITA della griglia non deve arrivare qui: niente rotta che lo disegna, niente testo.
        expect(json).not.toContain('/images/poster/');
        expect(json).not.toContain('"ITA"');
        expect(meta.name).toBe('Inception');
        expect(meta.background).toBe(`https://image.tmdb.org/t/p/original/backdrop-${DOPPIATO_CON_FILE.id}.jpg`);
        senzaErdb(meta);
    });

    test('cartella della cache inesistente: degrada al poster di TMDB, non si rompe', async () => {
        annotazioni([{ t: 'movie', id: DOPPIATO_CON_FILE.id, ita: true }]);
        const precedente = process.env.ERDB_CACHE_DIR;
        process.env.ERDB_CACHE_DIR = path.join(rootDir, 'cartella-che-non-esiste');
        try {
            const meta = await apriScheda(DOPPIATO_CON_FILE);
            expect(meta.poster).toBe(POSTER_TMDB(DOPPIATO_CON_FILE.id));
        } finally {
            process.env.ERDB_CACHE_DIR = precedente;
        }
    });

    test('file delle annotazioni assente: nessun badge, nessuna eccezione, poster di TMDB', async () => {
        fs.rmSync(annotationsFile, { force: true });
        itaAnnotations.reset();
        const meta = await apriScheda(DOPPIATO_CON_FILE);
        expect(meta.poster).toBe(POSTER_TMDB(DOPPIATO_CON_FILE.id));
        senzaErdb(meta);
    });
});

/**
 * TICKET 50 — la scheda dei film anime annotati come serie. Il file col badge esiste
 * (`tmdb-movie-823_ITA.jpg`) ma nessuno lo chiedeva, perché la scheda cercava `tv:823`.
 */
describe('Scheda: fallback a due tipi per i film anime (Ticket 50)', () => {
    beforeEach(() => {
        // Documenti anime: 823 e 8231/8232 sono film doppiati (1 episodio); 1399 non è un anime.
        mockAiringSnapshot = animeAiringState.buildSnapshot([
            {
                _id: '823', schemaVersion: 1, ids: { tmdb: 823, kitsu: '1' }, title: 'Jin-Roh',
                italian: { dub: { latest: { season: 1, episode: 1 } } },
                episodes: [{ season: 1, episode: 1, dubIta: true, subIta: true }]
            },
            {
                _id: '8232', schemaVersion: 1, ids: { tmdb: 8232, kitsu: '2' }, title: 'Film anime senza mappa',
                italian: { dub: { latest: { season: 1, episode: 1 } } },
                episodes: [{ season: 1, episode: 1, dubIta: true, subIta: true }]
            }
        ]);
        // La mappa certificata: è la seconda prova della guardia (quell'id TMDB è un film).
        animeMappingStore.isReady = true;
        animeMappingStore.buildFribbIndex([{ kitsu_id: '1', type: 'Movie', themoviedb_id: { movie: [823] } }]);
    });

    afterEach(() => {
        mockAiringSnapshot = null;
        animeMappingStore.isReady = false;
        animeMappingStore.buildFribbIndex([]);
    });

    test('film anime annotato `tv` → il poster col badge dalla cache', async () => {
        annotazioni([{ t: 'tv', id: FILM_ANIME.id, ita: true }]);
        const meta = await apriScheda(FILM_ANIME);
        expect(meta.poster).toBe(`${baseUrl}/erdb-poster/tmdb-movie-823_ITA.jpg`);
        senzaErdb(meta);
    });

    test('film estraneo con l\'id di una serie doppiata → poster di TMDB, mai il file `_ITA`', async () => {
        annotazioni([{ t: 'tv', id: FILM_ESTRANEO.id, ita: true }]);
        const meta = await apriScheda(FILM_ESTRANEO);
        expect(meta.poster).toBe(POSTER_TMDB(FILM_ESTRANEO.id));
        expect(meta.poster).not.toContain('_ITA');
    });

    test('stato anime assente (degrado): nessun fallback, nessuna eccezione', async () => {
        mockAiringSnapshot = null;
        annotazioni([{ t: 'tv', id: FILM_SENZA_STATO.id, ita: true }]);
        const meta = await apriScheda(FILM_SENZA_STATO);
        expect(meta.poster).toBe(POSTER_TMDB(FILM_SENZA_STATO.id));
    });

    test('documento film ma id non certificato come film → seconda prova mancante, nessun badge', async () => {
        // 8232 ha un documento anime "film doppiato", ma la mappa certificata non lo conosce:
        // il badge resterebbe quello di un film estraneo con lo stesso id, quindi niente badge.
        annotazioni([{ t: 'tv', id: FILM_SENZA_MAPPA.id, ita: true }]);
        const meta = await apriScheda(FILM_SENZA_MAPPA);
        expect(meta.poster).toBe(POSTER_TMDB(FILM_SENZA_MAPPA.id));
        expect(meta.poster).not.toContain('_ITA');
    });
});
