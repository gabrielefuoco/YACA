/**
 * tests/drenaPoster.test.js
 *
 * Il giro di scarico della coda dei poster: `src/cache/drenaPoster.js`.
 *
 * Tutto è iniettato, e qui è tutto finto: coda in memoria, `fetch` che restituisce buffer
 * preparati a mano, cartella in un tmp dir di sistema. Niente rete, niente Redis, niente ERDB.
 *
 * I nomi file attesi sono SCRITTI A MANO (`tmdb-movie-27205_ITA.jpg`), non presi da
 * `posterFileName`: se il test li confrontasse con la funzione del costruttore sarebbe una
 * tautologia, e invece il nome sbagliato è esattamente il fallimento silenzioso che questa
 * catena di moduli esiste per evitare.
 *
 * Il contratto verificato:
 * - coda vuota: giro vuoto, nessuna scrittura;
 * - un film col badge produce il file col nome giusto e byte JPEG;
 * - `badge: null` produce il nome SENZA suffisso;
 * - un evento con Kitsu produce DUE file (TMDB e Kitsu);
 * - 404 e byte non-JPEG sono `fail`, e non lasciano file;
 * - un `fetch` che esplode su un evento non ferma gli altri del lotto;
 * - `done`/`fail` ricevono la chiave giusta (`tipo|id`, come la coda identifica un evento);
 * - un `.tmp` non resta in giro quando la scrittura fallisce.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { drena } = require('../src/cache/drenaPoster');

const BASE = 'http://127.0.0.1:3100/Tk-prova';

/** JPEG finto: magic `ff d8` + SOI. Contano i primi due byte, non il resto. */
const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    Buffer.from('JFIF\0', 'ascii'),
    Buffer.alloc(32, 0x7a)
]);

/** WebP finto: magic `RIFF....WEBP`, cioè l'image/webp che l'istanza non patchata serve. */
const WEBP = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.alloc(4, 0),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(16, 0x11)
]);

/** Risposta finta, della sola forma che `drenaPoster` usa: `ok`, `status`, `arrayBuffer`. */
const risposta = (buffer, { ok = true, status = 200, contentType = 'image/jpeg' } = {}) => ({
    ok,
    status,
    headers: { get: (nome) => (nome.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
});

/**
 * Coda finta: tiene gli eventi e registra le chiusure **per chiave `tipo|id`**, che è come
 * `codaEventi` identifica un evento. Se `drena` passasse qualcos'altro (l'oggetto, una stringa
 * composta male, `undefined`) la chiave sarebbe diversa e il test lo vede.
 */
function creaCoda(eventi) {
    const chiusi = { done: [], fail: [] };
    const chiave = (e) => `${e.tipo}|${e.id}`;
    return {
        chiusi,
        async take(n) { return eventi.slice(0, n); },
        async done(e) { chiusi.done.push(chiave(e)); },
        async fail(e) { chiusi.fail.push(chiave(e)); }
    };
}

/** `fetch` finto: per URL restituisce il buffer promesso, altrimenti 404. */
function creaFetch(mappa = {}) {
    const richieste = [];
    const fn = async (url, opzioni) => {
        richieste.push({ url, opzioni });
        const voce = mappa[url];
        if (!voce) return risposta(Buffer.alloc(0), { ok: false, status: 404 });
        if (voce instanceof Error) throw voce;
        return voce;
    };
    fn.richieste = richieste;
    return fn;
}

const urlFilm = (badge) => (badge
    ? `${BASE}/poster/tmdb:movie:27205.jpg?badge=${badge}`
    : `${BASE}/poster/tmdb:movie:27205.jpg`);

let dir;
let logFinto;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drena-'));
    logFinto = { log: () => {}, warn: () => {} };
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

const gira = (extra) => drena({
    outDir: dir,
    base: BASE,
    log: logFinto,
    ...extra
});

const filePresente = (nome) => fs.readdirSync(dir).includes(nome);

describe('drenaPoster - coda vuota', () => {
    test('riepilogo a zero e nessuna scrittura', async () => {
        const fetchImpl = creaFetch({});
        const coda = creaCoda([]);
        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toEqual({ presi: 0, resi: 0, falliti: 0 });
        expect(fs.readdirSync(dir)).toEqual([]);
        expect(fetchImpl.richieste).toEqual([]);
        expect(coda.chiusi.done).toEqual([]);
        expect(coda.chiusi.fail).toEqual([]);
    });

    test('take che lancia: giro vuoto, niente propaga', async () => {
        const riepilogo = await gira({
            take: async () => { throw new Error('redis giù'); },
            done: async () => {},
            fail: async () => {},
            fetchImpl: creaFetch({})
        });
        expect(riepilogo).toEqual({ presi: 0, resi: 0, falliti: 0 });
    });
});

describe('drenaPoster - il file che viene scritto', () => {
    test('film col badge: nome giusto e byte JPEG', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const fetchImpl = creaFetch({ [urlFilm('ITA')]: risposta(JPEG) });

        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toEqual({ presi: 1, resi: 1, falliti: 0 });
        expect(fs.readdirSync(dir)).toEqual(['tmdb-movie-27205_ITA.jpg']);

        const scritto = fs.readFileSync(path.join(dir, 'tmdb-movie-27205_ITA.jpg'));
        expect(scritto.equals(JPEG)).toBe(true);
        // Magic riletto dal file su disco: è quello che la rotta servirà.
        expect(scritto[0]).toBe(0xff);
        expect(scritto[1]).toBe(0xd8);

        expect(coda.chiusi.done).toEqual(['movie|27205']);
        expect(coda.chiusi.fail).toEqual([]);
    });

    test('badge null: il nome file è quello SENZA suffisso', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const fetchImpl = creaFetch({ [urlFilm(null)]: risposta(JPEG) });

        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toEqual({ presi: 1, resi: 1, falliti: 0 });
        expect(fs.readdirSync(dir)).toEqual(['tmdb-movie-27205.jpg']);
    });

    test('sovrascrive: il file che c\'era era vecchio', async () => {
        fs.writeFileSync(path.join(dir, 'tmdb-movie-27205_ITA.jpg'), Buffer.from('vecchio'));

        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        await gira({ ...coda, fetchImpl: creaFetch({ [urlFilm('ITA')]: risposta(JPEG) }) });

        // Diverso giro grosso: qui il file esiste proprio perché il poster è cambiato.
        expect(fs.readFileSync(path.join(dir, 'tmdb-movie-27205_ITA.jpg')).equals(JPEG)).toBe(true);
    });

    test('la richiesta dichiara image/jpeg e va all\'URL del costruttore', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const fetchImpl = creaFetch({ [urlFilm('ITA')]: risposta(JPEG) });
        await gira({ ...coda, fetchImpl });

        expect(fetchImpl.richieste.length).toBe(1);
        expect(fetchImpl.richieste[0].url).toBe('http://127.0.0.1:3100/Tk-prova/poster/tmdb:movie:27205.jpg?badge=ITA');
        expect(fetchImpl.richieste[0].opzioni.headers).toEqual({ Accept: 'image/jpeg' });
    });
});

