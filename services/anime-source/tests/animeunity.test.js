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

describe('AnimeUnity Adapter', () => {
    test('decodeHtmlEntities decodifica correttamente le entità HTML e XML', () => {
        const input = '&quot;Titolo&quot; &amp; &lt;tag&gt; &#039;test&#039; &#x41;';
        const expected = '"Titolo" & <tag> \'test\' A';
        assert.strictEqual(decodeHtmlEntities(input), expected);
    });

    test('extractArchiveRecords estrae i record reali dalla fixture di Dandadan', () => {
        const fixturePath = path.join(__dirname, 'fixtures/dandadan_archive.html');
        const html = fs.readFileSync(fixturePath, 'utf8');

        const records = extractArchiveRecords(html);
        assert.ok(Array.isArray(records), 'I record devono essere un array');
        assert.strictEqual(records.length, 4, 'Ci devono essere 4 record totali per Dandadan');

        const subS1 = records.find(r => r.id === 5660);
        assert.ok(subS1, 'Record sub 5660 presente');
        assert.strictEqual(subS1.title, 'Dandadan');
        assert.strictEqual(subS1.dub, 0);
        assert.strictEqual(subS1.anilist_id, 171018);
        assert.strictEqual(subS1.mal_id, 57334);
        assert.strictEqual(subS1.status, 'Terminato');
        assert.strictEqual(subS1.episodes_count, 12);

        const dubS1 = records.find(r => r.id === 5698);
        assert.ok(dubS1, 'Record doppiato 5698 presente');
        assert.strictEqual(dubS1.title, 'Dandadan (ITA)');
        assert.strictEqual(dubS1.dub, 1);
        assert.strictEqual(dubS1.anilist_id, 171018);
        assert.strictEqual(dubS1.mal_id, 57334);
        assert.strictEqual(dubS1.status, 'Terminato');
        assert.strictEqual(dubS1.episodes_count, 12);
    });

    test('extractArchiveRecords gestisce HTML malformato o assenza di attributo records', () => {
        assert.deepStrictEqual(extractArchiveRecords('<div>nessun record</div>'), []);
        assert.deepStrictEqual(extractArchiveRecords(''), []);
        assert.deepStrictEqual(extractArchiveRecords(null), []);
        assert.deepStrictEqual(extractArchiveRecords('<archive-records records="not-valid-json">'), []);
    });

    test('extractHomeItems estrae correttamente gli item da fixture HTML e JSON', () => {
        const fixtureHtml = fs.readFileSync(path.join(__dirname, 'fixtures/home_page.html'), 'utf8');
        const items = extractHomeItems(fixtureHtml);

        assert.ok(Array.isArray(items));
        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[0].anime.title, 'Futsutsuka na Akujo dewa Gozaimasu ga: Suuguu Chouso Torikae Den (ITA)');
        assert.strictEqual(items[0].anime.dub, 1);
        assert.strictEqual(items[1].anime.dub, 0);
        assert.strictEqual(items[2].anime.dub, 1);

        // Test da oggetto e stringa JSON
        const rawItems = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/home_items.json'), 'utf8'));
        assert.strictEqual(extractHomeItems(rawItems).length, 5);
        assert.strictEqual(extractHomeItems(JSON.stringify(rawItems)).length, 5);
        assert.deepStrictEqual(extractHomeItems('<div>nessun item</div>'), []);
        assert.deepStrictEqual(extractHomeItems(null), []);
    });

    test('getEpisodes parsa correttamente le risposte reali di /info_api sub e doppiato', async () => {
        const subFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_5660_sub.json'), 'utf8'));
        const dubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_5698_dub.json'), 'utf8'));

        const mockFetch = async (url) => {
            if (url.includes('/5660/0')) {
                return {
                    ok: true,
                    json: async () => subFixture
                };
            }
            if (url.includes('/5698/1')) {
                return {
                    ok: true,
                    json: async () => dubFixture
                };
            }
            return { ok: false, status: 404 };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0 });

        const subRes = await client.getEpisodes(5660, 0);
        assert.ok(subRes);
        assert.strictEqual(subRes.episodes_count, 12);
        assert.strictEqual(subRes.episodes.length, 12);
        assert.strictEqual(subRes.episodes[0].number, '1');
        assert.strictEqual(subRes.episodes[0].created_at, '2024-10-03 16:15:04');

        const dubRes = await client.getEpisodes(5698, 1);
        assert.ok(dubRes);
        assert.strictEqual(dubRes.episodes_count, 12);
        assert.strictEqual(dubRes.episodes.length, 12);
        assert.strictEqual(dubRes.episodes[0].number, '1');
        assert.strictEqual(dubRes.episodes[0].created_at, '2024-10-03 16:45:54');
    });

    test('getDubbedSeries scarica l archivio con dubbed: true, status: false e rispetta il limite', async () => {
        const dubbedFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/archive_dubbed.json'), 'utf8'));

        const mockFetch = async (url, options = {}) => {
            if (url.includes('/archivio') && (!options.method || options.method === 'GET')) {
                return {
                    ok: true,
                    status: 200,
                    headers: {
                        getSetCookie: () => ['XSRF-TOKEN=test-csrf; Path=/'],
                        get: () => 'XSRF-TOKEN=test-csrf;'
                    },
                    text: async () => '<html><head><meta name="csrf-token" content="csrf-val-abc"></head></html>'
                };
            }
            if (url.includes('/archivio/get-animes') && options.method === 'POST') {
                const body = JSON.parse(options.body);
                assert.strictEqual(body.dubbed, true, 'dubbed deve essere true');
                assert.strictEqual(body.status, false, 'status deve essere false per prendere tutti i doppiati');
                assert.strictEqual(options.headers['X-CSRF-TOKEN'], 'csrf-val-abc');

                if (body.offset === 0) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            tot: 4,
                            records: dubbedFixture.records
                        })
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        tot: 4,
                        records: []
                    })
                };
            }
            return { ok: false, status: 404 };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0 });

        // Test con limit 2 su 4 disponibili
        const recordsLimited = await client.getDubbedSeries({ limit: 2 });
        assert.strictEqual(recordsLimited.length, 2);
        assert.strictEqual(recordsLimited[0].title, 'Dandadan (ITA)');

        // Test con limit pieno
        const recordsAll = await client.getDubbedSeries({ limit: 10 });
        assert.strictEqual(recordsAll.length, 4);
    });

    test('getLatestReleasesFromHome legge e parsa gli elementi della home page', async () => {
        const html = fs.readFileSync(path.join(__dirname, 'fixtures/home_page.html'), 'utf8');
        const mockFetch = async () => ({
            ok: true,
            status: 200,
            text: async () => html
        });

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0 });
        const releases = await client.getLatestReleasesFromHome();

        assert.ok(Array.isArray(releases));
        assert.strictEqual(releases.length, 3);
        assert.strictEqual(releases[0].anime.id, 7701);
        assert.strictEqual(releases[0].number, '6');
    });

    test('findSubCounterpart trova la controparte sub tramite anilist_id/mal_id o ritorna null', async () => {
        const dandadanArchiveHtml = fs.readFileSync(path.join(__dirname, 'fixtures/dandadan_archive.html'), 'utf8');

        const mockFetch = async (url) => {
            if (url.includes('title=Dandadan')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => dandadanArchiveHtml
                };
            }
            if (url.includes('title=.hack')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => '<archive-records records="[{&quot;id&quot;:827,&quot;title&quot;:&quot;.hack//Intermezzo (ITA)&quot;,&quot;dub&quot;:1,&quot;anilist_id&quot;:1143,&quot;mal_id&quot;:1143}]">'
                };
            }
            return { ok: true, text: async () => '[]' };
        };

        const client = new AnimeUnityClient({ fetch: mockFetch, requestDelayMs: 0 });

        // 1. Dandadan (ITA) -> ha controparte sub (id 5660)
        const subFound = await client.findSubCounterpart({
            id: 5698,
            title: 'Dandadan (ITA)',
            anilist_id: 171018,
            mal_id: 57334
        });
        assert.ok(subFound);
        assert.strictEqual(subFound.id, 5660);
        assert.strictEqual(subFound.dub, 0);

        // 2. .hack//Intermezzo (ITA) -> esiste solo doppiato, nessuna controparte sub
        const subNotFound = await client.findSubCounterpart({
            id: 827,
            title: '.hack//Intermezzo (ITA)',
            anilist_id: 1143,
            mal_id: 1143
        });
        assert.strictEqual(subNotFound, null);
    });

    test('searchArchive e getEpisodes gestiscono errori HTTP senza crash o dati inventati', async () => {
        const failingFetch = async () => ({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        const client = new AnimeUnityClient({ fetch: failingFetch, requestDelayMs: 0 });

        const searchRes = await client.searchArchive('Qualsiasi');
        assert.deepStrictEqual(searchRes, []);

        const epRes = await client.getEpisodes(99999, 0);
        assert.strictEqual(epRes, null);
    });
});
