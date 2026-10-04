/**
 * La fonte del catalogo "Simulcast (Nuovi Episodi)": la HOME di AnimeUnity, paginata.
 *
 * Qui si prova il contratto, senza rete: la home è una finta, `fetch` è finto.
 *  - il giro completo si FERMA quando la pagina più vecchia esce dalla finestra;
 *  - l'item dentro le due settimane produce una riga (canale + episodio + data);
 *  - l'item fuori finestra non produce niente;
 *  - lo stesso anime con due episodi in finestra produce UNA riga, quella più recente;
 *  - il documento porta `homeReleases` e il merge non lo perde.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { AnimeUnityClient } = require('../src/animeunity');
const {
    summarizeHomeItems,
    buildHomeReleases,
    buildHomeStateDocument,
    mergeAiringDocuments
} = require('../src/aggregate');
const { groupHomeRowsByTmdb, collectHomeAnimes } = require('../cli');

const NOW = Date.parse('2026-10-04T20:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
/** Data nel formato che scrive AnimeUnity (`YYYY-MM-DD HH:MM:SS`, UTC come nel resto del modulo). */
const at = (daysAgo, hour = 12) => {
    const d = new Date(NOW - daysAgo * DAY_MS);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(hour)}:00:00`;
};

function item(animeId, number, createdAt, dub = 0, extra = {}) {
    return {
        id: 1000 + animeId,
        anime_id: animeId,
        number: String(number),
        created_at: createdAt,
        anime: {
            id: animeId,
            dub,
            title: `Serie ${animeId}`,
            anilist_id: extra.anilist_id ?? null,
            mal_id: extra.mal_id ?? null,
            status: extra.status ?? 'In Corso'
        }
    };
}

/**
 * Home finta: `pages` array di array di item. La pagina 1 è la radice, la 2 è `/?page=2`.
 * Restituisce il fetch finto e il registro degli URL richiesti.
 */
function fakeHome(pages) {
    const asked = [];
    const fetchFn = async (url) => {
        const asString = String(url);
        asked.push(asString);
        const match = asString.match(/[?&]page=(\d+)/);
        const page = match ? Number(match[1]) : 1;
        const body = pages[page - 1];
        if (!body || body.length === 0) return { ok: true, status: 200, text: async () => '<html></html>' };
        const json = JSON.stringify(body).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return {
            ok: true,
            status: 200,
            text: async () => `<div id="app"><layout-items items-json="${json}"></layout-items></div>`
        };
    };
    return { fetchFn, asked };
}

describe('getHomeReleases — il giro completo della home', () => {
    test('si ferma quando la pagina più vecchia esce dalla finestra (home finta, niente rete)', async () => {
        // 5 item per pagina (la dimensione reale è 30: la regola non la usa).
        // p1 e p2 sono dentro le due settimane; p3 esce (il più vecchio ha 20 giorni).
        const pages = [
            [item(1, 5, at(0)), item(2, 3, at(0.2)), item(3, 1, at(0.5)), item(4, 9, at(1)), item(5, 2, at(1.5))],
            [item(6, 4, at(2)), item(7, 2, at(3)), item(8, 1, at(5)), item(9, 6, at(8)), item(10, 3, at(10))],
            [item(11, 1, at(13)), item(12, 7, at(16)), item(13, 2, at(20)), item(14, 4, at(25)), item(15, 1, at(30))],
            [item(16, 9, at(40)), item(17, 8, at(45)), item(18, 7, at(50)), item(19, 6, at(55)), item(20, 5, at(60))]
        ];
        const { fetchFn, asked } = fakeHome(pages);
        const client = new AnimeUnityClient({ fetch: fetchFn, requestDelayMs: 0, baseUrl: 'https://esempio.test' });

        const walk = await client.getHomeReleases({ now: NOW, windowDays: 14 });

        assert.strictEqual(walk.stoppedBy, 'window');
        assert.strictEqual(walk.pages.length, 3, 'si ferma alla terza pagina, non va alla quarta');
        assert.strictEqual(walk.items.length, 15);
        // La prima pagina è la radice, le successive usano ?page=N.
        assert.strictEqual(asked[0], 'https://esempio.test');
        assert.strictEqual(asked[1], 'https://esempio.test/?page=2');
        assert.strictEqual(asked[2], 'https://esempio.test/?page=3');
        assert.strictEqual(asked.length, 3, 'la quarta pagina non viene neppure richiesta');
        // La pagina che ha fatto scattare la finestra è dentro il giro.
        assert.ok(walk.items.some((i) => i.anime_id === 15));
    });

    test('la finestra si sposta da sola: a una data diversa servono più pagine', async () => {
        // Stessa home, ma "adesso" è 5 giorni dopo: le prime due pagine escono fuori
        // finestra e il giro deve proseguire fino a coprire i 14 giorni da lì.
        const pages = [
            [item(1, 6, at(0)), item(2, 4, at(0.3)), item(3, 2, at(0.6))],
            [item(4, 3, at(1)), item(5, 2, at(2)), item(6, 1, at(3))],
            [item(7, 5, at(4)), item(8, 4, at(5)), item(9, 3, at(6))],
            [item(10, 2, at(8)), item(11, 1, at(10)), item(12, 9, at(12))],
            [item(13, 3, at(13)), item(14, 2, at(14)), item(15, 1, at(15))],
            [item(16, 4, at(16)), item(17, 3, at(17)), item(18, 2, at(18))]
        ];
        const { fetchFn, asked } = fakeHome(pages);
        const client = new AnimeUnityClient({ fetch: fetchFn, requestDelayMs: 0, baseUrl: 'https://esempio.test' });

        const walk = await client.getHomeReleases({ now: NOW + 5 * DAY_MS, windowDays: 14 });

        assert.strictEqual(walk.stoppedBy, 'window');
        // pages 1-3 sono fuori finestra, la 4 copre i ~14 giorni richiesti.
        assert.strictEqual(walk.pages.length, 4);
        assert.strictEqual(asked.length, 4);
    });

    test('pagina vuota e prima pagina irraggiungibile: mai eccezioni, motivo dichiarato', async () => {
        const vuota = new AnimeUnityClient({
            fetch: async () => ({ ok: true, status: 200, text: async () => '<html></html>' }),
            requestDelayMs: 0,
            baseUrl: 'https://esempio.test'
        });
        const walkVuota = await vuota.getHomeReleases({ now: NOW, windowDays: 14 });
        assert.strictEqual(walkVuota.stoppedBy, 'unreachable');
        assert.deepStrictEqual(walkVuota.items, []);

        const mezzo = fakeHome([[item(1, 1, at(1))], null]);
        const client = new AnimeUnityClient({ fetch: mezzo.fetchFn, requestDelayMs: 0, baseUrl: 'https://esempio.test' });
        const walk = await client.getHomeReleases({ now: NOW, windowDays: 14 });
        assert.strictEqual(walk.stoppedBy, 'empty');
        assert.strictEqual(walk.items.length, 1);
    });

    test('il tetto di pagine è una rete di sicurezza, non una taratura', async () => {
        // Home sempre fresca: senza tetto il giro non finirebbe mai.
        const infinite = fakeHome(Array.from({ length: 10 }, (_, i) => [item(100 + i, 1, at(0))]));
        const client = new AnimeUnityClient({ fetch: infinite.fetchFn, requestDelayMs: 0, baseUrl: 'https://esempio.test' });

        const walk = await client.getHomeReleases({ now: NOW, windowDays: 14, maxPages: 3 });
        assert.strictEqual(walk.stoppedBy, 'max_pages');
        assert.strictEqual(walk.pages.length, 3);
    });

    test('getLatestReleasesFromHome resta la sola prima pagina (il check incrementale)', async () => {
        const { fetchFn, asked } = fakeHome([[item(1, 1, at(0))], [item(2, 1, at(0))]]);
        const client = new AnimeUnityClient({ fetch: fetchFn, requestDelayMs: 0, baseUrl: 'https://esempio.test' });

        const items = await client.getLatestReleasesFromHome();
        assert.strictEqual(items.length, 1);
        assert.deepStrictEqual(asked, ['https://esempio.test']);
    });
});

describe('summarizeHomeItems — la finestra applicata agli item', () => {
    const OPZIONI = { now: NOW, windowDays: 14 };

    test('item in finestra -> una riga col canale e l\'episodio; item fuori -> niente', () => {
        const rows = summarizeHomeItems([
            item(10, 5, at(0.2), 0),
            item(11, 3, at(3), 0),
            item(12, 2, at(6), 0),
            item(13, 1, at(13), 0),   // dentro: 13 giorni fa
            item(14, 9, at(15), 0),   // fuori: 15 giorni fa
            item(15, 8, at(40), 0)    // fuori: 40 giorni fa
        ], OPZIONI);

        assert.deepStrictEqual(rows.map((r) => r.animeId).sort((a, b) => a - b), [10, 11, 12, 13]);
        assert.strictEqual(rows.find((r) => r.animeId === 10).episode, 5);
        assert.strictEqual(rows.find((r) => r.animeId === 10).dub, 0);
        assert.strictEqual(rows.find((r) => r.animeId === 10).airedAt, at(0.2).replace(' ', 'T') + '.000Z');
    });

    test('`dub: 1` sull\'anime decide il canale, non l\'item', () => {
        const [riga] = summarizeHomeItems([item(20, 7, at(1), 1)], OPZIONI);
        assert.strictEqual(riga.dub, 1);
        assert.strictEqual(riga.animeId, 20);
        assert.strictEqual(riga.episode, 7);
    });

    test('lo stesso anime con due episodi in finestra -> UNA riga, la più recente', () => {
        const rows = summarizeHomeItems([
            item(30, 4, at(2)),     // più vecchio
            item(30, 5, at(0.1)),   // più recente: questo vince
            item(30, 6, at(4))      // ancora più vecchio
        ], OPZIONI);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].episode, 5);
        assert.strictEqual(rows[0].airedAt, at(0.1).replace(' ', 'T') + '.000Z');
    });

    test('sub e doppiato dello stesso anime sono due righe diverse', () => {
        const rows = summarizeHomeItems([
            item(40, 5, at(0.5), 0),
            item(40, 2, at(0.1), 1)
        ], OPZIONI);

        assert.strictEqual(rows.length, 2);
        assert.deepStrictEqual(rows.map((r) => r.dub).sort(), [0, 1]);
    });

    test('a parità di data vince la numerazione più alta; episodi 0 e date rotte si scartano', () => {
        const rows = summarizeHomeItems([
            item(50, 3, at(1)),
            item(50, 4, at(1)),
            item(51, 0, at(1)),                          // episodio 0: non esiste
            item(52, 2, 'non-una-data'),                 // data illeggibile
            item(53, 1, at(1), 0, { anilist_id: 1 })      // valido, serve il caso "a parità vince il maggiore"
        ], OPZIONI);

        assert.deepStrictEqual(rows.map((r) => [r.animeId, r.episode]), [[50, 4], [53, 1]]);
    });

    test('un item senza anime, senza id o senza data non deve far cadere il giro', () => {
        const rows = summarizeHomeItems([
            null,
            { id: 1, anime_id: 60, number: '2', created_at: at(1) },   // niente `anime`
            { anime: { id: 0, dub: 0 }, number: '2', created_at: at(1) }, // id non valido
            item(61, 1, at(1))
        ], OPZIONI);
        assert.deepStrictEqual(rows.map((r) => r.animeId), [61]);
    });
});

describe('groupHomeRowsByTmdb — l\'identità, l\'unico lavoro che resta', () => {
    const items = [
        item(100, 5, at(0.2), 0, { anilist_id: 111, mal_id: 222 }),
        item(100, 2, at(0.1), 1, { anilist_id: 111, mal_id: 222 }),   // doppiato: stesso anime id
        item(101, 7, at(0.3), 0, { anilist_id: 333, mal_id: 444 })    // altro titolo
    ];
    const rows = summarizeHomeItems(items, { now: NOW, windowDays: 14 });
    const animeById = collectHomeAnimes(items);
    const resolver = {
        resolve: ({ anilistId }) => {
            if (anilistId === 111) return { tmdbId: '240411', kitsuId: '48269', anilistId, season: 2 };
            if (anilistId === 333) return { tmdbId: '555', kitsuId: null, anilistId, season: 1 };
            return null;
        }
    };

    test('sub e doppiato dello stesso anime diventano un solo documento con due canali', () => {
        assert.strictEqual(animeById.size, 2, 'due anime distinti nella home');
        const { groups, unresolved } = groupHomeRowsByTmdb(rows, animeById, resolver);
        assert.deepStrictEqual(unresolved, []);
        assert.strictEqual(groups.length, 2);

        const danda = groups.find((g) => g.tmdbId === '240411');
        assert.strictEqual(danda.rows.length, 2);
        const home = buildHomeReleases(danda.rows, { checkedAt: new Date(NOW).toISOString() });
        assert.strictEqual(home.sub.episode, 5);
        assert.strictEqual(home.dub.episode, 2);

        const doc = buildHomeStateDocument({
            tmdbId: danda.tmdbId,
            kitsuId: danda.kitsuId,
            title: danda.title,
            homeReleases: home,
            now: NOW
        });
        assert.strictEqual(doc._id, '240411');
        assert.strictEqual(doc.ids.kitsu, '48269');
    });

    test('un anime senza identità resta fuori e viene contato: è l\'unica differenza ammessa', () => {
        const senzaIdentita = summarizeHomeItems(
            [item(200, 3, at(0.5), 0, { anilist_id: 999, mal_id: 888 })],
            { now: NOW, windowDays: 14 }
        );
        const { groups, unresolved } = groupHomeRowsByTmdb(senzaIdentita, collectHomeAnimes([item(200, 3, at(0.5), 0, { anilist_id: 999, mal_id: 888 })]), resolver);
        assert.strictEqual(groups.length, 0);
        assert.strictEqual(unresolved.length, 1);
        assert.strictEqual(unresolved[0].animeId, 200);
        assert.strictEqual(buildHomeStateDocument({ tmdbId: null, homeReleases: {} }), null);
    });
});

describe('buildHomeReleases + documento', () => {
    test('sub e dub nella finestra finiscono nel documento, col loro episodio', () => {
        const rows = summarizeHomeItems([
            item(70, 5, at(0.3), 0),
            item(70, 2, at(0.1), 1)
        ], { now: NOW, windowDays: 14 });

        const home = buildHomeReleases(rows, { checkedAt: new Date(NOW).toISOString() });
        assert.strictEqual(home.sub.episode, 5);
        assert.strictEqual(home.dub.episode, 2);
        assert.strictEqual(home.checkedAt, new Date(NOW).toISOString());

        const doc = buildHomeStateDocument({
            tmdbId: 240411,
            kitsuId: 48269,
            title: 'Dandadan',
            homeReleases: home,
            now: NOW
        });
        assert.strictEqual(doc._id, '240411');
        assert.strictEqual(doc.ids.kitsu, '48269');
        assert.strictEqual(doc.homeReleases.sub.episode, 5);
        assert.strictEqual(doc.homeReleases.dub.episode, 2);
        assert.strictEqual(doc.sources, undefined, 'la passata home non tocca le fonti dell\'archivio');
        assert.strictEqual(doc.sub, undefined, 'né sub.latest né italian: restano al ciclo dell\'archivio');
    });

    test('un anime solo-dub: `sub` null e `dub` pieno (la card ITA senza la card sub)', () => {
        const rows = summarizeHomeItems([item(71, 4, at(0.2), 1)], { now: NOW, windowDays: 14 });
        const home = buildHomeReleases(rows, { checkedAt: new Date(NOW).toISOString() });
        assert.strictEqual(home.sub, null);
        assert.strictEqual(home.dub.episode, 4);
    });

    test('il merge conserva `homeReleases` e chi non lo porta non lo cancella', () => {
        const esistente = {
            _id: '999',
            schemaVersion: 1,
            ids: { tmdb: 999, kitsu: '9' },
            title: 'Serie lunga',
            sub: { season: 1, episode: 30, airedAt: '2026-09-01T00:00:00.000Z' },
            italian: { sub: { latest: { season: 1, episode: 30 } }, dub: null },
            episodes: [{ season: 1, episode: 30, airedAt: '2026-09-01T00:00:00.000Z', subIta: true }],
            homeReleases: { checkedAt: '2026-10-01T00:00:00.000Z', sub: { episode: 30, airedAt: '2026-10-01T00:00:00.000Z' }, dub: null },
            sources: [{ provider: 'animeunity', animeId: 1, dub: 0 }]
        };

        // 1. Il ciclo dell'archivio (che non sa niente della home) non deve cancellarlo.
        const merged = mergeAiringDocuments(esistente, {
            _id: '999',
            schemaVersion: 1,
            ids: { tmdb: 999 },
            sub: { season: 1, episode: 31, airedAt: '2026-10-03T00:00:00.000Z' }
        });
        assert.strictEqual(merged.homeReleases.sub.episode, 30);
        assert.strictEqual(merged.sub.episode, 31);

        // 2. La passata home aggiorna il campo e lascia intatti gli altri.
        const conHome = mergeAiringDocuments(esistente, {
            _id: '999',
            schemaVersion: 1,
            ids: { tmdb: 999, kitsu: '9' },
            schedule: { status: 'In corso' },
            homeReleases: { checkedAt: '2026-10-04T00:00:00.000Z', sub: { episode: 33, airedAt: '2026-10-04T00:00:00.000Z' }, dub: { episode: 4, airedAt: '2026-10-02T00:00:00.000Z' } }
        });
        assert.strictEqual(conHome.homeReleases.sub.episode, 33);
        assert.strictEqual(conHome.homeReleases.dub.episode, 4);
        assert.strictEqual(conHome.homeReleases.checkedAt, '2026-10-04T00:00:00.000Z');
        assert.strictEqual(conHome.sub.episode, 30, 'il sub dell\'archivio resta');
        assert.strictEqual(conHome.episodes.length, 1, 'episodes[] resta');
        assert.strictEqual(conHome.sources.length, 1, 'sources resta');
    });
});