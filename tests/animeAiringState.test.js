/**
 * Test del lettore `anime_airing_state` (ticket 13): fixture locali, nessun Mongo vivo.
 * Copre: degrado (collezione vuota/errore), schemaVersion più alta ignorata, validazione
 * difensiva, finestra 14 giorni, card sub/ITA, ordinamento e risoluzione identità.
 */

const animeAiringState = require('../src/data/animeAiringState');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0); // 2026-09-22T12:00:00Z
const daysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString();
const WINDOW = { now: NOW, windowDays: 14 };

function buildFixtureDocs() {
    return [
        {
            // Serie in corso: sub recente (EP 12) e doppiato recente (ITA 8)
            _id: '240411',
            schemaVersion: 1,
            ids: { tmdb: 240411, kitsu: '48269', anilist: 171018, mal: 57334 },
            title: 'Dandadan',
            schedule: { status: 'In corso', nextEpisode: null },
            italian: {
                sub: { latest: { season: 2, episode: 12 }, status: 'In corso' },
                dub: { latest: { season: 2, episode: 8 }, status: 'In corso', isSimuldub: true }
            },
            episodes: [
                { season: 1, episode: 12, airedAt: daysAgo(300), subIta: true, dubIta: true },
                { season: 2, episode: 7, airedAt: daysAgo(40), subIta: true, dubIta: true },
                { season: 2, episode: 8, airedAt: daysAgo(3), subIta: true, dubIta: true },
                { season: 2, episode: 11, airedAt: daysAgo(8), subIta: true, dubIta: false },
                { season: 2, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }
            ],
            sources: [{ provider: 'animeunity', animeId: 6722, dub: 0 }],
            updatedAt: daysAgo(0)
        },
        {
            // Serie conclusa: tutto fuori finestra
            _id: '999001',
            schemaVersion: 1,
            ids: { tmdb: 999001, kitsu: '111' },
            title: 'Conclusa',
            italian: {
                sub: { latest: { season: 1, episode: 12 }, status: 'Terminato' },
                dub: { latest: { season: 1, episode: 12 }, status: 'Terminato', isSimuldub: false }
            },
            episodes: [
                { season: 1, episode: 12, airedAt: daysAgo(60), subIta: true, dubIta: true }
            ]
        },
        {
            // Doppiato fermo: il sub è nella finestra, il dub no -> niente card ITA
            _id: '999002',
            schemaVersion: 1,
            ids: { tmdb: 999002, kitsu: '222' },
            title: 'Dub Fermo',
            italian: {
                sub: { latest: { season: 1, episode: 20 }, status: 'In corso' },
                dub: { latest: { season: 1, episode: 5 }, status: 'In corso', isSimuldub: false }
            },
            episodes: [
                { season: 1, episode: 5, airedAt: daysAgo(40), subIta: true, dubIta: true },
                { season: 1, episode: 20, airedAt: daysAgo(1), subIta: true, dubIta: false }
            ]
        },
        {
            // Solo doppiato nella finestra: in catalogo con la sola card ITA
            _id: '999004',
            schemaVersion: 1,
            ids: { tmdb: 999004, kitsu: '444' },
            title: 'Solo Dub',
            italian: {
                sub: { latest: { season: 1, episode: 3 }, status: 'Terminato' },
                dub: { latest: { season: 1, episode: 3 }, status: 'In corso', isSimuldub: false }
            },
            episodes: [
                { season: 1, episode: 3, airedAt: daysAgo(4), subIta: false, dubIta: true }
            ]
        },
        {
            // schemaVersion futura: da ignorare senza interpretare i campi
            _id: '999003',
            schemaVersion: 2,
            ids: { tmdb: 999003, kitsu: '333' },
            italian: { sub: { latest: { season: 1, episode: 1 } }, dub: { latest: null } },
            episodes: [{ season: 1, episode: 1, airedAt: daysAgo(1), subIta: true, dubIta: true }]
        },
        {
            // Documento malformato: _id non è un TMDB id
            _id: 'non-un-tmdb-id',
            schemaVersion: 1,
            episodes: []
        }
    ];
}

function getDoc(snapshot, tmdbId) {
    return snapshot.byTmdbId.get(String(tmdbId));
}

