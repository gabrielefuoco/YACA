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

    test('un produttore che risponde null non congela la chiave col TTL normale', async () => {
        const cm = managerDiProva();
        await cm.getOrFetch('c6', async () => null, TTL_NORMALE);
        expect(cm.set.mock.calls[0][2]).toBe(60 * 1000);
    });

    test('il vuoto resta in cache breve: la seconda richiesta non ricostruisce subito', async () => {
        const cm = managerDiProva();
        const fetchFn = jest.fn(async () => ({ metas: [] }));
        await cm.getOrFetch('c5', fetchFn, TTL_NORMALE);
        await cm.getOrFetch('c5', fetchFn, TTL_NORMALE);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});

/**
 * La stessa regola deve valere per chi scrive direttamente, senza passare da `getOrFetch`:
 * `scrivi()` (i gruppi hero, gli id di raccomandazione, la meta) chiama `set`. Prima di questa
 * correzione un gruppo vuoto ci finiva col TTL pieno — 7 giorni di home vuota per un guasto di un
 * istante — e un `null` ci finiva come "fresco" per il TTL del catalogo, cioè 14 giorni.
 */
describe('CacheManager.set + payload vuoto (scrittura diretta)', () => {
    const TTL_RACCOMANDAZIONI = 7 * 24 * 60 * 60 * 1000;

    function managerReale() {
        return new CacheManager('test-set-vuoto', { ramMax: 10, ramTtlMs: 60000, redisTtlMs: 60000 });
    }

    /** Il TTL con cui la voce è stata davvero scritta (l'envelope porta il suo `ttl`). */
    function ttlScritto(cm, key) {
        const envelope = cm.lruFallback.get(key);
        return envelope ? envelope.ttl : undefined;
    }

    test('raccomandazioni vuote ({ids: []}) => TTL corto, non 7 giorni', async () => {
        const cm = managerReale();
        await cm.set('rec1', { ids: [] }, TTL_RACCOMANDAZIONI);
        expect(ttlScritto(cm, 'rec1')).toBe(60 * 1000);
    });

    test('gruppo hero senza righe ({catalogs: {}}) => TTL corto', async () => {
        const cm = managerReale();
        await cm.set('hero1', { catalogs: {} }, TTL_RACCOMANDAZIONI);
        expect(ttlScritto(cm, 'hero1')).toBe(60 * 1000);

        await cm.set('hero2', { catalogs: { top: [], amati: [] } }, TTL_RACCOMANDAZIONI);
        expect(ttlScritto(cm, 'hero2')).toBe(60 * 1000);
    });

    test('raccomandazioni piene => TTL pieno', async () => {
        const cm = managerReale();
        await cm.set('rec2', { ids: [1, 2, 3] }, TTL_RACCOMANDAZIONI);
        expect(ttlScritto(cm, 'rec2')).toBe(TTL_RACCOMANDAZIONI);
    });

    test('gruppo hero con almeno una riga => TTL pieno', async () => {
        const cm = managerReale();
        await cm.set('hero3', { catalogs: { top: [{ id: 'tmdb:1' }], amati: [] } }, TTL_RACCOMANDAZIONI);
        expect(ttlScritto(cm, 'hero3')).toBe(TTL_RACCOMANDAZIONI);
    });

    test('null => TTL corto: "non ho potuto" non è una verità da 14 giorni', async () => {
        const cm = managerReale();
        await cm.set('n1', null, TTL_NORMALE);
        expect(ttlScritto(cm, 'n1')).toBe(60 * 1000);
    });

    test('un negativo VOLUTO (conservaNegativo) resta lungo: il 404 pagato non si butta', async () => {
        const cm = managerReale();
        const ventiquattroOre = 24 * 60 * 60 * 1000;
        await cm.set('n2', null, ventiquattroOre, { conservaNegativo: true });
        expect(ttlScritto(cm, 'n2')).toBe(ventiquattroOre);
    });
});
