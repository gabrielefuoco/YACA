/**
 * `getOrFetch` e il caso "risultato vuoto ma transitorio" (ticket 16).
 *
 * Il catalogo Simulcast è alimentato da una fonte esterna: se quella fonte è a zero, la risposta è
 * vuota. Memorizzarla la congela per tutto il TTL, e se ogni richiesta la riscrive la cache resta
 * vuota anche dopo il ritorno della fonte — è esattamente quello che è successo (catalogo vuoto per
 * giorni mentre i dati c'erano).
 */
const CacheManager = require('../src/cache/CacheManager');

function managerDiProva() {
    const cm = new CacheManager('test-skipif', { ramMax: 10, ramTtlMs: 60000, redisTtlMs: 60000 });
    // Store finto in memoria: serve un `getWithStatus` coerente con `set`, altrimenti ogni chiamata
    // sarebbe un miss e il test non direbbe niente sul caching.
    const store = new Map();
    cm.getWithStatus = async (key) => (store.has(key)
        ? { value: store.get(key), status: 'fresh' }
        : { value: undefined, status: 'miss' });
    cm.set = jest.fn(async (key, value) => { store.set(key, value); });
    return cm;
}

describe('CacheManager.getOrFetch + skipIf', () => {
    test('un payload vuoto con skipIf non viene memorizzato, e la chiamata dopo ricostruisce', async () => {
        const cm = managerDiProva();
        const vuoto = { metas: [] };
        const fetchFn = jest.fn(async () => vuoto);

        const primo = await cm.getOrFetch('aria', fetchFn, 60000, {
            skipIf: (v) => !Array.isArray(v?.metas) || v.metas.length === 0
        });
        expect(primo).toEqual(vuoto);
        expect(cm.set).not.toHaveBeenCalled();

        await cm.getOrFetch('aria', fetchFn, 60000, {
            skipIf: (v) => !Array.isArray(v?.metas) || v.metas.length === 0
        });
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    test('un payload pieno viene memorizzato e la seconda chiamata non ricostruisce', async () => {
        const cm = managerDiProva();
        const pieno = { metas: [{ id: 'kitsu:1' }] };
        const fetchFn = jest.fn(async () => pieno);

        await cm.getOrFetch('aria', fetchFn, 60000, {
            skipIf: (v) => !Array.isArray(v?.metas) || v.metas.length === 0
        });
        expect(cm.set).toHaveBeenCalledTimes(1);

        await cm.getOrFetch('aria', fetchFn, 60000, {
            skipIf: (v) => !Array.isArray(v?.metas) || v.metas.length === 0
        });
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    test('senza skipIf il comportamento è quello di sempre (anche il vuoto si memorizza)', async () => {
        const cm = managerDiProva();
        const fetchFn = jest.fn(async () => ({ metas: [] }));
        await cm.getOrFetch('altro', fetchFn, 60000);
        expect(cm.set).toHaveBeenCalledTimes(1);
        await cm.getOrFetch('altro', fetchFn, 60000);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});
