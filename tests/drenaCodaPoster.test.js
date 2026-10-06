/**
 * tests/drenaCodaPoster.test.js
 *
 * Lo script da timer: `scripts/drena-coda-poster.js`.
 *
 * Il giro vero è già testato (`tests/drenaPoster.test.js`): qui si prova il **guscio**, cioè
 * le cose che solo lo script fa e che nessun modulo condiviso può fare: leggere gli
 * argomenti, tirare fuori la base mancante con un codice 1, non scrivere niente in
 * `--dry-run`, chiudere gli eventi, non lanciare mai, chiudere Redis e uscire davvero.
 *
 * Tutto è iniettato (`main(argv, env, dip)`): coda in memoria, `fetch` che restituisce byte
 * preparati a mano, store degli anime finto, cartella in un tmp dir di sistema, client Redis
 * che registra la `quit`. Niente rete, niente Redis, niente DuckDB, niente ERDB.
 *
 * I nomi file attesi sono SCRITTI A MANO (`tmdb-movie-27205_ITA.jpg`), non presi da
 * `posterFileName`: se il test li confrontasse con la funzione del costruttore sarebbe una
 * tautologia, e invece il nome sbagliato è esattamente il fallimento silenzioso che questa
 * catena di moduli esiste per evitare.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    parseArgs,
    rigaRiepilogo,
    gira,
    classificaMotivo,
    adattatoreKitsu,
    aspettaRedis,
    main
} = require('../scripts/drena-coda-poster');

const BASE = 'http://127.0.0.1:3100/Tk-prova';

/** JPEG finto: magic `ff d8` + SOI. Contano i primi due byte, non il resto. */
const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    Buffer.from('JFIF\0', 'ascii'),
    Buffer.alloc(32, 0x7a)
]);

/** WebP finto: dice `image/jpeg` ma i byte sono `RIFF…WEBP`, cioè non è un JPEG. */
const WEBP = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.alloc(4, 0),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(16, 0x11)
]);

/** Risposta finta, della sola forma che `drenaPoster` usa: `ok`, `status`, `arrayBuffer`. */
const risposta = (buffer, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    headers: { get: () => (ok ? 'image/jpeg' : 'text/html') },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
});

/**
 * Coda finta: tiene gli eventi e registra le chiusure **per chiave `tipo|id`**, che è come
 * `codaEventi` identifica un evento.
 *
 * E registra l'argomento ricevuto: `done`/`fail` vogliono l'EVENTO, non una chiave — se lo
 * script passasse la chiave (`"movie|27205"`), `take`/`done`/`fail` restituirebbero `false`
 * senza chiudere niente, in silenzio. Qui si vede: `tipo` e `id` ci sono, e sono quelli giusti.
 */
function creaCoda(eventi) {
    const chiusi = { done: [], fail: [] };
    const chiave = (e) => `${e.tipo}|${e.id}`;
    return {
        chiusi,
        async take(n) { return eventi.slice(0, n); },
        async done(e) { chiusi.done.push(chiave(e)); return true; },
        async fail(e) { chiusi.fail.push(chiave(e)); return false; }
    };
}

/**
 * Coda che fa cadere Redis **durante** il giro: parte con `isAvailable: true` (quindi
 * l'attesa di `aspettaRedis` passa) e la spegne al primo `take`. Serve ai due casi in cui
 * Redis era pronto e poi è andato via: è la situazione che `take` risolve in lista vuota
 * senza lanciare, e che il riepilogo deve continuare a distinguere da "coda vuota".
 */
function spegneRedis(redis, eventi) {
    const coda = creaCoda(eventi);
    const take = coda.take;
    coda.take = async (n) => { redis.isAvailable = false; return take(n); };
    return coda;
}

/** `fetch` finto: per URL restituisce il buffer promesso, altrimenti 404 (ERDB che non c'è). */
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

/** Store degli anime finto: pronto, e con la mappa di un id sola. */
function creaStorePronto({ mappa = { 9876: 'tv', 555: 'movie' } } = {}) {
    return {
        isReady: true,
        motiviResolveKitsu: { STORE_NON_PRONTO: 'store_non_pronto', MAPPATO: 'mappato' },
        risolti: [],
        resolveKitsuDaTmdbId(id, tipo) {
            this.risolti.push({ id, tipo });
            if (String(mappa[String(id)]) === String(tipo)) return { kitsuId: '9999', motivo: 'mappato', tmdbId: id };
            return { kitsuId: null, motivo: 'non_e_un_anime', tmdbId: id };
        }
    };
}

/** Store finto che non è ancora pronto: è il caso da non perdere in silenzio. */
function creaStoreNonPronto() {
    return {
        isReady: false,
        init: jest.fn(async () => {}),   // la rete non c'è: `init` non cambia nulla
        motiviResolveKitsu: { STORE_NON_PRONTO: 'store_non_pronto' },
        resolveKitsuDaTmdbId(id) {
            return { kitsuId: null, motivo: 'store_non_pronto', tmdbId: id };
        }
    };
}

