/**
 * Test del catalogo "novità anime" e dei badge sub/ITA (ticket 13).
 * Fixture locali del documento di stato: nessun Mongo e nessun DuckDB reale.
 * Copre: ordinamento/finestra 14 giorni, paginazione, id `kitsu:` condiviso,
 * card ITA presente solo se il doppiato è uscito nella finestra, degrado.
 */

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return { ...actual, getDuckDbCatalogFromPreset: jest.fn() };
});

const animeAiringState = require('../src/data/animeAiringState');
const animeMappingStore = require('../src/data/animeMappingStore');
const { getDuckDbCatalogFromPreset } = require('../src/catalog/providers/DuckDbProvider');
const { getAiringStateCatalog, PAGE_SIZE } = require('../src/catalog/providers/AiringStateProvider');
const { applyAiringStateBadges, isAiringStateCatalog } = require('../src/handlers/catalogHandler');
const { sanitizeCatalogMeta, formatStremioCatalog } = require('../src/catalog/formatters/StremioFormatter');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0); // 2026-09-22T12:00:00Z
const daysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString();
const HOST = 'http://localhost:7860';
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const CATALOG_META = { _provider: 'airing_state', showEpisodeBadge: true };

function buildFixtureDocs() {
    return [
        {
            // 2 giorni fa: sub S2E12 + doppiato S2E8 -> due card (EP 12 / ITA 8)
            _id: '240411',
            schemaVersion: 1,
            ids: { tmdb: 240411, kitsu: '48269' },
            title: 'Dandadan',
            italian: {
                sub: { latest: { season: 2, episode: 12 } },
                dub: { latest: { season: 2, episode: 8 }, isSimuldub: true }
            },
            episodes: [
                { season: 2, episode: 8, airedAt: daysAgo(3), subIta: true, dubIta: true },
                { season: 2, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }
            ]
        },
        {
            // 1 giorno fa: sub attivo, doppiato fermo da 40 giorni -> una card (EP 20)
            _id: '999002',
            schemaVersion: 1,
            ids: { tmdb: 999002, kitsu: '222' },
            title: 'Dub Fermo',
            italian: {
                sub: { latest: { season: 1, episode: 20 } },
                dub: { latest: { season: 1, episode: 5 } }
            },
            episodes: [
                { season: 1, episode: 5, airedAt: daysAgo(40), subIta: true, dubIta: true },
                { season: 1, episode: 20, airedAt: daysAgo(1), subIta: true, dubIta: false }
            ]
        },
        {
            // 4 giorni fa: solo doppiato nella finestra -> una card ITA (ITA 3)
            _id: '999004',
            schemaVersion: 1,
            ids: { tmdb: 999004, kitsu: '444' },
            title: 'Solo Dub',
            italian: {
                sub: { latest: { season: 1, episode: 3 } },
                dub: { latest: { season: 1, episode: 3 } }
            },
            episodes: [
                { season: 1, episode: 3, airedAt: daysAgo(4), subIta: false, dubIta: true }
            ]
        }
    ];
}

function buildManyFixtureDocs(count) {
    const docs = [];
    for (let i = 1; i <= count; i++) {
        docs.push({
            _id: String(100000 + i),
            schemaVersion: 1,
            ids: { tmdb: 100000 + i, kitsu: String(50000 + i) },
            title: `Anime Series ${i}`,
            italian: {
                sub: { latest: { season: 1, episode: i } }
            },
            episodes: [
                { season: 1, episode: i, airedAt: daysAgo(i * 0.1), subIta: true, dubIta: false }
            ]
        });
    }
    return docs;
}

function item(id, name) {
    const rawPoster = `https://image.tmdb.org/t/p/w500/${String(id).replace(/:/g, '_')}.jpg`;
    return {
        id,
        type: 'series',
        name,
        poster: rawPoster,
        _rawName: name,
        _rawPoster: rawPoster
    };
}

