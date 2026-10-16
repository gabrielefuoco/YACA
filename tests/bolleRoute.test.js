/**
 * LA ROTTA DEL GRAFO — le prove.
 *
 * Come dice `staticPosters.test.js`: nel progetto non c'e' supertest, quindi si avvia un **server vero**
 * su una porta effimera e si interroga con `http`. Cosi' si verifica la rotta (autenticazione, corpo,
 * stato) e non un handler chiamato a mano, dove il cablaggio non si vede.
 *
 * Il modello `WatchHistory` e' mockato: la rotta e' una LETTURA, e quello che va provato e' il
 * collegamento — sessione, query, risposta — non Mongoose.
 */
const http = require('http');
const express = require('express');

// IL SEGRETO JWT VA FISSATO, e la ragione sta nel prodotto stesso: senza `JWT_SECRET` configurato,
// `getJwtSecret()` genera un segreto CASUALE e lo tiene in memoria (lo dice con un `console.warn`).
// Quindi in un test il token firmato e quello verificato dalla rotta sono due segreti diversi, e la
// rotta risponde 401 — che e' esattamente quello che e' successo al primo giro di questi test.
// Non e' un difetto del prodotto: e' il comportamento documentato quando manca la configurazione.
const _jwtPrima = process.env.JWT_SECRET;
process.env.JWT_SECRET = _jwtPrima || "segreto-di-prova-per-i-test";

jest.mock('../src/models/WatchHistory', () => ({
    find: jest.fn(),
}));

const WatchHistory = require('../src/models/WatchHistory');
const rotteBolle = require('../src/api/bolle');

function fakeFind(voci) {
    // imita la catena `.sort().limit().lean()` del Mongoose
    const catena = {
        sort: () => catena, limit: () => catena, lean: async () => voci,
    };
    WatchHistory.find.mockReturnValue(catena);
}

let server; let base; let cookies = '';

function chiama(corpo, conCookie = true) {
    return new Promise((resolve) => {
        const dati = Buffer.from(JSON.stringify(corpo || {}));
        const req = http.request({
            host: '127.0.0.1', port: base.port, path: '/api/bolle', method: 'POST',
            headers: {
                'content-type': 'application/json', 'content-length': dati.length,
                ...(conCookie ? { cookie: cookies } : {}),
            },
        }, (res) => {
            let t = '';
            res.on('data', (c) => { t += c; });
            res.on('end', () => resolve({ stato: res.statusCode, corpo: JSON.parse(t || '{}') }));
        });
        req.end(dati);
    });
}

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        // il parser dei cookie, in due righe: il valore VERO, non un segnaposto
        req.cookies = {};
        for (const pezzo of String(req.headers.cookie || "").split(";")) {
            const [k, ...v] = pezzo.trim().split("=");
            if (k) req.cookies[k] = v.join("=");
        }
        next();
    });
    app.use('/api', rotteBolle);
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = { port: server.address().port };
    // il jwt e' verificato dalla rotta: qui si firma un token vero con il segreto del progetto
    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../src/api/auth/index');
    cookies = `yaca_session=${jwt.sign({ userId: 'utente-di-prova' }, getJwtSecret())}`;
});

afterAll(async () => {
    await new Promise((r) => server.close(r));
    // igiene: si rimette l ambiente com era. `process.env` e condiviso fra i file di test nello
    // stesso worker, e lasciare un JWT_SECRET impostato cambierebbe il comportamento di chi lo legge.
    if (_jwtPrima === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = _jwtPrima;
});

const VOCI = [
    { tmdbId: 314, type: 'tv', episodesWatched: 172, signals: [{ type: 'loved' }] },
    { tmdbId: 1396, type: 'tv', episodesWatched: 214, signals: [{ type: 'watched' }] },
    { tmdbId: 603, type: 'movie', signals: [{ type: 'liked' }] },
];

test('senza sessione risponde 401 e non legge niente', async () => {
    fakeFind(VOCI);
    const r = await chiama({}, false);
    expect(r.stato).toBe(401);
    expect(r.corpo.ok).toBe(false);
    expect(WatchHistory.find).not.toHaveBeenCalled();
});

test('con la sessione legge la storia del PROFILO e restituisce le liste', async () => {
    fakeFind(VOCI);
    const r = await chiama({ profileId: 'global', quante: 3 });
    expect(r.stato).toBe(200);
    expect(r.corpo.ok).toBe(true);
    expect(r.corpo.liste.map((l) => l.tipo)).toEqual([
        'il_tuo_mondo', 'un_passo_fuori', 'uscite_nuove', 'nicchia_di_qualita',
    ]);
    expect(r.corpo.items.length).toBeGreaterThan(0);
    // l'ordine delle liste non e' un vezzo: il tuo mondo 12,81% per slot, la nicchia 4,31%
    expect(r.corpo.liste[3].debole).toBe(true);
    // e la query e' quella del prodotto: owner dal token, context dal profilo
    expect(WatchHistory.find).toHaveBeenCalledWith({ owner: 'utente-di-prova', context: 'global' });
});

test('senza profileId si usa «global», che e il contesto di default del prodotto', async () => {
    fakeFind(VOCI);
    await chiama({});
    expect(WatchHistory.find).toHaveBeenCalledWith({ owner: 'utente-di-prova', context: 'global' });
});

test('una cronologia vuota risponde 200 con liste vuote, non con un errore', async () => {
    fakeFind([]);
    const r = await chiama({ quante: 3 });
    expect(r.stato).toBe(200);
    expect(r.corpo.liste).toEqual([]);
    expect(r.corpo.items).toEqual([]);
    expect(r.corpo.quanti_voci).toBe(0);
});

test('il motore non conosce il catalogo, quindi dice cosa escludere', async () => {
    fakeFind(VOCI);
    const r = await chiama({ quante: 3 });
    expect(r.corpo.esclusi).toEqual(['tv:314', 'tv:1396', 'movie:603']);
    expect(r.corpo.versioni.artefatto).toBeTruthy();
});

test('un errore del database non diventa un 500 con dentro il messaggio interno', async () => {
    WatchHistory.find.mockImplementation(() => { throw new Error('mongo giu: dettaglio interno'); });
    const r = await chiama({});
    expect(r.stato).toBe(500);
    expect(JSON.stringify(r.corpo)).not.toContain('dettaglio interno');
});
