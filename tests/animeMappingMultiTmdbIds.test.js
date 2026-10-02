/**
 * tests/animeMappingMultiTmdbIds.test.js
 *
 * Lettura dei record anime con PIÙ id TMDB (`src/data/animeMappingStore.buildFribbIndex`).
 *
 * Nel file vero (`fribb-mini.json`) `themoviedb_id` è `{tv: <numero>}` oppure
 * `{movie: [<numero>, ...]}`: il campo `movie` è un ARRAY di una-quattro varianti
 * (rifacimenti/compilation dello stesso film). `String()` su quell'array produceva
 * "128,1390599", che non è un id TMDB: la mappa in avanti (Kitsu/MAL → TMDB) finiva
 * spazzatura e chi cerca la doppiatura per id TMDB non trovava nulla.
 *
 * Contratto qui fissato:
 *  - in avanti (kitsuToTmdb / malToTmdb) vale il PRIMO id dell'array;
 *  - in dietro (tmdbToKitsuMovie) vanno registrati TUTTI gli id dell'array;
 *  - id numerico secco (`{movie: 67890}`, `themoviedb_id: 77777`) invariato.
 */

const animeMappingStore = require('../src/data/animeMappingStore');

/** Record veri, copiati dalle forme presenti in fribb-mini.json. */
const RECORDS = [
    // Caso del bug: più id TMDB per lo stesso titolo.
    { type: 'MOVIE', kitsu_id: 1376, mal_id: 100, themoviedb_id: { movie: [128, 1390599] } },
    // Array di un solo id: invariato (String([128]) === '128' anche prima).
    { type: 'MOVIE', kitsu_id: 6509, mal_id: 11441, themoviedb_id: { movie: [145675] } },
    // movie numerico secco: forma usata dai test esistenti.
    { type: 'Movie', kitsu_id: 501, anidb_id: 501, themoviedb_id: { movie: 67890 } },
    // themoviedb_id numerico secco al primo livello.
    { type: 'Movie', kitsu_id: 502, anidb_id: 502, themoviedb_id: 77777 },
    // tv numerico: non è un film, quindi niente mappa inversa.
    { type: 'TV', kitsu_id: 265, mal_id: 290, themoviedb_id: { tv: 26209 } }
];

describe('AnimeMappingStore: id TMDB multipli nei record Fribb', () => {
    beforeEach(() => {
        animeMappingStore.buildFribbIndex(RECORDS);
        animeMappingStore.isReady = true;
    });

    afterEach(() => {
        animeMappingStore.isReady = false;
    });

    test('in avanti (Kitsu → TMDB) usa il primo id, non la stringa "128,1390599"', () => {
        expect(animeMappingStore.resolveTmdbFromKitsu(1376)).toBe('128');
        expect(animeMappingStore.kitsuToTmdb.get('1376')).toBe('128');
        expect(animeMappingStore.kitsuToTmdb.get('1376')).toMatch(/^\d+$/);
    });

    test('in avanti (MAL → TMDB) usa il primo id', () => {
        expect(animeMappingStore.resolveTmdbFromMal(100)).toBe('128');
        expect(animeMappingStore.malToTmdb.get('100')).toBe('128');
    });

    test('in dietro (TMDB → Kitsu) risponde per tutti gli id dell\'array', () => {
        expect(animeMappingStore.resolveKitsuMovie(128)).toBe(1376);
        expect(animeMappingStore.resolveKitsuMovie('128')).toBe(1376);
        expect(animeMappingStore.resolveKitsuMovie(1390599)).toBe(1376);
        expect(animeMappingStore.resolveKitsuMovie('1390599')).toBe(1376);
    });

    test('ogni id dell\'array è riconosciuto come id anime (badge/doppiato)', () => {
        expect(animeMappingStore.isAnimeTmdbId(128)).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(1390599)).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId('tmdb:1390599')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(999999)).toBe(false);
    });

    test('array di un solo id: comportamento invariato', () => {
        expect(animeMappingStore.resolveTmdbFromKitsu(6509)).toBe('145675');
        expect(animeMappingStore.resolveTmdbFromMal(11441)).toBe('145675');
        expect(animeMappingStore.resolveKitsuMovie(145675)).toBe(6509);
    });

    test('movie numerico secco: comportamento invariato', () => {
        expect(animeMappingStore.resolveTmdbFromKitsu(501)).toBe('67890');
        expect(animeMappingStore.resolveKitsuMovie(67890)).toBe(501);
    });

    test('themoviedb_id numerico secco al primo livello: comportamento invariato', () => {
        expect(animeMappingStore.resolveTmdbFromKitsu(502)).toBe('77777');
        // type 'Movie' lo mette nella mappa inversa anche senza il campo `movie`.
        expect(animeMappingStore.resolveKitsuMovie(77777)).toBe(502);
    });

    test('tv numerico: invariato e NON finisce nella mappa inversa dei film', () => {
        expect(animeMappingStore.resolveTmdbFromKitsu(265)).toBe('26209');
        expect(animeMappingStore.resolveTmdbFromMal(290)).toBe('26209');
        expect(animeMappingStore.tmdbToKitsuMovie.has('26209')).toBe(false);
        expect(animeMappingStore.resolveKitsuMovie(26209)).toBeNull();
    });

    test('nessuna chiave spazzatura: tutte le chiavi delle mappe sono id TMDB numerici', () => {
        for (const map of [animeMappingStore.kitsuToTmdb, animeMappingStore.malToTmdb, animeMappingStore.tmdbToKitsuMovie]) {
            for (const key of map.keys()) {
                expect(key).toMatch(/^\d+$/);
            }
        }
    });

    test('nessun id vuoto finisce nelle mappe (array vuoto o id null)', () => {
        animeMappingStore.buildFribbIndex([
            { kitsu_id: 9001, mal_id: 9002, themoviedb_id: { movie: [] } },
            { kitsu_id: 9003, mal_id: 9004, themoviedb_id: { movie: [null, 4242] } }
        ]);
        expect(animeMappingStore.resolveTmdbFromKitsu(9001)).toBeNull();
        expect(animeMappingStore.resolveTmdbFromKitsu(9003)).toBe('4242');
        expect(animeMappingStore.resolveKitsuMovie(4242)).toBe(9003);
    });
});