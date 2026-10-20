// tests/catalogTypeAndValidation.test.js

/**
 * TDD AT THE TYPE SEAM (Ticket 23).
 *
 * Test suite per:
 * 1. La forma del tipo catalogo dichiarativo (una natura sola: system & user).
 * 2. L'invarianza assoluta delle derivazioni dalle definizioni (manifest, fingerprints, kind, pool spec, uiGroups, registry hash).
 * 3. Le regole di validazione (lingua × capacità dichiarate delle fonti).
 * 4. Il contratto dell'anteprima (card con cap a 20 e diagnosi strutturata).
 */

const {
    defineCatalog,
    normalizeMediaSet,
    mediaSetToType,
    normalizeAnimeAxis,
    HERO_REGISTRY,
    HERO_SYSTEM_CATALOGS,
    HERO_IDS,
    HERO_PREFIXES,
    getManifestHeroCatalogs,
    getHeroCatalogFingerprintRows,
    getHeroCatalogModes,
    getHeroPrefixes,
    isHeroCatalogId,
    getHeroCatalogKindMap,
    getHeroUiGroups,
    getHeroPoolSpec,
    getRegistryHash,
    validateCatalogDefinition,
    getSourceCapabilities,
    formatPreviewResponse,
    validatePreviewResponse,
    PREVIEW_CAP
} = require('../src/catalog');

const { getPresets } = require('../src/catalog/presets');

