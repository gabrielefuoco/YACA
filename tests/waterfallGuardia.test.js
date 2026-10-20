/**
 * Ticket 22 — la guardia del waterfall.
 *
 * IL DIFETTO: il waterfall deduce in ordine di specificità, ma alcune righe non hanno un catalogo servito
 * per il profilo. Deduplicare verso una riga che nessuno mostra toglie titoli alle righe visibili: sul
 * fixture del ticket 11, `il_tuo_mondo` perdeva 59/60 titoli (tutta la top-10) verso `micro_cluster_1`.
 * Ora il pool dice al motore quali ruoli sono serviti, e quella lista entra anche nella chiave di cache.
 */
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const cache = require('../src/cache');
const { righeServiteDelProfilo, buildSharedHeroCacheKey, getHeroPool, HERO_STRATEGIES } = require('../src/pool');

function configCon(presets) {
    return {
        activeProfileId: 'p1',
        profiles: [{ id: 'p1', raw_ui_state: { selectedPresets: presets } }]
    };
}

describe('Ticket 22: la guardia del waterfall', () => {
    describe('la lista dei ruoli serviti', () => {
        test('tiene solo i ruoli i cui cataloghi sono accesi, e li traduce nel nome del motore', () => {
            const cfg = configCon(['yaca_mondi_movies', 'yaca_classici_movies', 'yaca_micro_cluster_2_movies']);
            expect(righeServiteDelProfilo({ userConfig: cfg, context: 'p1', mediaType: 'movie' }))
                // `mondi` -> il ruolo del motore e' `il_tuo_mondo`
                .toEqual(['il_tuo_mondo', 'classici_imperdibili', 'micro_cluster_2']);
        });

        test('i tre ponti sono una riga sola: se il catalogo e\' acceso, partecipano tutti e tre', () => {
            const cfg = configCon(['yaca_punti_incontro_movies']);
            expect(righeServiteDelProfilo({ userConfig: cfg, context: 'p1', mediaType: 'movie' }))
                .toEqual(['punti_incontro_1', 'punti_incontro_2', 'punti_incontro_3']);
        });

        test('nessuna selezione (o nessuna riga di quel medium) -> null, cioe\' il §9.1 puro', () => {
            expect(righeServiteDelProfilo({ userConfig: configCon([]), context: 'p1' })).toBeNull();
            expect(righeServiteDelProfilo({ userConfig: { profiles: [] }, context: 'p1' })).toBeNull();
            // solo righe dei film: per le serie non c'e' niente da proteggere
            expect(righeServiteDelProfilo({ userConfig: configCon(['yaca_mondi_movies']), context: 'p1', mediaType: 'series' })).toBeNull();
        });
    });

    describe('la chiave di cache', () => {
        const base = { userId: 'u1', context: 'p1', mediaType: 'movie', kidsMode: false, typeSelectors: {} };

        test('cambia se cambia l\'insieme servito (il motore deduce solo fra quelli)', () => {
            const senza = buildSharedHeroCacheKey(base);
            const uno = buildSharedHeroCacheKey({ ...base, righeServite: ['il_tuo_mondo'] });
            const due = buildSharedHeroCacheKey({ ...base, righeServite: ['il_tuo_mondo', 'micro_cluster_1'] });
            expect(senza).not.toBe(uno);
            expect(uno).not.toBe(due);
        });

        test('non cambia per l\'ordine dell\'insieme (e\' un insieme, non una lista)', () => {
            const a = buildSharedHeroCacheKey({ ...base, righeServite: ['il_tuo_mondo', 'micro_cluster_1'] });
            const b = buildSharedHeroCacheKey({ ...base, righeServite: ['micro_cluster_1', 'il_tuo_mondo'] });
            expect(a).toBe(b);
        });
    });

    describe('fino al motore', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            jest.spyOn(cache, 'leggi').mockResolvedValue({ value: null, status: 'miss' });
            jest.spyOn(cache, 'scrivi').mockResolvedValue(undefined);
            jest.spyOn(library, 'semiDi').mockResolvedValue({
                seeds: new Map([[603, 5]]),
                counts: { loved: 1, liked: 0, watched: 0, library: 0 }
            });
            jest.spyOn(graphClient, 'getGraphHealthVersions').mockResolvedValue({ artefatto: 'a', ricetta: 'r' });
            jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
                contratto: 1,
                versioni: { artefatto: 'a', ricetta: 'r' },
                semi: { n: 1, da_catalogo: false },
                liste: [{ ruolo: 'il_tuo_mondo', mondo: 1, titoli: [{ tmdbId: 11, medium: 'movie', punteggio: 1 }] }],
                motivi: []
            });
        });

        test('con una selezione parziale il motore riceve `righe_servite`', async () => {
            const strategia = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
            await strategia.run(
                {
                    userId: 'u1',
                    context: 'p1',
                    mediaType: 'movie',
                    userConfig: configCon(['yaca_mondi_movies'])
                },
                { assigned: {}, rawTraktResult: { traktAvailable: false } }
            );
            expect(graphClient.raccomanda).toHaveBeenCalledWith(expect.objectContaining({
                opzioni: expect.objectContaining({ righe_servite: ['il_tuo_mondo'] })
            }));
        });

        test('senza selezione non si manda niente: il motore resta il §9.1', async () => {
            const strategia = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
            await strategia.run(
                { userId: 'u1', context: 'p1', mediaType: 'movie', userConfig: configCon([]) },
                { assigned: {}, rawTraktResult: { traktAvailable: false } }
            );
            const chiamata = graphClient.raccomanda.mock.calls[0][0];
            expect(chiamata.opzioni?.righe_servite).toBeUndefined();
        });
    });
});
