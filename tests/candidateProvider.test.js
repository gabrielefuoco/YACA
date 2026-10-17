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
        expect(res.candidati.length).toBeGreaterThan(0);

        const primo = res.candidati[0];
        expect(primo).toHaveProperty('id');
        expect(typeof primo.id).toBe('string');
        expect(primo).toHaveProperty('motivo');
        expect(typeof primo.motivo).toBe('string');
        expect(primo).toHaveProperty('punteggio');
        expect(typeof primo.punteggio).toBe('number');
        expect(primo.punteggio).toBeGreaterThanOrEqual(0);
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

    test('contesto diverso (kidsMode ON vs OFF) produce composizione non vuota e priva di generi adulti', async () => {
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
        expect(resNormal.candidati.length).toBeGreaterThan(0);
        // BUG 2 regression: la modalità kids in assenza di tasteProfile non deve mai svuotare il catalogo
        expect(resKids.candidati.length).toBeGreaterThan(0);

        // I risultati kids non devono contenere generi per adulti (Horror: 27, Thriller: 53, Crime: 80)
        const adultGenreIds = new Set([27, 53, 80]);
        for (const cand of resKids.candidati) {
            const gids = (cand.genre_ids || []).map(Number);
            for (const gid of gids) {
                expect(adultGenreIds.has(gid)).toBe(false);
            }
        }
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

    test('assenza di tasteProfile traccia esplicitamente il degrado in motivi (mai degrado silenzioso)', async () => {
        const ctxSenzaProfilo = {
            userId: 'u_no_profile',
            profileId: 'global',
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {},
            databaseConnected: false
        };

        const res = await indice.candidati(ctxSenzaProfilo, { mediaType: 'movie', limit: 10 });
        expect(res.motivi).toContain('taste_profile_non_disponibile');
        expect(res.motivi).toContain('database_profilo_non_connesso');
    });

    test('con tasteProfile fornito nel contesto, i candidati hanno score VSM non-zero', async () => {
        const syntheticTasteProfile = {
            compiledVectors: {
                V_final: {
                    'g:18': 0.8, // Drama
                    'g:878': 0.9, // Sci-Fi
                    'g:53': 0.7 // Thriller
                }
            }
        };

        const ctxConProfilo = {
            userId: 'u_with_profile',
            profileId: 'global',
            tasteProfile: syntheticTasteProfile,
            selettoriEffettivi: { anime: 'neutral' },
            kidsMode: false,
            sliders: {}
        };

        const res = await indice.candidati(ctxConProfilo, { mediaType: 'movie', limit: 10 });
        expect(res.candidati.length).toBeGreaterThan(0);
        expect(res.motivi).not.toContain('taste_profile_non_disponibile');

        // Almeno un candidato deve avere uno score calcolato positivo dal profilo VSM
        const nonZeroScores = res.candidati.filter(c => c.punteggio > 0);
        expect(nonZeroScores.length).toBeGreaterThan(0);
    });
});
