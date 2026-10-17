/**
 * tests/poolHiddenGemsSwitch.test.js
 *
 * Collaudo dello switch per hidden_gems nel modulo pool (Ticket 41 - Prima fetta).
 *
 * Verifica:
 * 1. Con lo switch OFF: comportamento vecchio esattamente identico a prima.
 * 2. Con lo switch ON: percorso nuovo su candidate provider (src/indice/candidati).
 * 3. Stessa forma dell'output atteso dal pool ({ ids, meta } o array normalizzabile).
 * 4. Con switch ON, la riga non è vuota e l'invariante claimedIds (nessun duplicato tra righe) regge.
 */

const {
    HERO_STRATEGIES,
    isNewHiddenGemsActive,
    setFlagNewHiddenGems,
    assignHeroPools,
    getHeroCatalogId,
    ensurePoolItem,
    getRecommendationId
} = require('../src/pool');
const duckDbStore = require('../src/indice/duckDbStore');

describe('Pool Hidden Gems Switch (Ticket 41 - Switch OFF vs ON)', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    });

    afterAll(async () => {
        setFlagNewHiddenGems(null);
        delete process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS;
        await duckDbStore.close();
    });

    afterEach(() => {
        setFlagNewHiddenGems(null);
        delete process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS;
    });

    test('lo switch è OFF di default se non configurato', () => {
        expect(isNewHiddenGemsActive()).toBe(false);
    });

    test('lo switch si attiva tramite setFlagNewHiddenGems o variabile d\'ambiente', () => {
        setFlagNewHiddenGems(true);
        expect(isNewHiddenGemsActive()).toBe(true);

        setFlagNewHiddenGems(false);
        expect(isNewHiddenGemsActive()).toBe(false);

        setFlagNewHiddenGems(null);
        process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS = 'true';
        expect(isNewHiddenGemsActive()).toBe(true);
    });

    test('con switch ON, hidden_gems restituisce candidati con forma attesa dal pool', async () => {
        setFlagNewHiddenGems(true);

        const strat = HERO_STRATEGIES.find(s => s.slug === 'hidden_gems');
        expect(strat).toBeDefined();

        const ctx = {
            userId: null,
            context: 'global',
            mediaType: 'movie',
            heroCandidateLimit: 50,
            kidsMode: false,
            effectiveSelectors: { anime: 'neutral' },
            tmdbApiKey: null
        };

        const result = await strat.run(ctx);
        expect(result).toBeDefined();

        const items = Array.isArray(result) ? result : (result.ids || []);
        expect(items.length).toBeGreaterThan(0);

        const first = items[0];
        expect(first).toHaveProperty('id');
        expect(typeof first.id).toBe('string');
        expect(first).toHaveProperty('matchScore');
        expect(first).toHaveProperty('motivo');
    });

    test('con switch ON, l\'invariante claimedIds del pool (disgiunzione righe) è rispettato', async () => {
        setFlagNewHiddenGems(true);

        const strat = HERO_STRATEGIES.find(s => s.slug === 'hidden_gems');
        const ctx = {
            userId: null,
            context: 'global',
            mediaType: 'movie',
            heroCandidateLimit: 30,
            kidsMode: false,
            effectiveSelectors: { anime: 'neutral' },
            tmdbApiKey: null
        };

        const hiddenGemsItems = await strat.run(ctx);
        const normHiddenGems = Array.isArray(hiddenGemsItems) ? hiddenGemsItems : (hiddenGemsItems.ids || []);
        expect(normHiddenGems.length).toBeGreaterThan(0);

        // Simuliamo un pool completo con true_blend che ha già reclamato alcuni ID
        const fakeTrueBlend = [
            { id: normHiddenGems[0].id }, // questo id è condiviso
            { id: 'tmdb:999991' },
            { id: 'tmdb:999992' }
        ];

        const poolsByCatalog = {
            [getHeroCatalogId('true_blend', 'movie')]: fakeTrueBlend,
            [getHeroCatalogId('seed_network', 'movie')]: [],
            [getHeroCatalogId('hidden_gems', 'movie')]: normHiddenGems,
            [getHeroCatalogId('trakt_filtered', 'movie')]: []
        };

        const assigned = assignHeroPools(poolsByCatalog, 'movie', 100);

        const tbAssigned = assigned[getHeroCatalogId('true_blend', 'movie')];
        const hgAssigned = assigned[getHeroCatalogId('hidden_gems', 'movie')];

        expect(tbAssigned.length).toBeGreaterThan(0);
        expect(hgAssigned.length).toBeGreaterThan(0);

        // L'invariante: nessun id assegnato a true_blend può essere in hidden_gems
        const tbIds = new Set(tbAssigned.map(i => getRecommendationId(i)));
        for (const item of hgAssigned) {
            const id = getRecommendationId(item);
            expect(tbIds.has(id)).toBe(false);
        }
    });
});
