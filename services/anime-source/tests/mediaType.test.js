const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildAiringStateDocument, mergeAiringDocuments, normalizeMediaType } = require('../src/aggregate');
const { IdentityResolver } = require('../src/identity');
const { AiringStateStore } = require('../src/store');
const { groupRecordsByTmdb } = require('../cli');

/**
 * Costruisce il documento esattamente come fa la CLI: dai record grezzi
 * AnimeUnity -> groupRecordsByTmdb (resolve) -> buildAiringStateDocument.
 * Serve a provare il percorso di produzione, non solo aggregate in isolamento.
 */
function docFromRecords(resolver, records, now = new Date('2026-10-04T00:00:00.000Z')) {
    const groups = groupRecordsByTmdb(records, resolver);
    assert.strictEqual(groups.length, 1, 'atteso un solo gruppo TMDB');
    const seasons = Array.from(groups[0].seasonsMap.values()).map(s => ({
        season: s.season,
        subRecord: s.subRecord,
        dubRecord: s.dubRecord,
        identity: s.identity
    }));
    return buildAiringStateDocument({ seasons, orderIndex: groups[0].orderIndex, now });
}

function resolverWith({ fribbData = [], anibridgeData = {} } = {}) {
    const resolver = new IdentityResolver();
    resolver.loadFromData({ fribbData, anibridgeData, overridesData: { version: 1, identities: [], certify: [] } });
    return resolver;
}