/** Logger finto: tutto quello che lo script dice, in tre sacchi. */
function creaLog() {
    const linee = { log: [], warn: [], error: [] };
    return {
        linee,
        log: (...a) => linee.log.push(a.join(' ')),
        warn: (...a) => linee.warn.push(a.join(' ')),
        error: (...a) => linee.error.push(a.join(' '))
    };
}

const urlFilm = (badge) => (badge
    ? `${BASE}/poster/tmdb:movie:27205.jpg?badge=${badge}`
    : `${BASE}/poster/tmdb:movie:27205.jpg`);

let dir;
let log;
let redis;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drena-scritt-'));
    log = creaLog();
    redis = { quit: jest.fn(async () => 'OK'), disconnect: jest.fn(), isAvailable: true };
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

/** La corsa vera dello script, con tutto iniettato. */
const corri = (argv, dip = {}) => main(
    argv,
    { ERDB_LOCAL_BASE: BASE, ERDB_CACHE_DIR: dir, ...(dip.env || {}) },
    { coda: creaCoda([]), fetchImpl: creaFetch({}), store: null, redisClient: redis, log, ...dip }
);

const filePresenti = () => fs.readdirSync(dir).sort();
// La riga di chiusura del giro: quella dei numeri, o quella del giro saltato (che non ha
// numeri da mostrare, e non deve fingere di averli).
const riepilogo = () => log.linee.log.concat(log.linee.warn)
    .find((l) => l.includes('presi,') || l.includes('giro saltato'));

describe('parseArgs - i default', () => {
    test('senza nulla sulla riga di comando viene tutto da $ERDB_LOCAL_BASE', () => {
        const opts = parseArgs([], { ERDB_LOCAL_BASE: BASE });
        expect(opts.base).toBe(BASE);
        expect(opts.out).toBeNull();          // null = la risoluzione della rotta
        expect(opts.batch).toBe(10);
        expect(opts.timeoutMs).toBe(20000);
        expect(opts.dryRun).toBe(false);
    });

    test('senza base nell\'ambiente la base resta null: la decide main, con codice 1', () => {
        expect(parseArgs([], {}).base).toBeNull();
    });

    test('--dry-run è un interruttore, e da solo cambia il resto', () => {
        const opts = parseArgs(['--dry-run'], { ERDB_LOCAL_BASE: BASE });
        expect(opts.dryRun).toBe(true);
        expect(opts.base).toBe(BASE);
        expect(opts.batch).toBe(10);
    });

    test('--help non chiede niente e non ha bisogno della base', () => {
        expect(parseArgs(['--help'], {})).toEqual(expect.objectContaining({ help: true }));
    });
});

describe('parseArgs - le override', () => {
    test('spazi separati', () => {
        const opts = parseArgs(['--base', BASE, '--out', '/tmp/x', '--batch', '50', '--timeout', '5000'], {});
        expect(opts.base).toBe(BASE);
        expect(opts.out).toBe('/tmp/x');
        expect(opts.batch).toBe(50);
        expect(opts.timeoutMs).toBe(5000);
    });

    test('forma --flag=valore', () => {
        const opts = parseArgs([`--base=${BASE}`, '--batch=3'], {});
        expect(opts.base).toBe(BASE);
        expect(opts.batch).toBe(3);
    });

    test('la riga di comando vince sull\'ambiente', () => {
        const opts = parseArgs([`--base=${BASE}`], { ERDB_LOCAL_BASE: 'http://altro.example' });
        expect(opts.base).toBe(BASE);
    });

    test('argomenti sbagliati: eccezione, non un default silenzioso', () => {
        expect(() => parseArgs(['--batch', 'tanti'], {})).toThrow(/--batch/);
        expect(() => parseArgs(['--batch', '0'], {})).toThrow(/--batch/);
        expect(() => parseArgs(['--base'], {})).toThrow(/richiede un valore/);
        expect(() => parseArgs(['--pippo'], {})).toThrow(/sconosciuto/);
        expect(() => parseArgs(['resto'], {})).toThrow(/sconosciuto/);
    });
});

