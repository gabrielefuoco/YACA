/**
 * tests/shelfCatalogsIntegration.test.js
 *
 * Test di integrazione per gli scaffali dinamici del grafo (V45):
 * 1. Data una risposta fake di POST /scaffali con 3 scaffali, il manifest dichiara esattamente
 *    3 cataloghi hero con quegli ID, tipi e nomi, ordinati per slot.
 * 2. Il pool (getHeroPool / buildSharedHeroCatalogs) interroga graphClient.scaffali e restituisce
 *    i titoli associati a ciascun catalogo scaffale.
 * 3. Un profilo contenente i 10 ID hero legacy in selectedPresets non crasha, ignora silenziosamente
 *    i vecchi ruoli editoriali e dichiara/serve gli scaffali qualificati.
 * 4. graphClient.scaffali sanitizza i semi, escludendo chiavi sconosciute (es. recente, peso) e
 *    trasmettendo correttamente plays, eta_giorni e medium.
 */

const { buildManifest } = require('../src/stremio/manifest');
const { isHeroCatalogId, catalogDefinitionsFromShelves } = require('../src/catalog/registry');
const { getHeroPool, buildSharedHeroCatalogs } = require('../src/pool');
const impressioni = require('../src/pool/impressioni');
const profileContext = require('../src/profile/profileContext');
const cache = require('../src/cache');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const axios = require('axios');

const FAKE_SCAFFALI_RESPONSE = {
    ok: true,
    contratto_versione: 2,
    scaffali: [
        {
            catalog_id: 'yaca_12609_series',
            nome: 'Anime shōnen',
            nome_fonte: 'tassonomia',
            confidenza: 1.0,
            medium: 'series',
            slot: 1,
            semi_rappresentativi: [
                { tmdbId: 12609, medium: 'series', titolo: 'Dragon Ball Z', anno: 1989, plays: 12.0, eta_giorni: 5.0 }
            ],
            semi_membri: [
                { tmdbId: 12609, medium: 'series', titolo: 'Dragon Ball Z', anno: 1989 }
            ],
            titoli: [
                { key: 'tv:46298', tmdbId: 46298, medium: 'series', punteggio: 0.95 },
                { key: 'tv:110356', tmdbId: 110356, medium: 'series', punteggio: 0.88 }
            ]
        },
        {
            catalog_id: 'yaca_447332_movie',
            nome: 'Horror psicologico',
            nome_fonte: 'tassonomia',
            confidenza: 0.92,
            medium: 'movie',
            slot: 2,
            semi_rappresentativi: [
                { tmdbId: 447332, medium: 'movie', titolo: 'A Quiet Place', anno: 2018, plays: 2.0, eta_giorni: 12.0 }
            ],
            semi_membri: [
                { tmdbId: 447332, medium: 'movie', titolo: 'A Quiet Place', anno: 2018 }
            ],
            titoli: [
                { key: 'movie:50014', tmdbId: 50014, medium: 'movie', punteggio: 0.91 }
            ]
        },
        {
            catalog_id: 'yaca_4607_series',
            nome: 'Mistero & Sci-Fi',
            nome_fonte: 'tassonomia',
            confidenza: 0.88,
            medium: 'series',
            slot: 3,
            semi_rappresentativi: [
                { tmdbId: 4607, medium: 'series', titolo: 'Lost', anno: 2004, plays: 8.0, eta_giorni: 20.0 }
            ],
            semi_membri: [
                { tmdbId: 4607, medium: 'series', titolo: 'Lost', anno: 2004 }
            ],
            titoli: [
                { key: 'tv:1399', tmdbId: 1399, medium: 'series', punteggio: 0.85 }
            ]
        }
    ],
    statistiche: {
        semi_totali: 3,
        semi_coperti: 3,
        righe: 3
    }
};

