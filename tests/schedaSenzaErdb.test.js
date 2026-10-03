/**
 * tests/schedaSenzaErdb.test.js
 *
 * LA SCHEDA (rotta `/meta`) non deve più prendere nessuna immagine dall'istanza ERDB
 * pubblica: ogni apertura di un titolo faceva centinaia di richieste a un server
 * remoto (una per episodio, più poster, sfondo e logo) e la cache locale dei poster
 * non veniva neppure sfiorata.
 *
 * Qui non c'è rete né Express: la cartella dei poster è un tmp dir con dentro file finti
 * (l'esistenza e la non vuotizia sono tutto ciò che il formatter guarda) e l'item è
 * costruito come lo consegna il percorso della scheda (`getDuckDbMetaDetails` /
 * `getTmdbMetaDetails` in `src/clients/tmdb.js`): poster, sfondo e miniature sono già
 * URL di `image.tmdb.org`.
 *
 * Le opzioni sono quelle con cui `src/api/stremio.js` chiama `sanitizeCatalogMeta` per la
 * scheda: niente badge episodio, niente landscape, `isMetaDetail: true`.
 *
 * Il controllo di sicurezza è sulla serializzazione dell'intero oggetto (`easyratingsdb`
 * e `tmdbKey` non devono comparire da nessuna parte): è la rete che prende i punti che
 * nessuno ha elencato, perché ieri erano sei righe e domani diversi.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { sanitizeCatalogMeta } = require('../src/catalog/formatters/StremioFormatter');

const HOST = 'http://localhost:7860';
const RAW_POSTER = 'https://image.tmdb.org/t/p/w500/7c24eQ6oQCOrFeyzJP7qWklDYhn.jpg';
const RAW_BACKGROUND = 'https://image.tmdb.org/t/p/original/suFvSpqPhe6VGx6anammfgBzKqNF.jpg';
const RAW_LOGO = 'https://image.tmdb.org/t/p/w500/c8zFv7hYqbBL0EW43XK4Cu9hT0.jpg';
const FILE_IN_CACHE = 'tmdb-tv-1396.jpg';

const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const OPZIONI_SCHEDA = {
    shouldApplyEpisodeBadge: false,
    isLandscapeEnabled: false,
    userConfig: USER_CONFIG,
    hostUrl: HOST,
    isMetaDetail: true
};

/** Episodio come lo produce `fetchTmdbEpisodes`: la miniatura è il `still_path` di TMDB. */
function episodio(num, stillPath) {
    return {
        id: `tmdb:1396:1:${num}`,
        title: `Episodio ${num}`,
        season: 1,
        episode: num,
        released: new Date(Date.UTC(2011, 3, num)).toISOString(),
        thumbnail: `https://image.tmdb.org/t/p/w500${stillPath}`,
        overview: `Trama dell'episodio ${num}`
    };
}

/**
 * Scheda di una serie, come la consegna il percorso della scheda: `rawTMDB` porta il logo
 * (che DuckDB non mette nel campo `logo`) e i video hanno già la miniatura di TMDB.
 */
function schedaSerie(extra = {}) {
    return {
        id: 'tmdb:1396',
        _tmdbId: 1396,
        type: 'series',
        name: 'Game of Thrones',
        poster: RAW_POSTER,
        posterShape: 'poster',
        background: RAW_BACKGROUND,
        description: 'Nove famiglie in lotta per il Trono di Spade.',
        releaseInfo: '2011',
        imdbRating: '8.4',
        original_language: 'en',
        behaviorHints: { hasScheduledVideos: true },
        rawTMDB: {
            id: 1396,
            original_language: 'en',
            images: { logos: [{ iso_639_1: 'en', file_path: '/aaaa.jpg' }, { iso_639_1: 'it', file_path: '/c8zFv7hYqbBL0EW43XK4Cu9hT0.jpg' }] }
        },
        videos: [
            episodio(1, '/kNGKlN2NrmRzZmSFKHDzLZQWOpq.jpg'),
            episodio(2, '/wrGWeW4WKxnaeA8sxJb2T9O6ryo.jpg'),
            episodio(3, '/9UuCvAXHPuCOqRM6uE5dtF4oXjW.jpg')
        ],
        ...extra
    };
}

let rootDir;
let cacheDir;
const precedenteCacheDir = process.env.ERDB_CACHE_DIR;

beforeAll(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-scheda-no-erdb-'));
    cacheDir = path.join(rootDir, 'erdb-cache');
    fs.mkdirSync(cacheDir);

    // Il poster della serie è in cache (file finto: conta che esista e non sia vuoto).
    fs.writeFileSync(path.join(cacheDir, FILE_IN_CACHE), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    // Una serie che NON è in cache.
    fs.writeFileSync(path.join(rootDir, 'vuoto.txt'), Buffer.alloc(0));

    process.env.ERDB_CACHE_DIR = cacheDir;
});

afterAll(() => {
    if (precedenteCacheDir === undefined) delete process.env.ERDB_CACHE_DIR;
    else process.env.ERDB_CACHE_DIR = precedenteCacheDir;
    if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
});