describe('la base è obbligatoria', () => {
    test('senza --base e senza $ERDB_LOCAL_BASE: codice 1 e un messaggio leggibile', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const fetchImpl = creaFetch({ [urlFilm(null)]: risposta(JPEG) });

        const codice = await main([], {}, { coda, fetchImpl, store: null, redisClient: redis, log });

        expect(codice).toBe(1);
        // Il messaggio è scritto per `systemctl status`: dice cosa manca, come si chiama la
        // variabile e perché si esce diversi. Senza questo si avrebbe un journal pieno di 404.
        const detto = log.linee.error.join('\n');
        expect(detto).toMatch(/ERDB_LOCAL_BASE/);
        expect(detto).toMatch(/Tk-/);
        expect(detto).toMatch(/systemctl status/);
        // E soprattutto: non ha girato. Nessuna richiesta, nessun file, nessuna chiusura.
        expect(fetchImpl.richieste).toEqual([]);
        expect(chiusiDi(coda)).toEqual({ done: [], fail: [] });
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('con la base nell\'ambiente: codice 0', async () => {
        await expect(corri([])).resolves.toBe(0);
        expect(log.linee.error).toEqual([]);
    });
});

describe('--dry-run', () => {
    const eventi = [
        { tipo: 'movie', id: 27205, badge: 'ITA' },
        { tipo: 'tv', id: 1396, badge: null }
    ];

    test('non scarica, non scrive, non chiude: dice solo i nomi che scriverebbe', async () => {
        const coda = creaCoda(eventi);
        const fetchImpl = creaFetch({
            [urlFilm('ITA')]: risposta(JPEG),
            [`${BASE}/poster/tmdb:tv:1396.jpg`]: risposta(JPEG)
        });

        const codice = await corri(['--dry-run'], { coda, fetchImpl });

        expect(codice).toBe(0);
        expect(fetchImpl.richieste).toEqual([]);          // niente rete
        expect(filePresenti()).toEqual([]);              // niente scrittura
        expect(chiusiDi(coda)).toEqual({ done: [], fail: [] });   // la coda non si tocca

        // I nomi sono quelli veri, scritti a mano: se il dry-run dicesse `tmdb_movie_27205`
        // ci sarebbe un nome diverso da quello della rotta, e qui non si vedrebbe.
        const detto = log.linee.log.join('\n');
        expect(detto).toMatch(/tmdb-movie-27205-460b8042_ITA\.jpg/);
        expect(detto).toMatch(/tmdb-tv-1396-85723d99\.jpg/);
        expect(riepilogo()).toMatch(/dry-run: 2 da rifare/);
    });

    test('la cartella dei poster non viene nemmeno creata', async () => {
        const vuota = path.join(dir, 'non-esiste-ancora');
        const codice = await main(['--dry-run', '--out', vuota], { ERDB_LOCAL_BASE: BASE }, {
            coda: creaCoda(eventi), fetchImpl: creaFetch({}), store: null, redisClient: redis, log
        });
        expect(codice).toBe(0);
        expect(fs.existsSync(vuota)).toBe(false);
    });

    test('coda vuota: giro vuoto, codice 0, e lo dice', async () => {
        const codice = await corri(['--dry-run']);
        expect(codice).toBe(0);
        expect(log.linee.log.join('\n')).toMatch(/coda vuota/);
        // Con Redis su, "0 presi" vuol davvero dire coda vuota: nessun avviso in più.
        expect(riepilogo()).not.toMatch(/redis=1/);
    });

    test('Redis che cade DOPO l\'attesa: "0 presi" non è "coda vuota", e il riepilogo lo distingue', async () => {
        // Il client è pronto quando il giro parte (quindi l'attesta passa) e cade mentre il
        // giro legge la coda: è il caso che `take` risolve in lista vuota senza lanciare.
        const coda = spegneRedis(redis, []);
        const codice = await corri(['--dry-run'], { coda });
        expect(codice).toBe(0);
        expect(log.linee.warn.join('\n')).toMatch(/Redis non raggiungibile/);
        expect(riepilogo()).toMatch(/avvisi: redis=1/);
    });
});

describe('una corsa vera', () => {
    test('scrive il file e chiude l\'evento (con l\'evento, non con la chiave)', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const fetchImpl = creaFetch({ [urlFilm('ITA')]: risposta(JPEG) });

        const codice = await corri([], { coda, fetchImpl, store: creaStorePronto() });

        expect(codice).toBe(0);
        expect(filePresenti()).toEqual(['tmdb-movie-27205-460b8042_ITA.jpg']);
        expect(fs.readFileSync(path.join(dir, 'tmdb-movie-27205-460b8042_ITA.jpg')).equals(JPEG)).toBe(true);
        // La trappola: `done` con una stringa chiude niente, in silenzio.
        expect(chiusiDi(coda)).toEqual({ done: ['movie|27205'], fail: [] });
        expect(riepilogo()).toMatch(/1 presi, 1 resi, 0 falliti/);
    });

    test('un anime: due file (TMDB e Kitsu), un solo done', async () => {
        const coda = creaCoda([{ tipo: 'tv', id: 9876, badge: null }]);
        const store = creaStorePronto();
        const fetchImpl = creaFetch({
            [`${BASE}/poster/tmdb:tv:9876.jpg`]: risposta(JPEG),
            [`${BASE}/poster/kitsu:9999.jpg`]: risposta(JPEG)
        });

        const codice = await corri([], { coda, fetchImpl, store });

        expect(codice).toBe(0);
        expect(store.risolti).toEqual([{ id: '9876', tipo: 'tv' }]);
        expect(filePresenti()).toEqual(['kitsu-9999-b34654c4.jpg', 'tmdb-tv-9876-6ed4d894.jpg']);
        expect(chiusiDi(coda)).toEqual({ done: ['tv|9876'], fail: [] });
    });

    test('Redis chiuso con `quit`: senza, il processo resterebbe appeso e il timer no', async () => {
        await corri([]);
        expect(redis.quit).toHaveBeenCalledTimes(1);
        // E poi il taglio secco: `quit` è una richiesta e può non tornare mai su un client
        // disconnesso, e ioredis continua a riconnettare da solo.
        expect(redis.disconnect).toHaveBeenCalledTimes(1);
    });
});

