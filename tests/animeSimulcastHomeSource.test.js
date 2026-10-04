/**
 * Il catalogo "Simulcast (Nuovi Episodi)" cambia fonte: adesso è la HOME di AnimeUnity.
 *
 * Qui si prova il percorso VERO, senza rete: una home finta passa per le funzioni pure del
 * servizio (`services/anime-source`: stessa identità → stessi documenti che il servizio
 * scrive su Mongo), i documenti finiscono nello snapshot del lettore e si vede cosa
 * diventa card. Le quattro prove sono le quattro righe del mandato:
 *
 *   1. un item della home entro le due settimane -> la card nasce con `EP <number>`;
 *   2. `anime.dub === 1` -> nasce anche la seconda card, `ITA <number>`;
 *   3. un item fuori finestra -> non entra;
 *   4. lo stesso anime con due episodi in finestra -> UNA card (quella più recente).
 *
 * E il resto della regola: la finestra è quella della fonte (`created_at`), non un campo
 * nostro. Un documento fresco con episodi del 2018 non entra; un documento vecchio con la
 * passata home non confermata da giorni esce (la freschezza è della fonte, non nostra).
 */

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return { ...actual, getDuckDbCatalogFromPreset: jest.fn() };
});

const animeAiringState = require('../src/data/animeAiringState');
const animeMappingStore = require('../src/data/animeMappingStore');
const { getDuckDbCatalogFromPreset } = require('../src/catalog/providers/DuckDbProvider');
const { getAiringStateCatalog } = require('../src/catalog/providers/AiringStateProvider');
const { applyAiringStateBadges } = require('../src/handlers/catalogHandler');
const { formatStremioCatalog } = require('../src/catalog/formatters/StremioFormatter');

// Le funzioni pure del servizio: nessuna rete, nessun Mongo, stesso identico di chi scrive.
const { summarizeHomeItems, buildHomeReleases, buildHomeStateDocument } = require('../services/anime-source/src/aggregate');
const { groupHomeRowsByTmdb, collectHomeAnimes } = require('../services/anime-source/cli');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 18, 0, 0); // 2026-10-04T18:00:00Z
const WINDOW_DAYS = 14;
const HOST = 'http://localhost:7860';
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const CATALOG_META = { _provider: 'airing_state', showEpisodeBadge: true };

/** Data nel formato che scrive AnimeUnity. */
const at = (daysAgo, hour = 12) => {
    const d = new Date(NOW - daysAgo * DAY_MS);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(hour)}:00:00`;
};

let PROSSIMO_ANIME_ID = 7000;
let PROSSIMO_TMDB = 900000;

/** Un item della home, con la sua scheda anime. */
function item({ number, daysAgo, dub = 0, animeId = null, tmdbId = null, title = 'Serie' }) {
    const id = animeId !== null ? animeId : ++PROSSIMO_ANIME_ID;
    PROSSIMO_TMDB = tmdbId !== null ? Number(tmdbId) : ++PROSSIMO_TMDB;
    return {
        id: id * 10,
        anime_id: id,
        number: String(number),
        created_at: at(daysAgo),
        anime: {
            id,
            dub,
            title,
            status: 'In Corso',
            anilist_id: 900000 + id,
            mal_id: 800000 + id
        },
        __tmdb: PROSSIMO_TMDB
    };
}

/**
 * Il resolver di identità finto: l'anime N della home è il TMDB che gli abbiamo dato.
 * È l'unica cosa che il disegno non evita: senza identità non c'è documento.
 */
function resolverFor(items) {
    const byAnilist = new Map(items.map((i) => [Number(i.anime.anilist_id), Number(i.__tmdb)]));
    return {
        resolve: ({ anilistId }) => {
            const tmdbId = byAnilist.get(Number(anilistId));
            return tmdbId ? { tmdbId: String(tmdbId), kitsuId: null, anilistId: Number(anilistId), season: 1 } : null;
        }
    };
}

/**
 * Il servizio, in locale: dalla home finta ai documenti che scriverebbe su Mongo.
 * @returns {Array<Object>} documenti `anime_airing_state`
 */
function documentiDaHome(items, { checkedAt = new Date(NOW).toISOString(), windowDays = WINDOW_DAYS } = {}) {
    const rows = summarizeHomeItems(items, { now: NOW, windowDays });
    const animeById = collectHomeAnimes(items);
    const { groups } = groupHomeRowsByTmdb(rows, animeById, resolverFor(items));

    return groups
        .map((group) => buildHomeStateDocument({
            tmdbId: group.tmdbId,
            kitsuId: group.kitsuId,
            title: group.title,
            homeReleases: buildHomeReleases(group.rows, { checkedAt }),
            now: checkedAt
        }))
        .filter(Boolean);
}

/** Provider → formatter → badge: il percorso che il catalogo servito fa davvero. */
async function catalogoDa(items, docs = null) {
    const documenti = docs || documentiDaHome(items);
    animeAiringState.setDataSourceForTests(async () => documenti);
    const snapshot = await animeAiringState.getSnapshot();

    const built = await getAiringStateCatalog(0);
    const pass1 = formatStremioCatalog(built, 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);
    const pass2 = await applyAiringStateBadges(pass1.metas, {
        userConfig: USER_CONFIG,
        hostUrl: HOST,
        catalogMeta: CATALOG_META,
        type: 'series',
        snapshot
    });

    return { documenti, snapshot, cards: pass2.metas };
}

function card(id, name) {
    const rawPoster = `https://image.tmdb.org/t/p/w500/${String(id).replace(/:/g, '_')}.jpg`;
    return { id, type: 'series', name, poster: rawPoster, _rawName: name, _rawPoster: rawPoster };
}

beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    PROSSIMO_ANIME_ID = 7000;
    PROSSIMO_TMDB = 900000;
    getDuckDbCatalogFromPreset.mockReset();
    getDuckDbCatalogFromPreset.mockImplementation(async (preset) => {
        const ids = (String(preset.where.join(' ')).match(/\d+/g) || []).map(Number);
        return ids.map((id) => ({
            id: `tmdb:${id}`, _tmdbId: id, type: 'series', name: `Serie ${id}`,
            poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`
        }));
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    animeMappingStore.isReady = false;
    animeAiringState.resetForTests();
});

describe('La fonte è la home: dentro le due settimane entra, con EP n', () => {
    test('item in finestra -> la card nasce con EP <number>', async () => {
        const items = [item({ number: 5, daysAgo: 0.4, title: 'Ghost Meets Gal!' })];
        const { cards } = await catalogoDa(items);

        expect(cards).toHaveLength(1);
        expect(cards[0].poster).toContain('EP%205');
        // Nessun clone ITA: la home non ha visto un doppiaggio per quell'anime.
        expect(cards.filter((c) => String(c.id).endsWith('_ita_offset'))).toHaveLength(0);
    });

    test('`anime.dub === 1` -> nasce anche la seconda card, ITA <number>', async () => {
        const items = [
            item({ number: 7, daysAgo: 0.2, dub: 0, animeId: 7100, tmdbId: 901001, title: 'Simulcast' }),
            item({ number: 3, daysAgo: 0.1, dub: 1, animeId: 7101, tmdbId: 901002, title: 'Simulcast ITA' })
        ];
        const { cards } = await catalogoDa(items);

        expect(cards).toHaveLength(3);
        const perId = new Map(cards.map((c) => [c.id, c]));
        // Il titolo con il sub in finestra: EP dalla home.
        expect(perId.get('tmdb:901001').poster).toContain('EP%207');
        // Il titolo doppiato: la card base resta nuda (la home non ha visto un sub per lui)
        // e il clone porta l'ITA. Sparire del tutto sarebbe un titolo perso.
        expect(perId.get('tmdb:901002').poster).not.toContain('EP%20');
        expect(perId.get('tmdb:901002_ita_offset').poster).toContain('ITA%203');
    });

    test('solo doppiato in finestra -> card nuda + clone ITA', async () => {
        const items = [item({ number: 4, daysAgo: 1, dub: 1, tmdbId: 901003, title: 'Solo ITA' })];
        const { cards } = await catalogoDa(items);

        expect(cards).toHaveLength(2);
        expect(cards[0].id).toBe('tmdb:901003');
        expect(cards[0].poster).not.toContain('EP%20');
        expect(cards[1].id).toBe('tmdb:901003_ita_offset');
        expect(cards[1].poster).toContain('ITA%204');
    });

    test('item fuori finestra -> non entra', async () => {
        const items = [
            item({ number: 1, daysAgo: 15, tmdbId: 901010, title: 'Troppo vecchio' }),
            item({ number: 40, daysAgo: 90, tmdbId: 901011, title: 'Anziano' }),
            item({ number: 9, daysAgo: 0.5, tmdbId: 901012, title: 'In finestra' })
        ];
        const { documenti, cards } = await catalogoDa(items);

        // Non è nemmeno un documento: la fonte non lo dichiara, quindi non lo scriviamo.
        expect(documenti.map((d) => d._id)).toEqual(['901012']);
        expect(cards.map((c) => c.id)).toEqual(['tmdb:901012']);
        expect(cards[0].poster).toContain('EP%209');
    });

    test('lo stesso anime con due episodi in finestra -> UNA card, la più recente', async () => {
        const items = [
            item({ number: 4, daysAgo: 3, animeId: 7200, tmdbId: 901020, title: 'Due episodi' }),
            item({ number: 5, daysAgo: 0.5, animeId: 7200, tmdbId: 901020, title: 'Due episodi' }),
            item({ number: 3, daysAgo: 6, animeId: 7200, tmdbId: 901020, title: 'Due episodi' })
        ];
        const { documenti, cards } = await catalogoDa(items);

        expect(documenti).toHaveLength(1);
        expect(documenti[0].homeReleases.sub.episode).toBe(5);
        expect(cards).toHaveLength(1);
        expect(cards[0].id).toBe('tmdb:901020');
        expect(cards[0].poster).toContain('EP%205');
    });

    test('sub e doppiato dello stesso titolo restano due canali sulla stessa card', async () => {
        // Stesso TMDB, due varianti AnimeUnity (record sub e record doppiato).
        const items = [
            { ...item({ number: 6, daysAgo: 0.4, dub: 0, animeId: 7300, tmdbId: 901030, title: 'Doppio canale' }) },
            { ...item({ number: 2, daysAgo: 0.2, dub: 1, animeId: 7301, tmdbId: 901030, title: 'Doppio canale ITA' }) }
        ];
        const { documenti, cards } = await catalogoDa(items);

        expect(documenti).toHaveLength(1);
        expect(documenti[0].homeReleases.sub.episode).toBe(6);
        expect(documenti[0].homeReleases.dub.episode).toBe(2);
        expect(cards.map((c) => c.id).sort()).toEqual(['tmdb:901030', 'tmdb:901030_ita_offset']);
    });
});

describe('La freschezza è della fonte, non nostra', () => {
    test('un documento senza `homeReleases` non entra, per quanto sia fresco e pieno di episodi', async () => {
        // Il caso di oggi in produzione: 962 documenti con sub/dub/episodes[] e listSeenAt,
        // nessuno dei quali è passato dalla home. Non entrano: la fonte non li ha nominati.
        const senzaHome = [{
            _id: '902000',
            schemaVersion: 1,
            ids: { tmdb: 902000, kitsu: '1' },
            title: 'In corso da sempre',
            sub: { season: 1, episode: 24, airedAt: new Date(NOW - DAY_MS).toISOString() },
            dub: { season: 1, episode: 9, airedAt: null },
            episodes: [{ season: 1, episode: 24, airedAt: new Date(NOW - DAY_MS).toISOString(), subIta: true, dubIta: true }],
            listSeenAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
            orderIndex: 0
        }];

        animeAiringState.setDataSourceForTests(async () => senzaHome);
        const entries = animeAiringState.getAiringEntries(await animeAiringState.getSnapshot(), { now: NOW });
        expect(entries).toEqual([]);
    });

    test('passata home confermata da giorni: entra; non confermata da giorni: esce', async () => {
        const items = [item({ number: 2, daysAgo: 1, tmdbId: 901040, title: 'Confermato' })];
        const documenti = documentiDaHome(items);

        // (1) Confermato ieri: dentro.
        animeAiringState.setDataSourceForTests(async () => documenti);
        let entries = animeAiringState.getAiringEntries(await animeAiringState.getSnapshot(), { now: NOW });
        expect(entries.map((e) => e.doc.tmdbId)).toEqual(['901040']);

        // (2) Non confermato da 5 giorni: fuori. La fonte non dice niente da 5 giorni, e
        //     servire quella roba come "in simulcast" sarebbe una bugiesta travestita.
        const vecchio = JSON.parse(JSON.stringify(documenti));
        vecchio[0].homeReleases.checkedAt = new Date(NOW - 5 * DAY_MS).toISOString();
        animeAiringState.setDataSourceForTests(async () => vecchio);
        entries = animeAiringState.getAiringEntries(await animeAiringState.getSnapshot(), { now: NOW });
        expect(entries).toEqual([]);
    });

    test('la card senza `homeReleases` non si sposta: nessun badge, nessun clone ITA', async () => {
        // Documento vecchio: ha `sub.latest`/`episodes[]` freschi, ma la fonte non lo ha
        // nominato nella home. Il badge NON torna da lì: `EP 3` sul nostro campo sarebbe
        // inventato (e `EP 0` non esiste più come rischio).
        const snapshot = animeAiringState.buildSnapshot([{
            _id: '901050',
            schemaVersion: 1,
            ids: { tmdb: 901050, kitsu: '77' },
            title: 'Nudo',
            sub: { season: 1, episode: 3, airedAt: new Date(NOW - DAY_MS).toISOString() },
            episodes: [{ season: 1, episode: 3, airedAt: new Date(NOW - DAY_MS).toISOString(), subIta: true }]
        }]);
        const built = formatStremioCatalog([card('kitsu:77', 'Nudo')], 'preset_anime_simulcast', 'series', USER_CONFIG, false, HOST, CATALOG_META);
        const result = await applyAiringStateBadges(built.metas, {
            userConfig: USER_CONFIG, hostUrl: HOST, catalogMeta: CATALOG_META, type: 'series', snapshot
        });

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].poster).not.toContain('EP%20');
        expect(result.metas[0].poster).toBe('https://image.tmdb.org/t/p/w500/kitsu_77.jpg');
    });
});

describe('L\'ordine è quello della fonte: l\'ultimo episodio uscito, prima', () => {
    test('il più recente in testa, indipendentemente da orderIndex e listSeenAt', async () => {
        const items = [
            item({ number: 10, daysAgo: 12, tmdbId: 901060, title: 'Vecchio' }),
            item({ number: 11, daysAgo: 0.1, tmdbId: 901061, title: 'Fresco' }),
            item({ number: 12, daysAgo: 5, tmdbId: 901062, title: 'Di mezzo' })
        ];
        const documenti = documentiDaHome(items).map((d, i) => ({
            ...d,
            // ordIndex e listSeenAt "sbagliati" di proposito: non devono contare nulla
            orderIndex: 10 - i,
            listSeenAt: new Date(NOW - (i + 1) * DAY_MS).toISOString()
        }));

        animeAiringState.setDataSourceForTests(async () => documenti);
        const entries = animeAiringState.getAiringEntries(await animeAiringState.getSnapshot(), { now: NOW });
        expect(entries.map((e) => e.doc.tmdbId)).toEqual(['901061', '901062', '901060']);
        expect(entries[0].subEpisode).toBe(11);
        expect(entries[0].dubEpisode).toBeNull();
    });
});

describe('Il documento viaggia con la card (il meccanimo del ticket precedente resta)', () => {
    test('la card porta il riferimento al proprio documento e non lo lascia nel JSON', async () => {
        const items = [
            item({ number: 8, daysAgo: 0.3, dub: 0, animeId: 7400, tmdbId: 901070, title: 'Con riferimento' }),
            item({ number: 3, daysAgo: 0.2, dub: 1, animeId: 7401, tmdbId: 901070, title: 'Con riferimento ITA' })
        ];
        const { cards } = await catalogoDa(items);

        expect(cards.map((c) => c.id)).toEqual(['tmdb:901070', 'tmdb:901070_ita_offset']);
        expect(JSON.stringify(cards)).not.toContain('_airingDocTmdbId');
        expect(cards[0].poster).toContain('EP%208');
        expect(cards[1].poster).toContain('ITA%203');
    });
});