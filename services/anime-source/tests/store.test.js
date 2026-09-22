const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { AiringStateStore } = require('../src/store');

describe('AiringStateStore', () => {
    function createMockCollection() {
        const memoryMap = new Map();
        const createdIndexes = [];

        return {
            memoryMap,
            createdIndexes,
            async updateOne(filter, update, options) {
                const id = String(filter._id);
                const isUpsert = options?.upsert;
                const exists = memoryMap.has(id);
                memoryMap.set(id, { ...update.$set });
                return {
                    acknowledged: true,
                    upsertedId: (!exists && isUpsert) ? id : null,
                    matchedCount: exists ? 1 : 0,
                    modifiedCount: exists ? 1 : 0
                };
            },
            async findOne(filter) {
                const doc = memoryMap.get(String(filter._id));
                return doc ? JSON.parse(JSON.stringify(doc)) : null;
            },
            async createIndex(indexSpec) {
                createdIndexes.push(indexSpec);
                return 'index_created';
            }
        };
    }

    test('esegue upsert e getById in modo idempotente con mock in-memory', async () => {
        const mockCol = createMockCollection();
        const store = new AiringStateStore(mockCol);
        await store.initIndexes();

        assert.strictEqual(mockCol.createdIndexes.length, 3, 'Devono essere stati creati 3 indici');

        const testDoc = {
            _id: '240411',
            schemaVersion: 1,
            title: 'Dandadan',
            ids: { tmdb: 240411, kitsu: '48269' },
            schedule: { status: 'Terminato', nextEpisode: null },
            italian: {
                sub: { latest: { season: 1, episode: 12 }, status: 'Terminato' },
                dub: { latest: { season: 1, episode: 12 }, status: 'Terminato', isSimuldub: false }
            },
            episodes: [{ season: 1, episode: 1, airedAt: '2024-10-03T14:15:04.000Z', subIta: true, dubIta: true }],
            sources: [{ provider: 'animeunity', animeId: 5660, dub: 0, latest: { season: 1, episode: 12 } }]
        };

        const firstResult = await store.upsert(testDoc);
        assert.strictEqual(firstResult.acknowledged, true);

        const fetched = await store.getById('240411');
        assert.ok(fetched);
        assert.strictEqual(fetched.title, 'Dandadan');
        assert.deepStrictEqual(fetched.italian.sub.latest, { season: 1, episode: 12 });
    });

    test('TEST MULTI-STAGIONE INCREMENTALE: una seconda scrittura con solo S2 non perde la S1', async () => {
        const mockCol = createMockCollection();
        const store = new AiringStateStore(mockCol);

        // Giro 1: vede solo la Stagione 1
        const run1Doc = {
            _id: '240411',
            schemaVersion: 1,
            title: 'Dandadan',
            ids: { tmdb: 240411, kitsu: '48269', anilist: 171018, mal: 57334 },
            schedule: { status: 'Terminato', nextEpisode: null },
            italian: {
                sub: { latest: { season: 1, episode: 12 }, status: 'Terminato' },
                dub: { latest: { season: 1, episode: 12 }, status: 'Terminato', isSimuldub: false }
            },
            episodes: [
                { season: 1, episode: 11, airedAt: '2024-12-12T15:04:49.000Z', subIta: true, dubIta: true },
                { season: 1, episode: 12, airedAt: '2024-12-19T15:02:57.000Z', subIta: true, dubIta: true }
            ],
            sources: [
                { provider: 'animeunity', animeId: 5660, dub: 0, season: 1, latest: { season: 1, episode: 12 } },
                { provider: 'animeunity', animeId: 5698, dub: 1, season: 1, latest: { season: 1, episode: 12 } }
            ],
            updatedAt: '2026-09-22T10:00:00.000Z'
        };

        await store.upsert(run1Doc);

        const afterRun1 = await store.getById('240411');
        assert.strictEqual(afterRun1.episodes.length, 2);
        assert.deepStrictEqual(afterRun1.italian.sub.latest, { season: 1, episode: 12 });

        // Giro 2: vede solo la Stagione 2
        const run2Doc = {
            _id: '240411',
            schemaVersion: 1,
            title: 'Dandadan',
            ids: { tmdb: 240411, anilist: 185660, mal: 60543 },
            schedule: { status: 'Terminato', nextEpisode: null },
            italian: {
                sub: { latest: { season: 2, episode: 12 }, status: 'Terminato' },
                dub: { latest: { season: 2, episode: 12 }, status: 'Terminato', isSimuldub: false }
            },
            episodes: [
                { season: 2, episode: 1, airedAt: '2025-07-03T16:12:36.000Z', subIta: true, dubIta: true },
                { season: 2, episode: 2, airedAt: '2025-07-10T16:12:36.000Z', subIta: true, dubIta: true }
            ],
            sources: [
                { provider: 'animeunity', animeId: 6722, dub: 0, season: 2, latest: { season: 2, episode: 12 } },
                { provider: 'animeunity', animeId: 6723, dub: 1, season: 2, latest: { season: 2, episode: 12 } }
            ],
            updatedAt: '2026-09-22T12:00:00.000Z'
        };

        await store.upsert(run2Doc);

        // Verifica documento fuso
        const merged = await store.getById('240411');
        assert.ok(merged);

        // 1. Nessun dato perso: la stagione 1 deve essere ancora presente negli episodi
        const hasS1 = merged.episodes.some(e => e.season === 1);
        const hasS2 = merged.episodes.some(e => e.season === 2);
        assert.ok(hasS1, 'La Stagione 1 NON deve essere stata persa dopo il secondo giro con S2');
        assert.ok(hasS2, 'La Stagione 2 deve essere presente');
        assert.strictEqual(merged.episodes.length, 4, 'Ci devono essere tutti e 4 gli episodi combinati');

        // 2. latest deve essere avanzato a S2E12
        assert.deepStrictEqual(merged.italian.sub.latest, { season: 2, episode: 12 });
        assert.deepStrictEqual(merged.italian.dub.latest, { season: 2, episode: 12 });

        // 3. sources deve contenere tutte e 4 le fonti
        assert.strictEqual(merged.sources.length, 4, 'Tutte le 4 fonti devono essere conservate');
        assert.ok(merged.sources.some(s => s.animeId === 5660));
        assert.ok(merged.sources.some(s => s.animeId === 5698));
        assert.ok(merged.sources.some(s => s.animeId === 6722));
        assert.ok(merged.sources.some(s => s.animeId === 6723));

        // 4. Kitsu ID principale preservato dalla S1
        assert.strictEqual(merged.ids.kitsu, '48269');
    });

    test('lancia errore se il documento non ha _id', async () => {
        const store = new AiringStateStore({});
        await assert.rejects(
            async () => store.upsert({ title: 'Senza ID' }),
            /privo del campo _id/
        );
    });
});