describe('AiringStateProvider - catalogo novità anime', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        animeAiringState.resetForTests();
        getDuckDbCatalogFromPreset.mockReset();
        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            // Idratamento simulato: restituiamo le righe in ordine inverso per verificare
            // che il provider riordini sulla base dello stato.
            const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
            return ids.slice().reverse().map((id) => ({
                id: `tmdb:${id}`,
                _tmdbId: id,
                type: 'series',
                name: `Serie ${id}`,
                poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
            }));
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        animeAiringState.resetForTests();
    });

    test('ordina per ultimo episodio disponibile e usa lo stesso id kitsu per le due card', async () => {
        animeAiringState.setDataSourceForTests(async () => buildFixtureDocs());

        const metas = await getAiringStateCatalog(0);
        expect(metas.map((m) => m.id)).toEqual(['kitsu:222', 'kitsu:48269', 'kitsu:444']);
        expect(PAGE_SIZE).toBe(20);
        expect(getDuckDbCatalogFromPreset).toHaveBeenCalledTimes(1);

        const [, hydrationSkip, hydrationLimit] = getDuckDbCatalogFromPreset.mock.calls[0];
        expect(hydrationSkip).toBe(0);
        expect(hydrationLimit).toBe(3);
        const where = getDuckDbCatalogFromPreset.mock.calls[0][0].where.join(' ');
        expect(where).toContain('240411');
        expect(where).toContain('999002');
        expect(where).toContain('999004');
        // Nessun filtro lingua o genere restrittivo (decisione ticket 33: segue AnimeUnity)
        expect(where).not.toContain('"original_language"');
        expect(where).not.toContain('16');
    });

    test('rispetta la paginazione (skip) come gli altri provider', async () => {
        animeAiringState.setDataSourceForTests(async () => buildFixtureDocs());

        const page1 = await getAiringStateCatalog(1);
        expect(page1.map((m) => m.id)).toEqual(['kitsu:48269', 'kitsu:444']);

        const outOfRange = await getAiringStateCatalog(3);
        expect(outOfRange).toEqual([]);
    });

    test('usa la risoluzione kitsu di YACA quando disponibile', async () => {
        animeAiringState.setDataSourceForTests(async () => buildFixtureDocs());

        animeMappingStore.isReady = true;
        animeMappingStore.buildAnibridgeIndex({
            'anilist:9001': { 'tmdb_show:240411:s2': { '1-12': '1-12' } }
        });
        animeMappingStore.buildFribbIndex([
            { kitsu_id: 9002, anilist_id: 9001, themoviedb_id: 240411, type: 'TV' }
        ]);

        try {
            const metas = await getAiringStateCatalog(0);
            const dandadan = metas.find((m) => m._tmdbId === 240411);
            expect(dandadan.id).toBe('kitsu:9002');
        } finally {
            animeMappingStore.isReady = false;
        }
    });

    test('degrado: collezione vuota o in errore -> catalogo vuoto, mai eccezioni', async () => {
        animeAiringState.setDataSourceForTests(async () => []);
        await expect(getAiringStateCatalog(0)).resolves.toEqual([]);

        animeAiringState.resetForTests();
        animeAiringState.setDataSourceForTests(async () => {
            throw new Error('mongo down');
        });
        await expect(getAiringStateCatalog(0)).resolves.toEqual([]);
        expect(getDuckDbCatalogFromPreset).not.toHaveBeenCalled();
    });

    test('riempie la pagina 1 con 20 item validi anche quando alcuni ID non si idratano (ticket 32)', async () => {
        // 35 documenti totali nello snapshot
        animeAiringState.setDataSourceForTests(async () => buildManyFixtureDocs(35));

        // DuckDB simula l'idratazione escludendo i multipli di 3 (11 esclusi su 35 -> 24 validi)
        // Tra i primi 20 della lista grezza, 6 sono multipli di 3. Con il vecchio slice(0, 20)
        // la pagina 1 ne avrebbe restituiti solo 14 (buco).
        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
            return ids
                .filter((id) => (id - 100000) % 3 !== 0)
                .map((id) => ({
                    id: `tmdb:${id}`,
                    _tmdbId: id,
                    type: 'series',
                    name: `Serie ${id}`,
                    poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
                }));
        });

        const page1 = await getAiringStateCatalog(0);
        expect(page1).toHaveLength(20);

        // Pagina 2 (skip = 20): deve restituire i restanti 4 validi (24 totali)
        const page2 = await getAiringStateCatalog(20);
        expect(page2).toHaveLength(4);

        // Nessun duplicato tra pagina 1 e pagina 2
        const page1Ids = new Set(page1.map((m) => m.id));
        for (const meta of page2) {
            expect(page1Ids.has(meta.id)).toBe(false);
        }

        // Tutti gli item restituiti sono validi (nessun multiplo di 3)
        const allReturnedIds = [...page1, ...page2].map((m) => m._tmdbId);
        expect(allReturnedIds).toHaveLength(24);
        for (const id of allReturnedIds) {
            expect((id - 100000) % 3).not.toBe(0);
        }
    });

    test('quando i validi disponibili sono meno di 20 restituisce quelli presenti senza buchi e pagina 2 vuota', async () => {
        // 20 documenti nello snapshot, 6 multipli di 3 scartati -> 14 validi disponibili
        animeAiringState.setDataSourceForTests(async () => buildManyFixtureDocs(20));

        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
            return ids
                .filter((id) => (id - 100000) % 3 !== 0)
                .map((id) => ({
                    id: `tmdb:${id}`,
                    _tmdbId: id,
                    type: 'series',
                    name: `Serie ${id}`,
                    poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
                }));
        });

        const page1 = await getAiringStateCatalog(0);
        expect(page1).toHaveLength(14);

        const page2 = await getAiringStateCatalog(20);
        expect(page2).toEqual([]);
    });

    test('provider con doc vecchi E nuovi: preserva orderIndex per i nuovi e gestisce i vecchi', async () => {
        const mixedDocs = [
            // Doc nuovo (senza episodes[], con orderIndex: 0)
            {
                _id: '37854',
                schemaVersion: 1,
                ids: { tmdb: 37854, kitsu: '12' },
                title: 'One Piece',
                sub: { season: 22, episode: 1180 },
                orderIndex: 0
            },
            // Doc vecchio (con episodes[], senza orderIndex)
            {
                _id: '240411',
                schemaVersion: 1,
                ids: { tmdb: 240411, kitsu: '48269' },
                title: 'Dandadan',
                italian: { sub: { latest: { season: 2, episode: 12 } } },
                episodes: [{ season: 2, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }]
            },
            // Doc nuovo (senza episodes[], con orderIndex: 1)
            {
                _id: '2362',
                schemaVersion: 1,
                ids: { tmdb: 2362, kitsu: '210' },
                title: 'Detective Conan',
                sub: { season: 1, episode: 1100 },
                orderIndex: 1
            }
        ];

        animeAiringState.setDataSourceForTests(async () => mixedDocs);

        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
            return ids.map((id) => ({
                id: `tmdb:${id}`,
                _tmdbId: id,
                type: 'series',
                name: `Serie ${id}`,
                poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
            }));
        });

        const metas = await getAiringStateCatalog(0);
        // orderIndex 0 (One Piece 37854), poi orderIndex 1 (Conan 2362), poi doc vecchio senza orderIndex (Dandadan 240411)
        expect(metas.map((m) => m._tmdbId)).toEqual([37854, 2362, 240411]);
        expect(metas.map((m) => m.id)).toEqual(['kitsu:12', 'kitsu:210', 'kitsu:48269']);
    });
});

