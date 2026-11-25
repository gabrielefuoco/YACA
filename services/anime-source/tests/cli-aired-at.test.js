const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { processTmdbGroup } = require('../cli');
const { AnimeUnityClient } = require('../src/animeunity');
const { mergeAiringDocuments } = require('../src/aggregate');

function makeGroup(seasonEntry, title = 'Titolo Test') {
    return {
        title,
        tmdbId: '999',
        orderIndex: 0,
        seasonsMap: new Map([[seasonEntry.season || 1, seasonEntry]])
    };
}

const identity = { tmdbId: '999', kitsuId: '1', anilistId: 1, malId: 1, season: 1 };
const noSubSearch = { findSubCounterpart: false };

describe('processTmdbGroup - data di uscita per osservazione (airedAt)', () => {
    test('osserva sub e dub senza chiamare /episodes e persiste in home-observed-at.json', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-aired-obs-'));
        try {
            let fetchCalls = 0;
            const client = new AnimeUnityClient({
                cacheDir: tmpDir,
                requestDelayMs: 0,
                fetch: async () => {
                    fetchCalls++;
                    throw new Error('non deve chiamare rete');
                }
            });

            const t1 = Date.parse('2026-11-25T10:00:00.000Z');
            const t2 = Date.parse('2026-11-25T13:00:00.000Z');

            const doc1 = await processTmdbGroup(makeGroup({
                season: 1,
                subRecord: { id: 12, title: 'One Piece', dub: 0, real_episodes_count: 1180 },
                dubRecord: { id: 2998, title: 'One Piece (ITA)', dub: 1, real_episodes_count: 936 },
                identity
            }), client, { ...noSubSearch, now: t1 });

            assert.strictEqual(fetchCalls, 0, 'zero chiamate /episodes per airedAt');
            assert.strictEqual(doc1.sub.airedAt, '2026-11-25T10:00:00.000Z');
            assert.strictEqual(doc1.dub.airedAt, '2026-11-25T10:00:00.000Z');

            // Nuova istanza del client ricarica home-observed-at.json e mantiene la prima osservazione
            const clientReloaded = new AnimeUnityClient({ cacheDir: tmpDir, requestDelayMs: 0 });
            const doc2 = await processTmdbGroup(makeGroup({
                season: 1,
                subRecord: { id: 12, title: 'One Piece', dub: 0, real_episodes_count: 1180 },
                dubRecord: { id: 2998, title: 'One Piece (ITA)', dub: 1, real_episodes_count: 936 },
                identity
            }), clientReloaded, { ...noSubSearch, now: t2 });

            assert.strictEqual(doc2.sub.airedAt, '2026-11-25T10:00:00.000Z');
            assert.strictEqual(doc2.dub.airedAt, '2026-11-25T10:00:00.000Z');
            assert.ok(fs.existsSync(path.join(tmpDir, 'home-observed-at.json')));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('condivide le osservazioni con la passata home (home -> archivio preserva timestamp)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-aired-shared-'));
        try {
            const tHome = Date.parse('2026-11-25T08:15:00.000Z');
            const tArchive = Date.parse('2026-11-25T11:30:00.000Z');
            const client = new AnimeUnityClient({
                cacheDir: tmpDir,
                requestDelayMs: 0,
                fetch: async () => ({
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        data: [{
                            id: 1,
                            language: 'jpn',
                            episode: { id: 10, number: '8', seq_number_end: 8, anime: { id: 7776, title: 'Test', default_status: 'ongoing' } }
                        }]
                    })
                })
            });

            await client.getLatestReleasesFromHome({ now: tHome });
            const doc = await processTmdbGroup(makeGroup({
                season: 1,
                subRecord: { id: 7776, title: 'Test', dub: 0, real_episodes_count: 8 },
                identity
            }), client, { ...noSubSearch, now: tArchive });

            assert.strictEqual(doc.sub.airedAt, '2026-11-25T08:15:00.000Z');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('senza real_episodes_count usa episodes_count della lista e non emette warning legacy', async () => {
        const warns = [];
        const origWarn = console.warn;
        console.warn = (...args) => warns.push(args.join(' '));
        try {
            const client = new AnimeUnityClient({ requestDelayMs: 0 });
            const t1 = Date.parse('2026-11-25T09:00:00.000Z');
            const doc = await processTmdbGroup(makeGroup({
                season: 1,
                subRecord: { id: 500, title: 'Senza conteggio reale', dub: 0, episodes_count: 14 },
                identity
            }), client, { ...noSubSearch, now: t1 });

            assert.strictEqual(doc.sub.airedAt, '2026-11-25T09:00:00.000Z');
            assert.ok(!warns.some(w => w.includes("l'API riporta") || w.includes('non recuperabile')));
        } finally {
            console.warn = origWarn;
        }
    });

    test('senza alcun conteggio lascia airedAt null e non chiama la rete', async () => {
        const client = new AnimeUnityClient({
            requestDelayMs: 0,
            fetch: async () => { throw new Error('non deve chiamare rete'); }
        });

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 501, title: 'Senza conteggi', dub: 0 },
            identity
        }), client, noSubSearch);

        assert.strictEqual(doc.sub.airedAt, null);
        assert.strictEqual(doc.sub.episode, null);
    });

    test('non sovrascrive un airedAt gia\' presente in Mongo sullo stesso episodio', async () => {
        const client = new AnimeUnityClient({ requestDelayMs: 0 });
        const existingDoc = {
            _id: '999',
            schemaVersion: 1,
            ids: { tmdb: 999, kitsu: '1', anilist: 1, mal: 1 },
            title: 'Titolo Test',
            schedule: { status: 'In corso', nextEpisode: null },
            sub: { season: 1, episode: 12, airedAt: '2026-10-10T14:00:00.000Z' },
            dub: { season: 1, episode: 6, airedAt: '2026-10-12T16:00:00.000Z' },
            italian: {
                sub: { latest: { season: 1, episode: 12, airedAt: '2026-10-10T14:00:00.000Z' }, status: 'In Corso' },
                dub: { latest: { season: 1, episode: 6, airedAt: '2026-10-12T16:00:00.000Z' }, status: 'In Corso', isSimuldub: true }
            }
        };

        const incomingDoc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 503, title: 'Titolo Test', dub: 0, real_episodes_count: 12, status: 'In Corso' },
            dubRecord: { id: 504, title: 'Titolo Test (ITA)', dub: 1, real_episodes_count: 6, status: 'In Corso' },
            identity
        }), client, {
            ...noSubSearch,
            listSeenAt: '2026-11-25T20:00:00.000Z',
            now: Date.parse('2026-11-25T20:00:00.000Z')
        });

        const merged = mergeAiringDocuments(existingDoc, incomingDoc);
        assert.strictEqual(merged.sub.airedAt, '2026-10-10T14:00:00.000Z');
        assert.strictEqual(merged.dub.airedAt, '2026-10-12T16:00:00.000Z');
        assert.strictEqual(merged.italian.sub.latest.airedAt, '2026-10-10T14:00:00.000Z');
        assert.strictEqual(merged.italian.dub.latest.airedAt, '2026-10-12T16:00:00.000Z');
    });
});
