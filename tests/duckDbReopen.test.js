/**
 * La riapertura del database dopo lo scambio del daemon (`_reopenDueToSwap`).
 *
 * Il guasto vero, visto in produzione il 27/11/2026: il daemon scambia `catalog.duckdb`, l'app
 * prova a riaprirlo mentre il file è ancora occupato, e — siccome chiudeva il vecchio handle
 * PRIMA di aprire il nuovo — restava con `con = null`. Da lì ogni catalogo a filtri rispondeva
 * vuoto (`Cannot read properties of null (reading 'all')`), mentre la ricerca per testo continuava
 * a funzionare: servito vuoto, non rotto, per 45 minuti.
 *
 * Contratti difesi qui:
 *   1. se la riapertura fallisce, il vecchio handle RESTA (il database non si spegne);
 *   2. se riesce, il nuovo subentra e solo dopo si chiude il vecchio;
 *   3. senza connessione, la prima richiesta successiva prova a riconnettersi (con divieto breve).
 */

// Il costruttore tocca il filesystem per scegliere il percorso di default: si punta a una
// cartella temporanea così il test non dipende dalla macchina.
const path = require('path');
const os = require('os');

process.env.TMDB_DUMP_DIR = process.env.TMDB_DUMP_DIR || path.join(os.tmpdir(), 'yaca-reopen-test');

const { DuckDbStore } = require('../src/indice/duckDbStore');

function store() {
    const s = new DuckDbStore({ basePath: '/tmp/yaca-finto', dbPath: '/tmp/yaca-finto/catalog.duckdb' });
    s.isInitialized = true;
    s.con = { nome: 'vecchia-connessione' };
    s.db = { nome: 'vecchio-db' };
    s._closeCon = jest.fn(async () => {});
    s._closeDb = jest.fn(async () => {});
    return s;
}

describe('_reopenDueToSwap: il database non si spegne per un lock conteso', () => {
    test('riapertura fallita ⇒ il vecchio handle resta al suo posto e non viene chiuso', async () => {
        const s = store();
        const vecchioCon = s.con;
        s._openPersistentWithRetry = jest.fn(async () => ({ success: false, error: new Error('Conflicting lock') }));

        const sostituito = await s._reopenDueToSwap();

        expect(sostituito).toBe(false);
        expect(s.con).toBe(vecchioCon);
        expect(s.db).toEqual({ nome: 'vecchio-db' });
        expect(s._closeCon).not.toHaveBeenCalled();
    });

    test('riapertura riuscita ⇒ subentra il nuovo, poi si chiude il vecchio', async () => {
        const s = store();
        const vecchioCon = s.con;
        const vecchioDb = s.db;
        const nuovoCon = { nome: 'nuova-connessione' };
        const nuovoDb = { nome: 'nuovo-db' };
        s._openPersistentWithRetry = jest.fn(async () => ({ success: true, db: nuovoDb, con: nuovoCon }));

        const sostituito = await s._reopenDueToSwap();

        expect(sostituito).toBe(true);
        expect(s.con).toBe(nuovoCon);
        expect(s.db).toBe(nuovoDb);
        expect(s._closeCon).toHaveBeenCalledWith(vecchioCon);
        expect(s._closeDb).toHaveBeenCalledWith(vecchioDb);
    });

    test('il vecchio handle si chiude DOPO che il nuovo è pronto (l\'ordine è il contratto)', async () => {
        const s = store();
        const ordine = [];
        s._openPersistentWithRetry = jest.fn(async () => {
            ordine.push('apri');
            return { success: true, db: {}, con: {} };
        });
        s._closeCon = jest.fn(async () => { ordine.push('chiudi-vecchia'); });
        s._closeDb = jest.fn(async () => { ordine.push('chiudi-vecchio'); });

        await s._reopenDueToSwap();

        expect(ordine).toEqual(['apri', 'chiudi-vecchia', 'chiudi-vecchio']);
    });
});

describe('ensureFreshHandle: senza connessione si prova a tornare', () => {
    test('con === null ⇒ tenta la riapertura e la installa', async () => {
        const s = store();
        s.con = null;
        s.db = null;
        const nuovoCon = { nome: 'riconnessa' };
        s._openPersistentWithRetry = jest.fn(async () => ({ success: true, db: {}, con: nuovoCon }));
        s._recordFileIdentity = jest.fn();

        await s.ensureFreshHandle(true);

        expect(s._openPersistentWithRetry).toHaveBeenCalled();
        expect(s.con).toBe(nuovoCon);
    });

    test('se la riapertura fallisce non solleva, e non riprova a ogni singola richiesta', async () => {
        const s = store();
        s.con = null;
        s.db = null;
        s._openPersistentWithRetry = jest.fn(async () => ({ success: false, error: new Error('lock') }));

        await expect(s.ensureFreshHandle(true)).resolves.toBeUndefined();
        await s.ensureFreshHandle(true);
        await s.ensureFreshHandle(true);

        // Un tentativo, poi il divieto: senza, ogni query aspetterebbe i retry del lock.
        expect(s._openPersistentWithRetry).toHaveBeenCalledTimes(1);
    });
});
