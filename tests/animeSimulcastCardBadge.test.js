/**
 * Le due cause per cui le card del catalogo "Simulcast (Nuovi Episodi)" restavano col poster
 * nudo di TMDB (ticket: badge assente su 28 card su 69 in produzione il 04/10/2026).
 *
 *  1. Il badge veniva da una lettura che guardava i campi NOSTRI (`episodes[]`, `sub.latest`,
 *     `dub.latest`) invece che dalla fonte: sui documenti storici contava episodi del 2018 e non
 *     trovava niente. Ticket 52: il numero e il canale vengono dalla HOME (`homeReleases`).
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
 * fuori dai 14 giorni) e i `latest` portano numeri vecchi: la home è l'unica che sa quando è
 * uscito qualcosa, e per questo arriva con `homeReleases`. `dub.latest.airedAt` è null su molti
 * documenti reali (Blue Box, Ranma, Overgeared): la logica non deve toccarlo.
 */
function documentoStorico({ tmdb, kitsuDoc, titolo, subEp, dubEp, dubAiredAt = null, storicoFinoA = null }) {
    return {
        _id: String(tmdb),
        schemaVersion: 1,
        ids: { tmdb, kitsu: String(kitsuDoc) },
        title: titolo,
        homeReleases: {
            checkedAt: daysAgo(0.1),
            sub: { episode: subEp, airedAt: daysAgo(1) },
            dub: dubEp > 0 ? { episode: dubEp, airedAt: dubAiredAt || daysAgo(2) } : null
        },
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

describe('Causa 1 — il badge viene dalla home, non dai nostri campi', () => {
    let snapshot;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        snapshot = animeAiringState.buildSnapshot([
            // Blue Box: storico 2018-2025, la home ha visto sub 7 e dub 5
            documentoStorico({ tmdb: 207347, kitsuDoc: 48239, titolo: 'Blue Box', subEp: 7, dubEp: 5 }),
            // Documento in cui la home ha visto solo il sub (il dub non è uscito): una card
            {
                _id: '30984',
                schemaVersion: 1,
                ids: { tmdb: 30984, kitsu: '49444' },
                title: 'BLEACH',
                homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 24, airedAt: daysAgo(1) }, dub: null },
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
            // Documento che la fonte non nomina: nessuna card con badge
            { _id: '111', schemaVersion: 1, ids: { tmdb: 111, kitsu: '999' }, title: 'Muto', listSeenAt: daysAgo(1) }
        ]);
    });

    afterEach(() => jest.restoreAllMocks());

    test('episodes[] storico e `latest` vecchi: due card, i numeri sono quelli della home (EP 7 / ITA 5)', () => {
        const doc = snapshot.byTmdbId.get('207347');
        // Il ramo vecchio: nessun episodio dentro i 14 giorni, quindi nessuna card.
        expect(animeAiringState.getWindowInfo(doc, { now: NOW, windowDays: 14 }).hasSub).toBe(false);

        const info = animeAiringState.getCardInfo(doc);
        expect(info).not.toBeNull();
        expect(info.sub).toEqual({ episode: 7 });
        expect(info.dub).toEqual({ episode: 5 });
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

    test('la home ha visto solo il sub (il dub è fermo): una card sola, niente clone ITA', async () => {
        const doc = snapshot.byTmdbId.get('30984');
        // Il nostro `dub.latest` dice 9: non conta più, la fonte non ha visto uscite doppiate.
        expect(animeAiringState.getWindowInfo(doc, { now: NOW, windowDays: 14 }).hasDub).toBe(false);

        const result = await applyAiringStateBadges([card('kitsu:49444', 'BLEACH')], {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:49444');
        expect(result.metas[0].poster).toContain('EP%2024');
    });

    test('i nostri campi non fabbricano badge: la home dice la sua, e solo quella', () => {
        const soloNostri = animeAiringState.buildSnapshot([{
            _id: '557', schemaVersion: 1, ids: { tmdb: 557, kitsu: '57' }, title: 'Solo nostri',
            sub: { season: 1, episode: 3, airedAt: daysAgo(1) },
            dub: { season: 1, episode: 4, airedAt: daysAgo(1) },
            episodes: [{ season: 1, episode: 4, airedAt: daysAgo(1), subIta: true, dubIta: true }]
        }]);
        // Nessuna passata home: nessuna card, nessun numero inventato.
        expect(animeAiringState.getCardInfo(soloNostri.byTmdbId.get('557'))).toBeNull();

        // Con la passata home, i numeri vengono da lì (EP 3 / ITA 4) e non dai `latest`.
        const conHome = animeAiringState.buildSnapshot([{
            _id: '557', schemaVersion: 1, ids: { tmdb: 557, kitsu: '57' }, title: 'Solo nostri',
            homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 3, airedAt: daysAgo(1) }, dub: { episode: 4, airedAt: daysAgo(1) } },
            sub: { season: 1, episode: 99 },
            dub: { season: 1, episode: 98 }
        }]);
        const info = animeAiringState.getCardInfo(conHome.byTmdbId.get('557'));
        expect(info.sub).toEqual({ episode: 3 });
        expect(info.dub).toEqual({ episode: 4 });
    });

    test('documento che la fonte non nomina -> nessuna card, mai eccezioni', async () => {
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
        homeReleases: {
            checkedAt: daysAgo(0.1),
            sub: { episode: 1, airedAt: daysAgo(1) },
            dub: { episode: 120, airedAt: daysAgo(2) }
        },
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
/**
 * Episodio 0: la serie **annunciata**, cioè quella che non è ancora uscita.
 *
 * PRIMA (regola provata il 04/10/2026 e superata il giorno stesso dalla fonte nuova): la lista
 * "In Corso" la dava per in corso con `real_episodes_count: 0`, il documento portava
 * `sub = { season: 2, episode: 0 }`, `normalizeLatest` rifiutava lo zero (un episodio 0 non
 * esiste) e la voce veniva scartata dal filtro: una serie annunciata semplicemente non
 * compariva. La cura era farla entrare senza badge.
 *
 * ADESSO (ticket 52, la fonte è la home): la regola dell'utente è "chi ha un episodio uscito
 * nelle ultime due settimane", e un'annunciata non ha episodi usciti — non è sulla home, non ha
 * `homeReleases`, quindi non entra. Non è più un caso speciale da gestire: è la stessa regola
 * degli altri, applicata senza eccezioni. Il caso `episode: 0` resta però innocuo: la
 * normalizzazione lo rifiuta e nessun `EP 0` può esistere.
 */
describe('Episodio 0 — la serie annunciata non entra, e non può mostrare EP 0', () => {
    // I due titoli veri del 04/10/2026, presi dalla collezione di produzione.
    const AOASHI_2 = {
        _id: '126437',
        schemaVersion: 1,
        ids: { tmdb: 126437, kitsu: '49883', anilist: 191788, mal: 61603 },
        title: 'Aoashi',
        schedule: { status: 'In corso', nextEpisode: null },
        sub: { season: 2, episode: 0, airedAt: '2026-10-04T14:57:13.000Z' },
        italian: { sub: { latest: { season: 2, episode: 0, airedAt: '2026-10-04T14:57:13.000Z' }, status: 'In Corso' }, dub: null },
        listSeenAt: daysAgo(0.1),
        updatedAt: daysAgo(0.1),
        orderIndex: 3
    };

    const OJI_SAN = {
        _id: '330505',
        schemaVersion: 1,
        ids: { tmdb: 330505, kitsu: null, anilist: 202079, mal: null },
        title: 'Oji-san wa Kawaii Mono ga Osuki.',
        schedule: { status: 'In corso', nextEpisode: null },
        sub: { season: 1, episode: 0, airedAt: '2026-10-04T15:00:08.000Z' },
        italian: { sub: { latest: { season: 1, episode: 0, airedAt: '2026-10-04T15:00:08.000Z' }, status: 'In Corso' }, dub: null },
        listSeenAt: daysAgo(0.1),
        updatedAt: daysAgo(0.1),
        orderIndex: 58
    };

    // Solo doppiato annunciato: il doppio a zero, il sub assente.
    const SOLO_DUB_ANNUNCIATO = {
        _id: '330506',
        schemaVersion: 1,
        ids: { tmdb: 330506, kitsu: '99999' },
        title: 'Solo dub annunciato',
        dub: { season: 1, episode: 0, airedAt: null },
        listSeenAt: daysAgo(0.1),
        updatedAt: daysAgo(0.1),
        orderIndex: 60
    };

    // Una serie normale: la home l'ha vista uscire, quindi entra come prima.
    const CON_EPISODI = {
        _id: '240411',
        schemaVersion: 1,
        ids: { tmdb: 240411, kitsu: '48269' },
        title: 'Dandadan',
        homeReleases: {
            checkedAt: daysAgo(0.1),
            sub: { episode: 12, airedAt: daysAgo(2) },
            dub: { episode: 8, airedAt: daysAgo(3) }
        },
        sub: { season: 2, episode: 12, airedAt: daysAgo(2) },
        dub: { season: 2, episode: 8, airedAt: daysAgo(3) },
        episodes: [
            { season: 2, episode: 8, airedAt: daysAgo(3), subIta: true, dubIta: true },
            { season: 2, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }
        ],
        listSeenAt: daysAgo(0.1),
        updatedAt: daysAgo(0.1),
        orderIndex: 1
    };

    // Documento legacy senza `listSeenAt`: resta fuori come prima.
    const LEGACY_SENZA_LISTA = {
        _id: '400',
        schemaVersion: 1,
        ids: { tmdb: 400, kitsu: '400' },
        title: 'Legacy senza lista',
        updatedAt: daysAgo(0.1),
        orderIndex: 99
    };

    let snapshot;

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        snapshot = animeAiringState.buildSnapshot([AOASHI_2, OJI_SAN, SOLO_DUB_ANNUNCIATO, CON_EPISODI, LEGACY_SENZA_LISTA]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        animeAiringState.resetForTests();
    });

    test('lo zero viene normalizzato a `null`: il documento non dichiara nessun episodio', () => {
        const doc = snapshot.byTmdbId.get('126437');
        expect(doc.sub).toBeNull();
        expect(doc.dub).toBeNull();
        expect(doc.home).toBeNull();
        expect(animeAiringState.getCardInfo(doc)).toBeNull();
        expect(animeAiringState.getDubEpisode(doc)).toBeNull();
    });

    test('serie annunciata: la voce NON è in getAiringEntries (la home non l\'ha nominata)', () => {
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW });
        const ids = entries.map((e) => e.doc.tmdbId);

        expect(ids).not.toContain('126437');
        expect(ids).not.toContain('330505');
        expect(ids).not.toContain('330506');
        expect(ids).toContain('240411');
    });

    test('una serie con episodi veri resta invariata: EP n e ITA n come prima', () => {
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW });
        expect(entries.map((e) => e.doc.tmdbId)).toContain('240411');

        const info = animeAiringState.getCardInfo(snapshot.byTmdbId.get('240411'));
        expect(info.sub).toEqual({ episode: 12 });
        expect(info.dub).toEqual({ episode: 8 });
    });

    test('la serie annunciata non è una novità: il backfill non ha niente da importare', () => {
        const novita = animeAiringState.getNoveltyEntries(snapshot, { now: NOW, windowDays: 14 }).map((e) => e.doc.tmdbId);
        expect(novita).not.toContain('126437');
        expect(novita).not.toContain('330505');
    });

    test('badge sulle card: nessun EP 0, nessun ITA 0, nessun clone _ita_offset', async () => {
        const cards = [
            { ...card('kitsu:49883', 'Aoashi'), _airingDocTmdbId: '126437' },
            { ...card('kitsu:99999', 'Solo dub annunciato'), _airingDocTmdbId: '330506' },
            { ...card('kitsu:48269', 'Dandadan'), _airingDocTmdbId: '240411' }
        ];
        const result = await applyAiringStateBadges(cards, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        const perId = new Map(result.metas.map((m) => [m.id, m]));
        // Le annunciate non hanno badge e non producono clone.
        expect(perId.get('kitsu:49883')._forceBadgeText).toBeUndefined();
        expect(perId.get('kitsu:99999')._forceBadgeText).toBeUndefined();
        expect(perId.has('kitsu:49883_ita_offset')).toBe(false);
        expect(perId.has('kitsu:99999_ita_offset')).toBe(false);
        expect(perId.get('kitsu:49883').poster).toBe('https://image.tmdb.org/t/p/w500/kitsu_49883.jpg');

        // La serie normale è intatta.
        expect(perId.get('kitsu:48269').poster).toContain('EP%2012');
        expect(perId.get('kitsu:48269_ita_offset').poster).toContain('ITA%208');
    });

    test('il badge TMDB calcolato alla costruzione del catalogo viene tolto alle card annunciate', async () => {
        // TMDB sa già quando uscirà l'episodio 1 e `showEpisodeBadge` è true su questo preset:
        // alla costruzione la card si compone con `S2 E1`. La fonte non ha detto niente, quindi
        // quel badge è inventato e sparisce.
        const built = formatStremioCatalog([{
            ...card('kitsu:49883', 'Aoashi'),
            _airingDocTmdbId: '126437',
            rawTMDB: {
                status: 'Returning Series',
                next_episode_to_air: { season_number: 2, episode_number: 1, air_date: '2026-10-11' },
                last_episode_to_air: null
            }
        }], 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);

        expect(built.metas[0].poster).toContain('S2%20E1'); // il difetto: la card "annunciata" ha un badge

        const result = await applyAiringStateBadges(built.metas, {
            userConfig: USER_CONFIG,
            hostUrl: HOST,
            catalogMeta: CATALOG_META,
            type: 'series',
            snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:49883');
        expect(result.metas[0]._forceBadgeText).toBeUndefined();
        expect(result.metas[0].poster).not.toContain('S2%20E1');
        expect(result.metas[0].poster).toBe('https://image.tmdb.org/t/p/w500/kitsu_49883.jpg');
    });

    test('per chi non ha badge il poster non cambia: la ri-formattazione è neutra', async () => {
        // Card senza documento: il ramo `!info` la ri-formatta. Se la ri-formattazione cambiasse
        // qualcosa, cambierebbe anche il poster delle card che oggi sono già senza badge.
        const item = { ...card('kitsu:777777', 'Senza documento'), _airingDocTmdbId: '999999' };
        const pass1 = formatStremioCatalog([item], 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);
        const result = await applyAiringStateBadges(pass1.metas, {
            userConfig: USER_CONFIG, hostUrl: HOST, catalogMeta: CATALOG_META, type: 'series', snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].poster).toBe(pass1.metas[0].poster);
    });

    test('flusso vero: il provider mette in pagina solo quello che la fonte ha visto', async () => {
        getDuckDbCatalogFromPreset.mockReset();
        getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
            const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
            return ids.map((id) => ({
                id: `tmdb:${id}`, _tmdbId: id, type: 'series', name: `Serie ${id}`,
                poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
            }));
        });
        animeAiringState.setDataSourceForTests(async () => [AOASHI_2, OJI_SAN, CON_EPISODI]);

        const built = await getAiringStateCatalog(0);
        // Solo Dandadan: le due annunciate non sono sulla home, quindi non hanno pagina.
        expect(built.map((m) => m.id)).toEqual(['kitsu:48269']);

        const pass1 = formatStremioCatalog(built, 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);
        const pass2 = await applyAiringStateBadges(pass1.metas, {
            userConfig: USER_CONFIG, hostUrl: HOST, catalogMeta: CATALOG_META, type: 'series',
            snapshot: await animeAiringState.getSnapshot()
        });

        const perId = new Map(pass2.metas.map((m) => [m.id, m]));
        expect(perId.get('kitsu:48269').poster).toContain('EP%2012');
        expect(perId.get('kitsu:48269_ita_offset').poster).toContain('ITA%208');

        // Il riferimento interno non finisce mai nel JSON.
        expect(JSON.stringify(pass2)).not.toContain('_airingDocTmdbId');
    });
});