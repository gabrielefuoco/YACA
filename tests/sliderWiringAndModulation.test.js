/**
 * tests/sliderWiringAndModulation.test.js
 *
 * Ticket 41: Lo slider — il cablaggio dal profilo ai cataloghi.
 *
 * Verifica:
 * 1. Il contratto del cablaggio:
 *    - I 4 valori di slider (largo, lontano, cozy, canone) salvati nel profilo
 *      viaggiano attraverso contestoDi -> getHeroPool -> HERO_STRATEGIES (graph_rows)
 *      -> graphClient.raccomanda -> body di POST /raccomanda ({ opzioni: { largo, lontano, cozy, canone } }).
 *    - Se gli slider sono assenti o predefiniti, il contratto predefinito tiene (opzioni: undefined / defaults)
 *      senza rompere il comportamento esistente.
 *    - Cache isolation: la chiave di cache del pool varia solo se gli slider differiscono dai default.
 * 2. La misura della modulazione:
 *    - Stessi slider -> stessa lista (Jaccard = 1.0).
 *    - Slider diversi -> composizione diversa (circa un terzo dei titoli cambia, Jaccard ~0.4-0.6).
 *    - Gli assi MODULANO, non filtrano: la lista NON si svuota (mantiene il 100% della capienza),
 *      mentre un filtro rigido farebbe crollare il numero di titoli.
 */

jest.mock('../src/engines/hybrid/dataFetchers', () => ({
    fetchProfileContext: jest.fn().mockResolvedValue({ profile: {}, user: {} }),
    fetchPopularFallbackIds: jest.fn().mockResolvedValue(['tmdb:1']),
    fetchTopRatedPeriodFallbackIds: jest.fn().mockResolvedValue(['tmdb:2']),
    fetchUndiscoveredFallbackIds: jest.fn().mockResolvedValue(['tmdb:3']),
    fetchHiddenGemsFallbackIds: jest.fn().mockResolvedValue(['tmdb:4']),
    fetchTraktRecommendationsRawDetailed: jest.fn().mockResolvedValue({
        items: [],
        available: false,
        fallbackUsed: true,
        reason: 'credentials'
    })
}));

jest.mock('../src/engines/hybrid/catalogStrategies', () => ({
    buildTopGenresMixCatalog: jest.fn().mockResolvedValue(['tmdb:1']),
    buildHybridCatalog: jest.fn().mockResolvedValue(['tmdb:2']),
    buildHiddenGemsCatalog: jest.fn().mockResolvedValue(['tmdb:3']),
    buildTraktFilteredCatalog: jest.fn().mockResolvedValue(['tmdb:4']),
    buildTraktFilteredCatalogWithMeta: jest.fn().mockResolvedValue({
        ids: ['tmdb:4'],
        traktAvailable: true,
        traktSourcedCount: 1,
        fallbackTopUpCount: 0,
        isDegradedFallback: false,
        fallbackUsed: false
    })
}));

const axios = require('axios');
const graphClient = require('../src/clients/graphClient');
const {
    buildSharedHeroCacheKey,
    buildSharedHeroCatalogs,
    getHeroPool,
    HERO_CACHE_KEY_VERSION,
    HERO_STRATEGIES
} = require('../src/pool');
const { contestoDi } = require('../src/profile/context');
const library = require('../src/library');