describe('drenaPoster - gli anime (due file per un evento)', () => {
    test('id TMDB con Kitsu: due file scritti, un solo done', async () => {
        const coda = creaCoda([{ tipo: 'tv', id: 1234, badge: null }]);
        const cercaKitsu = jest.fn(() => '9876');
        const fetchImpl = creaFetch({
            [`${BASE}/poster/tmdb:tv:1234.jpg`]: risposta(JPEG),
            [`${BASE}/poster/kitsu:9876.jpg`]: risposta(JPEG)
        });

        const riepilogo = await gira({ ...coda, cercaKitsu, fetchImpl });

        expect(cercaKitsu).toHaveBeenCalledWith('1234', 'tv');
        expect(riepilogo).toEqual({ presi: 1, resi: 1, falliti: 0 });
        expect(fs.readdirSync(dir).sort()).toEqual(['kitsu-9876.jpg', 'tmdb-tv-1234.jpg']);
        // Un solo evento, quindi una sola chiusura.
        expect(coda.chiusi.done).toEqual(['tv|1234']);
    });

    test('un id che va bene e uno che no: l\'evento è fail, ma il primo file resta', async () => {
        const coda = creaCoda([{ tipo: 'tv', id: 1234, badge: null }]);
        const cercaKitsu = () => '9876';
        const fetchImpl = creaFetch({ [`${BASE}/poster/tmdb:tv:1234.jpg`]: risposta(JPEG) });

        const riepilogo = await gira({ ...coda, cercaKitsu, fetchImpl });

        expect(riepilogo).toEqual({ presi: 1, resi: 0, falliti: 1 });
        expect(coda.chiusi.done).toEqual([]);
        expect(coda.chiusi.fail).toEqual(['tv|1234']);
        expect(filePresente('tmdb-tv-1234.jpg')).toBe(true);
        expect(filePresente('kitsu-9876.jpg')).toBe(false);
    });

    test('nessuna mappatura: un file solo, e l\'evento è chiuso lo stesso', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const riepilogo = await gira({ ...coda, cercaKitsu: () => null, fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) }) });

        expect(riepilogo).toEqual({ presi: 1, resi: 1, falliti: 0 });
        expect(fs.readdirSync(dir)).toEqual(['tmdb-movie-27205.jpg']);
    });
});

