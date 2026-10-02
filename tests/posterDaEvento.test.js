const { erdbIdDaEvento, nomeFileDaEvento, urlDaEvento } = require('../src/cache/posterDaEvento');

/*
 * I nomi file attesi qui sono SCRITTI A MANO, non presi da `posterFileName`.
 * Se il test li confrontasse con la funzione del costruttore sarebbe una tautologia:
 * passerebbe anche se il costruttore cambiasse idea, e invece il nome sbagliato è
 * esattamente il fallimento silenzioso che questo modulo esiste per evitare
 * (file prodotto, rotta che non lo chiede, poster invisibile).
 * Se `posterFileName` cambia convenzione, questi valori sono il segnale: vanno aggiornati
 * insieme al drenatore e alla rotta, non di nascosto.
 */

describe('posterDaEvento - id ERDB', () => {
    test('film: tmdb:movie:<id>', () => {
        expect(erdbIdDaEvento({ tipo: 'movie', id: 27205 })).toBe('tmdb:movie:27205');
        expect(erdbIdDaEvento({ tipo: 'movie', id: '27205' })).toBe('tmdb:movie:27205');
    });

    test('serie: tmdb:tv:<id>', () => {
        expect(erdbIdDaEvento({ tipo: 'tv', id: 1396 })).toBe('tmdb:tv:1396');
        expect(erdbIdDaEvento({ tipo: 'tv', id: '1396' })).toBe('tmdb:tv:1396');
    });

    test('anime: id gia\' kitsu, si riusa cosi\' com\'e\' (il tipo non c\'entra)', () => {
        expect(erdbIdDaEvento({ tipo: 'movie', id: 'kitsu:265' })).toBe('kitsu:265');
        expect(erdbIdDaEvento({ tipo: 'tv', id: 'kitsu:265' })).toBe('kitsu:265');
    });

    test('tipo sconosciuto: solleva, e il messaggio dice cosa e\' arrivato', () => {
        expect(() => erdbIdDaEvento({ tipo: 'film', id: 27205 }))
            .toThrow(/film/);
        expect(() => erdbIdDaEvento({ tipo: 'serie', id: 27205 }))
            .toThrow(/serie/);
        // Non si degrada in `null`/`undefined`: un evento malformato deve farsi sentire.
        expect(() => erdbIdDaEvento({ tipo: undefined, id: 27205 })).toThrow();
    });

    test('id mancante: solleva', () => {
        expect(() => erdbIdDaEvento({ tipo: 'movie' })).toThrow(/id/);
        expect(() => erdbIdDaEvento({ tipo: 'movie', id: '' })).toThrow(/id/);
        expect(() => erdbIdDaEvento({ tipo: 'movie', id: null })).toThrow(/id/);
    });
});

describe('posterDaEvento - nome file (letterali, non prodotti dal costruttore)', () => {
    test('film con badge: tmdb-movie-27205_ITA.jpg', () => {
        expect(nomeFileDaEvento({ tipo: 'movie', id: 27205, badge: 'ITA' })).toBe('tmdb-movie-27205_ITA.jpg');
        expect(nomeFileDaEvento({ tipo: 'movie', id: '27205', badge: 'ITA' })).toBe('tmdb-movie-27205_ITA.jpg');
    });

    test('film senza badge: tmdb-movie-27205.jpg', () => {
        expect(nomeFileDaEvento({ tipo: 'movie', id: 27205 })).toBe('tmdb-movie-27205.jpg');
        // Badge vuoto o assente valgono come "senza badge".
        expect(nomeFileDaEvento({ tipo: 'movie', id: 27205, badge: '' })).toBe('tmdb-movie-27205.jpg');
        expect(nomeFileDaEvento({ tipo: 'movie', id: 27205, badge: null })).toBe('tmdb-movie-27205.jpg');
    });

    test('serie con e senza badge', () => {
        expect(nomeFileDaEvento({ tipo: 'tv', id: 1396, badge: 'ITA' })).toBe('tmdb-tv-1396_ITA.jpg');
        expect(nomeFileDaEvento({ tipo: 'tv', id: 1396 })).toBe('tmdb-tv-1396.jpg');
    });

    test('anime: il nome conserva il prefisso "kitsu" (sanitizzato in trattino)', () => {
        expect(nomeFileDaEvento({ tipo: 'tv', id: 'kitsu:265' })).toBe('kitsu-265.jpg');
        expect(nomeFileDaEvento({ tipo: 'movie', id: 'kitsu:265', badge: 'ITA' })).toBe('kitsu-265_ITA.jpg');
    });

    test('id numerico e id stringa danno lo stesso nome (stesso titolo)', () => {
        expect(nomeFileDaEvento({ tipo: 'movie', id: 27205, badge: 'ITA' }))
            .toBe(nomeFileDaEvento({ tipo: 'movie', id: '27205', badge: 'ITA' }));
    });

    test('tipo sconosciuto: solleva anche qui, nessun nome inventato', () => {
        expect(() => nomeFileDaEvento({ tipo: 'film', id: 27205, badge: 'ITA' })).toThrow(/film/);
    });
});

describe('posterDaEvento - url ERDB', () => {
    const BASE = 'https://easyratingsdb.com/CHIAVE';

    test('l\'erdbId viaggia col ":" nel path, il badge in query', () => {
        expect(urlDaEvento(BASE, { tipo: 'movie', id: 27205, badge: 'ITA' }))
            .toBe('https://easyratingsdb.com/CHIAVE/poster/tmdb:movie:27205.jpg?badge=ITA');
    });

    test('senza badge la query sparisce', () => {
        expect(urlDaEvento(BASE, { tipo: 'tv', id: 1396 }))
            .toBe('https://easyratingsdb.com/CHIAVE/poster/tmdb:tv:1396.jpg');
        expect(urlDaEvento(BASE, { tipo: 'tv', id: 'kitsu:265', badge: '' }))
            .toBe('https://easyratingsdb.com/CHIAVE/poster/kitsu:265.jpg');
    });

    test('slash finale nella base non ne aggiunge uno in piu\'', () => {
        expect(urlDaEvento(`${BASE}/`, { tipo: 'movie', id: 27205 }))
            .toBe('https://easyratingsdb.com/CHIAVE/poster/tmdb:movie:27205.jpg');
    });
});