describe('Ticket 23: Il Tipo Catalogo e le sue Derivazioni', () => {

    describe('1. Forma dichiarativa del Tipo Catalogo', () => {
        test('defineCatalog genera la forma unificata con tutti i campi dichiarativi', () => {
            const def = defineCatalog({
                id: 'preset_custom_test',
                name: 'Miei Film Preferiti',
                emoji: '🍿',
                mediaSet: ['film'],
                anime: 'no',
                filters: {
                    queries: [{ strategy: 'discovery', with_genres: 28, 'vote_count.gte': 50 }]
                },
                sort: {
                    by: 'popularity.desc',
                    sortable: true
                },
                system: {
                    isSystem: false,
                    userModifiable: true,
                    category: 'Test'
                }
            });

            // Campi canonici del tipo
            expect(def.id).toBe('preset_custom_test');
            expect(def.name).toBe('Miei Film Preferiti');
            expect(def.emoji).toBe('🍿');
            expect(def.mediaSet).toEqual(['film']);
            expect(def.anime).toBe('no');
            expect(def.filters).toBeDefined();
            expect(def.filters.queries).toHaveLength(1);
            expect(def.sort).toBeDefined();
            expect(def.sort.by).toBe('popularity.desc');
            expect(def.sort.sortable).toBe(true);
            expect(def.system).toBeDefined();
            expect(def.system.isSystem).toBe(false);
            expect(def.system.userModifiable).toBe(true);

            // Proprietà di retrocompatibilità
            expect(def.type).toBe('movie');
            expect(def.isAnime).toBe(false);
            expect(def.queries).toHaveLength(1);
            expect(def.sortable).toBe(true);
            expect(def.category).toBe('Test');
        });

        test('mediaSetToType e normalizeMediaSet gestiscono film, serie e both', () => {
            expect(normalizeMediaSet('movie')).toEqual(['film']);
            expect(normalizeMediaSet('film')).toEqual(['film']);
            expect(normalizeMediaSet(['film'])).toEqual(['film']);

            expect(normalizeMediaSet('series')).toEqual(['serie']);
            expect(normalizeMediaSet('serie')).toEqual(['serie']);
            expect(normalizeMediaSet('tv')).toEqual(['serie']);
            expect(normalizeMediaSet(['serie'])).toEqual(['serie']);

            expect(normalizeMediaSet('both')).toEqual(['film', 'serie']);
            expect(normalizeMediaSet(['film', 'serie'])).toEqual(['film', 'serie']);

            expect(mediaSetToType(['film'])).toBe('movie');
            expect(mediaSetToType(['serie'])).toBe('series');
            expect(mediaSetToType(['film', 'serie'])).toBe('both');
        });

        test('normalizeAnimeAxis normalizza i 4 valori dell\'asse anime e booleani', () => {
            expect(normalizeAnimeAxis('yes')).toBe('yes');
            expect(normalizeAnimeAxis('no')).toBe('no');
            expect(normalizeAnimeAxis('mixed')).toBe('mixed');
            expect(normalizeAnimeAxis('agnostic')).toBe('agnostic');
            expect(normalizeAnimeAxis(true)).toBe('yes');
            expect(normalizeAnimeAxis(false)).toBe('no');
            expect(normalizeAnimeAxis('invalid')).toBe('no');
        });
    });

    describe('2. Invarianza delle Derivazioni (Regression Net)', () => {
        test('getManifestHeroCatalogs produce esattamente le 20 righe hero per Stremio', () => {
            const manifestRows = getManifestHeroCatalogs();
            // Ticket 13: erano 8 (4 righe x 2 medium); ora 20 (10 x 2).
            expect(manifestRows).toHaveLength(20);

            expect(manifestRows[0]).toEqual({
                id: 'yaca_mondi_movies',
                type: 'movie',
                name: '🌍 Il tuo mondo',
                extra: [{ name: 'skip' }]
            });
            expect(manifestRows[1]).toEqual({
                id: 'yaca_mondi_series',
                type: 'series',
                name: '🌍 Il tuo mondo',
                extra: [{ name: 'skip' }]
            });
            expect(manifestRows[6]).toEqual({
                id: 'yaca_nicchia_di_qualita_movies',
                type: 'movie',
                name: '💎 Nicchia di Qualità',
                extra: [{ name: 'skip' }]
            });
            expect(manifestRows[7]).toEqual({
                id: 'yaca_nicchia_di_qualita_series',
                type: 'series',
                name: '💎 Nicchia di Qualità',
                extra: [{ name: 'skip' }]
            });
        });

        test('getHeroCatalogFingerprintRows produce le 20 righe per la firma cache', () => {
            const fingerprints = getHeroCatalogFingerprintRows();
            // Ticket 13: erano 8 (4 righe x 2 medium); ora 20 (10 x 2): il registro elenca anche
            // classici, ultime visioni, punti d'incontro e i tre slot dei micro-cluster.
            expect(fingerprints).toHaveLength(20);
            for (const row of fingerprints) {
                expect(row).toHaveProperty('id');
                expect(row).toHaveProperty('type');
                expect(row).toHaveProperty('name');
                expect(row).not.toHaveProperty('extra');
            }
        });

        test('getHeroCatalogKindMap mappa tutti i 20 cataloghi a mediaSet, anime: agnostic, alwaysVisible: false', () => {
            const kindMap = getHeroCatalogKindMap();
            expect(Object.keys(kindMap)).toHaveLength(20);  // Ticket 13: erano 8

            expect(kindMap['yaca_mondi_movies']).toEqual({
                mediaSet: ['film'],
                anime: 'agnostic',
                alwaysVisible: false
            });
            expect(kindMap['yaca_mondi_series']).toEqual({
                mediaSet: ['serie'],
                anime: 'agnostic',
                alwaysVisible: false
            });
            expect(kindMap['yaca_uscite_nuove_movies']).toEqual({
                mediaSet: ['film'],
                anime: 'agnostic',
                alwaysVisible: false
            });
        });

        test('getHeroPoolSpec mantiene le priorità, gli slug e l\'additività di Ticket 46', () => {
            const poolSpec = getHeroPoolSpec();

            // Ordine di priorità: le quattro righe storiche restano prime (Ticket 46), poi le righe
            // nuove del cantiere righe-vive nell'ordine in cui il motore le produce (Ticket 13).
            expect(poolSpec.heroPriority).toEqual([
                'mondi',
                'passo_fuori',
                'uscite_nuove',
                'nicchia_di_qualita',
                'classici',
                'ultime_visioni',
                'punti_incontro',
                'micro_cluster_1',
                'micro_cluster_2',
                'micro_cluster_3'
            ]);

            // Slug additivi: tutte le righe del grafo sono additive (erano 4, ora 10 — Ticket 13)
            for (const slug of poolSpec.heroPriority) {
                expect(poolSpec.slugAdditivi.has(slug)).toBe(true);
            }
            expect(poolSpec.slugAdditivi.size).toBe(10);

            // 10 slug base e 20 cataloghi associati (erano 4 e 8)
            expect(poolSpec.slugs).toHaveLength(10);
            expect(poolSpec.catalogs).toHaveLength(20);
        });

        test('getHeroUiGroups raggruppa le 10 card per la UI di configurazione', () => {
            const groups = getHeroUiGroups();
            // Ticket 13: erano 4 card, ora 10 (le sei righe nuove sono additive).
            expect(groups).toHaveLength(10);
            expect(groups.map(g => g.idBase)).toEqual([
                'yaca_mondi',
                'yaca_passo_fuori',
                'yaca_uscite_nuove',
                'yaca_nicchia_di_qualita',
                'yaca_classici',
                'yaca_ultime_visioni',
                'yaca_punti_incontro',
                'yaca_micro_cluster_1',
                'yaca_micro_cluster_2',
                'yaca_micro_cluster_3'
            ]);
            expect(groups[0]).toEqual({
                idBase: 'yaca_mondi',
                label: 'Il tuo mondo',
                emoji: '🌍',
                desc: 'La bolla che la tua storia accende di piu\': il tuo mondo, coi suoi titoli.',
                type: 'algo'
            });
        });

        test('getHeroCatalogModes restituisce le strategie dichiarate per il motore', () => {
            const modes = getHeroCatalogModes();
            expect(modes['yaca_mondi_movies']).toBeNull();
            expect(modes['yaca_uscite_nuove_series']).toBeNull();
        });

        test('getRegistryHash calcola l\'hash identico a quello precedente (aa9da269c5787496)', () => {
            // Ticket 13: l'hash cambia di proposito (sei righe nuove nel registro).
            // prima: 4abf3230f7019d6d
            expect(getRegistryHash()).toBe('aa9da269c5787496');
        });

        test('isHeroCatalogId riconosce tutti i 20 hero e rifiuta ID sconosciuti o rimossi', () => {
            for (const id of HERO_IDS) {
                expect(isHeroCatalogId(id)).toBe(true);
            }
            expect(isHeroCatalogId('yaca_true_blend_movies')).toBe(false);
            expect(isHeroCatalogId('preset_pop_movies')).toBe(false);
            expect(isHeroCatalogId('random_id')).toBe(false);
            expect(isHeroCatalogId(null)).toBe(false);
        });
    });

    describe('3. Regole di Validazione (Lingua × Capacità Servire)', () => {
        test('Rifiuta oggetto nullo o non valido', () => {
            const res = validateCatalogDefinition(null);
            expect(res.valid).toBe(false);
            expect(res.errors[0].code).toBe('ERR_INVALID_OBJECT');
        });

        test('Rifiuta ID mancante o con caratteri vietati', () => {
            const r1 = validateCatalogDefinition({ name: 'Test', mediaSet: ['film'] });
            expect(r1.valid).toBe(false);
            expect(r1.errors.some(e => e.code === 'ERR_EMPTY_ID')).toBe(true);

            const r2 = validateCatalogDefinition({ id: 'bad id with spaces!', name: 'Test', mediaSet: ['film'] });
            expect(r2.valid).toBe(false);
            expect(r2.errors.some(e => e.code === 'ERR_INVALID_ID_CHARS')).toBe(true);
        });

        test('Rifiuta nome vuoto o superiore a 100 caratteri', () => {
            const r1 = validateCatalogDefinition({ id: 'test_cat', name: '', mediaSet: ['film'] });
            expect(r1.valid).toBe(false);
            expect(r1.errors.some(e => e.code === 'ERR_EMPTY_NAME')).toBe(true);

            const r2 = validateCatalogDefinition({ id: 'test_cat', name: 'A'.repeat(101), mediaSet: ['film'] });
            expect(r2.valid).toBe(false);
            expect(r2.errors.some(e => e.code === 'ERR_NAME_TOO_LONG')).toBe(true);
        });

        test('Rifiuta mediaSet vuoto o contenente valori non ammessi', () => {
            const r1 = validateCatalogDefinition({ id: 'test_cat', name: 'Test', mediaSet: [] });
            expect(r1.valid).toBe(false);
            expect(r1.errors.some(e => e.code === 'ERR_EMPTY_MEDIASET')).toBe(true);

            const r2 = validateCatalogDefinition({ id: 'test_cat', name: 'Test', mediaSet: ['podcast'] });
            expect(r2.valid).toBe(false);
            expect(r2.errors.some(e => e.code === 'ERR_INVALID_MEDIASET')).toBe(true);
        });

        test('Rifiuta asse anime non ammesso', () => {
            const r = validateCatalogDefinition({ id: 'test_cat', name: 'Test', mediaSet: ['film'], anime: 'maybe' });
            expect(r.valid).toBe(false);
            expect(r.errors.some(e => e.code === 'ERR_INVALID_ANIME_AXIS')).toBe(true);
        });

        test('Rifiuta valori di filtro numerici non validi', () => {
            const r = validateCatalogDefinition({
                id: 'test_cat',
                name: 'Test',
                mediaSet: ['film'],
                filters: { 'vote_average.gte': 15 }
            });
            expect(r.valid).toBe(false);
            expect(r.errors.some(e => e.code === 'ERR_INVALID_FILTER_VALUE')).toBe(true);
        });

        test('Rifiuta mediaSet incompatibile con la fonte (es. airing_state per soli film)', () => {
            const r = validateCatalogDefinition({
                id: 'preset_anime_simulcast',
                name: 'Simulcast Film',
                mediaSet: ['film'],
                anime: 'yes',
                _provider: 'airing_state'
            });
            expect(r.valid).toBe(false);
            expect(r.errors.some(e => e.code === 'ERR_SOURCE_CANNOT_SERVE_MEDIASET')).toBe(true);
        });

        test('Rifiuta asse anime incompatibile con la fonte (es. airing_state con anime: no)', () => {
            const r = validateCatalogDefinition({
                id: 'preset_anime_simulcast',
                name: 'Simulcast No Anime',
                mediaSet: ['serie'],
                anime: 'no',
                _provider: 'airing_state'
            });
            expect(r.valid).toBe(false);
            expect(r.errors.some(e => e.code === 'ERR_SOURCE_CANNOT_SERVE_ANIME')).toBe(true);
        });

        test('Rifiuta filtro non supportato dalla fonte dichiarata', () => {
            // airing_state non supporta 'with_crew'
            const r1 = validateCatalogDefinition({
                id: 'preset_anime_simulcast',
                name: 'Simulcast Nolan',
                mediaSet: ['serie'],
                anime: 'yes',
                _provider: 'airing_state',
                filters: { with_crew: 525 }
            });
            expect(r1.valid).toBe(false);
            expect(r1.errors.some(e => e.code === 'ERR_SOURCE_UNSUPPORTED_FILTER')).toBe(true);

            // duckdb non supporta un filtro inventato
            const r2 = validateCatalogDefinition({
                id: 'test_cat',
                name: 'Test Cat',
                mediaSet: ['film'],
                anime: 'no',
                filters: { filtro_inesistente_xyz: 123 }
            });
            expect(r2.valid).toBe(false);
            expect(r2.errors.some(e => e.code === 'ERR_SOURCE_UNSUPPORTED_FILTER')).toBe(true);
        });

        test('Rifiuta definizione multi-query se il secondo blocco contiene un filtro non supportato', () => {
            const r = validateCatalogDefinition({
                id: 'test_multi_invalid_second_block',
                name: 'Multi Query Invalid Second Block',
                mediaSet: ['film'],
                anime: 'no',
                filters: {
                    queries: [
                        { strategy: 'discovery', sort_by: 'popularity.desc' },
                        { strategy: 'discovery', filtro_che_non_esiste: 123 }
                    ]
                }
            });
            expect(r.valid).toBe(false);
            expect(r.errors.some(e => e.code === 'ERR_SOURCE_UNSUPPORTED_FILTER' && e.field === 'filters[1].filtro_che_non_esiste')).toBe(true);
        });

        test('Valida con successo una definizione corretta', () => {
            const r = validateCatalogDefinition({
                id: 'preset_pop_movies',
                name: 'Film Popolari',
                emoji: '🌟',
                mediaSet: ['film'],
                anime: 'no',
                filters: {
                    queries: [{ strategy: 'discovery', sort_by: 'popularity.desc', 'vote_count.gte': 100 }]
                }
            });
            expect(r.valid).toBe(true);
            expect(r.errors).toHaveLength(0);
        });

        test('Tutti i 12 cataloghi hero di sistema superano la validazione', () => {
            for (const hero of HERO_SYSTEM_CATALOGS) {
                const res = validateCatalogDefinition(hero);
                expect(res.valid).toBe(true);
                expect(res.errors).toHaveLength(0);
            }
        });

        test('Tutti i 163 preset utente di presets.js superano la validazione', () => {
            const presets = getPresets();
            expect(presets).toHaveLength(163);
            for (const preset of presets) {
                const res = validateCatalogDefinition(preset);
                if (!res.valid) {
                    console.error('Validation failure on preset:', preset.id, res.errors);
                }
                expect(res.valid).toBe(true);
                expect(res.errors).toHaveLength(0);
            }
        });
    });

    describe('4. Contratto dell\'Anteprima', () => {
        test('formatPreviewResponse applica il cap a 20 card e formatta la diagnosi', () => {
            const mockCards = Array.from({ length: 25 }, (_, i) => ({
                id: `tmdb:${i + 1}`,
                title: `Titolo ${i + 1}`,
                name: `Titolo ${i + 1}`,
                poster: `https://image.tmdb.org/${i}.jpg`,
                releaseInfo: '2024-05-01',
                runtime: 120,
                vote_average: 7.5
            }));

            const diagnosi = {
                candidati: 60,
                entrati: 20,
                tagliati: {
                    ita: 10,
                    kids: 5,
                    genere: 8,
                    gia_visto: 12,
                    qualita: 5,
                    collezioni: 0
                }
            };

            const response = formatPreviewResponse({
                name: 'Mio Catalogo',
                type: 'movie',
                cards: mockCards,
                diagnosi,
                total: 20
            });

            expect(response.cards).toHaveLength(PREVIEW_CAP);
            expect(response.items).toHaveLength(PREVIEW_CAP);
            expect(response.total).toBe(20);
            expect(response.diagnosi.candidati).toBe(60);
            expect(response.diagnosi.entrati).toBe(20);
            expect(response.diagnosi.tagliati.ita).toBe(10);
            expect(response.cards[0].titolo).toBe('Titolo 1');
            expect(response.cards[0].anno).toBe('2024');
            expect(response.cards[0].durata).toBe(120);
        });

        test('validatePreviewResponse certifica risposte valide e rigetta risposte difformi', () => {
            const validRes = formatPreviewResponse({
                name: 'Anteprima',
                type: 'movie',
                cards: [{ id: 'tmdb:100', title: 'Film Test' }],
                diagnosi: { candidati: 10, entrati: 1, tagliati: { ita: 0 } },
                total: 1
            });
            expect(validatePreviewResponse(validRes).valid).toBe(true);

            // Troppe card (> 20)
            const overflown = {
                cards: Array.from({ length: 25 }, (_, i) => ({ id: `t:${i}`, title: 'T' })),
                diagnosi: { candidati: 25, entrati: 25, tagliati: {} }
            };
            const rOverflown = validatePreviewResponse(overflown);
            expect(rOverflown.valid).toBe(false);
            expect(rOverflown.errors.some(e => e.includes('cap massimo'))).toBe(true);

            // Diagnosi mancante
            const missingDiag = {
                cards: [{ id: 't:1', title: 'T' }]
            };
            const rMissingDiag = validatePreviewResponse(missingDiag);
            expect(rMissingDiag.valid).toBe(false);
            expect(rMissingDiag.errors.some(e => e.includes('diagnosi'))).toBe(true);
        });
    });
});
