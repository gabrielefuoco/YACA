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
 *
 * I conteggi si confrontano con `toMatchObject` e non con `toEqual`: il riepilogo porta ora
 * anche `fallimenti` e `note`, e il contratto che qui interessa è che i tre numeri siano
 * giusti (le liste hanno un contratto loro, in fondo a questo file).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { drena, classificaMotivo } = require('../src/cache/drenaPoster');

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

        expect(riepilogo).toMatchObject({ presi: 0, resi: 0, falliti: 0 });
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
        expect(riepilogo).toMatchObject({ presi: 0, resi: 0, falliti: 0 });
    });
});

describe('drenaPoster - il file che viene scritto', () => {
    test('film col badge: nome giusto e byte JPEG', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const fetchImpl = creaFetch({ [urlFilm('ITA')]: risposta(JPEG) });

        const riepilogo = await gira({ ...coda, fetchImpl });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
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

        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
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
        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
        expect(fs.readdirSync(dir).sort()).toEqual(['kitsu-9876.jpg', 'tmdb-tv-1234.jpg']);
        // Un solo evento, quindi una sola chiusura.
        expect(coda.chiusi.done).toEqual(['tv|1234']);
    });

    test('un id che va bene e uno che no: l\'evento è fail, ma il primo file resta', async () => {
        const coda = creaCoda([{ tipo: 'tv', id: 1234, badge: null }]);
        const cercaKitsu = () => '9876';
        const fetchImpl = creaFetch({ [`${BASE}/poster/tmdb:tv:1234.jpg`]: risposta(JPEG) });

        const riepilogo = await gira({ ...coda, cercaKitsu, fetchImpl });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 0, falliti: 1 });
        expect(coda.chiusi.done).toEqual([]);
        expect(coda.chiusi.fail).toEqual(['tv|1234']);
        expect(filePresente('tmdb-tv-1234.jpg')).toBe(true);
        expect(filePresente('kitsu-9876.jpg')).toBe(false);
    });

    test('nessuna mappatura: un file solo, e l\'evento è chiuso lo stesso', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const riepilogo = await gira({ ...coda, cercaKitsu: () => null, fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) }) });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
        expect(fs.readdirSync(dir)).toEqual(['tmdb-movie-27205.jpg']);
    });
});

describe('drenaPoster - i guasti sono fail, non eccezioni', () => {
    test('404: fail, nessun file', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        // `fetch` senza la risposta in mappa: torna 404.
        const riepilogo = await gira({ ...coda, fetchImpl: creaFetch({}) });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 0, falliti: 1 });
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

        expect(riepilogo).toMatchObject({ presi: 1, resi: 0, falliti: 1 });
        expect(fs.readdirSync(dir)).toEqual([]);
        expect(coda.chiusi.fail).toEqual(['movie|27205']);
        expect(coda.chiusi.done).toEqual([]);
    });

    test('corpo vuoto: fail (il magic non c\'è)', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const riepilogo = await gira({ ...coda, fetchImpl: creaFetch({ [urlFilm('ITA')]: risposta(Buffer.alloc(0)) }) });
        expect(riepilogo).toMatchObject({ presi: 1, resi: 0, falliti: 1 });
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

        expect(riepilogo).toMatchObject({ presi: 3, resi: 2, falliti: 1 });
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

        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
        expect(filePresente('tmdb-movie-27205.jpg')).toBe(true);
    });

    test('timeout: il fetch non risponde e il giro va avanti lo stesso', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const fetchImpl = () => new Promise(() => {});   // appesa per sempre

        const riepilogo = await gira({ ...coda, fetchImpl, timeoutMs: 30 });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 0, falliti: 1 });
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

        expect(riepilogo).toMatchObject({ presi: 2, resi: 1, falliti: 1 });
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

        expect(riepilogo).toMatchObject({ presi: 1, resi: 0, falliti: 1 });
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
/**
 * IL PERCHÉ ESCE DALLA FUNZIONE, NON DAL LOG.
 *
 * Il chiamante (lo script da timer) deve poter dire "3 falliti, e sono stati 3 `http_404`"
 * senza leggere una riga di journal e riconoscerci dentro un motivo: due file legati da una
 * frase si rompono nel momento in cui la frase cambia, e si rompono in silenzio (tutto
 * finisce in `altro`, il riepilogo sembra regolare). Qui il motivo è un **codice** decido dove
 * il guasto nasce, e l'elenco dice anche *quale* evento e *quale* id ERDB.
 */