describe('drenaPoster - i guasti sono fail, non eccezioni', () => {
    test('404: fail, nessun file', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        // `fetch` senza la risposta in mappa: torna 404.
        const riepilogo = await gira({ ...coda, fetchImpl: creaFetch({}) });

        expect(riepilogo).toEqual({ presi: 1, resi: 0, falliti: 1 });
        expect(fs.readdirSync(dir)).toEqual([]);
        expect(coda.chiusi.fail).toEqual(['movie|27205']);
    });

    test('byte non-JPEG: fail, nessun file (il caso che protegge la cache)', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        // Content-type che dice JPEG, byte che dicono WebP: è il guasto vero, e la
        // risposta si verifica sui byte, non sull'intestazione.
        const fetchImpl = creaFetch({
            [urlFilm('ITA')]: risposta(WEBP, { contentType: 'image/jpeg' })
        });

        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toEqual({ presi: 1, resi: 0, falliti: 1 });
        expect(fs.readdirSync(dir)).toEqual([]);
        expect(coda.chiusi.fail).toEqual(['movie|27205']);
        expect(coda.chiusi.done).toEqual([]);
    });

    test('corpo vuoto: fail (il magic non c\'è)', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const riepilogo = await gira({ ...coda, fetchImpl: creaFetch({ [urlFilm('ITA')]: risposta(Buffer.alloc(0)) }) });
        expect(riepilogo).toEqual({ presi: 1, resi: 0, falliti: 1 });
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('fetch che solleva su UN evento: gli altri del lotto vengono lavorati lo stesso', async () => {
        const coda = creaCoda([
            { tipo: 'movie', id: 1, badge: null },
            { tipo: 'movie', id: 2, badge: null },   // quello che esplode
            { tipo: 'movie', id: 3, badge: null }
        ]);
        const fetchImpl = async (url) => {
            if (url.includes('tmdb:movie:2')) throw new Error('ECONNRESET');
            return risposta(JPEG);
        };

        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toEqual({ presi: 3, resi: 2, falliti: 1 });
        expect(coda.chiusi.done).toEqual(['movie|1', 'movie|3']);
        expect(coda.chiusi.fail).toEqual(['movie|2']);
        expect(fs.readdirSync(dir).sort()).toEqual(['tmdb-movie-1.jpg', 'tmdb-movie-3.jpg']);
    });

    test('done/fail che lanciano: il giro finisce lo stesso', async () => {
        const riepilogo = await gira({
            take: async () => [{ tipo: 'movie', id: 27205, badge: null }],
            done: async () => { throw new Error('redis giù'); },
            fail: async () => { throw new Error('redis giù'); },
            fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) })
        });

        expect(riepilogo).toEqual({ presi: 1, resi: 1, falliti: 0 });
        expect(filePresente('tmdb-movie-27205.jpg')).toBe(true);
    });

    test('timeout: il fetch non risponde e il giro va avanti lo stesso', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const fetchImpl = () => new Promise(() => {});   // appesa per sempre

        const riepilogo = await gira({ ...coda, fetchImpl, timeoutMs: 30 });

        expect(riepilogo).toEqual({ presi: 1, resi: 0, falliti: 1 });
        expect(coda.chiusi.fail).toEqual(['movie|27205']);
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('evento malformato: fail, gli altri non ci perdono', async () => {
        const coda = creaCoda([
            { tipo: 'film', id: 27205, badge: null },   // tipo sconosciuto
            { tipo: 'movie', id: 1396, badge: null }
        ]);
        const fetchImpl = creaFetch({ [`${BASE}/poster/tmdb:movie:1396.jpg`]: risposta(JPEG) });

        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toEqual({ presi: 2, resi: 1, falliti: 1 });
        expect(coda.chiusi.fail).toEqual(['film|27205']);
        expect(coda.chiusi.done).toEqual(['movie|1396']);
    });
});

describe('drenaPoster - scrittura atomica', () => {
    test('scrittura che fallisce: nessun .tmp residuo', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);

        // Il rename su una cartella non può funzionare (EISDIR/EPERM): il fallimento della
        // scrittura è garantito senza dipendere da permessi o da un disco pieno.
        fs.mkdirSync(path.join(dir, 'tmdb-movie-27205.jpg'));

        const riepilogo = await gira({ ...coda, fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) }) });

        expect(riepilogo).toEqual({ presi: 1, resi: 0, falliti: 1 });
        // Nessun `.tmp` abbandonato: un file orfano occupa disco e un giorno qualcuno lo rinomina.
        expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
        expect(coda.chiusi.fail).toEqual(['movie|27205']);
    });

    test('scrittura riuscita: nessun .tmp residuo nemmeno li', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        await gira({ ...coda, fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) }) });
        expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    });
});