describe('la mappa degli anime non pronta', () => {
    test('non viene dimenticata in silenzio: avviso una volta e conteggio nel riepilogo', async () => {
        const coda = creaCoda([{ tipo: 'tv', id: 9876, badge: null }]);
        const store = creaStoreNonPronto();
        const fetchImpl = creaFetch({ [`${BASE}/poster/tmdb:tv:9876.jpg`]: risposta(JPEG) });

        const codice = await corri([], { coda, fetchImpl, store });

        expect(codice).toBe(0);
        // Il lato TMDB si rifà comunque: un guasto della mappa non deve fermare il drenaggio.
        expect(filePresenti()).toEqual(['tmdb-tv-9876-6ed4d894.jpg']);
        // E l'avviso c'è, perché 8.263 poster dimenticati in silenzio è il guasto che
        // questo caso deve rendere impossibile.
        const avvisi = log.linee.warn.join('\n');
        expect(avvisi).toMatch(/NON è pronta \(store_non_pronto\)/);
        expect(avvisi).toMatch(/Kitsu/);
        expect(riepilogo()).toMatch(/mappa anime NON pronta \(store_non_pronto su 1 eventi/);
        // Il giro resta riuscito dal punto di vista TMDB: nessun fallimento inventato.
        expect(riepilogo()).toMatch(/1 presi, 1 resi, 0 falliti/);
    });

    test('la mappa si carica SOLO se nel lotto c\'è un id TMDB da mappare', async () => {
        const store = creaStoreNonPronto();

        // Lotto vuoto: un timer che si sveglia tra un diff e l'altro non deve scaricare
        // Anibridge e Fribb (qualche MB, secondi di rete) per non trovare niente.
        await corri([], { store });
        expect(store.init).not.toHaveBeenCalled();
        expect(log.linee.log.join('\n')).toMatch(/la mappa anime non serve/);

        // Lotto di eventi già in forma Kitsu: la mappa non serve lo stesso.
        store.init.mockClear();
        await corri([], {
            store,
            coda: creaCoda([{ tipo: 'tv', id: 'kitsu:265', badge: null }]),
            fetchImpl: creaFetch({ [`${BASE}/poster/kitsu:265.jpg`]: risposta(JPEG) })
        });
        expect(store.init).not.toHaveBeenCalled();
        expect(filePresenti()).toEqual(['kitsu-265-a4facb96.jpg']);

        // Lotto con un id TMDB: adesso sì, e viene detto se non è riuscita a caricarsi.
        store.init.mockClear();
        await corri([], {
            store,
            coda: creaCoda([{ tipo: 'movie', id: 27205, badge: null }]),
            fetchImpl: creaFetch({ [urlFilm(null)]: risposta(JPEG) })
        });
        expect(store.init).toHaveBeenCalledTimes(1);
    });

    test('l\'adattatore conta i motivi e restituisce solo l\'id (la forma che drena vuole)', () => {
        const stato = { chiamate: 0, storeNonPronto: 0, errori: 0, motivi: {} };
        const cercaKitsu = adattatoreKitsu({
            resolveKitsuDaTmdbId: (id) => {
                if (id === '111') return { kitsuId: '222', motivo: 'mappato', tmdbId: id };
                if (id === '222') return { kitsuId: null, motivo: 'anime_senza_kitsu', tmdbId: id };
                if (id === '333') return { kitsuId: null, motivo: 'store_non_pronto', tmdbId: id };
                throw new Error('store rotto');
            }
        }, stato, creaLog());

        expect(cercaKitsu('111', 'tv')).toBe('222');   // numero, non oggetto: `drena` lo prepende
        expect(cercaKitsu('222', 'tv')).toBeNull();     // "anime senza Kitsu" non è "non è un anime"
        expect(cercaKitsu('333', 'tv')).toBeNull();
        expect(cercaKitsu('444', 'tv')).toBeNull();     // uno store che lancia non ferma il giro
        expect(stato.motivi).toEqual({ anime_senza_kitsu: 1 });
        expect(stato.storeNonPronto).toBe(1);
        expect(stato.errori).toBe(1);
    });
});

describe('non lancia mai', () => {
    test('Redis giù (ogni comando lancia): codice 0, nessun crash, giro vuoto', async () => {
        const coda = {
            take: async () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); },
            done: async () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); },
            fail: async () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); }
        };

        await expect(corri([], { coda })).resolves.toBe(0);
        expect(log.linee.error).toEqual([]);            // non è un errore dello script
        expect(log.linee.warn.join('\n')).toMatch(/take fallito/);
        expect(riepilogo()).toMatch(/0 presi, 0 resi, 0 falliti/);
        expect(riepilogo()).toMatch(/avvisi: take=1/);
    });

    test('coda che ritorna lista vuota ma Redis non c\'è più: giro vuoto e avvisato', async () => {
        // Anche qui Redis era pronto all'avvio (l'attesa passa) e sparisce dopo: se invece
        // non fosse mai stato pronto, il giro verrebbe saltato prima del primo `take`.
        const coda = spegneRedis(redis, []);
        await expect(corri([], { coda })).resolves.toBe(0);
        expect(riepilogo()).toMatch(/0 presi, 0 resi, 0 falliti/);
        expect(riepilogo()).toMatch(/avvisi: redis=1/);
        expect(log.linee.warn.join('\n')).toMatch(/non perché la coda fosse vuota/);
    });

    test('chiusure che lanciano: i file restano scritti e il giro finisce', async () => {
        const coda = {
            take: async () => [{ tipo: 'movie', id: 27205, badge: null }],
            done: async () => { throw new Error('redis giù'); },
            fail: async () => { throw new Error('redis giù'); }
        };
        const fetchImpl = creaFetch({ [urlFilm(null)]: risposta(JPEG) });

        await expect(corri([], { coda, fetchImpl })).resolves.toBe(0);
        expect(filePresenti()).toEqual(['tmdb-movie-27205-9dd1156a.jpg']);
    });

    test('`quit` che lancia: il codice di uscita è lo stesso (0)', async () => {
        redis.quit = jest.fn(async () => { throw new Error('socket già chiuso'); });
        await expect(corri([])).resolves.toBe(0);
        expect(redis.disconnect).toHaveBeenCalledTimes(1);
    });

    test('`quit` che non torna mai: non tiene appeso il processo', async () => {
        redis.quit = jest.fn(() => new Promise(() => {}));   // appesa per sempre, come ioredis
        redis.disconnect = jest.fn();

        await expect(corri([])).resolves.toBe(0);
        expect(redis.disconnect).toHaveBeenCalledTimes(1);
    });

    test('ERDB giù (tutto 404): falliti, non crash, e i motivi sono aggregati', async () => {
        const coda = creaCoda([
            { tipo: 'movie', id: 1, badge: null },
            { tipo: 'movie', id: 2, badge: null },
            { tipo: 'movie', id: 3, badge: null }
        ]);

        await expect(corri([], { coda, fetchImpl: creaFetch({}) })).resolves.toBe(0);
        expect(filePresenti()).toEqual([]);
        // `fail` riceve l'evento: la coda lo ritenterà (e dopo 5 lo scarterà).
        expect(chiusiDi(coda)).toEqual({ done: [], fail: ['movie|1', 'movie|2', 'movie|3'] });
        // Tre righe identiche in journal, una voce sola nel riepilogo.
        expect(riepilogo()).toMatch(/3 presi, 0 resi, 3 falliti/);
        expect(riepilogo()).toMatch(/motivi: http_404=3/);
    });

    test('evento malformato: fail, gli altri del lotto non ci perdono', async () => {
        const coda = creaCoda([
            { tipo: 'film', id: 27205, badge: null },
            { tipo: 'movie', id: 1396, badge: null }
        ]);
        const fetchImpl = creaFetch({ [`${BASE}/poster/tmdb:movie:1396.jpg`]: risposta(JPEG) });

        await expect(corri([], { coda, fetchImpl })).resolves.toBe(0);
        expect(chiusiDi(coda)).toEqual({ done: ['movie|1396'], fail: ['film|27205'] });
        expect(riepilogo()).toMatch(/motivi: tipo_sconosciuto=1/);
    });

    test('timeout: l\'ERDB che non risponde non tiene il giro', async () => {
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: null }]);
        const fetchImpl = () => new Promise(() => {});   // appesa per sempre

        const codice = await main(['--timeout', '50'], { ERDB_LOCAL_BASE: BASE, ERDB_CACHE_DIR: dir }, {
            coda, fetchImpl, store: null, redisClient: redis, log
        });

        expect(codice).toBe(0);
        expect(chiusiDi(coda)).toEqual({ done: [], fail: ['movie|27205'] });
        expect(riepilogo()).toMatch(/motivi: timeout=1/);
    });
});

