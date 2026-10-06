/**
 * tests/catalogBadgeNonAnime.test.js
 *
 * Ticket 15 — il badge ITA dei titoli **non-anime** nei cataloghi.
 *
 * Il difetto: il poster viene scelto quando la card è formattata e messa in cache, cioè PRIMA che
 * le annotazioni ITA siano lette. `applyPostCacheBadges` aggiunge `_itaBadge` dopo, ma se la card
 * non viene ri-formattata il poster non viene ricalcolato: il badge resta un'etichetta che nessuno
 * disegna. Gli anime ri-formattavano già (`|| animeDubbed` nel ramo sopra); i non-anime solo quando
 * il badge episodio è attivo — cioè quasi mai, perché basta `type === 'movie'` a escluderlo.
 * Risultato in produzione: Il Padrino, Pulp Fiction, Breaking Bad doppiati e senza badge.
 *
 * La cache dei poster è una cartella vera (file finti da 4 byte: al formatter basta che esistano
 * e non siano vuoti), perché è l'unica cosa che decide se il poster può essere sostituito.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyPostCacheBadges } = require('../src/handlers/catalogHandler');

const HOST_URL = 'http://localhost:7860';
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };

const precedenteCacheDir = process.env.ERDB_CACHE_DIR;
let cacheDir;

/** Snapshot delle annotazioni ITA: `byKey` con chiavi `tipo:id`. */
const snapshot = (coppie) => {
    const byKey = new Map(coppie);
    return {
        byKey,
        count: byKey.size,
        trueCount: [...byKey.values()].filter(v => v === true).length,
        nullCount: 0,
        error: null
    };
};

/** Una card come esce dalla cache dei cataloghi: già formattata, con il poster di TMDB. */
const card = (id, type, nome) => ({
    id,
    type,
    name: nome,
    poster: `https://image.tmdb.org/t/p/w500/${id.replace(/\D/g, '')}.jpg`,
    _rawPoster: `https://image.tmdb.org/t/p/w500/${id.replace(/\D/g, '')}.jpg`,
    _isAnime: false
});

beforeAll(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-badge-nonanime-'));
    for (const file of ['tmdb-movie-238-e5611aea_ITA.jpg', 'tmdb-tv-1396-fbbcf456_ITA.jpg']) {
        fs.writeFileSync(path.join(cacheDir, file), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    }
    process.env.ERDB_CACHE_DIR = cacheDir;
});

afterAll(() => {
    if (precedenteCacheDir === undefined) delete process.env.ERDB_CACHE_DIR;
    else process.env.ERDB_CACHE_DIR = precedenteCacheDir;
    if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
});

const esegui = (metas, itaSnapshot, { baseId, catalogMeta = {}, type = 'movie' }) =>
    applyPostCacheBadges({ metas }, USER_CONFIG, HOST_URL, catalogMeta, type, baseId, {
        itaSnapshot,
        imdbMap: {} // gli id sono `tmdb:…`: nessuna risoluzione IMDb da fare
    });

describe('badge ITA sui titoli non-anime (ticket 15)', () => {
    test('un FILM doppiato in un catalogo normale esce col poster _ITA', async () => {
        const out = await esegui(
            [card('tmdb:238', 'movie', 'Il Padrino')],
            snapshot([['movie:238', true]]),
            { baseId: 'preset_top_rated_movies' }
        );
        expect(out.metas[0]._itaBadge).toBe(true);
        expect(out.metas[0].poster).toBe(`${HOST_URL}/erdb-poster/tmdb-movie-238-e5611aea_ITA.jpg`);
    });

    test('una SERIE doppiata in un catalogo normale esce col poster _ITA', async () => {
        const out = await esegui(
            [card('tmdb:1396', 'series', 'Breaking Bad')],
            snapshot([['tv:1396', true]]),
            { baseId: 'preset_top_rated_series', type: 'series' }
        );
        expect(out.metas[0]._itaBadge).toBe(true);
        expect(out.metas[0].poster).toBe(`${HOST_URL}/erdb-poster/tmdb-tv-1396-fbbcf456_ITA.jpg`);
    });

    test('un titolo NON doppiato resta col poster di TMDB (nessun badge)', async () => {
        const out = await esegui(
            [card('tmdb:9999', 'movie', 'Mai doppiato')],
            snapshot([['movie:9999', false]]),
            { baseId: 'preset_top_rated_movies' }
        );
        expect(out.metas[0]._itaBadge).toBe(false);
        expect(out.metas[0].poster).toContain('image.tmdb.org');
        expect(out.metas[0].poster).not.toContain('_ITA');
    });

    test('col badge episodio attivo il doppiato continua a prendere il badge', async () => {
        // Controllo di non-regressione sul ramo che già funzionava (catalogo in EPISODE_CATALOG_IDS).
        const out = await esegui(
            [card('tmdb:1396', 'series', 'Breaking Bad')],
            snapshot([['tv:1396', true]]),
            { baseId: 'preset_new_series_eps', type: 'series' }
        );
        expect(out.metas[0]._itaBadge).toBe(true);
        expect(out.metas[0].poster).toMatch(/_ITA\.jpg$|\/images\/poster\//);
    });

    test('la card non doppiata non viene toccata nemmeno se la cache ha il file _ITA', async () => {
        // Il file `tmdb-tv-1396-fbbcf456_ITA.jpg` esiste in cache, ma la serie non è doppiata: nessun badge.
        const out = await esegui(
            [card('tmdb:1396', 'series', 'Breaking Bad')],
            snapshot([['tv:1396', false]]),
            { baseId: 'preset_top_rated_series', type: 'series' }
        );
        expect(out.metas[0]._itaBadge).toBe(false);
        expect(out.metas[0].poster).not.toContain('_ITA');
    });
});