describe('AnimeAiringState - lettore con degrado', () => {
    beforeEach(() => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        animeAiringState.resetForTests();
        jest.restoreAllMocks();
    });

    test('collezione vuota: nessuna eccezione, snapshot vuoto', async () => {
        animeAiringState.setDataSourceForTests(async () => []);
        const snapshot = await animeAiringState.getSnapshot();

        expect(snapshot.docs).toEqual([]);
        expect(snapshot.degraded).toBe(false);
        expect(animeAiringState.getNoveltyEntries(snapshot, WINDOW)).toEqual([]);
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:48269', WINDOW)).toBeNull();
    });

    test('errore di lettura (modulo spento/Mongo giù): ritorna vuoto senza lanciare', async () => {
        animeAiringState.setDataSourceForTests(async () => {
            throw new Error('mongo down');
        });

        const snapshot = await animeAiringState.getSnapshot();
        expect(snapshot.docs).toEqual([]);
        expect(snapshot.degraded).toBe(true);
        expect(snapshot.lastError).toBe('mongo down');
        expect(animeAiringState.getNoveltyEntries(snapshot, WINDOW)).toEqual([]);
    });

    test('errore dopo un fetch riuscito: serve l\'ultimo stato noto (stantio)', async () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
        let calls = 0;
        animeAiringState.setDataSourceForTests(async () => {
            calls++;
            if (calls === 1) return buildFixtureDocs();
            throw new Error('timeout');
        });

        const first = await animeAiringState.getSnapshot();
        expect(first.docs.length).toBe(4);
        expect(first.degraded).toBe(false);

        // Oltre il TTL: il refresh fallisce, ma lo snapshot precedente resta servito.
        nowSpy.mockReturnValue(NOW + animeAiringState.CACHE_TTL_MS + 1);
        const second = await animeAiringState.getSnapshot();
        expect(second.docs.length).toBe(4);
        expect(second.degraded).toBe(true);
        expect(animeAiringState.getNoveltyEntries(second, WINDOW).length).toBe(3);
    });

    test('cache L1: una sola query per snapshot entro il TTL', async () => {
        const source = jest.fn(async () => buildFixtureDocs());
        animeAiringState.setDataSourceForTests(source);

        await animeAiringState.getSnapshot();
        await animeAiringState.getSnapshot();
        await animeAiringState.getSnapshot();

        expect(source).toHaveBeenCalledTimes(1);
    });

    test('dopo il TTL la cache viene rinfrescata', async () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
        const source = jest.fn(async () => buildFixtureDocs());
        animeAiringState.setDataSourceForTests(source);
        await animeAiringState.getSnapshot();

        nowSpy.mockReturnValue(NOW + animeAiringState.CACHE_TTL_MS + 1);
        await animeAiringState.getSnapshot();

        expect(source).toHaveBeenCalledTimes(2);
    });
});

describe('AnimeAiringState - validazione e schemaVersion', () => {
    let snapshot;
    let warnSpy;

    beforeAll(async () => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        snapshot = animeAiringState.buildSnapshot(buildFixtureDocs());
    });

    afterAll(() => {
        warnSpy.mockRestore();
    });

    test('il log di scarto è aggregato: una riga per refresh, non una per documento', () => {
        warnSpy.mockClear();
        animeAiringState.setDataSourceForTests(async () => buildFixtureDocs());
        return animeAiringState.getSnapshot().then(() => {
            animeAiringState.resetForTests();
            const aggregated = warnSpy.mock.calls.filter(([msg]) => String(msg).includes('[AnimeAiringState]'));
            expect(aggregated).toHaveLength(1);
            expect(aggregated[0][0]).toContain('1 ignorate');
            expect(aggregated[0][0]).toContain('1 scartate');
        });
    });

    test('i documenti con schemaVersion più alta vengono ignorati e contati', () => {
        expect(getDoc(snapshot, 999003)).toBeUndefined();
        expect(snapshot.ignoredSchema).toBe(1);
        expect(snapshot.byKitsuId.has('333')).toBe(false);
    });

    test('i documenti malformati vengono scartati e contati', () => {
        expect(snapshot.invalid).toBe(1);
        expect(snapshot.docs.length).toBe(4);
    });

    test('i campi non usati vengono ignorati senza rompere la lettura', () => {
        const doc = getDoc(snapshot, 240411);
        expect(doc.title).toBe('Dandadan');
        expect(doc.schedule).toBeUndefined(); // non nel contratto del lettore
        expect(doc.sources).toBeUndefined();
    });

    test('latest malformato -> null, ma il documento resta leggibile', () => {
        const result = animeAiringState.validateDocument({
            _id: '12345',
            schemaVersion: 1,
            ids: { kitsu: 'x' },
            italian: { sub: { latest: { season: 'nope', episode: 'nope' } }, dub: { latest: null } },
            episodes: [{ season: '2', episode: '3.5', airedAt: 'non-una-data', subIta: 1, dubIta: true }]
        });

        expect(result.doc).toBeDefined();
        expect(result.doc.sub).toBeNull();
        expect(result.doc.dub).toBeNull();
        expect(result.doc.kitsuId).toBeNull();
        expect(result.doc.episodes).toEqual([
            { season: 2, episode: 3.5, airedAt: null, subIta: false, dubIta: true }
        ]);
    });

    test('_id numerico o stringa numerica sono entrambi accettati', () => {
        expect(animeAiringState.validateDocument({ _id: 123, schemaVersion: 1 }).doc.tmdbId).toBe('123');
        expect(animeAiringState.validateDocument({ _id: '123', schemaVersion: 1 }).doc.tmdbId).toBe('123');
    });
});

