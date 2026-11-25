const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    AnimeUnityClient,
    decodeHtmlEntities,
    extractArchiveRecords,
    extractHomeItems
} = require('../src/animeunity');
const { summarizeHomeItems } = require('../src/aggregate');

describe('AnimeUnity Adapter (New JSON API)', () => {
    test('decodeHtmlEntities decodifica correttamente le entità HTML e XML', () => {
        const input = '&quot;Titolo&quot; &amp; &lt;tag&gt; &#039;test&#039; &#x41;';
        const expected = '"Titolo" & <tag> \'test\' A';
        assert.strictEqual(decodeHtmlEntities(input), expected);
    });

    test('home: latest-episodes con item misti jpn/ita produce episodi e dub flag corretti e preserva il primo airedAt osservato', async () => {
        const homeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_home_latest_episodes.json'), 'utf8'));
        const asked = [];
        const mockFetch = async (url) => {
            asked.push(url);
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify(homeFixture)
            };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0, baseUrl: 'https://animeunity.cx' });
        const t1 = Date.parse('2026-11-25T10:00:00.000Z');
        const t2 = Date.parse('2026-11-25T10:15:00.000Z');

        const releases1 = await client.getLatestReleasesFromHome({ now: t1 });
        assert.strictEqual(asked[0], 'https://animeunity.cx/api/home/latest-episodes');
        assert.strictEqual(releases1.length, 2);

        const jpnItem = releases1.find(r => r.anime.id === 7776);
        assert.strictEqual(jpnItem.number, '8');
        assert.strictEqual(jpnItem.anime.dub, 0);
        assert.strictEqual(jpnItem.created_at, '2026-11-25T10:00:00.000Z');

        const itaItem = releases1.find(r => r.anime.id === 7793);
        assert.strictEqual(itaItem.number, '5');
        assert.strictEqual(itaItem.anime.dub, 1);
        assert.strictEqual(itaItem.created_at, '2026-11-25T10:00:00.000Z');

        // Seconda osservazione a t2 (15 min dopo): airedAt resta quello della prima osservazione
        const releases2 = await client.getLatestReleasesFromHome({ now: t2 });
        assert.strictEqual(releases2.find(r => r.anime.id === 7776).created_at, '2026-11-25T10:00:00.000Z');
        assert.strictEqual(releases2.find(r => r.anime.id === 7793).created_at, '2026-11-25T10:00:00.000Z');

        // Compatibilita' con aggregate.summarizeHomeItems
        const rows = summarizeHomeItems(releases2, { now: t2, windowDays: 14 });
        assert.strictEqual(rows.length, 2);
        assert.deepStrictEqual(rows.find(r => r.animeId === 7776), {
            animeId: 7776,
            dub: 0,
            episode: 8,
            airedAt: '2026-11-25T10:00:00.000Z'
        });
        assert.deepStrictEqual(rows.find(r => r.animeId === 7793), {
            animeId: 7793,
            dub: 1,
            episode: 5,
            airedAt: '2026-11-25T10:00:00.000Z'
        });
    });

    test('episodes: 120 episodi con i primi 3 ita+jpn e i restanti solo jpn separano sub e dub correttamente', async () => {
        const epFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_anime_episodes_120.json'), 'utf8'));
        const mockFetch = async (url) => {
            if (url.includes('/api/anime/112/episodes')) {
                return { ok: true, status: 200, json: async () => epFixture };
            }
            return { ok: false, status: 404 };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0, baseUrl: 'https://animeunity.cx' });

        const subRes = await client.getEpisodes(112, 0);
        assert.ok(subRes);
        assert.strictEqual(subRes.episodes_count, 120);
        assert.strictEqual(subRes.episodes.length, 120);
        assert.strictEqual(subRes.episodes[0].number, '1');
        assert.strictEqual(subRes.episodes[119].number, '120');

        const dubRes = await client.getEpisodes(112, 1);
        assert.ok(dubRes);
        assert.strictEqual(dubRes.episodes_count, 3);
        assert.strictEqual(dubRes.episodes.length, 3);
        assert.deepStrictEqual(dubRes.episodes.map(e => e.number), ['1', '2', '3']);
    });

    test('pagination: total > episodes.length attiva la seconda richiesta con start', async () => {
        const p1Base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_anime_episodes_120.json'), 'utf8'));
        const p2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_anime_episodes_p2.json'), 'utf8'));
        const p1 = { ...p1Base, total: 125 };

        const calls = [];
        const mockFetch = async (url) => {
            calls.push(url);
            if (url.includes('start=121')) {
                return { ok: true, status: 200, json: async () => p2 };
            }
            return { ok: true, status: 200, json: async () => p1 };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0, baseUrl: 'https://animeunity.cx' });
        const subRes = await client.getEpisodes(112, 0);

        assert.strictEqual(calls.length, 2);
        assert.strictEqual(calls[0], 'https://animeunity.cx/api/anime/112/episodes');
        assert.strictEqual(calls[1], 'https://animeunity.cx/api/anime/112/episodes?start=121');
        assert.strictEqual(subRes.episodes.length, 125);
        assert.strictEqual(subRes.episodes[124].number, '125');
    });

    test('archive: status=ongoing viene richiesto in GET e parsato con id, slug e titolo', async () => {
        const archiveFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_archive_ongoing.json'), 'utf8'));
        const calls = [];
        const mockFetch = async (url, options = {}) => {
            calls.push({ url, method: options.method || 'GET' });
            return { ok: true, status: 200, json: async () => archiveFixture };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0, baseUrl: 'https://animeunity.cx' });
        const records = await client.getOngoingSeries({ limit: 90 });

        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].method, 'GET');
        assert.strictEqual(calls[0].url, 'https://animeunity.cx/api/archive?status=ongoing');
        assert.strictEqual(records.length, 2);
        assert.strictEqual(records[0].id, 7826);
        assert.strictEqual(records[0].slug, 'im-looking-for-a-zombie');
        assert.strictEqual(records[0].title, "#I'm Looking For a Zombie");
        assert.strictEqual(records[0].anilist_id, 199007);
        assert.strictEqual(records[0].status, 'In Corso');
        assert.strictEqual(records[0].real_episodes_count, 7);
    });

    test('getDubbedSeries usa GET /api/archive?language=ita senza CSRF e rispetta il limite', async () => {
        const archiveFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_archive_ongoing.json'), 'utf8'));
        const calls = [];
        const mockFetch = async (url, options = {}) => {
            calls.push({ url, method: options.method || 'GET' });
            return { ok: true, status: 200, json: async () => archiveFixture };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0, baseUrl: 'https://animeunity.cx' });
        const recordsLimited = await client.getDubbedSeries({ limit: 1 });
        assert.strictEqual(recordsLimited.length, 1);
        assert.strictEqual(recordsLimited[0].dub, 1);
        assert.strictEqual(calls[0].url, 'https://animeunity.cx/api/archive?language=ita');
        assert.strictEqual(calls[0].method, 'GET');
    });

    test('extractHomeItems gestisce JSON nuovo, JSON legacy e input non validi', () => {
        const homeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_home_latest_episodes.json'), 'utf8'));
        const parsedNew = extractHomeItems(homeFixture, { now: Date.parse('2026-11-25T12:00:00Z') });
        assert.strictEqual(parsedNew.length, 2);
        assert.strictEqual(parsedNew[0].anime.dub, 0);
        assert.strictEqual(parsedNew[1].anime.dub, 1);

        const rawItems = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/home_items.json'), 'utf8'));
        assert.strictEqual(extractHomeItems(rawItems).length, 5);
        assert.strictEqual(extractHomeItems(JSON.stringify(rawItems)).length, 5);
        assert.deepStrictEqual(extractHomeItems('<div>nessun item</div>'), []);
        assert.deepStrictEqual(extractHomeItems(null), []);
    });

    test('extractArchiveRecords gestisce JSON vuoto o malformato', () => {
        assert.deepStrictEqual(extractArchiveRecords('<div>nessun record</div>'), []);
        assert.deepStrictEqual(extractArchiveRecords(''), []);
        assert.deepStrictEqual(extractArchiveRecords(null), []);
        assert.deepStrictEqual(extractArchiveRecords('<archive-records records="not-valid-json">'), []);
    });

    test('findSubCounterpart trova la variante jpn su record con variants o tramite /api/search', async () => {
        const mockFetch = async (url) => {
            if (url.includes('/api/search?q=Dan%20Da%20Dan')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: [{
                            id: 5660,
                            slug: 'dan-da-dan',
                            title: 'Dan Da Dan',
                            default_status: 'completed',
                            variants: [
                                { language: 'ita', status: 'completed', episodes_count: 12 },
                                { language: 'jpn', status: 'completed', episodes_count: 12 }
                            ]
                        }]
                    })
                };
            }
            return { ok: true, status: 200, json: async () => ({ data: [] }) };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0 });
        const subFound = await client.findSubCounterpart({
            id: 5660,
            slug: 'dan-da-dan',
            title: 'Dan Da Dan'
        });
        assert.ok(subFound);
        assert.strictEqual(subFound.id, 5660);
        assert.strictEqual(subFound.dub, 0);
        assert.strictEqual(subFound.real_episodes_count, 12);

        const subNotFound = await client.findSubCounterpart({
            id: 827,
            slug: 'hackintermezzo',
            title: '.hack//Intermezzo'
        });
        assert.strictEqual(subNotFound, null);
    });

    test('groupRecordsByTmdb separa correttamente subRecord e dubRecord da variants della nuova API', () => {
        const archiveFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_archive_ongoing.json'), 'utf8'));
        const records = extractArchiveRecords(archiveFixture);
        const { groupRecordsByTmdb } = require('../cli');
        const resolver = {
            resolve: ({ anilistId }) => {
                if (anilistId === 199007) return { tmdbId: '300001', season: 1, anilistId };
                if (anilistId === 178868) return { tmdbId: '300002', season: 1, anilistId };
                return null;
            }
        };
        const groups = groupRecordsByTmdb(records, resolver);
        assert.strictEqual(groups.length, 2);

        const rayearth = groups.find(g => g.tmdbId === '300002');
        const s1 = rayearth.seasonsMap.get(1);
        assert.strictEqual(s1.subRecord.dub, 0);
        assert.strictEqual(s1.subRecord.real_episodes_count, 8);
        assert.strictEqual(s1.dubRecord.dub, 1);
        assert.strictEqual(s1.dubRecord.real_episodes_count, 5);
    });

    test('searchArchive e getEpisodes gestiscono errori HTTP senza crash o dati inventati', async () => {
        const failingFetch = async () => ({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        const client = new AnimeUnityClient({ fetch: failingFetch, requestDelayMs: 0 });
        assert.deepStrictEqual(await client.searchArchive('Qualsiasi'), []);
        assert.strictEqual(await client.getEpisodes(99999, 0), null);
    });

    test('429: riprova UNA volta con pausa crescente, logga warn con animeId e error solo se fallisce anche il retry', async () => {
        let ep743Calls = 0;
        let ep744Calls = 0;
        let ep745Calls = 0;
        const epFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_anime_episodes_120.json'), 'utf8'));

        const mockFetch = async (url) => {
            if (url.includes('/api/anime/743/episodes')) {
                ep743Calls++;
                if (ep743Calls === 1) return { ok: false, status: 429 };
                return { ok: true, status: 200, json: async () => epFixture };
            }
            if (url.includes('/api/anime/744/episodes')) {
                ep744Calls++;
                return { ok: false, status: 429 };
            }
            if (url.includes('/api/anime/745/episodes')) {
                ep745Calls++;
                return { ok: true, status: 200, json: async () => epFixture };
            }
            return { ok: false, status: 404 };
        };

        const warns = [];
        const errors = [];
        const origWarn = console.warn;
        const origError = console.error;
        console.warn = (...args) => warns.push(args.join(' '));
        console.error = (...args) => errors.push(args.join(' '));

        try {
            const client = new AnimeUnityClient({
                fetch: mockFetch,
                requestDelayMs: 0,
                rateLimitDelaysMs: [15, 45]
            });

            // 1) Anime 743: primo 429 -> warn + attesa 15ms -> retry 200 (nessun error)
            const t0 = Date.now();
            const res743 = await client.getEpisodes(743, 0);
            const elapsed743 = Date.now() - t0;
            assert.ok(res743 && res743.episodes_count === 120);
            assert.strictEqual(ep743Calls, 2);
            assert.ok(elapsed743 >= 10, `attesa primo backoff >= 10ms (got ${elapsed743}ms)`);
            assert.ok(warns.some(w => w.includes('743') && w.includes('429')));
            assert.strictEqual(errors.length, 0);

            // 2) Anime 744: 429 poi ancora 429 -> pausa crescente (45ms), un solo retry, poi error e return null senza abortire
            const t1 = Date.now();
            const res744 = await client.getEpisodes(744, 0);
            const elapsed744 = Date.now() - t1;
            assert.strictEqual(res744, null);
            assert.strictEqual(ep744Calls, 2, 'riprova esattamente una volta');
            assert.ok(elapsed744 >= 35, `pausa crescente >= 35ms (got ${elapsed744}ms)`);
            assert.ok(warns.some(w => w.includes('744') && w.includes('45ms')));
            assert.ok(errors.some(e => e.includes('744') && e.includes('429')));

            // 3) Il ciclo continua dopo il 429 fallito e il successo pulito azzera lo streak
            const t2 = Date.now();
            const res745 = await client.getEpisodes(745, 0);
            const elapsed745 = Date.now() - t2;
            assert.ok(res745 && res745.episodes_count === 120);
            assert.strictEqual(ep745Calls, 1);
            assert.ok(elapsed745 >= 35, `cooldown dopo retry 429 fallito applicato al pacing (got ${elapsed745}ms)`);
            assert.strictEqual(client._rateLimitStreak, 0, 'successo pulito azzera la streak 429');
        } finally {
            console.warn = origWarn;
            console.error = origError;
        }
    });

    test('429: retry funziona anche su home e archive', async () => {
        let homeCalls = 0;
        let archiveCalls = 0;
        const homeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_home_latest_episodes.json'), 'utf8'));
        const archiveFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api_archive_ongoing.json'), 'utf8'));

        const mockFetch = async (url) => {
            if (url.includes('/api/home/latest-episodes')) {
                homeCalls++;
                if (homeCalls === 1) return { ok: false, status: 429 };
                return { ok: true, status: 200, text: async () => JSON.stringify(homeFixture) };
            }
            if (url.includes('/api/archive')) {
                archiveCalls++;
                if (archiveCalls === 1) return { ok: false, status: 429 };
                return { ok: true, status: 200, json: async () => archiveFixture };
            }
            return { ok: false, status: 404 };
        };

        const warns = [];
        const errors = [];
        const origWarn = console.warn;
        const origError = console.error;
        console.warn = (...args) => warns.push(args.join(' '));
        console.error = (...args) => errors.push(args.join(' '));

        try {
            const client = new AnimeUnityClient({
                fetch: mockFetch,
                requestDelayMs: 0,
                rateLimitDelaysMs: [5, 10]
            });

            const homeItems = await client.getLatestReleasesFromHome();
            assert.strictEqual(homeItems.length, 2);
            assert.strictEqual(homeCalls, 2);

            const archiveRecords = await client.getOngoingSeries({ limit: 50 });
            assert.strictEqual(archiveRecords.length, 2);
            assert.strictEqual(archiveCalls, 2);

            assert.strictEqual(warns.length, 2);
            assert.strictEqual(errors.length, 0);
        } finally {
            console.warn = origWarn;
            console.error = origError;
        }
    });
});
