const { HERO_STRATEGIES, convertiSemiPerGrafo } = require('../src/pool');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const { SEED_RECENTI_QUANTI } = library;

describe('Ticket 07: recenza dei semi da data vera', () => {
    test('l ordine di inserimento della Map non decide la recenza', () => {
        const ids = ['1', '2', '3', '4', '5'];
        const tsById = { '1': 100, '2': 200, '3': 300, '4': 400, '5': 500 };
        const seeds = new Map(ids.map((id) => [id, 2]));

        const oldestFirst = new Map();
        for (const id of ids) oldestFirst.set(id, tsById[id]);

        const newestFirst = new Map();
        for (const id of [...ids].reverse()) newestFirst.set(id, tsById[id]);

        const r1 = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: oldestFirst, quantiRecenti: 2 });
        const r2 = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: newestFirst, quantiRecenti: 2 });

        const recent1 = new Set(r1.filter((x) => x.recente === true).map((x) => x.tmdbId));
        const recent2 = new Set(r2.filter((x) => x.recente === true).map((x) => x.tmdbId));
        expect(recent1).toEqual(recent2);
        expect(recent1).toEqual(new Set([4, 5]));
    });

    test('due giri con date diverse cambiano i recenti', () => {
        const ids = ['1', '2', '3'];
        const seeds = new Map(ids.map((id) => [id, 2]));

        const uvA = new Map([['1', 500], ['2', 400], ['3', 100]]);
        const uvB = new Map([['1', 100], ['2', 500], ['3', 400]]);

        const rA = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: uvA, quantiRecenti: 1 });
        const rB = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: uvB, quantiRecenti: 1 });

        const recentA = new Set(rA.filter((x) => x.recente === true).map((x) => x.tmdbId));
        const recentB = new Set(rB.filter((x) => x.recente === true).map((x) => x.tmdbId));
        expect(recentA).not.toEqual(recentB);
    });

    test('una data mancante non e recente', () => {
        const ids = ['1', '2', '3', '4', '5'];
        const seeds = new Map(ids.map((id) => [id, 2]));
        const uv = new Map([['1', 200], ['2', 100], ['3', 0]]); // 4,5 assenti

        const r = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: uv });
        const recent = r.filter((x) => x.recente === true);
        expect(recent).toHaveLength(2);
        for (const item of r) {
            if (item.tmdbId !== 1 && item.tmdbId !== 2) {
                expect(item).not.toHaveProperty('recente');
            }
        }
    });

    test('il taglio e per data, non per inserimento', () => {
        const ids = Array.from({ length: 20 }, (_, i) => String(i + 1));
        const seeds = new Map(ids.map((id) => [id, 2]));
        // inserimento in ordine cronologico inverso (piu recenti prima)
        const uv = new Map();
        for (let i = 20; i >= 1; i--) uv.set(String(i), i * 10);

        const r = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: uv });
        const recent = new Set(r.filter((x) => x.recente === true).map((x) => x.tmdbId));
        expect(recent.size).toBe(SEED_RECENTI_QUANTI);
        // i 15 piu recenti sono 6..20
        for (let i = 6; i <= 20; i++) expect(recent.has(i)).toBe(true);
        for (let i = 1; i <= 5; i++) expect(recent.has(i)).toBe(false);
    });

    test('il pool manda recente al servizio del grafo', async () => {
        jest.clearAllMocks();
        const ultimaVisione = new Map([['603', 200], ['314', 0]]);
        jest.spyOn(library, 'semiDi').mockResolvedValue({
            seeds: new Map([['603', 3], ['314', 4]]),
            counts: { loved: 1, liked: 1, watched: 0, library: 0 },
            ultimaVisione
        });
        jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
            liste: []
        });

        const graphStrategy = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
        const assigned = {};
        await graphStrategy.run({
            userId: 'u1',
            context: 'p1',
            mediaType: 'movie',
            userConfig: {}
        }, { assigned, rawTraktResult: { traktAvailable: false } });

        const call = graphClient.raccomanda.mock.calls[0][0];
        const semi = call.semi;
        const recentIds = semi.filter((s) => s.recente === true).map((s) => s.tmdbId);
        expect(recentIds).toEqual([603]);
        for (const s of semi) {
            if (s.tmdbId !== 603) expect(s).not.toHaveProperty('recente');
        }
    });

    test('il taglio avviene fra i semi inviati, non fra tutte le visioni', () => {
        const allIds = Array.from({ length: 20 }, (_, i) => String(i + 1));
        const seeds = new Map(Array.from({ length: 10 }, (_, i) => [String(i + 1), 2]));
        const uv = new Map(allIds.map((id, i) => [id, (i + 1) * 10]));

        const r = convertiSemiPerGrafo(seeds, { medium: 'movie', animePolicy: 'neutral', ultimaVisione: uv });
        const recent = r.filter((x) => x.recente === true);
        expect(recent).toHaveLength(10);
        for (let i = 1; i <= 10; i++) {
            expect(recent.map((x) => x.tmdbId)).toContain(i);
        }
    });
});
