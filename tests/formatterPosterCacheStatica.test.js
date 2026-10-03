/**
 * tests/formatterPosterCacheStatica.test.js
 *
 * Il formatter (`sanitizeCatalogMeta`) che PREFERISCE il poster già composto nella cache
 * servita da `GET /erdb-poster/:file`, invece di comporre il poster al volo.
 *
 * Il contratto conta in un solo verso: finché il file non c'è, l'URL deve essere quello di
 * prima — cioè il poster di TMDB, com'era prima di rimuovere le URL dell'istanza ERDB
 * pubblica (le immagini della scheda non passano più da `easyratingsdb.com`).
 *
 * I nomi file sono scritti a mano (`tmdb-movie-27205.jpg`, `tmdb-movie-27205_ITA.jpg`), non
 * presi da `posterFileName`: un nome sbagliato è proprio il fallimento silenzioso che la
 * catena di moduli (costruttore → cartella → rotta → formatter) esiste per evitare.
 *
 * Qui non c'è rete né Express: la cartella è un tmp dir e basta. Il file da servire è finto,
 * conta solo che esista e non sia vuoto.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { sanitizeCatalogMeta } = require('../src/catalog/formatters/StremioFormatter');

const HOST = 'http://localhost:7860';
const ERDB_CHIAVE = 'Tk-prova';
const RAW_POSTER = 'https://image.tmdb.org/t/p/w500/27205.jpg';

const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const OPZIONI = { shouldApplyEpisodeBadge: false, isLandscapeEnabled: false, userConfig: USER_CONFIG, hostUrl: HOST };

let cacheDir;
let rootDir;
const precedenteCacheDir = process.env.ERDB_CACHE_DIR;
const precedenteErdbConfig = process.env.ERDB_CONFIG;

/** L'URL che il formatter produce SENZA il file in cache: il poster di TMDB, così com'era. */
function urlDiPrima() {
    return RAW_POSTER;
}

/** Item di catalogo: film TMDB 27205. */
function film(extra = {}) {
    return {
        id: 'tmdb:27205',
        type: 'movie',
        name: 'Inception',
        poster: RAW_POSTER,
        _rawPoster: RAW_POSTER,
        ...extra
    };
}

beforeAll(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-formatter-cache-'));
    cacheDir = path.join(rootDir, 'erdb-cache');
    fs.mkdirSync(cacheDir);

    // I due file che la cache "ufficiale" avrebbe per questo titolo: liscio e con badge ITA.
    fs.writeFileSync(path.join(cacheDir, 'tmdb-movie-27205.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    fs.writeFileSync(path.join(cacheDir, 'tmdb-movie-27205_ITA.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    // Un file vuoto: scarico abortito. Non deve MAI sostituire un URL funzionante.
    fs.writeFileSync(path.join(cacheDir, 'tmdb-tv-1399.jpg'), Buffer.alloc(0));

    process.env.ERDB_CACHE_DIR = cacheDir;
    process.env.ERDB_CONFIG = ERDB_CHIAVE;
});

afterAll(() => {
    if (precedenteCacheDir === undefined) delete process.env.ERDB_CACHE_DIR;
    else process.env.ERDB_CACHE_DIR = precedenteCacheDir;
    if (precedenteErdbConfig === undefined) delete process.env.ERDB_CONFIG;
    else process.env.ERDB_CONFIG = precedenteErdbConfig;
    if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('Formatter: preferisce il poster già composto quando il file c\'è', () => {
    test('senza badge, il file presente porta all\'URL statico col nome esatto', () => {
        const meta = sanitizeCatalogMeta(film(), OPZIONI);
        expect(meta.poster).toBe(`${HOST}/erdb-poster/tmdb-movie-27205.jpg`);
    });

    test('titolo doppiato col solo badge ITA: nome col suffisso, non quello liscio', () => {
        const meta = sanitizeCatalogMeta(film({ _itaBadge: true }), OPZIONI);
        expect(meta.poster).toBe(`${HOST}/erdb-poster/tmdb-movie-27205_ITA.jpg`);
    });

    test('il resto del meta non cambia: solo il poster', () => {
        const meta = sanitizeCatalogMeta(film(), OPZIONI);
        expect(meta.id).toBe('tmdb:27205');
        expect(meta.type).toBe('movie');
        expect(meta.name).toBe('Inception');
        expect(meta.posterShape).toBe('poster');
        expect(meta._rawPoster).toBe(RAW_POSTER);
    });
});

describe('Formatter: senza file (o cartella assente) l\'URL è quello di prima', () => {
    test('file assente: si resta sul poster di TMDB', () => {
        const meta = sanitizeCatalogMeta({ ...film(), id: 'tmdb:999999', tmdbId: 999999 }, OPZIONI);
        expect(meta.poster).toBe(urlDiPrima());
    });

    test('cartella inesistente: nessun errore, poster di TMDB', () => {
        const precedente = process.env.ERDB_CACHE_DIR;
        process.env.ERDB_CACHE_DIR = path.join(rootDir, 'cartella-che-non-esiste');
        try {
            const meta = sanitizeCatalogMeta(film(), OPZIONI);
            expect(meta.poster).toBe(urlDiPrima());
        } finally {
            process.env.ERDB_CACHE_DIR = precedente;
        }
    });

    test('file vuoto (scarico abortito): poster di TMDB, meglio che un\'immagine vuota', () => {
        const meta = sanitizeCatalogMeta({ ...film(), id: 'tmdb:1399', type: 'series' }, OPZIONI);
        expect(fs.existsSync(path.join(cacheDir, 'tmdb-tv-1399.jpg'))).toBe(true);
        expect(meta.poster).toBe(urlDiPrima());
    });

    test('senza ERDB configurato la cache locale basta: il file c\'è e viene servito', () => {
        // La cache è NOSTRA: non chiede niente all'istanza ERDB, quindi non ha bisogno
        // che ERDB sia configurato per essere guardata.
        const precedente = process.env.ERDB_CONFIG;
        delete process.env.ERDB_CONFIG;
        try {
            const meta = sanitizeCatalogMeta(film(), OPZIONI);
            expect(meta.poster).toBe(`${HOST}/erdb-poster/tmdb-movie-27205.jpg`);
        } finally {
            process.env.ERDB_CONFIG = precedente;
        }
    });
});

describe('Formatter: la cache non può riprodurre i badge composti al volo', () => {
    test('con badge episodio l\'URL resta quello della rotta /images/poster', () => {
        const meta = sanitizeCatalogMeta(film({ _forceBadgeText: 'EP 12' }), {
            ...OPZIONI,
            shouldApplyEpisodeBadge: true
        });
        expect(meta.poster).toContain('/images/poster/');
        expect(meta.poster).toContain('EP%2012');
        expect(meta.poster).not.toContain('/erdb-poster/');
    });

    test('con badge ITA + episodio (la card doppiata del catalogo novità) resta l\'URL di oggi', () => {
        const meta = sanitizeCatalogMeta(film({ _itaBadge: true, _forceBadgeText: 'ITA 8' }), {
            ...OPZIONI,
            shouldApplyEpisodeBadge: true
        });
        expect(meta.poster).toContain('/images/poster/');
        expect(meta.poster).toContain('ITA%208');
        expect(meta.poster).not.toContain('/erdb-poster/');
    });

    test('in landscape la cache non viene usata (i file sono solo poster)', () => {
        const meta = sanitizeCatalogMeta(film(), { ...OPZIONI, isLandscapeEnabled: true });
        expect(meta.posterShape).toBe('landscape');
        expect(meta.poster).not.toContain('/erdb-poster/');
    });
});