describe('il riepilogo', () => {
    test('i motivi sono aggregati, non un elenco di righe', () => {
        const riga = rigaRiepilogo({
            presi: 5, resi: 2, falliti: 3, daRifare: 0, dryRun: false,
            motivi: { http_404: 2, timeout: 1 },
            note: {},
            mappa: { chiamate: 0, storeNonPronto: 0, errori: 0, motivi: {} },
            outDir: '/data/erdb-cache'
        });
        expect(riga).toBe('[Drena] 5 presi, 2 resi, 3 falliti — motivi: http_404=2, timeout=1 — out=/data/erdb-cache');
        // Una riga sola: il journal di un timer deve stare in una schermata.
        expect(riga.split('\n')).toHaveLength(1);
    });

    test('la mappa non pronta ha la sua frase, anche a zero falliti', () => {
        const riga = rigaRiepilogo({
            presi: 2, resi: 2, falliti: 0, daRifare: 0, dryRun: false,
            motivi: {},
            note: {},
            mappa: { chiamate: 2, storeNonPronto: 2, errori: 0, motivi: {} },
            outDir: '/data/erdb-cache'
        });
        expect(riga).toMatch(/0 falliti/);
        expect(riga).toMatch(/mappa anime NON pronta \(store_non_pronto su 2 eventi: i poster Kitsu corrispondenti NON sono stati rifatti\)/);
    });

    test('gli avvisi del giro non si confondono con i motivi dei fallimenti', () => {
        // I motivi e gli avvisi vengono da due campi diversi di ciò che `drena` RESTITUISCE:
        // un guasto del giro (`take`, cartella, chiusura) non è un poster non rifatto, e nel
        // riepilogo devono stare in due voci diverse. Qui il conto è fatto a mano come fa
        // lo script, per vedere che le due liste non si mangiano.
        const riepilogo = {
            presi: 5, resi: 1, falliti: 4, daRifare: 0, dryRun: false,
            motivi: { http_404: 2, non_jpeg: 1, altro: 1 },
            note: { take: 1, chiusura: 2 },
            mappa: { chiamate: 0, storeNonPronto: 0, errori: 0, motivi: {} },
            outDir: '/data/erdb-cache'
        };
        const riga = rigaRiepilogo(riepilogo);

        expect(riga).toMatch(/motivi: http_404=2, altro=1, non_jpeg=1/);
        expect(riga).toMatch(/avvisi: chiusura=2, take=1/);
    });

    test('classificaMotivo: i motivi che contano sono distinguibili', () => {
        expect(classificaMotivo('richiesta fallita: timeout')).toBe('timeout');
        expect(classificaMotivo('HTTP 502 su http://x')).toBe('http_502');
        expect(classificaMotivo('la risposta non è un JPEG (12 byte, content-type text/html)')).toBe('non_jpeg');
        expect(classificaMotivo('richiesta fallita: fetch failed')).toBe('rete');
        expect(classificaMotivo('evento senza "id" (tipo: "movie")')).toBe('evento_malformato');
        expect(classificaMotivo('boh')).toBe('altro');
    });
});