describe('AnimeAiringState - finestra 14 giorni e card', () => {
    let snapshot;

    beforeAll(() => {
        snapshot = animeAiringState.buildSnapshot(buildFixtureDocs());
    });

    test('serie in corso: sub EP 12 e card ITA presente con ITA 8', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 240411), WINDOW);
        expect(info.hasSubInWindow).toBe(true);
        expect(info.hasDubInWindow).toBe(true);
        expect(info.sub).toEqual({ season: 2, episode: 12 });
        expect(info.dub).toEqual({ season: 2, episode: 8 });
    });

    test('serie conclusa: fuori dalla finestra, nessuna card', () => {
        expect(animeAiringState.getCardInfo(getDoc(snapshot, 999001), WINDOW)).toBeNull();
        expect(animeAiringState.getWindowInfo(getDoc(snapshot, 999001), WINDOW).hasSub).toBe(false);
    });

    test('doppiato fermo: card ITA assente, badge sub presente', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999002), WINDOW);
        expect(info.hasSubInWindow).toBe(true);
        expect(info.hasDubInWindow).toBe(false);
        expect(info.sub).toEqual({ season: 1, episode: 20 });
        expect(info.dub).toBeNull();
    });

    test('solo doppiato nella finestra: solo card ITA', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999004), WINDOW);
        expect(info.hasSubInWindow).toBe(false);
        expect(info.hasDubInWindow).toBe(true);
        expect(info.sub).toBeNull();
        expect(info.dub).toEqual({ season: 1, episode: 3 });
    });

    test('serie senza stato: getCardInfoForId ritorna null', () => {
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:999999', WINDOW)).toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'tmdb:999999', WINDOW)).toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, null, WINDOW)).toBeNull();
    });

    test('lookup per id item: kitsu, kitsu con _ita_offset, tmdb', () => {
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:48269', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:48269_ita_offset', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'tmdb:240411', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, '240411', WINDOW)).not.toBeNull();
    });

    test('le novità sono ordinate per ultimo episodio disponibile (più recente prima)', () => {
        const entries = animeAiringState.getNoveltyEntries(snapshot, WINDOW);
        expect(entries.map((e) => e.doc.tmdbId)).toEqual(['999002', '240411', '999004']);
        expect(entries[0].lastAiredAt).toBeGreaterThan(entries[1].lastAiredAt);
        expect(entries[1].lastAiredAt).toBeGreaterThan(entries[2].lastAiredAt);
    });

    test('finestra personalizzata: con 0 giorni nessuna novità', () => {
        expect(animeAiringState.getNoveltyEntries(snapshot, { now: NOW, windowDays: 0.5 })).toEqual([]);
    });
});

describe('AnimeAiringState - identità della card', () => {
    let snapshot;

    beforeAll(() => {
        snapshot = animeAiringState.buildSnapshot(buildFixtureDocs());
    });

    test('usa ids.kitsu del documento quando il mapping store non è pronto', () => {
        const entry = animeAiringState.getNoveltyEntries(snapshot, WINDOW).find((e) => e.doc.tmdbId === '240411');
        expect(animeAiringState.resolveCardId(entry, null)).toBe('kitsu:48269');
    });

    test('preferisce la risoluzione di YACA (stessa lingua di metaHandler)', () => {
        const entry = animeAiringState.getNoveltyEntries(snapshot, WINDOW).find((e) => e.doc.tmdbId === '240411');
        const mappingStore = {
            resolveKitsu: jest.fn(() => ({ success: true, kitsuId: 49425, kitsuEpisode: 12 }))
        };
        expect(animeAiringState.resolveCardId(entry, mappingStore)).toBe('kitsu:49425');
        expect(mappingStore.resolveKitsu).toHaveBeenCalledWith('240411', 2, 12);
    });

    test('se il mapping fallisce o lancia, ricade su ids.kitsu', () => {
        const entry = animeAiringState.getNoveltyEntries(snapshot, WINDOW).find((e) => e.doc.tmdbId === '240411');
        const throwingStore = { resolveKitsu: () => { throw new Error('store down'); } };
        expect(animeAiringState.resolveCardId(entry, throwingStore)).toBe('kitsu:48269');
        expect(animeAiringState.resolveCardId(entry, { resolveKitsu: () => ({ error: 'miss' }) })).toBe('kitsu:48269');
    });

    test('senza ids.kitsu ricade sul TMDB id', () => {
        const snapshotNoKitsu = animeAiringState.buildSnapshot([
            {
                _id: '555',
                schemaVersion: 1,
                italian: { sub: { latest: { season: 1, episode: 1 } }, dub: { latest: null } },
                episodes: [{ season: 1, episode: 1, airedAt: daysAgo(1), subIta: true, dubIta: false }]
            }
        ]);
        const entry = animeAiringState.getNoveltyEntries(snapshotNoKitsu, WINDOW)[0];
        expect(animeAiringState.resolveCardId(entry, null)).toBe('tmdb:555');
    });
});
