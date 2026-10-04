/**
 * Le due cause per cui le card del catalogo "Simulcast (Nuovi Episodi)" restavano col poster
 * nudo di TMDB (ticket: badge assente su 28 card su 69 in produzione il 04/10/2026).
 *
 *  1. `getCardInfo` scartava i titoli giusti: sui documenti storici contava solo gli episodi
 *     dentro i 14 giorni, mentre l'episodio fresco sta in `sub.latest`/`dub.latest`.
 *     Con la regola dell'utente («basta anche un episodio doppiato») la finestra non c'è più.
 *  2. Il documento non veniva trovato: la card è un `kitsu:` stagionale (da Anibridge → Fribb,
 *     giro che non ha bisogno di TMDB) e il ritorno per TMDB non esiste senza `themoviedb_id`.
 *     Il documento ora viaggia con la card (`_airingDocTmdbId`).
 *
 * Fixture locali: nessun Mongo, nessun DuckDB.
 */

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return { ...actual, getDuckDbCatalogFromPreset: jest.fn() };
});

const animeAiringState = require('../src/data/animeAiringState');
const animeMappingStore = require('../src/data/animeMappingStore');
const { getDuckDbCatalogFromPreset } = require('../src/catalog/providers/DuckDbProvider');
const { getAiringStateCatalog } = require('../src/catalog/providers/AiringStateProvider');
const { applyAiringStateBadges, findAiringStateDocument } = require('../src/handlers/catalogHandler');
const { formatStremioCatalog } = require('../src/catalog/formatters/StremioFormatter');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 12, 0, 0); // 2026-10-04T12:00:00Z
const daysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString();
const HOST = 'http://localhost:7860';
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const CATALOG_META = { _provider: 'airing_state', showEpisodeBadge: true };

/**
 * Il caso di produzione: documento storico. `episodes[]` è l'archivio (2018-2025, tutte le date
 * fuori dai 14 giorni), l'episodio fresco sta solo nei `latest`. `dub.latest.airedAt` è null
 * su molti documenti reali (Blue Box, Ranma, Overgeared): la logica non deve toccarlo.
 */
function documentoStorico({ tmdb, kitsuDoc, titolo, subEp, dubEp, dubAiredAt = null, storicoFinoA = null }) {
    return {
        _id: String(tmdb),
        schemaVersion: 1,
        ids: { tmdb, kitsu: String(kitsuDoc) },
        title: titolo,
        italian: {
            sub: { latest: { season: 1, episode: subEp } },
            dub: { latest: { season: 1, episode: dubEp, airedAt: dubAiredAt }, isSimuldub: true }
        },
        episodes: [
            { season: 1, episode: 1, airedAt: daysAgo(2000), subIta: true, dubIta: true },
            ...(storicoFinoA ? [{ season: 1, episode: storicoFinoA, airedAt: daysAgo(400), subIta: true, dubIta: true }] : [])
        ],
        listSeenAt: daysAgo(0.1),
        updatedAt: daysAgo(0.1)
    };
}

function card(id, name) {
    const rawPoster = `https://image.tmdb.org/t/p/w500/${String(id).replace(/:/g, '_')}.jpg`;
    return { id, type: 'series', name, poster: rawPoster, _rawName: name, _rawPoster: rawPoster };
}

