/**
 * tests/staticPostersCoda.test.js
 *
 * Quando la rotta `/erdb-poster/:file` non riesce a farsi rendere il file, l'evento va
 * in coda (`src/cache/codaEventi.js`) perché il drenatore lo renda più tardi con i suoi
 * 20 s: il tetto di 5 s della rotta è più corto del render a freddo di un anime
 * (8,6-11,8 s misurati, ticket 10 di poster-erdb) e senza la push quel poster resterebbe
 * un 404 per sempre — il file che nessuno produce e nessuno chiede.
 *
 * Il contratto qui è fatto di tre cose che devono stare insieme:
 * - **la risposta non cambia**: 404 come oggi, stessa `Cache-Control`, stesso corpo, e
 *   l'utente non aspetta un millisecondo in più (la push è lanciata e dimenticata);
 * - **l'evento è quello giusto**: `{tipo, id, badge}` come li accetta la coda, ricavati
 *   dal nome file, e senza campi inventati;
 * - **un guasto della coda resta un guasto della coda**: 404 lo stesso, nessuna
 *   eccezione che esce dalla rotta e nessuna `unhandledRejection` che uccide il processo.
 *
 * La coda è sostituita con `jest.mock`: qui si verifica CHE si chiama e con che, non come
 * funziona Redis (quello è `tests/codaEventi.test.js`). L'istanza ERDB è un server HTTP
 * vero su porta effimera, come negli altri test del repo: il timeout si misura sul
 * davvero, non con un orologio finto.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

// La coda è l'unica cosa che qui si osserva: un mock con una `push` che il test comanda.
jest.mock('../src/cache/codaEventi', () => ({ push: jest.fn() }));

const registerStaticPostersRoute = require('../src/api/staticPosters');
const coda = require('../src/cache/codaEventi');

const JPEG_RISPOSTA = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x42, 0x01]);

// Il 404 di oggi, scritto qui perché sia la risposta che i test confrontano: se un giorno
// la rotta cambiasse corpo o cache-control, questi test diventerebbero rossi e la
// domanda ("era previsto?") avrebbe una risposta. Non è una tautologia: la stringa è
// scritta a mano, non presa dal modulo.
const CORPO_404 = '{"error":"Poster non trovato"}';
const CACHE_404 = 'public, max-age=300';

let server;         // l'app Express
let erdbServer;     // l'istanza ERDB finta
let erdbBase;
let rootDir;
let cacheDir;
let modo;           // impostato da ogni test: che cosa fa l'istanza finta
let richiesteErdb;  // [url], in ordine di arrivo
const rejectioniNonGestite = [];   // `unhandledRejection` viste durante i test

/** Il listener è una funzione nominata: `removeListener` con una arrow anonima non la toglierebbe. */
const notaUnhandledRejection = (motivo) => { rejectioniNonGestite.push(motivo); };

const previousCacheDir = process.env.ERDB_CACHE_DIR;

const request = (urlPath) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${server.address().port}${urlPath}`, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
        }));
    }).on('error', reject);
});

/** Quello che l'istanza finta risponde, secondo il `modo` del test. */
const rispostaPerIlModo = () => {
    switch (modo) {
        case 'jpeg': return { status: 200, body: JPEG_RISPOSTA, contentType: 'image/jpeg' };
        case 'non-jpeg': return { status: 200, body: Buffer.from('<html>errore</html>'), contentType: 'text/html' };
        case 'mute': return null;   // connessione aperta, nessuna risposta: scade il tetto di 5 s
        case '404': default: return { status: 404, body: Buffer.from('non c\'e'), contentType: 'text/plain' };
    }
};

beforeAll(async () => {
    // Le `unhandledRejection` sono l'unico posto in cui una push "dimenticata" si fa
    // notare: nel processo vero ucciderebbero l'app. Qui vengono raccolte e controllate.
    process.on('unhandledRejection', notaUnhandledRejection);

    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-static-posters-coda-'));
    cacheDir = path.join(rootDir, 'erdb-cache');
    fs.mkdirSync(cacheDir);
    process.env.ERDB_CACHE_DIR = cacheDir;

    erdbServer = http.createServer((req, res) => {
        richiesteErdb.push({ url: req.url });
        const r = rispostaPerIlModo();
        if (!r) return;   // 'mute': socket tenuto aperto e nessuna risposta, mai
        res.writeHead(r.status, { 'Content-Type': r.contentType });
        res.end(r.body);
    });
    await new Promise((resolve) => erdbServer.listen(0, '127.0.0.1', resolve));
    erdbBase = `http://127.0.0.1:${erdbServer.address().port}/Tk-token-di-prova`;

    const app = express();
    registerStaticPostersRoute(app);
    server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
});

