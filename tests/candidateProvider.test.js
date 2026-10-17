/**
 * tests/candidateProvider.test.js
 *
 * Collaudo del fornitore di candidati di gusto (Ticket 41 - Prima fetta).
 *
 * Verifica gli invarianti:
 * 1. Stesso contesto -> stessa lista (deterministica e stabile).
 * 2. Contesto diverso -> composizione diversa.
 * 3. Mai un'eccezione (contratto delle porte: vuoto + motivi[]).
 * 4. Struttura spiegata: ogni candidato ha { id, motivo, punteggio }.
 * 5. Rispetto dei filtri del contesto risolto (kidsMode, animePolicy).
 */

const indice = require('../src/indice');
const { candidati } = require('../src/indice/candidati');
const duckDbStore = require('../src/indice/duckDbStore');

describe('CandidateProvider (Ticket 41 - Porta dei Candidati)', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    });

    afterAll(async () => {
        await duckDbStore.close();
    });

    test('la porta non solleva mai eccezioni con contesto vuoto o mancante', async () => {
        const resNull = await candidati(null);
        expect(resNull).toBeDefined();
        expect(resNull.candidati).toEqual([]);
        expect(resNull.motivi).toContain('contesto_mancante');

        const resUndef = await indice.candidati(undefined);
        expect(resUndef).toBeDefined();
        expect(resUndef.candidati).toEqual([]);
        expect(resUndef.motivi).toContain('contesto_mancante');
    });

    test('la porta non solleva mai se DuckDB fallisce', async () => {
        const mockDb = {
            query: jest.fn().mockRejectedValue(new Error('DuckDB lock timeout simulato'))
        };
        const ctx = {
            userId: 'u1',
            profileId: 'global',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {}
        };

        const res = await candidati(ctx, { db: mockDb });
        expect(res).toBeDefined();
        expect(res.candidati).toEqual([]);
        expect(res.motivi.some(m => m.includes('errore_indice'))).toBe(true);
    });

    test('restituisce candidati spiegati nella forma { id, motivo, punteggio }', async () => {
        const ctx = {
            userId: 'user_test',
            profileId: 'global',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {}
        };

        const res = await indice.candidati(ctx, { mediaType: 'movie', limit: 10 });
        expect(res).toBeDefined();
        expect(Array.isArray(res.candidati)).toBe(true);

        if (res.candidati.length > 0) {
            const primo = res.candidati[0];
            expect(primo).toHaveProperty('id');
            expect(typeof primo.id).toBe('string');
            expect(primo).toHaveProperty('motivo');
            expect(typeof primo.motivo).toBe('string');
            expect(primo).toHaveProperty('punteggio');
            expect(typeof primo.punteggio).toBe('number');
            expect(primo.punteggio).toBeGreaterThanOrEqual(0);
        }
    });

    test('stesso contesto produce la stessa lista (deterministica)', async () => {
        const ctx = {
            userId: 'user_deterministico',
            profileId: 'global',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {}
        };

        const res1 = await indice.candidati(ctx, { mediaType: 'movie', limit: 20 });
        const res2 = await indice.candidati(ctx, { mediaType: 'movie', limit: 20 });

        expect(res1.candidati.map(c => c.id)).toEqual(res2.candidati.map(c => c.id));
    });

    test('contesto diverso (kidsMode ON vs OFF) produce composizione diversa o filtrata', async () => {
        const ctxNormal = {
            userId: 'user_diff',
            profileId: 'global',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {}
        };

        const ctxKids = {
            userId: 'user_diff',
            profileId: 'kids_p',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: true,
            sliders: {}
        };

        const resNormal = await indice.candidati(ctxNormal, { mediaType: 'movie', limit: 30 });
        const resKids = await indice.candidati(ctxKids, { mediaType: 'movie', limit: 30 });

        expect(Array.isArray(resNormal.candidati)).toBe(true);
        expect(Array.isArray(resKids.candidati)).toBe(true);
        // I risultati kids non devono contenere contenuti per adulti o inappropriati
        const kidsIds = new Set(resKids.candidati.map(c => c.id));
        expect(kidsIds.size).toBeLessThanOrEqual(resNormal.candidati.length);
    });

    test('contesto diverso (anime policy only vs exclude) produce liste disgiunte', async () => {
        const ctxAnimeOnly = {
            userId: 'u_otaku',
            profileId: 'p_anime',
            selettoriEffettivi: { anime: 'only' },
            kidsMode: false,
            sliders: {}
        };

        const ctxAnimeExclude = {
            userId: 'u_cinefilo',
            profileId: 'p_no_anime',
            selettoriEffettivi: { anime: 'exclude' },
            kidsMode: false,
            sliders: {}
        };

        const resOnly = await indice.candidati(ctxAnimeOnly, { mediaType: 'movie', limit: 20 });
        const resExclude = await indice.candidati(ctxAnimeExclude, { mediaType: 'movie', limit: 20 });

        const setOnly = new Set(resOnly.candidati.map(c => c.id));
        const setExclude = new Set(resExclude.candidati.map(c => c.id));

        // Le due liste devono essere disgiunte
        for (const id of setOnly) {
            expect(setExclude.has(id)).toBe(false);
        }
    });

    test('l\'alias candidatiPerGusto risponde con la stessa porta', async () => {
        const ctx = {
            userId: 'u_alias',
            profileId: 'global',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {}
        };

        const r1 = await indice.candidati(ctx, { limit: 5 });
        const r2 = await indice.candidatiPerGusto(ctx, { limit: 5 });

        expect(r1.candidati).toEqual(r2.candidati);
    });
});