describe('--help e gli errori di battitura', () => {
    test('--help esce 0 e spiega le opzioni', async () => {
        await expect(main(['--help'], {}, { log })).resolves.toBe(0);
        const detto = log.linee.log.join('\n');
        expect(detto).toMatch(/--base/);
        expect(detto).toMatch(/ERDB_LOCAL_BASE/);
        expect(detto).toMatch(/--dry-run/);
    });

    test('argomento sconosciuto: codice 1 (è un errore di battitura, non un guasto)', async () => {
        await expect(main(['--pippo'], { ERDB_LOCAL_BASE: BASE }, { log })).resolves.toBe(1);
        expect(log.linee.error.join('\n')).toMatch(/sconosciuto/);
        // E non è la corsa: la base c\'era, ma l\'errore è di sintassi.
        expect(redis.quit).not.toHaveBeenCalled();
    });
});

/** Le chiusure registrate dalla coda finta, per chiave `tipo|id`. */
function chiusiDi(coda) {
    return { done: coda.chiusi.done, fail: coda.chiusi.fail };
}
describe('la corsa all\'avvio: Redis non è pronto quando parte il giro', () => {
    /**
     * Client finto con la stessa forma del vero: `isAvailable` è una **getter** (non
     * un campo), perché è una getter anche in `redisClient.js` e la corsa è proprio lì.
     * Diventa pronto alla `n` interrogazione: prima no, poi sì, come un socket che si apre.
     */
    function clientCheProntoDopo(n) {
        const finto = { lette: 0, quit: jest.fn(async () => 'OK'), disconnect: jest.fn() };
        Object.defineProperty(finto, 'isAvailable', {
            get() { finto.lette += 1; return finto.lette >= n; }
        });
        return finto;
    }

    test('diventa pronto dopo N interrogazioni: il giro DRENA davvero', async () => {
        const finto = clientCheProntoDopo(3);
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const fetchImpl = creaFetch({ [urlFilm('ITA')]: risposta(JPEG) });

        const codice = await corri([], { coda, fetchImpl, redisClient: finto });

        expect(codice).toBe(0);
        // Il punto del compito: senza l'attesa questo giro avrebbe finito qui, con "0 presi".
        expect(finto.lette).toBeGreaterThanOrEqual(3);
        expect(coda.take).toBeDefined();
        expect(filePresenti()).toEqual(['tmdb-movie-27205-460b8042_ITA.jpg']);
        expect(chiusiDi(coda)).toEqual({ done: ['movie|27205'], fail: [] });
        expect(log.linee.warn.join('\n')).not.toMatch(/Redis NON pronto/);
    });

    test('non diventa MAI pronto: nessun take, nessuna scrittura, codice 0, e la riga che lo dice', async () => {
        const finto = { quit: jest.fn(async () => 'OK'), disconnect: jest.fn(), isAvailable: false };
        const coda = creaCoda([{ tipo: 'movie', id: 27205, badge: 'ITA' }]);
        const presa = jest.spyOn(coda, 'take');
        const fetchImpl = creaFetch({ [urlFilm('ITA')]: risposta(JPEG) });

        // Tetto corto: qui si testa la decisione, non la pazienza.
        const codice = await corri(['--attesa-redis', '250'], { coda, fetchImpl, redisClient: finto });

        expect(codice).toBe(0);              // il timer riproverà: non è un guasto da allarme
        expect(presa).not.toHaveBeenCalled(); // la coda non è stata guardata: questo è il punto
        expect(fetchImpl.richieste).toEqual([]);
        expect(filePresenti()).toEqual([]);
        expect(chiusiDi(coda)).toEqual({ done: [], fail: [] });

        // La riga che si legge da `journalctl`: deve dire che Redis non era pronto E che
        // non è una coda vuota. Una generica "coda vuota" qui è la bug, non il rimedio.
        const detto = log.linee.warn.join('\n');
        expect(detto).toMatch(/Redis NON pronto dopo 250 ms/);
        expect(detto).toMatch(/non è che la coda fosse vuota/);
        expect(detto).toMatch(/timer riproverà/);
        // E non si traveste da giro normale nella riga di riepilogo.
        expect(riepilogo()).toMatch(/giro saltato/);
        expect(riepilogo()).not.toMatch(/0 presi, 0 resi, 0 falliti/);
        // Il client va chiuso comunque: altrimenti il processo resta vivo sul socket.
        expect(finto.quit).toHaveBeenCalledTimes(1);
    });

    test('già pronto: nessuna attesa aggiuntiva (una sola interrogazione, nessuna dormita)', async () => {
        const finto = clientCheProntoDopo(1);
        const coda = creaCoda([]);

        const inizio = Date.now();
        await corri([], { coda, redisClient: finto });
        const durata = Date.now() - inizio;

        // Una domanda, una risposta, e via: nessun `setTimeout`, nessuna dormita.
        expect(finto.lette).toBeLessThanOrEqual(2);   // l'attesa + la nota di fine giro
        // Il passo è 100 ms: un giro normale che lo aspettasse si sentirebbe. Qui no.
        expect(durata).toBeLessThan(100);
        expect(log.linee.log.join('\n')).not.toMatch(/Redis non è ancora connesso/);
        // E l'attesa, guardata da vicino: una sola interrogazione, zero millisecondi.
        await expect(aspettaRedis(finto, { log })).resolves.toMatchObject({ pronto: true, interrogazioni: 1, attesaMs: 0 });
    });
});

