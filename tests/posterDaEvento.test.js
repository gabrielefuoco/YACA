const { erdbIdDaEvento, erdbIdsDaEvento, nomeFileDaEvento, urlDaEvento } = require('../src/cache/posterDaEvento');

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

describe('posterDaEvento - erdbIdsDaEvento (l\'elenco, con gli anime)', () => {
    // Mappa finta: la vera la passa chi chiama (animeMappingStore). Qui basta la forma.
    const CERCA_KITSU_MOVIE = jest.fn((id, tipo) => (tipo === 'movie' && String(id) === '265') ? 265 : null);
    const CERCA_KITSU_TV = jest.fn((id) => (String(id) === '1234') ? '9876' : null);

    test('anime mappato: due id, prima il TMDB poi il Kitsu', () => {
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, CERCA_KITSU_MOVIE))
            .toEqual(['tmdb:movie:265', 'kitsu:265']);
    });

    test('la mappa riceve (id, tipo), cosi\' puo\' scegliere la tabella giusta', () => {
        erdbIdsDaEvento({ tipo: 'movie', id: 265 }, CERCA_KITSU_MOVIE);
        expect(CERCA_KITSU_MOVIE).toHaveBeenCalledWith('265', 'movie');
    });

    test('serie anime: stessa regola, id Kitsu numerico come stringa', () => {
        expect(erdbIdsDaEvento({ tipo: 'tv', id: 1234 }, CERCA_KITSU_TV))
            .toEqual(['tmdb:tv:1234', 'kitsu:9876']);
    });

    test('nessuna mappatura: un id solo, il TMDB', () => {
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 999 }, CERCA_KITSU_MOVIE)).toEqual(['tmdb:movie:999']);
        expect(erdbIdsDaEvento({ tipo: 'tv', id: 1 }, CERCA_KITSU_TV)).toEqual(['tmdb:tv:1']);
    });

    test('cercaKitsu assente: un id solo (nessuna mappa non e\' un errore)', () => {
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 })).toEqual(['tmdb:movie:265']);
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, null)).toEqual(['tmdb:movie:265']);
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, 'non-una-funzione')).toEqual(['tmdb:movie:265']);
    });

    test('cercaKitsu che restituisce vuoto o null: un id solo', () => {
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, () => null)).toEqual(['tmdb:movie:265']);
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, () => undefined)).toEqual(['tmdb:movie:265']);
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, () => '')).toEqual(['tmdb:movie:265']);
    });

    test('cercaKitsu che solleva: NON esplode, logga e lascia rifare il poster TMDB', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const rotta = () => { throw new Error('store non pronto'); };
            expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, rotta)).toEqual(['tmdb:movie:265']);
            // Il guasto si vede (non e' silenzioso), ma non ferma il drenaggio.
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('store non pronto'));
        } finally {
            warn.mockRestore();
        }
    });

    test('nessun doppione: il prefisso kitsu non si raddoppia', () => {
        // Difesa contro una mappa che restituisce l'id gia' con prefisso: senza questo
        // controllo si avrebbe `kitsu:kitsu:265`, cioe' un file che la rotta non chiede.
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, () => 'kitsu:265'))
            .toEqual(['tmdb:movie:265', 'kitsu:265']);
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, () => '265'))
            .toEqual(['tmdb:movie:265', 'kitsu:265']);
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265 }, () => ' kitsu:265 '))
            .toEqual(['tmdb:movie:265', 'kitsu:265']);
    });

    test('id gia\' in forma kitsu: la mappa non viene neppure interrogata', () => {
        const cerca = jest.fn(() => 999);
        expect(erdbIdsDaEvento({ tipo: 'tv', id: 'kitsu:265' }, cerca)).toEqual(['kitsu:265']);
        expect(cerca).not.toHaveBeenCalled();
    });

    test('tipo sconosciuto: solleva come prima, nessun elenco inventato', () => {
        const cerca = jest.fn(() => 265);
        expect(() => erdbIdsDaEvento({ tipo: 'film', id: 265 }, cerca)).toThrow(/film/);
        expect(() => erdbIdsDaEvento({ tipo: undefined, id: 265 }, cerca)).toThrow();
        expect(cerca).not.toHaveBeenCalled();
    });

    test('id mancante: solleva', () => {
        expect(() => erdbIdsDaEvento({ tipo: 'movie' }, CERCA_KITSU_MOVIE)).toThrow(/id/);
    });

    test('l\'elenco produce nomi file che la rotta chiede davvero (letterali)', () => {
        // Il punto del compito: coi due id si ottengono i due nomi che esistono su disco.
        expect(erdbIdsDaEvento({ tipo: 'movie', id: 265, badge: 'ITA' }, CERCA_KITSU_MOVIE)
            .map((erdbId) => erdbId.replace(/:/g, '-') + '_ITA.jpg'))
            .toEqual(['tmdb-movie-265_ITA.jpg', 'kitsu-265_ITA.jpg']);
    });
});