describe('drenaPoster - i fallimenti si spiegano da sé', () => {
    test('un 404 e un non-JPEG: due voci con due motivi diversi e leggibili', async () => {
        const coda = creaCoda([
            { tipo: 'movie', id: 1, badge: null },
            { tipo: 'tv', id: 1396, badge: null }
        ]);
        const fetchImpl = async (url) => (url.includes('tmdb:movie:1')
            ? risposta(Buffer.alloc(0), { ok: false, status: 404 })          // ERDB: non c'è
            : risposta(WEBP, { contentType: 'image/jpeg' }));                 // dice JPEG, è WebP

        const riepilogo = await gira({ ...coda, fetchImpl });

        // I tre contatori sono quelli di prima: chi li leggeva continua a leggere gli stessi.
        expect(riepilogo).toMatchObject({ presi: 2, resi: 0, falliti: 2 });
        expect(riepilogo.fallimenti).toHaveLength(2);
        // I motivi sono DIVERSI e sono codici, non frasi: un 404 e un formato sbagliato non
        // possono finire nella stessa voce (prima finivano, se il testo cambiava).
        expect(riepilogo.fallimenti.map((f) => f.motivo)).toEqual(['http_404', 'non_jpeg']);
        // E la voce sa QUALE evento e QUALE id ERDB: un evento anime ne ha due, e il motivo
        // serve per quello che è andato storto.
        expect(riepilogo.fallimenti.map((f) => `${f.tipo}:${f.id}`)).toEqual(['movie:1', 'tv:1396']);
        expect(riepilogo.fallimenti.map((f) => f.erdbId)).toEqual(['tmdb:movie:1', 'tmdb:tv:1396']);
        // La frase resta, per l'occhio: il codice è per il conto.
        expect(riepilogo.fallimenti[0].dettaglio).toMatch(/HTTP 404/);
        expect(riepilogo.fallimenti[1].dettaglio).toMatch(/non è un JPEG/);
        // Un giro senza guasti del giro stesso: gli avvisi sono a zero, non assenti.
        expect(riepilogo.note).toEqual({ take: 0, cartella: 0, chiusura: 0 });
    });

    test('gli altri guasti hanno ciascuno il suo codice', async () => {
        const rete = await gira({
            ...creaCoda([{ tipo: 'movie', id: 1, badge: null }]),
            fetchImpl: async () => { throw new Error('ECONNRESET'); }
        });
        const scadenza = await gira({
            ...creaCoda([{ tipo: 'movie', id: 2, badge: null }]),
            fetchImpl: () => new Promise(() => {}),          // appesa per sempre
            timeoutMs: 30
        });
        const malformato = await gira({
            ...creaCoda([{ tipo: 'film', id: 3, badge: null }]),
            fetchImpl: creaFetch({})
        });

        expect(rete.fallimenti.map((f) => f.motivo)).toEqual(['rete']);
        expect(scadenza.fallimenti.map((f) => f.motivo)).toEqual(['timeout']);
        expect(malformato.fallimenti.map((f) => f.motivo)).toEqual(['tipo_sconosciuto']);
        // Sono codici corti: il chiamante li conta, non li legge.
        for (const riepilogo of [rete, scadenza, malformato]) {
            for (const voce of riepilogo.fallimenti) {
                expect(voce.motivo).toMatch(/^[a-z_]+(\d+)?$/);
            }
        }
    });

    test('un giro riuscito non inventa fallimenti', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const riepilogo = await gira({ ...coda, fetchImpl: creaFetch({ [urlFilm('ITA')]: risposta(JPEG) }) });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
        expect(riepilogo.fallimenti).toEqual([]);
    });

    test('take che lancia: l\'avviso del giro esce strutturato (non più da una riga di log)', async () => {
        const riepilogo = await gira({
            take: async () => { throw new Error('redis giù'); },
            done: async () => {},
            fail: async () => {},
            fetchImpl: creaFetch({})
        });

        expect(riepilogo).toMatchObject({ presi: 0, resi: 0, falliti: 0 });
        expect(riepilogo.note.take).toBe(1);
    });

    test('una chiusura che lancia si conta, e il giro finisce lo stesso', async () => {
        const riepilogo = await gira({
            take: async () => [{ tipo: 'movie', id: 27205, badge: null }],
            done: async () => { throw new Error('redis giù'); },
            fail: async () => { throw new Error('redis giù'); },
            fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) })
        });

        expect(riepilogo).toMatchObject({ presi: 1, resi: 1, falliti: 0 });
        expect(riepilogo.note.chiusura).toBe(1);
    });

    test('cartella inutilizzabile: ogni evento è fallito, e si sa che è per la cartella', async () => {
        // Una cartella che è un file: `mkdir` non può funzionare, senza dipendere da permessi.
        const outDir = path.join(dir, 'file-e-non-cartella');
        fs.writeFileSync(outDir, 'non una cartella');

        const riepilogo = await gira({
            ...creaCoda([{ tipo: 'movie', id: 1, badge: null }, { tipo: 'movie', id: 2, badge: null }]),
            fetchImpl: creaFetch({}),
            outDir
        });

        expect(riepilogo).toMatchObject({ presi: 2, resi: 0, falliti: 2 });
        expect(riepilogo.fallimenti.map((f) => f.motivo)).toEqual(['cartella', 'cartella']);
        // Nessun id ERDB: nessuna richiesta è mai partita, quindi dirlo sarebbe inventare.
        expect(riepilogo.fallimenti[0].erdbId).toBeNull();
        expect(riepilogo.fallimenti[0].dettaglio).toMatch(/non utilizzabile/);
        expect(riepilogo.note.cartella).toBe(1);
    });

    test('classificaMotivo: il codice dichiarato vince, il testo è la rete di sicurezza', () => {
        // Dichiarato sul guasto: conta quello, anche se il messaggio dice altro.
        expect(classificaMotivo({ motivo: 'non_jpeg', message: 'HTTP 500 su http://x' })).toBe('non_jpeg');
        // Non dichiarato (un errore che viene da un altro modulo): si riconosce dal testo.
        expect(classificaMotivo(new Error('HTTP 404 su http://x'))).toBe('http_404');
        expect(classificaMotivo('la risposta non è un JPEG (12 byte)')).toBe('non_jpeg');
        expect(classificaMotivo('timeout dopo 20000 ms su http://x')).toBe('timeout');
        expect(classificaMotivo('richiesta fallita: fetch failed')).toBe('rete');
        expect(classificaMotivo('boh')).toBe('altro');
    });
});