afterAll(async () => {
    delete process.env.ERDB_LOCAL_BASE;
    if (server) await new Promise((resolve) => server.close(resolve));
    // Le connessioni del caso 'mute' sono ancora aperte: senza questo `close` non finirebbe.
    if (erdbServer && typeof erdbServer.closeAllConnections === 'function') erdbServer.closeAllConnections();
    if (erdbServer) await new Promise((resolve) => erdbServer.close(resolve));
    if (previousCacheDir === undefined) delete process.env.ERDB_CACHE_DIR;
    else process.env.ERDB_CACHE_DIR = previousCacheDir;
    if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
    process.removeListener('unhandledRejection', notaUnhandledRejection);
});

beforeEach(() => {
    richiesteErdb = [];
    modo = '404';
    coda.push.mockReset();
    coda.push.mockResolvedValue(true);   // coda sana, per default
    process.env.ERDB_CACHE_DIR = cacheDir;
});

afterEach(() => {
    delete process.env.ERDB_LOCAL_BASE;
    jest.restoreAllMocks();
});

const fileEsiste = (nome) => fs.existsSync(path.join(cacheDir, nome));
const nomiInCartella = () => fs.readdirSync(cacheDir);

/** Il 404 di oggi, verificato per intero: stato, cache-control e corpo. */
const attendeIl404DiOggi = (res) => {
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe(CACHE_404);
    expect(res.body.toString()).toBe(CORPO_404);
};

/**
 * Il caso vero del ticket: ERDB accetta la connessione e non risponde entro i 5 s della
 * rotta (il drenatore avrebbe i suoi 20 s e ce la farebbe). La risposta è il 404 di
 * sempre e l'evento è in coda.
 */
test('istanza che non risponde entro il tetto: 404 come oggi E l\'evento in coda', async () => {
    modo = 'mute';
    process.env.ERDB_LOCAL_BASE = erdbBase;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const nome = 'tmdb-movie-823_ITA.jpg';
    expect(fileEsiste(nome)).toBe(false);

    const inizio = Date.now();
    const res = await request(`/erdb-poster/${nome}`);
    const trascorso = Date.now() - inizio;

    // 1. La risposta è IDENTICA a quella di oggi.
    attendeIl404DiOggi(res);

    // 2. E non è costata più di adesso: il tetto è 5 s e non è stato alzato.
    expect(trascorso).toBeGreaterThanOrEqual(4800);
    expect(trascorso).toBeLessThan(15000);

    // 3. L'evento è in coda, con la forma che la coda accetta: tipo, id e badge letti
    //    dal nome file (non inventati), e nient'altro.
    expect(coda.push).toHaveBeenCalledTimes(1);
    expect(coda.push).toHaveBeenCalledWith({ tipo: 'movie', id: '823', badge: 'ITA' });
    expect(Object.keys(coda.push.mock.calls[0][0]).sort()).toEqual(['badge', 'id', 'tipo']);

    // 3b. E il drenatore, da quell'evento, ricava proprio il file che la rotta chiede:
    //     un evento che rifà un file diverso produrrebbe un poster che nessuno chiede.
    const { nomeFileDaEvento } = require('../src/cache/posterDaEvento');
    expect(nomeFileDaEvento(coda.push.mock.calls[0][0])).toBe(nome);

    // 4. Niente in cartella, nemmeno mezzo file: la rotta non ha scritto niente.
    expect(fileEsiste(nome)).toBe(false);
    expect(nomiInCartella().filter((n) => n.includes(nome))).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timeout dopo 5000 ms'));
}, 30000);