describe('Badge sub/ITA dal documento di stato', () => {
    let snapshot;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        snapshot = animeAiringState.buildSnapshot(buildFixtureDocs());
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('il marker del catalogo riconosce anche il legacy anilist_simulcast', () => {
        expect(isAiringStateCatalog('preset_anime_simulcast', null)).toBe(true);
        expect(isAiringStateCatalog('yaca_preset_preset_anime_simulcast', { _provider: 'airing_state' })).toBe(true);
        expect(isAiringStateCatalog('altro', { _provider: 'anilist_simulcast' })).toBe(true);
        expect(isAiringStateCatalog('preset_new_series_eps', { _provider: 'tmdb' })).toBe(false);
        expect(isAiringStateCatalog('yaca_discover_movies', null)).toBe(false);
    });

    test('card sub EP 12 + card ITA 8 con lo stesso id kitsu', async () => {
        const metas = [item('kitsu:48269', 'Dandadan')];
        const result = await applyAiringStateBadges(metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(2);
        const [sub, dub] = result.metas;

        expect(sub.id).toBe('kitsu:48269');
        expect(sub.poster).toContain('EP%2012');
        expect(sub.poster).not.toContain('ITA');

        expect(dub.id).toBe('kitsu:48269_ita_offset');
        expect(dub.poster).toContain('ITA%208');
        expect(dub.poster).not.toContain('EP%20');

        // Entrambe le card puntano allo stesso `kitsu:{id}` sotto il suffisso di presentazione.
        expect(dub.id.replace('_ita_offset', '')).toBe(sub.id);
    });

    test('risolve gli ID Kitsu stagionali verso il TMDB base dello snapshot', async () => {
        const rawDocs = [
            {
                _id: '65942',
                schemaVersion: 1,
                ids: { kitsu: '49746' },
                title: 'Re:ZERO -Starting Life in Another World-',
                italian: { sub: { latest: { season: 1, episode: 18 } } },
                episodes: [
                    { season: 1, episode: 18, airedAt: daysAgo(1), subIta: true, dubIta: false }
                ]
            },
            {
                _id: '293629',
                schemaVersion: 1,
                ids: { kitsu: '50622' },
                title: 'Samurai Troopers - I cinque samurai: La nuova leggenda delle armature',
                italian: { sub: { latest: { season: 1, episode: 12 } } },
                episodes: [
                    { season: 1, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }
                ]
            }
        ];
        const snapshot = animeAiringState.buildSnapshot(rawDocs);
        const tmdbByKitsu = { 11209: '65942', 50427: '293629' };
        const mappingStore = {
            resolveTmdbFromKitsu: jest.fn(id => tmdbByKitsu[id] || null)
        };

        // Le card usano ID stagionali diversi da quelli memorizzati nel documento.
        expect(animeAiringState.findDocument(snapshot, 'kitsu:11209')).toBeNull();
        expect(animeAiringState.findDocument(snapshot, 'kitsu:50427')).toBeNull();

        const result = await applyAiringStateBadges([
            item('kitsu:11209', rawDocs[0].title),
            item('kitsu:50427', rawDocs[1].title)
        ], {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot,
            mappingStore
        });

        expect(result.metas).toHaveLength(2);
        expect(result.metas[0].id).toBe('kitsu:11209');
        expect(result.metas[0].poster).toContain('EP%2018');
        expect(result.metas[1].id).toBe('kitsu:50427');
        expect(result.metas[1].poster).toContain('EP%2012');
        expect(mappingStore.resolveTmdbFromKitsu).toHaveBeenCalledWith('11209');
        expect(mappingStore.resolveTmdbFromKitsu).toHaveBeenCalledWith('50427');
    });

    test('doppiato fermo: nessuna card ITA, badge sub corretto', async () => {
        const metas = [item('kitsu:222', 'Dub Fermo')];
        const result = await applyAiringStateBadges(metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:222');
        expect(result.metas[0].poster).toContain('EP%2020');
        expect(result.metas[0].id).not.toContain('_ita_offset');
    });

    test('solo doppiato nella finestra: unica card ITA', async () => {
        const metas = [item('kitsu:444', 'Solo Dub')];
        const result = await applyAiringStateBadges(metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:444_ita_offset');
        expect(result.metas[0].poster).toContain('ITA%203');
    });

    test('serie senza stato: card servita senza badge, nessuna eccezione', async () => {
        const metas = [item('kitsu:999999', 'Senza Stato')];
        const result = await applyAiringStateBadges(metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:999999');
        expect(result.metas[0].poster).toBe(metas[0].poster); // nessun badge applicato
    });

    test('degrado: snapshot vuoto o errore del lettore -> card senza badge, mai eccezioni', async () => {
        const metas = [item('kitsu:48269', 'Dandadan')];

        const empty = await applyAiringStateBadges(metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot: animeAiringState.buildSnapshot([])
        });
        expect(empty.metas).toHaveLength(1);
        expect(empty.metas[0].poster).toBe(metas[0].poster);

        // Nessuno snapshot passato: usa il lettore, che qui degrada (Mongo non connesso).
        animeAiringState.setDataSourceForTests(async () => {
            throw new Error('mongo down');
        });
        try {
            const degraded = await applyAiringStateBadges(metas, {
                userConfig: USER_CONFIG,
                hostUrl: HOST,
                catalogMeta: CATALOG_META,
                type: 'series'
            });
            expect(degraded.metas).toHaveLength(1);
            expect(degraded.metas[0].poster).toBe(metas[0].poster);
        } finally {
            animeAiringState.resetForTests();
        }
    });

    test('nessuna eccezione su lista vuota o input non valido', async () => {
        await expect(applyAiringStateBadges([], { snapshot })).resolves.toEqual({ metas: [] });
        await expect(applyAiringStateBadges(null, { snapshot })).resolves.toEqual({ metas: [] });
    });

    test('flusso reale a due passi: format poi badge, senza doppio proxy sul poster', async () => {
        const raw = [item('kitsu:48269', 'Dandadan')];
        const pass1 = formatStremioCatalog(raw, 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);
        expect(pass1.metas[0].poster).toBe(raw[0].poster); // il primo passo non ha ancora badge

        const pass2 = await applyAiringStateBadges(pass1.metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        const sub = pass2.metas.find((m) => m.id === 'kitsu:48269');
        const dub = pass2.metas.find((m) => m.id === 'kitsu:48269_ita_offset');
        expect(sub.poster).toContain('EP%2012');
        expect(dub.poster).toContain('ITA%208');
        // Un solo livello di proxy immagine, non due annidati.
        expect(sub.poster.match(/\/images\/poster\//g)).toHaveLength(1);
        expect(dub.poster.match(/\/images\/poster\//g)).toHaveLength(1);
    });

    test('per gli altri cataloghi il badge TMDB resta invariato', () => {
        const tmdbItem = {
            ...item('tmdb:123', 'Serie Normale'),
            rawTMDB: { next_episode_to_air: { season_number: 2, episode_number: 5 } }
        };
        const formatted = sanitizeCatalogMeta(tmdbItem, {
            shouldApplyEpisodeBadge: true,
            isLandscapeEnabled: false,
            userConfig: USER_CONFIG,
            hostUrl: HOST
        });
        expect(formatted.poster).toContain('S2%20E5');
    });
});
