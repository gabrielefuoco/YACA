/**
 * tests/allineaIdFilm.test.js
 *
 * L'id con cui Stremio apre un film deve essere quello che l'ecosistema capisce: IMDb.
 *
 * Per una **serie** Stremio costruisce la richiesta di stream dall'id del **video** (che è già
 * `tt…:S:E`), quindi il problema non si pone. Per un **film** non c'è un video separato: usa l'id
 * della scheda, e se quello è `tmdb:238` gli altri addon non rispondono. Misurato il 04/10/2026 con
 * Torrentio: `movie/tt0068646` → **58 stream**, `movie/tmdb:238` → **0**.
 *
 * Questi test difendono le tre cose che non devono rompersi: le serie, i film senza id IMDb, e il
 * suffisso `_ita_offset` dei cloni doppiati.
 */

const { allineaIdFilm } = require('../src/handlers/catalogHandler');

const risposta = (...metas) => ({ metas });

describe('allineaIdFilm (ticket: stream dei film)', () => {
    test('un film doppiato passa all\'id IMDb', () => {
        const r = risposta({ id: 'tmdb:238', type: 'movie', name: 'Il padrino', _imdbId: 'tt0068646' });
        expect(allineaIdFilm(r).metas[0].id).toBe('tt0068646');
    });

    test('una SERIE non viene toccata (lì Stremio usa l\'id del video)', () => {
        const r = risposta({ id: 'tmdb:1396', type: 'series', name: 'Breaking Bad', _imdbId: 'tt0903747' });
        expect(allineaIdFilm(r).metas[0].id).toBe('tmdb:1396');
    });

    test('un film SENZA id IMDb resta com\'è', () => {
        const r = risposta({ id: 'tmdb:99999', type: 'movie', name: 'Senza IMDb', _imdbId: null });
        expect(allineaIdFilm(r).metas[0].id).toBe('tmdb:99999');
    });

    test('un film già in forma IMDb non cambia', () => {
        const r = risposta({ id: 'tt0111161', type: 'movie', name: 'Le ali della libertà', _imdbId: 'tt0111161' });
        expect(allineaIdFilm(r).metas[0].id).toBe('tt0111161');
    });

    test('il suffisso _ita_offset del clone sopravvive', () => {
        const r = risposta({ id: 'tmdb:1311031_ita_offset', type: 'movie', name: 'Demon Slayer', _imdbId: 'tt32820897' });
        expect(allineaIdFilm(r).metas[0].id).toBe('tt32820897_ita_offset');
    });

    test('anche il defaultVideoId segue l\'id', () => {
        const r = risposta({
            id: 'tmdb:238', type: 'movie', name: 'Il padrino', _imdbId: 'tt0068646',
            behaviorHints: { defaultVideoId: 'tmdb:238' }
        });
        expect(allineaIdFilm(r).metas[0].behaviorHints.defaultVideoId).toBe('tt0068646');
    });

    test('una risposta vuota o malformata non fa danni', () => {
        expect(allineaIdFilm(null)).toBe(null);
        expect(allineaIdFilm({}).metas).toBeUndefined();
        expect(allineaIdFilm(risposta(null)).metas[0]).toBe(null);
    });
});