/** La push non aspetta: il 404 parte senza aspettare la coda (che può essere lenta). */
test('la push non fa aspettare la risposta: 404 subito, evento in coda dopo', async () => {
    modo = '404';
    process.env.ERDB_LOCAL_BASE = erdbBase;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Coda lenta di proposito: se la rotta la aspettasse, la risposta tarderebbe con lei.
    let libera;
    const inCoda = new Promise((resolve) => { libera = resolve; });
    coda.push.mockImplementation(() => inCoda);

    const nome = 'tmdb-tv-1396.jpg';
    const inizio = Date.now();
    const res = await request(`/erdb-poster/${nome}`);
    const trascorso = Date.now() - inizio;

    attendeIl404DiOggi(res);
    expect(trascorso).toBeLessThan(4000);        // niente attesa della coda
    expect(coda.push).toHaveBeenCalledWith({ tipo: 'tv', id: '1396', badge: null });
    libera(true);                                 // la coda si libera DOPO la risposta
    await inCoda;
});

/** Un guasto della coda resta un guasto della coda: 404 identico, nessuna eccezione fuori. */
test('coda che solleva (sincrono o come promessa): 404 lo stesso e nulla esce dalla rotta', async () => {
    modo = '404';
    process.env.ERDB_LOCAL_BASE = erdbBase;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rejectioniPrima = rejectioniNonGestite.length;

    // Le due forme di guasto: `throw` dentro la `push`, e promessa rifiutata.
    coda.push.mockImplementation(() => { throw new Error('Redis giù: hsetnx non c\'è'); });
    let res = await request('/erdb-poster/tmdb-movie-27210.jpg');
    attendeIl404DiOggi(res);

    coda.push.mockImplementation(() => Promise.reject(new Error('push di movie|27210 fallito')));
    res = await request('/erdb-poster/tmdb-movie-27211.jpg');
    attendeIl404DiOggi(res);

    // Il guasto è detto (non è silenzioso), ma non è un errore della rotta.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Redis giù'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('non accodato'));

    // E soprattutto: nessuna `unhandledRejection` — nel processo vero ucciderebbe l'app.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(rejectioniNonGestite.slice(rejectioniPrima)).toEqual([]);
}, 30000);

