/**
 * La cache e il caso "risposta vuota" (ticket 16, generalizzato).
 *
 * Un risultato vuoto è quasi sempre un guasto transitorio (fonte esterna giù, DuckDB non ancora caldo,
 * token scaduto). Memorizzarlo col TTL normale congela il guasto — e siccome ogni richiesta lo riscrive,
 * la cache resta vuota anche dopo il ritorno dei dati. Misurato in produzione: 19 cataloghi vuoti in
 * cache, con TTL fino a 14 giorni.
 *
 * Regola: vuoto ⇒ TTL corto (60 s), non zero. La fonte si ritenta, ma non a ogni richiesta.
 */
const CacheManager = require('../src/cache/CacheManager');

function managerDiProva() {
    const cm = new CacheManager('test-vuoto', { ramMax: 10, ramTtlMs: 60000, redisTtlMs: 60000 });
    const store = new Map();
    cm.getWithStatus = async (key) => (store.has(key)
        ? { value: store.get(key), status: 'fresh' }
        : { value: undefined, status: 'miss' });
    cm.set = jest.fn(async (key, value) => { store.set(key, value); });
    return cm;
}

const TTL_NORMALE = 14 * 24 * 60 * 60 * 1000; // il default dei cataloghi

describe('CacheManager.getOrFetch + payload vuoto', () => {
    test('metas vuoto => TTL corto (60s), non il TTL del catalogo', async () => {
        const cm = managerDiProva();
        await cm.getOrFetch('c1', async () => ({ metas: [] }), TTL_NORMALE);
        expect(cm.set).toHaveBeenCalledTimes(1);
        expect(cm.set.mock.calls[0][2]).toBe(60 * 1000);
    });

    test('scaffali vuoti => TTL corto', async () => {
        const cm = managerDiProva();
        await cm.getOrFetch('c2', async () => ({ ok: true, scaffali: [] }), TTL_NORMALE);
        expect(cm.set.mock.calls[0][2]).toBe(60 * 1000);
    });

    test('metas piene => TTL normale', async () => {
        const cm = managerDiProva();
        await cm.getOrFetch('c3', async () => ({ metas: [{ id: 'tmdb:1' }] }), TTL_NORMALE);
        expect(cm.set.mock.calls[0][2]).toBe(TTL_NORMALE);
    });

    test('payload non-lista (es. oggetto singolo) => TTL normale, non lo si scambia per vuoto', async () => {
        const cm = managerDiProva();
        await cm.getOrFetch('c4', async () => ({ id: 'tmdb:1', name: 'X' }), TTL_NORMALE);
        expect(cm.set.mock.calls[0][2]).toBe(TTL_NORMALE);
    });

    test('il vuoto resta in cache breve: la seconda richiesta non ricostruisce subito', async () => {
        const cm = managerDiProva();
        const fetchFn = jest.fn(async () => ({ metas: [] }));
        await cm.getOrFetch('c5', fetchFn, TTL_NORMALE);
        await cm.getOrFetch('c5', fetchFn, TTL_NORMALE);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});