describe('Integrazione Scaffali V45: Manifest, Pool e Migrazione', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('1. Dato un fixture a 3 scaffali, il manifest dichiara esattamente 3 cataloghi con quegli ID e tipi', () => {
        const userConfig = {
            userId: 'user_test_shelves',
            activeProfileId: 'profile_test',
            profiles: [{
                id: 'profile_test',
                name: 'Test Profile',
                raw_ui_state: {
                    selectedPresets: []
                }
            }],
            shelves: FAKE_SCAFFALI_RESPONSE.scaffali
        };

        const manifest = buildManifest(userConfig);
        const heroCatalogs = manifest.catalogs.filter(c => isHeroCatalogId(c.id));

        expect(heroCatalogs).toHaveLength(3);
        expect(heroCatalogs.map(c => c.id)).toEqual([
            'yaca_12609_series',
            'yaca_447332_movie',
            'yaca_4607_series'
        ]);
        expect(heroCatalogs.map(c => c.type)).toEqual([
            'series',
            'movie',
            'series'
        ]);
        expect(heroCatalogs.map(c => c.name)).toEqual([
            'Anime shōnen',
            'Horror psicologico',
            'Mistero & Sci-Fi'
        ]);
    });

    test('2. Con options.shelvesOnly, il manifest dichiara esclusivamente i 3 cataloghi scaffale', () => {
        const manifest = buildManifest({
            shelves: FAKE_SCAFFALI_RESPONSE.scaffali,
            shelvesOnly: true
        });

        expect(manifest.catalogs).toHaveLength(3);
        expect(manifest.catalogs[0].id).toBe('yaca_12609_series');
        expect(manifest.catalogs[1].id).toBe('yaca_447332_movie');
        expect(manifest.catalogs[2].id).toBe('yaca_4607_series');
    });

    test('3. Il pool interroga graphClient.scaffali e restituisce i titoli per ciascuno scaffale', async () => {
        jest.spyOn(profileContext, 'fetchProfileContext').mockResolvedValue({ profile: {}, user: {} });
        jest.spyOn(cache, 'leggi').mockResolvedValue({ value: null, status: 'miss' });
        jest.spyOn(cache, 'scrivi').mockResolvedValue(true);
        jest.spyOn(impressioni, 'applicaDecadimento').mockImplementation(async ({ assigned }) => ({
            assigned,
            statistiche: { titoli: 0, cataloghi: 0, riposati: 0, spostamenti: 0, giorniMedi: 0, righeNonOrdinate: 0 }
        }));
        jest.spyOn(library, 'semiDi').mockResolvedValue({
            seeds: new Map([['12609', 4], ['447332', 3]]),
            tipi: new Map([['12609', 'loved'], ['447332', 'liked']]),
            ultimaVisione: new Map([['12609', Date.now() - 86400000 * 5]]),
            plays: new Map([['12609', 12]]),
            counts: { loved: 1, liked: 1, watched: 0, library: 0 }
        });

        jest.spyOn(graphClient, 'getGraphHealthVersions').mockResolvedValue({ artefatto: 'v45', ricetta: 'v45' });
        const scaffaliSpy = jest.spyOn(graphClient, 'scaffali').mockResolvedValue(FAKE_SCAFFALI_RESPONSE);

        const pool = await getHeroPool({
            userId: 'user_pool_test',
            context: 'prof_pool_test',
            mediaType: 'series'
        });

        expect(scaffaliSpy).toHaveBeenCalled();
        const callArgs = scaffaliSpy.mock.calls[0];
        // semi passati come primo argomento
        const semiInviati = callArgs[0];
        expect(Array.isArray(semiInviati)).toBe(true);
        expect(semiInviati.length).toBeGreaterThan(0);
        // Ogni seme ha plays e medium, NON contiene 'recente' né 'peso'. `eta_giorni` c'è
        // solo dove esiste una data di visione: dove manca il campo si omette, invece di
        // riempirlo con l'indice del seme (che l'interfaccia leggeva come «oggi»).
        for (const s of semiInviati) {
            expect(s.plays).toBeDefined();
            expect(s.medium).toBeDefined();
            expect(s.recente).toBeUndefined();
            expect(s.peso).toBeUndefined();
            if (s.eta_giorni !== undefined) {
                expect(typeof s.eta_giorni).toBe('number');
                expect(Number.isFinite(s.eta_giorni)).toBe(true);
            }
        }
        const conData = semiInviati.find(s => String(s.tmdbId) === '12609');
        expect(conData?.eta_giorni).toBeGreaterThan(4);

        // Il pool contiene i titoli per ciascuno dei cataloghi scaffale
        expect(pool['yaca_12609_series']).toBeDefined();
        expect(pool['yaca_12609_series'].length).toBe(2);
        expect(pool['yaca_12609_series'][0].id).toBe('tmdb:46298');

        expect(pool['yaca_4607_series']).toBeDefined();
        expect(pool['yaca_4607_series'].length).toBe(1);
        expect(pool['yaca_4607_series'][0].id).toBe('tmdb:1399');
    });

    test('4. Un profilo con i 10 ID legacy in selectedPresets ignora i vecchi ID e serve gli scaffali senza crashare', () => {
        const legacyPresets = [
            'yaca_mondi_movies',
            'yaca_passo_fuori_movies',
            'yaca_uscite_nuove_movies',
            'yaca_nicchia_di_qualita_movies',
            'yaca_classici_movies',
            'yaca_ultime_visioni_movies',
            'yaca_punti_incontro_movies',
            'yaca_micro_cluster_1_movies',
            'yaca_micro_cluster_2_movies',
            'yaca_micro_cluster_3_movies'
        ];

        const userConfig = {
            userId: 'user_legacy_migration',
            activeProfileId: 'prof_legacy',
            profiles: [{
                id: 'prof_legacy',
                name: 'Legacy Profile',
                raw_ui_state: {
                    selectedPresets: legacyPresets
                }
            }],
            shelves: FAKE_SCAFFALI_RESPONSE.scaffali
        };

        const manifest = buildManifest(userConfig);
        const heroCatalogs = manifest.catalogs.filter(c => isHeroCatalogId(c.id));

        // Non crasha, mostra i 3 scaffali e nessuno dei 10 ruoli legacy
        expect(heroCatalogs).toHaveLength(3);
        const catalogIds = heroCatalogs.map(c => c.id);
        for (const legacyId of legacyPresets) {
            expect(catalogIds).not.toContain(legacyId);
        }
    });

    test('5. graphClient.scaffali sanitizza il payload ed esclude chiavi sconosciute', async () => {
        const postSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
            data: FAKE_SCAFFALI_RESPONSE
        });

        const rawSemi = [
            {
                tmdbId: 12609,
                medium: 'tv', // deve diventare 'series'
                tipo: 'loved',
                plays: 10,
                eta_giorni: 2.5,
                recente: true, // DEVE ESSERE RIMOSSO
                peso: 4.5,     // DEVE ESSERE RIMOSSO
                unknown_key: 'danger' // DEVE ESSERE RIMOSSO
            }
        ];

        const res = await graphClient.scaffali(rawSemi, { medium: 'series' });
        expect(res.ok).toBe(true);
        expect(postSpy).toHaveBeenCalledTimes(1);

        const sentPayload = postSpy.mock.calls[0][1];
        expect(sentPayload.medium).toBe('series');
        expect(sentPayload.semi).toHaveLength(1);

        const sentSeed = sentPayload.semi[0];
        expect(sentSeed.tmdbId).toBe(12609);
        expect(sentSeed.medium).toBe('series');
        expect(sentSeed.plays).toBe(10);
        expect(sentSeed.eta_giorni).toBe(2.5);
        expect(sentSeed.tipo).toBe('loved');
        expect(sentSeed.recente).toBeUndefined();
        expect(sentSeed.peso).toBeUndefined();
        expect(sentSeed.unknown_key).toBeUndefined();
    });
});

describe("Il confine di rete non inventa l'età di un seme", () => {
    // `sanitizeScaffaliSeed` riempiva `eta_giorni` con l'INDICE del seme quando mancava:
    // l'interfaccia lo leggeva come «visto oggi», e ogni correzione a monte veniva annullata
    // un istante prima della chiamata HTTP.
    const { sanitizeScaffaliSeed } = require('../src/clients/graphClient');

    test('un seme senza età resta senza età', () => {
        const s = sanitizeScaffaliSeed({ tmdbId: 671, plays: 1, medium: 'movie' }, 7);
        expect(s).not.toHaveProperty('eta_giorni');
    });

    test("un'età dichiarata passa intatta", () => {
        const s = sanitizeScaffaliSeed({ tmdbId: 671, plays: 1, eta_giorni: 12.5 }, 7);
        expect(s.eta_giorni).toBe(12.5);
    });

    test("un'età non valida si scarta, non diventa un indice", () => {
        const s = sanitizeScaffaliSeed({ tmdbId: 671, plays: 1, eta_giorni: 'boh' }, 7);
        expect(s).not.toHaveProperty('eta_giorni');
    });
});