describe('Causa 1 — il badge non ha più finestra temporale', () => {
    let snapshot;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        snapshot = animeAiringState.buildSnapshot([
            // Blue Box: storico 2018-2025, fresco solo nei `latest`, dub senza data
            documentoStorico({ tmdb: 207347, kitsuDoc: 48239, titolo: 'Blue Box', subEp: 7, dubEp: 5 }),
            // Doppiato fermo a 5 mesi: la nuova regola lo dichiara ITA lo stesso
            {
                _id: '30984',
                schemaVersion: 1,
                ids: { tmdb: 30984, kitsu: '49444' },
                title: 'BLEACH',
                italian: {
                    sub: { latest: { season: 1, episode: 24 } },
                    dub: { latest: { season: 1, episode: 9 }, isSimuldub: true }
                },
                episodes: [
                    { season: 1, episode: 24, airedAt: daysAgo(150), subIta: true, dubIta: false },
                    { season: 1, episode: 9, airedAt: daysAgo(160), subIta: true, dubIta: true }
                ],
                listSeenAt: daysAgo(0.1),
                updatedAt: daysAgo(0.1)
            },
            // Documento che non dichiara niente: nessuna card (degrado, non un'eccezione)
            { _id: '111', schemaVersion: 1, ids: { tmdb: 111, kitsu: '999' }, title: 'Muto', listSeenAt: daysAgo(1) }
        ]);
    });

    afterEach(() => jest.restoreAllMocks());

    test('episodes[] storico + sub.latest/dub.latest freschi -> due card (EP 7 / ITA 5)', () => {
        const doc = snapshot.byTmdbId.get('207347');
        // Il ramo vecchio: nessun episodio dentro i 14 giorni, quindi nessuna card.
        expect(animeAiringState.getWindowInfo(doc, { now: NOW, windowDays: 14 }).hasSub).toBe(false);

        const info = animeAiringState.getCardInfo(doc);
        expect(info).not.toBeNull();
        expect(info.sub).toEqual({ season: 1, episode: 7 });
        expect(info.dub).toEqual({ season: 1, episode: 5 });
    });

    test('il badge arriva fino al poster: la card non resta il TMDB nudo', async () => {
        const result = await applyAiringStateBadges([card('kitsu:48239', 'Blue Box')], {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas.map((m) => m.id)).toEqual(['kitsu:48239', 'kitsu:48239_ita_offset']);
        expect(result.metas[0].poster).toContain('EP%207');
        expect(result.metas[1].poster).toContain('ITA%205');
    });

    test('doppiaggio fermo da 5 mesi: ITA lo stesso (la regola dell\'utente)', async () => {
        const doc = snapshot.byTmdbId.get('30984');
        expect(animeAiringState.getWindowInfo(doc, { now: NOW, windowDays: 14 }).hasDub).toBe(false);

        const result = await applyAiringStateBadges([card('kitsu:49444', 'BLEACH')], {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(2);
        expect(result.metas[0].poster).toContain('EP%2024');
        expect(result.metas[1].id).toBe('kitsu:49444_ita_offset');
        expect(result.metas[1].poster).toContain('ITA%209');
    });

    test('senza `latest` il numero viene dall\'episodio dichiarato più recente', () => {
        const senzaLatest = animeAiringState.buildSnapshot([{
            _id: '555', schemaVersion: 1, ids: { tmdb: 555, kitsu: '55' }, title: 'Solo archivio',
            episodes: [
                { season: 1, episode: 3, airedAt: daysAgo(500), subIta: true, dubIta: false },
                { season: 2, episode: 1, airedAt: daysAgo(20), subIta: true, dubIta: true }
            ]
        }]);
        const info = animeAiringState.getCardInfo(senzaLatest.byTmdbId.get('555'));
        expect(info.sub).toEqual({ season: 2, episode: 1 });
        expect(info.dub).toEqual({ season: 2, episode: 1 });
    });

    test('episodi senza data: non vengono scartati, vince la numerazione più alta', () => {
        const senzaDate = animeAiringState.buildSnapshot([{
            _id: '556', schemaVersion: 1, ids: { tmdb: 556, kitsu: '56' }, title: 'Senza date',
            episodes: [
                { season: 1, episode: 2, airedAt: null, subIta: true, dubIta: false },
                { season: 1, episode: 4, airedAt: null, subIta: true, dubIta: true }
            ]
        }]);
        const info = animeAiringState.getCardInfo(senzaDate.byTmdbId.get('556'));
        expect(info).not.toBeNull();
        expect(info.sub).toEqual({ season: 1, episode: 4 });
        expect(info.dub).toEqual({ season: 1, episode: 4 });
    });

    test('documento che non dichiara nulla -> nessuna card, mai eccezioni', async () => {
        const result = await applyAiringStateBadges([card('kitsu:999', 'Muto')], {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });
        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:999');
    });
});

describe('Causa 2 — il documento viaggia con la card', () => {
    let snapshot;

    // Black Clover: ids.kitsu = 13209, la card è `kitsu:50024` (Kitsu stagionale da Anibridge).
    const BLACK_CLOVER = {
        _id: '73223', schemaVersion: 1, ids: { tmdb: 73223, kitsu: '13209' }, title: 'Black Clover',
        italian: { sub: { latest: { season: 2, episode: 1 } }, dub: { latest: { season: 1, episode: 120 } } },
        episodes: [{ season: 2, episode: 1, airedAt: daysAgo(1), subIta: true, dubIta: false }],
        listSeenAt: daysAgo(0.1), updatedAt: daysAgo(0.1)
    };

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        getDuckDbCatalogFromPreset.mockReset();
        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
            return ids.map((id) => ({
                id: `tmdb:${id}`, _tmdbId: id, type: 'series', name: `Serie ${id}`,
                poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
            }));
        });
        snapshot = animeAiringState.buildSnapshot([BLACK_CLOVER]);
        animeAiringState.setDataSourceForTests(async () => [BLACK_CLOVER]);
        animeMappingStore.isReady = true;
        // La voce Fribb del titolo non ha `themoviedb_id`: il ritorno per TMDB non esiste.
        // Il percorso che produce l'id della card è Anibridge → Fribb → kitsu, che non
        // ha bisogno di TMDB: è il giro normale, ed è la causa 2.
        animeMappingStore.buildFribbIndex([{ kitsu_id: 50024, anilist_id: 999, mal_id: 888, type: 'TV' }]);
        animeMappingStore.buildAnibridgeIndex({ 'anilist:999': { 'tmdb_show:73223:s2': { '1-3': '1-3' } } });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        animeMappingStore.isReady = false;
        animeAiringState.resetForTests();
    });

    test('senza il riferimento: ids.kitsu non coincide e il ritorno per TMDB è null', () => {
        expect(animeAiringState.findDocument(snapshot, 'kitsu:50024')).toBeNull();
        expect(animeMappingStore.resolveTmdbFromKitsu('50024')).toBeNull();
        expect(findAiringStateDocument(snapshot, { id: 'kitsu:50024' })).toBeNull();
    });

    test('con il riferimento che viaggia: il documento viene trovato e la card ha il badge', () => {
        const found = findAiringStateDocument(snapshot, { id: 'kitsu:50024', _airingDocTmdbId: '73223' });
        expect(found).not.toBeNull();
        expect(found.tmdbId).toBe('73223');
    });

    test('flusso vero: provider -> formatter -> badge, e il riferimento NON finisce nel JSON', async () => {
        const built = await getAiringStateCatalog(0);
        expect(built).toHaveLength(1);
        expect(built[0].id).toBe('kitsu:50024'); // ids.kitsu del documento è 13209
        expect(built[0]._airingDocTmdbId).toBe('73223');

        // Il formatter deve far sopravvivere il riferimento (la card passa dalla cache).
        const pass1 = formatStremioCatalog(built, 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);
        expect(pass1.metas[0]._airingDocTmdbId).toBe('73223');
        expect(pass1.metas[0].poster).toBe(built[0].poster); // il primo passo non ha ancora badge

        const pass2 = await applyAiringStateBadges(pass1.metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot: await animeAiringState.getSnapshot()
        });

        expect(pass2.metas.map((m) => m.id)).toEqual(['kitsu:50024', 'kitsu:50024_ita_offset']);
        expect(pass2.metas[0].poster).toContain('EP%201');
        expect(pass2.metas[1].poster).toContain('ITA%20120');

        // Il campo è interno: nel JSON servito non c'è.
        const json = JSON.stringify(pass2);
        expect(json).not.toContain('_airingDocTmdbId');
        expect(pass2.metas.every((m) => m._airingDocTmdbId === undefined)).toBe(true);
    });

    test('senza snapshot il riferimento non inventa nulla: la card resta senza badge', async () => {
        const result = await applyAiringStateBadges(
            [{ ...card('kitsu:50024', 'Black Clover'), _airingDocTmdbId: '73223' }],
            { userConfig: USER_CONFIG, hostUrl: HOST, catalogMeta: CATALOG_META, type: 'series', snapshot: animeAiringState.buildSnapshot([]) }
        );
        expect(result.metas).toHaveLength(1);
        expect(result.metas[0]._airingDocTmdbId).toBeUndefined();
    });
});