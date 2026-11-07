const { buildManifest, buildManifestFingerprint } = require('../src/stremio');
const { resolveProfileShelves } = require('../src/stremio/shelvesResolver');
const { clearCachedProfileShelves, setCachedProfileShelves } = require('../src/pool');

describe('Manifest with dynamic shelves (Task 5)', () => {
    beforeEach(() => {
        clearCachedProfileShelves();
    });

    const LEGACY_ROLE_IDS = [
        'yaca_mondi_movies',
        'yaca_mondi_series',
        'yaca_passo_fuori_movies',
        'yaca_passo_fuori_series',
        'yaca_uscite_nuove_movies',
        'yaca_uscite_nuove_series',
        'yaca_nicchia_di_qualita_movies',
        'yaca_nicchia_di_qualita_series',
        'yaca_classici_movies',
        'yaca_classici_series',
        'yaca_ultime_visioni_movies',
        'yaca_ultime_visioni_series',
        'yaca_punti_incontro_movies',
        'yaca_punti_incontro_series',
        'yaca_micro_cluster_1_movies',
        'yaca_micro_cluster_1_series',
        'yaca_micro_cluster_2_movies',
        'yaca_micro_cluster_2_series',
        'yaca_micro_cluster_3_movies',
        'yaca_micro_cluster_3_series'
    ];

    function makeUserConfig(shelves = null) {
        return {
            userId: 'user-test-shelves',
            activeProfileId: 'profile-main',
            profiles: [
                {
                    id: 'profile-main',
                    name: 'Principale',
                    catalogs: [],
                    shelves,
                    settings: {
                        typeSelectors: { film: true, serie: true, anime: null },
                        kidsMode: false
                    }
                }
            ],
            customCatalogs: []
        };
    }

    test('manifest with 3 shelves declares exactly 3 shelf catalogs plus the non-personal ones and ZERO legacy role ids', () => {
        const threeShelves = [
            { catalog_id: 'yaca_1401_series', nome: 'Western contemporaneo (serie)', medium: 'series', slot: 1 },
            { catalog_id: 'yaca_1401_movie', nome: 'Western contemporaneo (film)', medium: 'movie', slot: 2 },
            { catalog_id: 'yaca_330459_movie', nome: 'Space opera (film)', medium: 'movie', slot: 3 }
        ];

        const userConfig = makeUserConfig(threeShelves);
        const manifest = buildManifest(userConfig, 'http://localhost:7000', 'user-test-shelves', { shelves: threeShelves });

        // Non-personal catalogs (4 search + 3 watchlist = 7)
        const nonPersonalIds = [
            'yaca_search_standard',
            'yaca_search_ai',
            'yaca_watchlist_movies',
            'yaca_watchlist_series',
            'yaca_watchlist_anime'
        ];

        const catalogIds = manifest.catalogs.map(c => c.id);

        // Exactly 3 shelf catalogs
        const shelfCatalogs = manifest.catalogs.filter(c =>
            c.id === 'yaca_1401_series' || c.id === 'yaca_1401_movie' || c.id === 'yaca_330459_movie'
        );
        expect(shelfCatalogs).toHaveLength(3);
        expect(shelfCatalogs[0]).toMatchObject({ id: 'yaca_1401_series', type: 'series', name: 'Western contemporaneo (serie)' });
        expect(shelfCatalogs[1]).toMatchObject({ id: 'yaca_1401_movie', type: 'movie', name: 'Western contemporaneo (film)' });
        expect(shelfCatalogs[2]).toMatchObject({ id: 'yaca_330459_movie', type: 'movie', name: 'Space opera (film)' });

        // Total catalogs: 4 search + 3 watchlist + 3 shelves = 10
        expect(manifest.catalogs).toHaveLength(10);

        // ZERO legacy editorial role IDs
        for (const legacyId of LEGACY_ROLE_IDS) {
            expect(catalogIds).not.toContain(legacyId);
        }
    });

    test('empty shelves -> no shelf catalogs and no crash', () => {
        const emptyConfig = makeUserConfig([]);
        const manifest = buildManifest(emptyConfig, 'http://localhost:7000', 'user-test-shelves', { shelves: [] });

        expect(manifest).toBeDefined();
        expect(Array.isArray(manifest.catalogs)).toBe(true);

        // Should declare only the 7 non-personal catalogs
        expect(manifest.catalogs).toHaveLength(7);

        const catalogIds = manifest.catalogs.map(c => c.id);
        // ZERO legacy editorial role IDs
        for (const legacyId of LEGACY_ROLE_IDS) {
            expect(catalogIds).not.toContain(legacyId);
        }
    });

    test('fingerprint changes when a shelf name changes', () => {
        const configA = makeUserConfig([
            { catalog_id: 'yaca_1401_series', nome: 'Western contemporaneo (serie)' }
        ]);
        const configB = makeUserConfig([
            { catalog_id: 'yaca_1401_series', nome: 'Frontiera americana (serie)' }
        ]);

        const fpA = buildManifestFingerprint(configA);
        const fpB = buildManifestFingerprint(configB);

        expect(fpA).not.toBe(fpB);
        expect(fpA).toMatch(/^[a-f0-9]{64}$/);
        expect(fpB).toMatch(/^[a-f0-9]{64}$/);
    });

    test('resolveProfileShelves reads from pool in-memory cache if available', async () => {
        const cachedShelves = [
            { catalog_id: 'yaca_cached_1', nome: 'Cache Test', medium: 'movie', slot: 1 }
        ];
        setCachedProfileShelves('profile-cached', cachedShelves);

        const config = {
            userId: 'user-cached',
            activeProfileId: 'profile-cached',
            profiles: [{ id: 'profile-cached', name: 'Cached' }]
        };

        const resolved = await resolveProfileShelves({ userConfig: config, profileId: 'profile-cached' });
        expect(resolved).toEqual(cachedShelves);
    });

    test('resolveProfileShelves returns empty array without throwing when seeds are empty (cold start)', async () => {
        const config = {
            userId: 'user-cold-start',
            activeProfileId: 'profile-cold',
            profiles: [{ id: 'profile-cold', name: 'Cold' }]
        };

        const resolved = await resolveProfileShelves({ userConfig: config, profileId: 'profile-cold' });
        expect(resolved).toEqual([]);
    });
});