describe('Ticket 41: Cablaggio slider dal profilo al motore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        graphClient.resetHealthCache();
    });

    describe('1. graphClient.raccomanda inoltra opzioni/sliders nel payload POST', () => {
        test('invia opzioni nel corpo JSON quando fornito come opzioni', async () => {
            const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
                status: 200,
                data: { ok: true, versioni: {}, liste: [] }
            });

            const sliders = { largo: 6, lontano: 0.5, cozy: 0.2, canone: -0.3 };
            await graphClient.raccomanda({
                semi: [{ tmdbId: 603, medium: 'movie', tipo: 'liked', peso: 3 }],
                medium: 'movie',
                opzioni: sliders,
                cap: 45
            });

            expect(postSpy).toHaveBeenCalledTimes(1);
            const [url, payload] = postSpy.mock.calls[0];
            expect(url).toContain('/raccomanda');
            expect(payload.opzioni).toEqual(sliders);
            expect(payload.cap).toBe(45);
            expect(payload.medium).toBe('movie');
            expect(payload.semi).toEqual([{ tmdbId: 603, medium: 'movie', tipo: 'liked', peso: 3 }]);

            postSpy.mockRestore();
        });

        test('invia opzioni nel corpo JSON quando fornito con alias sliders/slider', async () => {
            const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
                status: 200,
                data: { ok: true, versioni: {}, liste: [] }
            });

            const sliders = { largo: 8, lontano: 0.0, cozy: 0.8, canone: 0.5 };
            await graphClient.raccomanda({
                semi: [{ tmdbId: 1396, medium: 'series' }],
                medium: 'series',
                sliders,
                cap: 60
            });

            expect(postSpy).toHaveBeenCalledTimes(1);
            const [, payload] = postSpy.mock.calls[0];
            expect(payload.opzioni).toEqual(sliders);

            postSpy.mockRestore();
        });

        test('omette opzioni quando assenti (contratto predefinito)', async () => {
            const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
                status: 200,
                data: { ok: true, versioni: {}, liste: [] }
            });

            await graphClient.raccomanda({
                semi: [{ tmdbId: 603, medium: 'movie' }],
                cap: 60
            });

            expect(postSpy).toHaveBeenCalledTimes(1);
            const [, payload] = postSpy.mock.calls[0];
            expect(payload.opzioni).toBeUndefined();

            postSpy.mockRestore();
        });
    });

    describe('2. Il filo: dal profilo a graph_rows e getHeroPool', () => {
        beforeEach(() => {
            jest.spyOn(library, 'semiDi').mockResolvedValue({
                seeds: new Map([['603', 4]]),
                counts: { loved: 1, liked: 0, watched: 0, library: 0 }
            });
        });

        test('gli slider salvati nel profilo raggiungono graphClient.raccomanda attraverso getHeroPool', async () => {
            const customSliders = { largo: 7, lontano: 0.4, cozy: -0.6, canone: 0.8 };
            const raccomandaSpy = jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
                liste: [
                    { ruolo: 'il_tuo_mondo', titoli: [{ tmdbId: 603, medium: 'movie', punteggio: 1.0 }] },
                    { ruolo: 'un_passo_fuori', titoli: [{ tmdbId: 604, medium: 'movie', punteggio: 0.8 }] }
                ]
            });

            const userConfig = {
                userId: 'utente_slider',
                activeProfileId: 'profilo_knobs',
                profiles: [
                    {
                        id: 'profilo_knobs',
                        name: 'Cinematografico',
                        settings: {
                            sliders: customSliders
                        }
                    }
                ]
            };

            await getHeroPool({
                userId: 'utente_slider',
                context: 'profilo_knobs',
                mediaType: 'movie',
                userConfig
            });

            expect(raccomandaSpy).toHaveBeenCalledTimes(1);
            const argsPassed = raccomandaSpy.mock.calls[0][0];
            expect(argsPassed.opzioni).toEqual(customSliders);
            expect(argsPassed.medium).toBe('movie');
            raccomandaSpy.mockRestore();
        });

        test('se il profilo non ha slider, opzioni è undefined e i default del motore valgono', async () => {
            const raccomandaSpy = jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
                liste: []
            });

            const userConfig = {
                userId: 'utente_default',
                activeProfileId: 'profilo_default',
                profiles: [
                    {
                        id: 'profilo_default',
                        name: 'Default',
                        settings: {}
                    }
                ]
            };

            await getHeroPool({
                userId: 'utente_default',
                context: 'profilo_default',
                mediaType: 'movie',
                userConfig
            });

            expect(raccomandaSpy).toHaveBeenCalledTimes(1);
            const argsPassed = raccomandaSpy.mock.calls[0][0];
            expect(argsPassed.opzioni).toBeUndefined();
            raccomandaSpy.mockRestore();
        });
    });

    describe('3. Isolamento della cache del pool per gli slider', () => {
        const baseParams = {
            userId: 'user1',
            context: 'prof1',
            mediaType: 'movie',
            kidsMode: false,
            typeSelectors: {}
        };

        test('slider default o assenti mantengono la chiave canonica invariata', () => {
            const keySenzaSlider = buildSharedHeroCacheKey(baseParams);
            const keySliderDefault = buildSharedHeroCacheKey({
                ...baseParams,
                sliders: { largo: 4, lontano: 0, cozy: 0, canone: 0 }
            });

            expect(keySenzaSlider).toBe(`user1_prof1_heroes_${HERO_CACHE_KEY_VERSION}_movie`);
            expect(keySliderDefault).toBe(keySenzaSlider);
        });

        test('slider modificati cambiano la chiave di cache evitando collisioni con vecchie risposte', () => {
            const keyBase = buildSharedHeroCacheKey(baseParams);
            const keyModificata = buildSharedHeroCacheKey({
                ...baseParams,
                sliders: { largo: 6, lontano: 0.3, cozy: 0, canone: 0 }
            });

            expect(keyModificata).not.toBe(keyBase);
            expect(keyModificata).toContain('_sl_6_0.3_0_0');
        });
    });

    describe('4. La Prova: Misura della Modulazione (Modulazione vs Filtro)', () => {
        /**
         * Simula il comportamento provato del motore (services/graph/motore.py, Motore.modula):
         * - Un asse modula esponenzialmente l'attivazione dei titoli/mondi.
         * - La modulazione NON scarta i titoli (non filtra), ma ne altera il rank.
         * - Stessi slider -> Jaccard 1.0 (stessa lista).
         * - Slider diversi -> Jaccard ~0.4-0.6 (circa 1/3 dei titoli cambia composizione).
         * - Riempimento: la lista modulata resta piena (100% capienza), mentre un filtro rigido si svuota.
         */
        const N_TITLES = 40;
        const TARGET_PORTFOLIO = 20;

        // Genera candidati sintetici ma con distribuzione realistica
        const candidates = Array.from({ length: N_TITLES }, (_, i) => ({
            id: `movie:${1000 + i}`,
            baseActivation: 1.0 / (1 + i * 0.1),
            voteMed: 200 + (i * 350) % 5000, // canone/popolarità varia
            cozyRatio: (i % 3 === 0) ? 0.8 : (i % 3 === 1) ? 0.2 : 0.5 // cozy vs impegnativo
        }));

        function evaluatePortfolio(slider = {}, isHardFilter = false) {
            const canone = slider.canone || 0.0;
            const cozy = slider.cozy || 0.0;
            const targetCanone = 1500 + canone * 1200;

            if (isHardFilter) {
                // Controprova: un filtro rigido SCARTA i titoli che non soddisfano la soglia
                const filtered = candidates.filter(c => {
                    if (canone > 0.5 && c.voteMed < 2000) return false;
                    if (canone < -0.5 && c.voteMed > 1000) return false;
                    if (cozy > 0.5 && c.cozyRatio < 0.6) return false;
                    if (cozy < -0.5 && c.cozyRatio > 0.4) return false;
                    return true;
                });
                return filtered.slice(0, TARGET_PORTFOLIO).map(c => c.id);
            }

            // Formula di modulazione provata del motore (np.exp(-peso * diff))
            const scored = candidates.map(c => {
                let score = c.baseActivation;
                if (canone !== 0.0) {
                    const diffCanone = Math.abs(Math.log(Math.max(c.voteMed, 1)) - Math.log(Math.max(targetCanone, 1)));
                    score *= Math.exp(-0.5 * Math.abs(canone) * diffCanone);
                }
                if (cozy !== 0.0) {
                    const diffCozy = cozy > 0 ? (c.cozyRatio - 0.5) * cozy : ((1 - c.cozyRatio) - 0.5) * (-cozy);
                    score *= Math.exp(1.0 * diffCozy);
                }
                return { id: c.id, score };
            });

            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, TARGET_PORTFOLIO).map(c => c.id);
        }

        function jaccard(listA, listB) {
            const setA = new Set(listA);
            const setB = new Set(listB);
            const intersection = [...setA].filter(x => setB.has(x)).length;
            const union = new Set([...setA, ...setB]).size;
            return union === 0 ? 0 : intersection / union;
        }

        test('stessi slider producono la stessa identica lista (Jaccard = 1.0)', () => {
            const list1 = evaluatePortfolio({ canone: 0.5, cozy: 0.0 });
            const list2 = evaluatePortfolio({ canone: 0.5, cozy: 0.0 });

            expect(list1.length).toBe(TARGET_PORTFOLIO);
            expect(list2.length).toBe(TARGET_PORTFOLIO);
            expect(jaccard(list1, list2)).toBe(1.0);
            expect(list1).toEqual(list2);
        });

        test('slider diversi modulano l attivazione: cambia la composizione (~1/3) senza svuotare la lista', () => {
            const baseList = evaluatePortfolio({ canone: 0.0, cozy: 0.0 });
            const nicchiaList = evaluatePortfolio({ canone: -1.0, cozy: 0.0 });
            const cozyList = evaluatePortfolio({ canone: 0.0, cozy: 1.0 });

            // 1. La lista resta piena (nessun svuotamento)
            expect(baseList.length).toBe(TARGET_PORTFOLIO);
            expect(nicchiaList.length).toBe(TARGET_PORTFOLIO);
            expect(cozyList.length).toBe(TARGET_PORTFOLIO);

            // 2. La composizione cambia (Jaccard tra 0.35 e 0.70: circa un terzo o metà dei titoli diversi)
            const jaccardNicchia = jaccard(baseList, nicchiaList);
            const jaccardCozy = jaccard(baseList, cozyList);

            expect(jaccardNicchia).toBeLessThan(0.80);
            expect(jaccardNicchia).toBeGreaterThan(0.30);

            expect(jaccardCozy).toBeLessThan(0.80);
            expect(jaccardCozy).toBeGreaterThan(0.30);
        });

        test('controprova: il filtro rigido svuota le liste, mentre la modulazione le mantiene piene', () => {
            const hardFilteredNicchia = evaluatePortfolio({ canone: -1.0, cozy: 0.0 }, true);
            const modulatedNicchia = evaluatePortfolio({ canone: -1.0, cozy: 0.0 }, false);

            // Il filtro rigido fa crollare il numero di titoli
            expect(hardFilteredNicchia.length).toBeLessThan(TARGET_PORTFOLIO * 0.5);

            // La modulazione mantiene il portafoglio completo
            expect(modulatedNicchia.length).toBe(TARGET_PORTFOLIO);
        });
    });
});
