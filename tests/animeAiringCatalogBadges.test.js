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
const { getAiringStateCatalog } = require('../src/catalog/providers/AiringStateProvider');
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
        expect(getDuckDbCatalogFromPreset).toHaveBeenCalledTimes(1);

        const where = getDuckDbCatalogFromPreset.mock.calls[0][0].where.join(' ');
        expect(where).toContain('240411');
        expect(where).toContain('999002');
        expect(where).toContain('999004');
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