/**
 * I MOTIVI VENGONO DALL'ELENCO, NON DAL LOG.
 *
 * Prima lo script contava i motivi **leggendo la riga di log** che `drenaPoster` scriveva e
 * riconoscendoci dentro il motivo: funzionava, degradava in `altro` se il testo cambiava, ma
 * legava due file a una frase. Qui si prova che il riepilogo guarda `drena.fallimenti`: si
 * passa un `drena` finto che restituisce motivi noti (e che non scrive righe di log utili), e si
 * verifica che il riepilogo li conti — quindi il test non dipende da nessuna riga di journal.
 */
describe('i motivi si contano su `drena.fallimenti`', () => {
    /** Un `drena` finto: restituisce i fallimenti che vuole e non sa niente di log. */
    const drenaFinto = (riepilogo, { righeDiLog = [] } = {}) => jest.fn(async (opzioni) => {
        for (const riga of righeDiLog) opzioni.log.warn(riga);
        return riepilogo;
    });

    test('un giro vero: 404 e non-JPEG insieme, due motivi separati nel riepilogo', async () => {
        const coda = creaCoda([
            { tipo: 'movie', id: 1, badge: null },      // 404: l'istanza non ce l'ha
            { tipo: 'tv', id: 1396, badge: null },       // dice JPEG, è WebP
            { tipo: 'movie', id: 27205, badge: 'ITA' }   // questo va a buon fine
        ]);
        const fetchImpl = async (url) => {
            if (url.includes('tmdb:tv:1396')) return risposta(WEBP, { ok: true, status: 200 });
            if (url.includes('tmdb:movie:1')) return risposta(Buffer.alloc(0), { ok: false, status: 404 });
            return risposta(JPEG);
        };

        await expect(corri([], { coda, fetchImpl })).resolves.toBe(0);

        expect(riepilogo()).toMatch(/3 presi, 1 resi, 2 falliti/);
        expect(riepilogo()).toMatch(/motivi: http_404=1, non_jpeg=1/);
        expect(chiusiDi(coda)).toEqual({ done: ['movie|27205'], fail: ['movie|1', 'tv|1396'] });
    });

    test('un `drena` finto: il riepilogo conta i motivi che riceve, non quelli che logga', async () => {
        // Motivi che nessun testo di log potrebbe produrre: se qui il riepilogo li dicesse,
        // significherebbe che sta ancora leggendo il journal.
        const drenaImpl = drenaFinto({
            presi: 4,
            resi: 1,
            falliti: 3,
            fallimenti: [
                { tipo: 'movie', id: 1, erdbId: 'tmdb:movie:1', motivo: 'http_404', dettaglio: 'HTTP 404 su http://x' },
                { tipo: 'movie', id: 2, erdbId: 'tmdb:movie:2', motivo: 'http_404', dettaglio: 'HTTP 404 su http://x' },
                { tipo: 'tv', id: 3, erdbId: 'tmdb:tv:3', motivo: 'non_jpeg', dettaglio: 'la risposta non è un JPEG (12 byte)' }
            ],
            note: { take: 0, cartella: 0, chiusura: 1 }
        }, {
            // Righe che, se qualcuno le leggesse, darebbero altri motivi: qui non contano.
            righeDiLog: ['[DrenaPoster] fallito movie:1: timeout dopo 20000 ms su http://x']
        });

        const stato = await gira({
            coda: creaCoda([{ tipo: 'movie', id: 1, badge: null }]),
            fetchImpl: creaFetch({}),
            store: null,
            drenaImpl,
            redis,
            log,
            base: BASE,
            outDir: dir,
            batch: 10
        });
        const riga = rigaRiepilogo(stato);

        expect(riga).toMatch(/4 presi, 1 resi, 3 falliti/);
        expect(riga).toMatch(/motivi: http_404=2, non_jpeg=1/);
        expect(riga).not.toMatch(/timeout/);          // la riga di log non conta più
        expect(riga).toMatch(/avvisi: chiusura=1/);   // le note arrivano dal riepilogo del giro
        expect(drenaImpl).toHaveBeenCalledTimes(1);
    });

    test('un motivo nuovo che nessuno conosce passa nel riepilogo com\'è', async () => {
        const drenaImpl = drenaFinto({
            presi: 2, resi: 1, falliti: 1,
            fallimenti: [{ tipo: 'movie', id: 1, erdbId: 'tmdb:movie:1', motivo: 'vortice_di_erp', dettaglio: 'boh' }],
            note: { take: 0, cartella: 0, chiusura: 0 }
        });

        const stato = await gira({
            coda: creaCoda([]), fetchImpl: creaFetch({}), store: null,
            drenaImpl, redis, log, base: BASE, outDir: dir
        });

        // Nessuna lista chiusa di motivi: un guasto nuovo si racconta, non sparisce in `altro`.
        expect(rigaRiepilogo(stato)).toMatch(/motivi: vortice_di_erp=1/);
    });

    test('nessuna lista di fallimenti: il riepilogo resta lo stesso (e non inventa motivi)', async () => {
        const drenaImpl = drenaFinto({ presi: 3, resi: 3, falliti: 0 });

        const stato = await gira({
            coda: creaCoda([]), fetchImpl: creaFetch({}), store: null,
            drenaImpl, redis, log, base: BASE, outDir: dir
        });

        const riga = rigaRiepilogo(stato);
        expect(riga).toMatch(/3 presi, 3 resi, 0 falliti/);
        expect(riga).not.toMatch(/motivi:/);
    });
});
