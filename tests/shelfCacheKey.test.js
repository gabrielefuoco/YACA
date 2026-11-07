/**
 * La cache degli scaffali deve rispondere a tre domande, e sbagliarne una costa un bug silenzioso:
 *  1. due richieste con gli stessi semi in ORDINE diverso devono condividere la voce (o la cache è inutile);
 *  2. un cambio di cursore, di cap o di versione del grafo deve invalidare (o si servono scaffali sbagliati);
 *  3. il pool non deve chiamare il grafo due volte per la stessa richiesta (o i 4 secondi restano).
 */
const { buildShelfCacheKey } = require('../src/cache/shelfKey');

const semiBase = [
    { key: 'movie:603', plays: 2, eta_giorni: 10, medium: 'movie' },
    { key: 'tv:1396', plays: 1, eta_giorni: 4, medium: 'series' },
];
const versioni = { artefatto: 'aaa', ricetta: 'bbb' };

function chiave(over = {}) {
    return buildShelfCacheKey({ semi: semiBase, medium: 'movie', opzioni: null, cap: 60, versioni, ...over });
}

describe('buildShelfCacheKey', () => {
    test('ordine dei semi irrilevante', () => {
        expect(chiave({ semi: [...semiBase].reverse() })).toBe(chiave());
    });

    test('cursori arrotondati: 0.1 e 0.10000000000000002 sono lo stesso cursore', () => {
        const a = chiave({ opzioni: { tono: 0.1, complessita: 0.1 } });
        const b = chiave({ opzioni: { tono: 0.1, complessita: 0.10000000000000002 } });
        expect(a).toBe(b);
    });

    test('cursore diverso => chiave diversa', () => {
        expect(chiave({ opzioni: { tono: 0.1 } })).not.toBe(chiave({ opzioni: { tono: 0.2 } }));
    });

    test('versione del grafo diversa => chiave diversa', () => {
        expect(chiave({ versioni: { artefatto: 'aaa', ricetta: 'ccc' } })).not.toBe(chiave());
        expect(chiave({ versioni: { artefatto: 'zzz', ricetta: 'bbb' } })).not.toBe(chiave());
    });

    test('cap e medium entrano nella chiave', () => {
        expect(chiave({ cap: 30 })).not.toBe(chiave());
        expect(chiave({ medium: 'series' })).not.toBe(chiave());
    });

    test('plays ed eta cambiano la chiave: sono il segnale del profilo', () => {
        const variato = semiBase.map((s, i) => (i === 0 ? { ...s, plays: 3 } : s));
        expect(chiave({ semi: variato })).not.toBe(chiave());
        const eta = semiBase.map((s, i) => (i === 0 ? { ...s, eta_giorni: 11 } : s));
        expect(chiave({ semi: eta })).not.toBe(chiave());
    });
});

describe('shelvesCache', () => {
    const { shelvesCache } = require('../src/cache/cacheInstances');

    test('due richieste identiche => una sola chiamata al grafo', async () => {
        let chiamate = 0;
        const fetch = async () => { chiamate += 1; return { scaffali: [{ catalog_id: 'x' }] }; };
        const k = chiave({ opzioni: { tono: 0.3 } });

        const a = await shelvesCache.getOrFetch(k, fetch);
        const b = await shelvesCache.getOrFetch(k, fetch);

        expect(chiamate).toBe(1);
        expect(a).toEqual(b);
    });

    test('richieste concorrenti sulla stessa chiave => una sola chiamata (niente valanga)', async () => {
        let chiamate = 0;
        const fetch = async () => {
            chiamate += 1;
            await new Promise((r) => setTimeout(r, 30));
            return { scaffali: [] };
        };
        const k = chiave({ opzioni: { tono: 0.4 } });
        await Promise.all([shelvesCache.getOrFetch(k, fetch), shelvesCache.getOrFetch(k, fetch), shelvesCache.getOrFetch(k, fetch)]);
        expect(chiamate).toBe(1);
    });

    test('chiave diversa => nuova chiamata', async () => {
        let chiamate = 0;
        const fetch = async () => { chiamate += 1; return { scaffali: [] }; };
        await shelvesCache.getOrFetch(chiave({ cap: 20 }), fetch);
        await shelvesCache.getOrFetch(chiave({ cap: 21 }), fetch);
        expect(chiamate).toBe(2);
    });
});
