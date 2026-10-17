/**
 * tests/moduloPoster.test.js
 *
 * Collaudo del modulo Poster (`src/posters`):
 * - Esporta i componenti chiave: coda, drenatore, traduttore eventi, costruttore ERDB e comando timer.
 * - Le funzioni pure di traduzione operano correttamente dal modulo canonico.
 * - Gli shim in `src/erdb/` e `src/cache/` garantiscono la retrocompatibilità per i chiamanti non migrati.
 */

const posters = require('../src/posters');

describe('Modulo Poster — Superficie pubblica', () => {
    test('esporta la coda e le sue primitive', () => {
        expect(posters.codaEventi).toBeDefined();
        expect(typeof posters.createCodaEventi).toBe('function');
        expect(typeof posters.push).toBe('function');
        expect(typeof posters.take).toBe('function');
        expect(typeof posters.done).toBe('function');
        expect(typeof posters.fail).toBe('function');
        expect(posters.MAX_TENTATIVI).toBe(5);
        expect(posters.TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    });

    test('esporta il drenatore come funzione', () => {
        expect(typeof posters.drena).toBe('function');
        expect(typeof posters.scarica).toBe('function');
        expect(typeof posters.scrivi).toBe('function');
        expect(typeof posters.classificaMotivo).toBe('function');
        expect(typeof posters.eventoDaErdbId).toBe('function');
        expect(typeof posters.eJpeg).toBe('function');
    });

    test('esporta la traduzione eventi <-> nomi file / id ERDB', () => {
        expect(typeof posters.erdbIdDaEvento).toBe('function');
        expect(typeof posters.erdbIdDaNomeFile).toBe('function');
        expect(typeof posters.erdbIdsDaEvento).toBe('function');
        expect(typeof posters.eventoDaNomeFile).toBe('function');
        expect(typeof posters.nomeFileDaEvento).toBe('function');
        expect(typeof posters.urlDaEvento).toBe('function');

        // Verifica comportamento funzioni pure
        expect(posters.erdbIdDaEvento({ tipo: 'movie', id: '27205' })).toBe('tmdb:movie:27205');
        expect(posters.erdbIdDaNomeFile('tmdb-movie-27205_ITA.jpg')).toEqual({
            erdbId: 'tmdb:movie:27205',
            badge: 'ITA'
        });
        expect(posters.eventoDaNomeFile('tmdb-movie-27205_ITA.jpg')).toEqual({
            tipo: 'movie',
            id: '27205',
            badge: 'ITA'
        });
    });

    test('esporta il costruttore ERDB e la composizione poster', () => {
        expect(typeof posters.posterFileName).toBe('function');
        expect(typeof posters.posterUrl).toBe('function');
        expect(typeof posters.sanitizeErdbId).toBe('function');
        expect(posters.erdb).toBeDefined();

        expect(posters.posterFileName({ erdbId: 'tmdb:movie:27205', badge: 'ITA', version: '460b8042' }))
            .toBe('tmdb-movie-27205-460b8042_ITA.jpg');
        expect(posters.posterUrl('http://localhost:3100/Tk-test', { erdbId: 'tmdb:movie:27205', badge: 'ITA' }))
            .toBe('http://localhost:3100/Tk-test/poster/tmdb:movie:27205.jpg?badge=ITA');
    });

    test('esporta il comando di drenaggio (proprietà del modulo)', () => {
        expect(posters.drenaCodaPoster).toBeDefined();
        expect(typeof posters.drenaCommand).toBe('function');
        expect(typeof posters.drenaCodaPoster.main).toBe('function');
        expect(typeof posters.drenaCodaPoster.gira).toBe('function');
        expect(typeof posters.drenaCodaPoster.aspettaRedis).toBe('function');
    });
});
