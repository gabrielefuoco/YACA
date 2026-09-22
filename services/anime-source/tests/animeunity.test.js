const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    AnimeUnityClient,
    decodeHtmlEntities,
    extractArchiveRecords
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