describe('mediaType: dalla fonte al documento', () => {
    // Record AnimeUnity di un film (un solo episodio, sub + doppiato).
    const movieRecords = [
        { id: 1, title: 'La città incantata', anilist_id: 5680, mal_id: 314, dub: 0, status: 'Terminato', real_episodes_count: 1 },
        { id: 2, title: 'La città incantata (ITA)', anilist_id: 5680, mal_id: 314, dub: 1, status: 'Terminato', real_episodes_count: 1 }
    ];

    test('Fribb: un film (themoviedb_id.movie) finisce col campo mediaType = "movie"', () => {
        const resolver = resolverWith({
            fribbData: [
                { type: 'MOVIE', anilist_id: 5680, mal_id: 314, kitsu_id: 1247, themoviedb_id: { movie: 129 } }
            ]
        });

        const identity = resolver.resolve({ anilistId: 5680, malId: 314 });
        assert.strictEqual(identity.tmdbId, '129');
        assert.strictEqual(identity.mediaType, 'movie');

        const doc = docFromRecords(resolver, movieRecords);
        assert.strictEqual(doc._id, '129');
        assert.strictEqual(doc.mediaType, 'movie', 'il documento deve dichiarare il film');
    });

    test('Fribb: una serie (themoviedb_id.tv) finisce col campo mediaType = "tv"', () => {
        const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
        const resolver = resolverWith({ fribbData: fribbFixture });

        const identity = resolver.resolve({ anilistId: 171018, malId: 57334 });
        assert.strictEqual(identity.mediaType, 'tv');

        const doc = docFromRecords(resolver, [
            { id: 5660, title: 'Dandadan', anilist_id: 171018, mal_id: 57334, dub: 0, status: 'Terminato', real_episodes_count: 12 }
        ]);
        assert.strictEqual(doc.mediaType, 'tv');
    });

    test('Fribb: se dichiara tv e movie insieme vince il ramo tv, e dichiara "tv"', () => {
        // Precedenza originale (tv || movie) conservata: cambia la sola id scelta,
        // non quale ramo vince.
        const resolver = resolverWith({
            fribbData: [{ anilist_id: 1, mal_id: 2, themoviedb_id: { tv: 111, movie: 222 } }]
        });

        const identity = resolver.resolve({ anilistId: 1 });
        assert.strictEqual(identity.tmdbId, '111');
        assert.strictEqual(identity.mediaType, 'tv');
    });

    test('AniBridge: il prefisso tmdb_movie: produce "movie", tmdb_show: produce "tv"', () => {
        const anibridgeMovie = {
            'anilist:600': {
                'mal:900': {},
                'tmdb_movie:823': {}
            }
        };
        const anibridgeShow = {
            'anilist:601': {
                'mal:901': {},
                'tmdb_show:555': { 's1': {} }
            }
        };

        const movieResolver = resolverWith({ anibridgeData: anibridgeMovie });
        assert.strictEqual(movieResolver.resolve({ anilistId: 600 }).mediaType, 'movie');
        assert.strictEqual(movieResolver.resolve({ malId: 900 }).mediaType, 'movie');

        const showResolver = resolverWith({ anibridgeData: anibridgeShow });
        assert.strictEqual(showResolver.resolve({ anilistId: 601 }).mediaType, 'tv');
    });

    test('bridge TVDB: il mediaType di /3/find arriva al documento', async () => {
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-mediatype-test-'));
        try {
            const resolver = new IdentityResolver({
                cacheDir: testDir,
                tvdbBridgeResolver: {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveTvdb: async () => ({ tmdbId: '823', name: 'Jin-Roh', mediaType: 'movie' })
                },
                fallbackResolver: {
                    loadCache: async () => {},
                    saveCache: () => {},
                    resolveFallback: async () => null
                }
            });
            // Nessun tmdb ufficiale: il record ha solo il nodo TVDB del cluster.
            resolver.loadFromData({
                fribbData: [],
                anibridgeData: { 'anilist:602': { 'mal:902': {}, 'tvdb_show:5001': {} } },
                overridesData: { version: 1, identities: [], certify: [] }
            });

            await resolver.enrichWithFallbacks([{ id: 7, title: 'Jin-Roh', anilist_id: 602, mal_id: 902 }]);

            const identity = resolver.resolve({ anilistId: 602, malId: 902 });
            assert.strictEqual(identity.tmdbId, '823');
            assert.strictEqual(identity.mediaType, 'movie', 'il bridge dichiara movie');

            const doc = docFromRecords(resolver, [
                { id: 7, title: 'Jin-Roh', anilist_id: 602, mal_id: 902, dub: 0, status: 'Terminato', real_episodes_count: 1 }
            ]);
            assert.strictEqual(doc.mediaType, 'movie');
        } finally {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    test('il tipo dichiarato per un id non viene riportato su un altro id (override forzato)', () => {
        const resolver = resolverWith({
            fribbData: [{ anilist_id: 700, mal_id: 800, themoviedb_id: { movie: 4444 } }]
        });
        resolver.loadOverrides({
            version: 1,
            identities: [{ anilist: 700, mal: 800, tmdbId: '5555', force: true, note: 'id corretto a mano' }],
            certify: []
        });

        const identity = resolver.resolve({ anilistId: 700, malId: 800 });
        assert.strictEqual(identity.tmdbId, '5555');
        assert.strictEqual(identity.mediaType, null, 'il tipo del vecchio id non descrive il nuovo');
    });

    test('fonte che non distingue film e serie: il documento resta SENZA il campo', () => {
        // themoviedb_id scalare: la fonte conosce l'id ma non dichiara il tipo.
        const resolver = resolverWith({
            fribbData: [{ anilist_id: 900, mal_id: 901, themoviedb_id: 777 }]
        });

        const identity = resolver.resolve({ anilistId: 900 });
        assert.strictEqual(identity.tmdbId, '777');
        assert.strictEqual(identity.mediaType, null);

        const doc = docFromRecords(resolver, [
            { id: 9, title: 'Titolo senza tipo', anilist_id: 900, dub: 0, status: 'Terminato', real_episodes_count: 12 }
        ]);
        assert.strictEqual(doc._id, '777');
        assert.ok(!('mediaType' in doc), 'assente, non "tv": l\'assenza significa "la fonte non lo dice"');
        assert.strictEqual(Object.values(doc).includes('tv'), false);
    });

    test('normalizeMediaType accetta solo movie/tv e scarta il resto', () => {
        assert.strictEqual(normalizeMediaType('movie'), 'movie');
        assert.strictEqual(normalizeMediaType(' TV '), 'tv');
        assert.strictEqual(normalizeMediaType('tv'), 'tv');
        assert.strictEqual(normalizeMediaType('show'), null);
        assert.strictEqual(normalizeMediaType('movies'), null);
        assert.strictEqual(normalizeMediaType(null), null);
        assert.strictEqual(normalizeMediaType(undefined), null);
        assert.strictEqual(normalizeMediaType(3), null);
    });
});

describe('mediaType: la trappola del merge', () => {
    function baseDoc(extra = {}) {
        return {
            _id: '823',
            schemaVersion: 1,
            ids: { tmdb: 823, kitsu: '1247', anilist: 5680, mal: 314 },
            title: 'Jin-Roh',
            schedule: { status: 'Terminato', nextEpisode: null },
            sources: [],
            updatedAt: '2026-10-04T00:00:00.000Z',
            sub: { season: 1, episode: 1 },
            dub: { season: 1, episode: 1 },
            italian: {
                sub: { latest: { season: 1, episode: 1 }, status: 'Terminato' },
                dub: { latest: { season: 1, episode: 1 }, status: 'Terminato', isSimuldub: false }
            },
            ...extra
        };
    }

    test('il merge NON cancella mediaType (whitelist del merge, la trappola principale)', () => {
        const existing = baseDoc({ mediaType: 'movie' });
        // Seconda passata del ciclo: il documento in arrivo non sa ancora il tipo.
        const incoming = baseDoc({ updatedAt: '2026-10-05T00:00:00.000Z' });
        delete incoming.mediaType;

        const merged = mergeAiringDocuments(existing, incoming);
        assert.strictEqual(merged.mediaType, 'movie', 'il merge deve conservare il tipo dichiarato');
    });

    test('il merge conserva anche il tipo quando l\'incoming arriva con un tipo diverso', () => {
        const merged = mergeAiringDocuments(
            baseDoc({ mediaType: 'movie' }),
            baseDoc({ mediaType: 'tv', updatedAt: '2026-10-05T00:00:00.000Z' })
        );
        assert.strictEqual(merged.mediaType, 'tv', 'la fonte piu\' recente (incoming) vince');
    });

    test('il merge NON inventa un tipo: nessuna delle due parti lo dichiara, nessuna chiave', () => {
        const existing = baseDoc();
        const incoming = baseDoc({ updatedAt: '2026-10-05T00:00:00.000Z' });

        const merged = mergeAiringDocuments(existing, incoming);
        assert.ok(!('mediaType' in merged), 'assenza significa non dichiarato, non "tv" di default');
    });

    test('il merge scarta un tipo non valido invece di propagarlo', () => {
        const merged = mergeAiringDocuments(baseDoc(), baseDoc({ mediaType: 'anime' }));
        assert.ok(!('mediaType' in merged));
    });

    test('sul percorso reale di scrittura (store.upsert) il tipo sopravvive alla seconda passata', async () => {
        const memoryMap = new Map();
        const mockCol = {
            async updateOne(filter, update, options) {
                const id = String(filter._id);
                const exists = memoryMap.has(id);
                memoryMap.set(id, { ...update.$set });
                return { acknowledged: true, upsertedId: (!exists && options?.upsert) ? id : null, matchedCount: exists ? 1 : 0, modifiedCount: 1 };
            },
            async findOne(filter) {
                const doc = memoryMap.get(String(filter._id));
                return doc ? JSON.parse(JSON.stringify(doc)) : null;
            },
            async createIndex() { return 'ok'; }
        };
        const store = new AiringStateStore(mockCol);

        await store.upsert(baseDoc({ mediaType: 'movie' }));
        assert.strictEqual((await store.getById('823')).mediaType, 'movie');

        const incoming = baseDoc({ updatedAt: '2026-10-05T00:00:00.000Z' });
        delete incoming.mediaType;
        await store.upsert(incoming);

        const stored = await store.getById('823');
        assert.strictEqual(stored.mediaType, 'movie', 'il $set del merge non deve cancellare il tipo');
    });
});
