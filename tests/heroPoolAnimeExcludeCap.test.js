// tests/heroPoolAnimeExcludeCap.test.js

/**
 * Test di accettazione per il requisito ereditato dal Ticket 38 (Ticket 12):
 * "Il cap si applica DOPO i filtri, MAI prima."
 *
 * Nel Ticket 38, per un profilo con `effectiveTypeSelectors: { anime: 'exclude' }`:
 * - Nel pool c'erano 60 serie candidate (un mondo misto anime + live-action).
 * - Nei primi 20 ID campionati, 17 o 18 erano anime.
 * - `.slice(0, 20)` applicato prima del filtro post-fetch riduceva il set a 2-3 titoli.
 *
 * Con il fix del Ticket 12:
 * - Il cap conta SOLO ciò che sopravvive ai filtri: il fetch prosegue nei blocchi successivi
 *   fino a riempire la pagina da 20 con titoli che hanno superato il filtro anime.
 * - Conteggio prima del fix: 2 (o 3) serie.
 * - Conteggio dopo il fix: 20 serie su 20.
 */

jest.mock('../src/models/TasteProfile');
jest.mock('../src/models/AddonConfig');
jest.mock('../src/models/UserAccount');
jest.mock('../src/clients/tmdb');
jest.mock('../src/indice/duckDbProvider', () => {
    const actual = jest.requireActual('../src/indice/duckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn()
    };
});
jest.mock('../src/pool', () => {
    const actual = jest.requireActual('../src/pool');
    return {
        ...actual,
        getHeroPool: jest.fn()
    };
});

const TasteProfile = require('../src/models/TasteProfile');
const AddonConfig = require('../src/models/AddonConfig');
const UserAccount = require('../src/models/UserAccount');
const tmdb = require('../src/clients/tmdb');
const { getDuckDbMetaDetails } = require('../src/indice/duckDbProvider');
const { getHeroPool } = require('../src/pool');
const { getHybridCatalog } = require('../src/stremio/hybridServing');
const { getEngineHybridCatalog } = require('../src/stremio/hybridServing');

describe('Ticket 12 / Ticket 38: il cap si applica DOPO i filtri (anime: exclude)', () => {
    const mockItems = {};

    // 18 serie anime (ID 1001 .. 1018)
    for (let i = 1; i <= 18; i++) {
        const id = 1000 + i;
        mockItems[String(id)] = {
            id,
            name: `Anime Series ${i}`,
            title: `Anime Series ${i}`,
            type: 'series',
            media_type: 'tv',
            original_language: 'ja',
            genre_ids: [16, 18],
            genres: [{ id: 16, name: 'Animation' }, { id: 18, name: 'Drama' }],
            keywords: [{ id: 210024, name: 'anime' }],
            vote_count: 3000,
            vote_average: 8.0
        };
    }

    // 42 serie live-action (ID 2001 .. 2042)
    for (let i = 1; i <= 42; i++) {
        const id = 2000 + i;
        mockItems[String(id)] = {
            id,
            name: `Live Action Series ${i}`,
            title: `Live Action Series ${i}`,
            type: 'series',
            media_type: 'tv',
            original_language: 'en',
            genre_ids: [18, 35],
            genres: [{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }],
            keywords: [{ id: 100, name: 'hospital' }],
            vote_count: 5000,
            vote_average: 8.2
        };
    }

    // Pool misto da 60 item: primi 18 anime, 2 live-action, poi altre 40 live-action
    // Primi 20 elementi = [1001..1018 (18 anime), 2001..2002 (2 live-action)]
    // Elementi 21..60 = [2003..2042 (40 live-action)]
    const mixed60Candidates = [
        ...Array.from({ length: 18 }, (_, i) => ({ id: `tmdb:${1001 + i}`, tmdbId: 1001 + i, type: 'series', media_type: 'tv' })),
        ...Array.from({ length: 42 }, (_, i) => ({ id: `tmdb:${2001 + i}`, tmdbId: 2001 + i, type: 'series', media_type: 'tv' }))
    ];

    const userConfig = {
        userId: 'liveaction_user',
        activeProfileId: 'no_anime_profile',
        activeProfileSettings: {
            typeSelectors: { anime: 'exclude' },
            kidsMode: false
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        TasteProfile.findOne.mockResolvedValue({
            owner: 'liveaction_user',
            context: 'no_anime_profile',
            compiledVectors: { V_final: { 'g:18': 10 } },
            settings: { typeSelectors: { anime: 'exclude' } },
            lastUpdated: new Date()
        });

        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                userId: 'liveaction_user',
                addonUuid: 'addon_uuid'
            })
        });

        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                uuid: 'addon_uuid',
                userId: 'liveaction_user',
                apiKeys: {},
                profiles: [{
                    id: 'no_anime_profile',
                    settings: {
                        kidsMode: false,
                        typeSelectors: { film: false, serie: false, anime: 'exclude' }
                    }
                }]
            })
        });

        getDuckDbMetaDetails.mockImplementation(async (id, type) => {
            const raw = mockItems[String(id)];
            if (!raw) return null;
            return {
                id: `tmdb:${id}`,
                type: 'series',
                name: raw.name,
                rawTMDB: raw
            };
        });

        tmdb.getTmdbMovieDetails.mockImplementation(async (key, id) => {
            return mockItems[String(id)] || null;
        });

        // Il pool consegna 60 candidati per yaca_mondi_series
        getHeroPool.mockResolvedValue({
            yaca_mondi_series: mixed60Candidates,
            catalogs: {
                yaca_mondi_series: mixed60Candidates
            }
        });
    });

    test('misura del ticket 38: con anime: exclude su 60 candidati misti sopravvivono 20 serie (prima erano 2)', async () => {
        // Simulazione della logica VECCHIA (slice prima dei filtri):
        // Se si tagliasse a monte a 20 candidati:
        const oldSliceFirst = mixed60Candidates.slice(0, 20);
        const oldSurvivingCount = oldSliceFirst.filter(item => {
            const data = mockItems[String(item.tmdbId)];
            return data && !(data.genre_ids.includes(16) && data.original_language === 'ja');
        }).length;

        // Verifica che nello scenario del test la logica vecchia avrebbe prodotto esattamente 2 titoli
        expect(oldSurvivingCount).toBe(2);

        // Esecuzione REALE con la logica NUOVA (cap applicato dopo i filtri):
        const results = await getHybridCatalog(
            'yaca_mondi_series',
            0,
            null,
            'tmdb_key',
            'liveaction_user',
            'no_anime_profile',
            userConfig
        );

        // DOPO il fix:
        // L'engine continua il campionamento e raccoglie 20 serie che sopravvivono al filtro anime:
        expect(results.length).toBe(20);

        // Tutti e 20 sono non-anime e sono serie live-action
        for (const item of results) {
            expect(item.type).toBe('series');
            expect(item.media_type).toBe('tv');
            expect(item.genre_ids).not.toContain(16);
            expect(item.original_language).not.toBe('ja');
            const numericId = Number(item.id.replace('tmdb:', ''));
            expect(numericId).toBeGreaterThanOrEqual(2001);
            expect(numericId).toBeLessThanOrEqual(2042);
        }

        // Verifica tramite porta provider HybridProvider
        const providerResults = await getEngineHybridCatalog(
            'yaca_mondi_series',
            'series',
            0,
            userConfig,
            'tmdb_key',
            userConfig.activeProfileSettings
        );
        expect(providerResults.length).toBe(20);
    });
});
