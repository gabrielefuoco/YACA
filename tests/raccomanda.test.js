/**
 * IL PONTE FRA IL GRAFO E IL FEED — le prove.
 *
 * Il pezzo più facile da rompere in silenzio è la CAPPELLA delle liste: `un_passo_fuori` raccoglie da
 * tre mondi, e senza un tetto torna a fare trenta item contro i dieci delle altre — che è l'artefatto
 * che il 16/10/2026 ha prodotto una conclusione di prodotto sbagliata (e che ho rifatto qui al primo
 * tentativo, trovato dal primo giro di fumata).
 */
const R = require('../src/engines/bolle/raccomanda');

// una storia nella forma di `WatchHistory`: Star Trek amato, Stargate visto, Matrix piaciuto
const STORIA = [
    { tmdbId: 314, type: 'tv', episodesWatched: 172, signals: [{ type: 'loved' }] },
    { tmdbId: 1396, type: 'tv', episodesWatched: 214, signals: [{ type: 'watched' }] },
    { tmdbId: 603, type: 'movie', signals: [{ type: 'liked' }] },
];

describe('il ponte fra il grafo e il feed', () => {
    test('traduce la forma del prodotto senza interpretarla', () => {
        const s = R.storiaDaWatchHistory(STORIA);
        expect(s).toEqual([
            { chiave: 'tv:314', plays: 172, tipo: 'loved' },
            { chiave: 'tv:1396', plays: 214, tipo: 'watched' },
            { chiave: 'movie:603', plays: 1, tipo: 'liked' },
        ]);
    });

    test('scarta le voci senza tmdbId invece di inventare una chiave', () => {
        expect(R.storiaDaWatchHistory([{ type: 'tv' }, null, { tmdbId: 603, type: 'movie' }]))
            .toEqual([{ chiave: 'movie:603', plays: 1, tipo: 'watched' }]);
    });

    test('lo stesso titolo due volte: vince il segnale più forte e il massimo dei plays', () => {
        const s = R.storiaDaWatchHistory([
            { tmdbId: 1396, type: 'tv', episodesWatched: 10, signals: [{ type: 'watched' }] },
            { tmdbId: 1396, type: 'tv', episodesWatched: 214, signals: [{ type: 'loved' }] },
        ]);
        expect(s).toEqual([{ chiave: 'tv:1396', plays: 214, tipo: 'loved' }]);
    });

    test('le liste hanno TUTTE la stessa capienza — è l artefatto che ha sbagliato i conti', () => {
        const r = R.raccomanda(STORIA, { quante: 3 });
        for (const l of r.liste) {
            if (l.da_comporre) continue;
            expect(l.items.length).toBeLessThanOrEqual(R.CAP);
        }
        // il caso che si rompe da solo: tre vicini da dieci facevano trenta
        const passo = r.liste.find((l) => l.tipo === 'un_passo_fuori');
        expect(passo.items.length).toBeLessThanOrEqual(R.CAP);
        expect(passo.per_mondo.length).toBeGreaterThan(0);
    });

    test('il tuo mondo viene prima, la nicchia per ultima e segnalata debole', () => {
        const r = R.raccomanda(STORIA, { quante: 3 });
        expect(r.liste.map((l) => l.tipo)).toEqual([
            'il_tuo_mondo', 'un_passo_fuori', 'uscite_nuove', 'nicchia_di_qualita',
        ]);
        expect(r.liste[0].debole).toBe(false);
        expect(r.liste[3].debole).toBe(true);
        // l'ordine non è un vezzo: 12,81% per slot contro 10,62%, e la nicchia 4,31%
        expect(r.items.length).toBeGreaterThan(0);
    });

    test('gli item sono nella forma che il prodotto sa mostrare, e senza doppioni', () => {
        const r = R.raccomanda(STORIA, { quante: 3 });
        for (const it of r.items) {
            expect(typeof it.id).toBe('number');
            expect(['movie', 'tv']).toContain(it.type);
        }
        const chiavi = r.items.map((i) => `${i.type}:${i.id}`);
        expect(new Set(chiavi).size).toBe(chiavi.length);
    });

    test('ogni mondo acceso si spiega: termini del centroide e chi l ha acceso', () => {
        const r = R.raccomanda(STORIA, { quante: 3 });
        const primo = r.liste[0];
        expect(primo.mondo).toBeGreaterThanOrEqual(0);
        expect(typeof primo.come).toBe('string');
        expect(primo.come.length).toBeGreaterThan(0);
        expect(Array.isArray(primo.perche)).toBe(true);
    });

    test('la cache serve la seconda chiamata, e la chiave porta le due versioni', () => {
        // una storia DIVERSA da quelle degli altri test: la cache e' del modulo, e un test che la scalda
        // prima renderebbe questo rosso. (E' successo al primo giro.)
        const altra = [
            { tmdbId: 27205, type: 'movie', signals: [{ type: 'loved' }] },
            { tmdbId: 1399, type: 'tv', episodesWatched: 73, signals: [{ type: 'watched' }] },
        ];
        const r1 = R.raccomanda(altra, { quante: 3 });
        const r2 = R.raccomanda(altra, { quante: 3 });
        expect(r1.cache).toBe(false);
        expect(r2.cache).toBe(true);
        expect(r2.versioni.artefatto).toBe(r1.versioni.artefatto);
    });

    test('i titoli della storia si escludono dalle liste: il motore non conosce il catalogo', () => {
        const r = R.raccomanda(STORIA, { quante: 3 });
        expect(r.esclusi).toEqual(['tv:314', 'tv:1396', 'movie:603']);
    });

    test('una storia vuota non esplode e non accende niente', () => {
        const r = R.raccomanda([], {});
        expect(r.liste).toEqual([]);
        expect(r.items).toEqual([]);
    });
});