/** Nessuna URL dell'oggetto deve passare da ERDB pubblico né portare una chiave TMDB. */
function senzaErdbESenzaChiave(meta) {
    const json = JSON.stringify(meta);
    expect(json).not.toContain('easyratingsdb');
    expect(json).not.toContain('tmdbKey');
}

describe('Scheda: il poster viene dalla cache locale quando il file c\'è', () => {
    test('titolo in cache: URL statico col nome esatto, niente ERDB', () => {
        const meta = sanitizeCatalogMeta(schedaSerie(), OPZIONI_SCHEDA);
        expect(meta.poster).toBe(`${HOST}/erdb-poster/${FILE_IN_CACHE}`);
        senzaErdbESenzaChiave(meta);
    });

    test('la cache è nostra: serve il file anche senza ERDB configurato', () => {
        const meta = sanitizeCatalogMeta(schedaSerie(), { ...OPZIONI_SCHEDA, userConfig: undefined });
        expect(meta.poster).toBe(`${HOST}/erdb-poster/${FILE_IN_CACHE}`);
    });

    test('titolo NON in cache: poster di TMDB, nessuna hop, nessuna chiave', () => {
        const meta = sanitizeCatalogMeta(schedaSerie({ id: 'tmdb:139600', _tmdbId: 139600 }), OPZIONI_SCHEDA);
        expect(meta.poster).toBe(RAW_POSTER);
        senzaErdbESenzaChiave(meta);
    });

    test('cartella della cache inesistente: degrada al poster di TMDB, non si rompe', () => {
        const precedente = process.env.ERDB_CACHE_DIR;
        process.env.ERDB_CACHE_DIR = path.join(rootDir, 'cartella-che-non-esiste');
        try {
            const meta = sanitizeCatalogMeta(schedaSerie(), OPZIONI_SCHEDA);
            expect(meta.poster).toBe(RAW_POSTER);
        } finally {
            process.env.ERDB_CACHE_DIR = precedente;
        }
    });

    test('anime Kitsu: la cache si chiama col suo id (convenzione del costruttore)', () => {
        const meta = sanitizeCatalogMeta({
            id: 'kitsu:265',
            type: 'anime',
            name: 'Naruto',
            poster: 'https://media.kitsu.io/anime/poster/265.jpg',
            _rawPoster: 'https://media.kitsu.io/anime/poster/265.jpg',
            rawTMDB: { id: 46260 }
        }, OPZIONI_SCHEDA);
        // Il file del poster Kitsu non è in cartella: si resta sul poster che c'era.
        expect(meta.poster).toBe('https://media.kitsu.io/anime/poster/265.jpg');
        senzaErdbESenzaChiave(meta);
    });
});

describe('Scheda: sfondo, logo e miniature vengono da TMDB', () => {
    test('sfondo: il backdrop di TMDB, non riscritto', () => {
        const meta = sanitizeCatalogMeta(schedaSerie(), OPZIONI_SCHEDA);
        expect(meta.background).toBe(RAW_BACKGROUND);
    });

    test('logo: quello di TMDB, italiano se disponibile', () => {
        const meta = sanitizeCatalogMeta(schedaSerie(), OPZIONI_SCHEDA);
        expect(meta.logo).toBe(RAW_LOGO);
    });

    test('logo assente in `rawTMDB`: resta quello che c\'è (nessun ERDB al suo posto)', () => {
        const item = schedaSerie();
        delete item.rawTMDB.images;
        const meta = sanitizeCatalogMeta(item, OPZIONI_SCHEDA);
        expect(meta.logo).toBeUndefined();
        senzaErdbESenzaChiave(meta);
    });

    test('serie con 3 episodi: 3 miniature, tutte di TMDB', () => {
        const meta = sanitizeCatalogMeta(schedaSerie(), OPZIONI_SCHEDA);
        expect(meta.videos).toHaveLength(3);
        for (const video of meta.videos) {
            expect(video.thumbnail).toMatch(/^https:\/\/image\.tmdb\.org\//);
        }
        senzaErdbESenzaChiave(meta);
    });

    test('nessuna URL dell\'oggetto scheda contiene easyratingsdb né tmdbKey', () => {
        // Rete di sicurezza: vale per TUTTI i campi insieme, non per uno alla volta.
        const meta = sanitizeCatalogMeta(schedaSerie(), OPZIONI_SCHEDA);
        const json = JSON.stringify(meta);
        expect(json).not.toContain('easyratingsdb');
        expect(json).not.toContain('tmdbKey');
        // E nessuna hop attraverso la rotta di fallback, che era il modo di portare ERDB qui.
        expect(json).not.toContain('/images/fallback');
    });
});

describe('Scheda: una serie lunga non fa più un\'richiesta per episodio', () => {
    test('373 episodi: 373 miniature TMDB, zero URL remote costruite', () => {
        const videos = [];
        for (let i = 1; i <= 373; i++) {
            videos.push(episodio(i % 50, `/still-${i}.jpg`));
        }
        const meta = sanitizeCatalogMeta(schedaSerie({ videos }), OPZIONI_SCHEDA);

        expect(meta.videos).toHaveLength(373);
        const remote = meta.videos.filter(v => v.thumbnail && !v.thumbnail.startsWith('https://image.tmdb.org/'));
        expect(remote).toEqual([]);
        senzaErdbESenzaChiave(meta);
    });
});