/** Il caso normale: se il file c'è, in coda non ci va niente (l'evento sarebbe spazzatura). */
test('istanza che risponde un JPEG: 200 e NESSUN evento in coda', async () => {
    modo = 'jpeg';
    process.env.ERDB_LOCAL_BASE = erdbBase;

    const nome = 'tmdb-movie-27212_ITA.jpg';
    const res = await request(`/erdb-poster/${nome}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.body.equals(JPEG_RISPOSTA)).toBe(true);
    expect(fileEsiste(nome)).toBe(true);

    expect(richiesteErdb.length).toBe(1);
    expect(richiesteErdb[0].url).toBe('/Tk-token-di-prova/poster/tmdb:movie:27212.jpg?badge=ITA');
    expect(coda.push).not.toHaveBeenCalled();

    fs.rmSync(path.join(cacheDir, nome));
});

test('file già in cartella: 200 dalla cartella e nessun evento in coda (l\'istanza non si disturba)', async () => {
    modo = 'jpeg';
    process.env.ERDB_LOCAL_BASE = erdbBase;

    const nome = 'tmdb-movie-27213.jpg';
    fs.writeFileSync(path.join(cacheDir, nome), JPEG_RISPOSTA);

    const res = await request(`/erdb-poster/${nome}`);
    expect(res.status).toBe(200);
    expect(richiesteErdb.length).toBe(0);
    expect(coda.push).not.toHaveBeenCalled();

    fs.rmSync(path.join(cacheDir, nome));
});

/** Il render è partito e ha risposto, ma non è un JPEG: stesso 404, stesso evento in coda. */
test('risposta che non è un JPEG: 404 come oggi e l\'evento in coda', async () => {
    modo = 'non-jpeg';
    process.env.ERDB_LOCAL_BASE = erdbBase;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const nome = 'kitsu-265_ITA.jpg';
    const res = await request(`/erdb-poster/${nome}`);

    attendeIl404DiOggi(res);
    expect(fileEsiste(nome)).toBe(false);
    // L'id Kitsu viaggia già in forma ERDB: è l'unica che il drenatore rifà in un
    // `kitsu-*.jpg` senza dipendere dalla mappa.
    expect(coda.push).toHaveBeenCalledWith({ tipo: 'kitsu', id: 'kitsu:265', badge: 'ITA' });
});

/** ERDB dice 404 per quell'id: è un render fallito come gli altri, quindi l'evento entra. */
test('istanza che risponde 404: 404 come oggi e l\'evento in coda (il drenatore ha 20 s)', async () => {
    modo = '404';
    process.env.ERDB_LOCAL_BASE = erdbBase;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const nome = 'tmdb-movie-27214.jpg';
    const res = await request(`/erdb-poster/${nome}`);

    attendeIl404DiOggi(res);
    expect(fileEsiste(nome)).toBe(false);
    expect(coda.push).toHaveBeenCalledWith({ tipo: 'movie', id: '27214', badge: null });
});

/** Niente da accodare: non è mancato un render, è mancata la configurazione. */
test('senza ERDB_LOCAL_BASE: 404 e nessun evento (non c\'è nessuna richiesta fallita)', async () => {
    delete process.env.ERDB_LOCAL_BASE;

    const res = await request('/erdb-poster/tmdb-movie-27215_ITA.jpg');
    attendeIl404DiOggi(res);
    expect(richiesteErdb.length).toBe(0);
    expect(coda.push).not.toHaveBeenCalled();
});

test('un nome che non è una forma nota: nessun id inventato, quindi nessun evento', async () => {
    modo = 'jpeg';
    process.env.ERDB_LOCAL_BASE = erdbBase;

    for (const nome of ['poster.jpg', 'anime-265.jpg', 'tmdb-movie-abc.jpg', 'tmdb-movie-27216_ENG.jpg']) {
        const res = await request(`/erdb-poster/${nome}`);
        expect(res.status).toBe(404);
    }
    expect(richiesteErdb.length).toBe(0);
    expect(coda.push).not.toHaveBeenCalled();
});

/** Lo stesso nome chiesto due volte: due `push`, e a deduplicare è la coda (`tipo|id`). */
test('due richieste sullo stesso file mancante: due push, una sola riga da mettere in coda', async () => {
    modo = '404';
    process.env.ERDB_LOCAL_BASE = erdbBase;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // La coda è quella vera in questo aspetto: `push` risponde `true` la prima volta e
    // `false` (era già in attesa) la seconda. La rotta non deve fare niente di più.
    coda.push.mockResolvedValueOnce(true).mockResolvedValue(false);

    const nome = 'tmdb-movie-823_ITA.jpg';
    for (let i = 0; i < 2; i++) {
        const res = await request(`/erdb-poster/${nome}`);
        attendeIl404DiOggi(res);
    }
    expect(coda.push).toHaveBeenCalledTimes(2);
    expect(coda.push).toHaveBeenNthCalledWith(1, { tipo: 'movie', id: '823', badge: 'ITA' });
    expect(coda.push).toHaveBeenNthCalledWith(2, { tipo: 'movie', id: '823', badge: 'ITA' });
});