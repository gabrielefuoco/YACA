/**
 * tests/dfCacheSync.test.js
 *
 * Il test che avrebbe preso la regressione del 18/10/2026: togliendo la callback push (ticket 49)
 * la cache DF non arrivava più al motore DNA, e la rarità ricadeva **in silenzio** sulle stime.
 * Nessun test lo vedeva, perché le stime sono valori plausibili.
 *
 * Qui si verifica che la sincronizzazione esplicita porti davvero la cache, e che il numero cambi.
 */

const duckDbStore = require('../src/indice/duckDbStore');
const dnaEngine = require('../src/profile/dnaEngine');
const { sincronizzaDfCache } = require('../src/profile');

describe('sincronizzaDfCache: la cache DF deve arrivare al motore DNA', () => {
    const cacheOriginale = dnaEngine.getGlobalDfCache();
    const dfMapOriginale = duckDbStore.dfMap;

    afterEach(() => {
        dnaEngine.setGlobalDfCache(cacheOriginale);
        duckDbStore.dfMap = dfMapOriginale;
    });

    test('senza cache la rarità usa le stime (comportamento di ripiego)', () => {
        dnaEngine.setGlobalDfCache(null);
        duckDbStore.dfMap = null;
        const conStime = dnaEngine.getSoftRarityMultiplier('k:prova');
        expect(conStime).toBeGreaterThan(1);
    });

    test('con la cache dell indice la rarità cambia: la sincronizzazione la porta davvero', () => {
        dnaEngine.setGlobalDfCache(null);
        duckDbStore.dfMap = new Map([['k:prova', 12345]]);

        const esito = sincronizzaDfCache();
        expect(esito).toBe(true);
        expect(dnaEngine.getGlobalDfCache()).toBeInstanceOf(Map);

        const conCacheVera = dnaEngine.getSoftRarityMultiplier('k:prova');
        const conStime = dnaEngine.getSoftRarityMultiplier('k:prova', new Map());
        // Il punto del test: il numero DEVE cambiare. Se restasse uguale, la cache non è arrivata
        // e la rarità starebbe mentendo senza dirlo.
        expect(conCacheVera).not.toBeCloseTo(conStime, 3);
    });

    test('è idempotente: non sovrascrive una cache già presente', () => {
        const gia = new Map([['k:altro', 1]]);
        dnaEngine.setGlobalDfCache(gia);
        duckDbStore.dfMap = new Map([['k:prova', 999]]);

        sincronizzaDfCache();

        expect(dnaEngine.getGlobalDfCache()).toBe(gia);
    });

    test('senza indice caricato non solleva: degrada dichiaratamente', () => {
        dnaEngine.setGlobalDfCache(null);
        duckDbStore.dfMap = null;
        expect(() => sincronizzaDfCache()).not.toThrow();
    });
});
