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
        expect(info.hasSub).toBe(true);
        expect(info.hasDub).toBe(true);
        expect(info.sub).toEqual({ season: 2, episode: 12 });
        expect(info.dub).toEqual({ season: 2, episode: 8 });
    });

    test('serie conclusa: la dichiarazione vale anche fuori dalla finestra (regola del 04/10/2026)', () => {
        // Il documento dichiara sub e doppiato, ma 60 giorni fa: la card c'è lo stesso, perché
        // «basta anche un episodio doppiato per considerare la serie ITA». La novità
        // (`getNoveltyEntries`) continua invece a usare la finestra: è un'altra domanda.
        expect(animeAiringState.getNoveltyEntries(snapshot, WINDOW).map((e) => e.doc.tmdbId))
            .not.toContain('999001');

        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999001), WINDOW);
        expect(info).not.toBeNull();
        expect(info.sub).toEqual({ season: 1, episode: 12 });
        expect(info.dub).toEqual({ season: 1, episode: 12 });
        expect(animeAiringState.getWindowInfo(getDoc(snapshot, 999001), WINDOW).hasSub).toBe(false);
    });

    test('doppiato fermo: la card ITA c\'è anche se il doppiaggio è vecchio', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999002), WINDOW);
        expect(info.hasSub).toBe(true);
        expect(info.hasDub).toBe(true);
        expect(info.sub).toEqual({ season: 1, episode: 20 });
        expect(info.dub).toEqual({ season: 1, episode: 5 });
    });

    test('solo doppiato dichiarato: il `sub.latest` del documento dà la card sub', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999004), WINDOW);
        expect(info.hasSub).toBe(true);
        expect(info.hasDub).toBe(true);
        expect(info.sub).toEqual({ season: 1, episode: 3 });
        expect(info.dub).toEqual({ season: 1, episode: 3 });
    });

    test('serie senza stato: getCardInfoForId ritorna null', () => {
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:999999', WINDOW)).toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'tmdb:999999', WINDOW)).toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, null, WINDOW)).toBeNull();
    });

    test('lookup per id item: kitsu, kitsu con _ita_offset, tmdb (anche con prefisso tv/movie)', () => {
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:48269', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'kitsu:48269_ita_offset', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'tmdb:240411', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, 'tmdb:tv:240411', WINDOW)).not.toBeNull();
        expect(animeAiringState.getCardInfoForId(snapshot, '240411', WINDOW)).not.toBeNull();
    });

    test('getDubEpisode e getDubEpisodeForId estraggono l\'ultimo episodio doppiato indipendentemente dalla finestra', () => {
        // Dandadan: dub S2E8 -> 8
        const dandadanDoc = getDoc(snapshot, '240411');
        expect(animeAiringState.getDubEpisode(dandadanDoc)).toBe(8);
        expect(animeAiringState.getDubEpisodeForId(snapshot, 'kitsu:48269')).toBe(8);
        expect(animeAiringState.getDubEpisodeForId(snapshot, 'tmdb:tv:240411')).toBe(8);

        // Serie conclusa fuori finestra (60 giorni fa): getDubEpisode restituisce 12
        const conclusaDoc = getDoc(snapshot, '999001');
        expect(animeAiringState.getDubEpisode(conclusaDoc)).toBe(12);
        expect(animeAiringState.getDubEpisodeForId(snapshot, 'kitsu:111')).toBe(12);

        // Titolo non doppiato o assente -> null
        expect(animeAiringState.getDubEpisode(null)).toBeNull();
        expect(animeAiringState.getDubEpisodeForId(snapshot, 'kitsu:999999')).toBeNull();
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

describe('AnimeAiringState - lettura senza finestra e nuovi documenti (senza episodes[])', () => {
    test('doc senza episodes[] con sub/dub: getWindowInfo e getCardInfo considerano i canali disponibili', () => {
        const docNoEpisodes = {
            _id: '37854',
            schemaVersion: 1,
            ids: { tmdb: 37854, kitsu: '12' },
            title: 'One Piece',
            sub: { season: 22, episode: 1180 },
            dub: { season: 22, episode: 936 },
            orderIndex: 0,
            updatedAt: daysAgo(0.1)
        };

        const snapshot = animeAiringState.buildSnapshot([docNoEpisodes]);
        const doc = snapshot.byTmdbId.get('37854');

        const winInfo = animeAiringState.getWindowInfo(doc, WINDOW);
        expect(winInfo.hasSub).toBe(true);
        expect(winInfo.hasDub).toBe(true);

        const cardInfo = animeAiringState.getCardInfo(doc, WINDOW);
        expect(cardInfo).not.toBeNull();
        expect(cardInfo.hasSub).toBe(true);
        expect(cardInfo.hasDub).toBe(true);
        expect(cardInfo.sub).toEqual({ season: 22, episode: 1180 });
        expect(cardInfo.dub).toEqual({ season: 22, episode: 936 });

        expect(animeAiringState.getDubEpisode(doc)).toBe(936);
        expect(animeAiringState.getDubEpisodeForId(snapshot, 'kitsu:12')).toBe(936);
    });

    test('getAiringEntries restituisce tutti i documenti con sub o dub e ordina per orderIndex', () => {
        const docs = [
            {
                _id: '100',
                schemaVersion: 1,
                title: 'Terzo in lista',
                sub: { season: 1, episode: 5 },
                orderIndex: 2,
                updatedAt: daysAgo(0.1)
            },
            {
                _id: '200',
                schemaVersion: 1,
                title: 'Primo in lista',
                sub: { season: 1, episode: 1 },
                orderIndex: 0,
                updatedAt: daysAgo(0.1)
            },
            {
                _id: '300',
                schemaVersion: 1,
                title: 'Secondo in lista',
                dub: { season: 1, episode: 10 },
                orderIndex: 1,
                updatedAt: daysAgo(0.1)
            },
            {
                _id: '400',
                schemaVersion: 1,
                title: 'Nessun sub o dub',
                updatedAt: daysAgo(0.1)
            }
        ];

        const snapshot = animeAiringState.buildSnapshot(docs);
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW });

        expect(entries.map(e => e.doc.tmdbId)).toEqual(['200', '300', '100']);
        expect(entries.find(e => e.doc.tmdbId === '400')).toBeUndefined();
    });

    test('filtro di freschezza: doc aggiornato adesso -> incluso; doc vecchio di 3 giorni -> escluso; doc vecchio con episodes[] -> escluso', () => {
        const docs = [
            // Doc aggiornato adesso (2 ore fa): incluso
            {
                _id: '101',
                schemaVersion: 1,
                title: 'Ciclo Corrente',
                sub: { season: 1, episode: 10 },
                updatedAt: daysAgo(2 / 24), // 2h fa
                orderIndex: 0
            },
            // Doc vecchio di 3 giorni: escluso (storico)
            {
                _id: '102',
                schemaVersion: 1,
                title: 'Vecchio 3 giorni',
                sub: { season: 1, episode: 5 },
                updatedAt: daysAgo(3),
                orderIndex: 1
            },
            // Doc vecchio con episodes[] (compatibilità storica): escluso se oltre la finestra di freschezza
            {
                _id: '103',
                schemaVersion: 1,
                title: 'Vecchio con episodes',
                sub: { season: 1, episode: 12 },
                episodes: [{ season: 1, episode: 12, airedAt: daysAgo(1), subIta: true, dubIta: false }],
                updatedAt: daysAgo(3),
                orderIndex: 2
            }
        ];

        const snapshot = animeAiringState.buildSnapshot(docs);
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW, freshnessHours: 12 });

        expect(entries.map(e => e.doc.tmdbId)).toEqual(['101']);
        expect(entries.find(e => e.doc.tmdbId === '102')).toBeUndefined();
        expect(entries.find(e => e.doc.tmdbId === '103')).toBeUndefined();
    });

    test('regola di appartenenza listSeenAt (14 giorni) vs legacy (12h): 5 scenari del brief', () => {
        const docs = [
            // 1. Doc con listSeenAt di 10 giorni fa -> INCLUSO
            {
                _id: '501',
                schemaVersion: 1,
                title: 'ListSeen 10gg fa',
                sub: { season: 1, episode: 10 },
                listSeenAt: daysAgo(10),
                updatedAt: daysAgo(10),
                orderIndex: 0
            },
            // 2. Doc con listSeenAt di 20 giorni fa -> ESCLUSO
            {
                _id: '502',
                schemaVersion: 1,
                title: 'ListSeen 20gg fa',
                sub: { season: 1, episode: 8 },
                listSeenAt: daysAgo(20),
                updatedAt: daysAgo(20),
                orderIndex: 1
            },
            // 3. Doc legacy (solo updatedAt vecchio, senza listSeenAt) -> ESCLUSO
            {
                _id: '503',
                schemaVersion: 1,
                title: 'Legacy vecchio 3gg',
                sub: { season: 1, episode: 5 },
                updatedAt: daysAgo(3),
                orderIndex: 2
            },
            // 4. Doc legacy aggiornato ora (senza listSeenAt, transizione) -> INCLUSO
            {
                _id: '504',
                schemaVersion: 1,
                title: 'Legacy fresco 2h',
                sub: { season: 1, episode: 6 },
                updatedAt: daysAgo(2 / 24),
                orderIndex: 3
            },
            // 5. Doc in corso con listSeenAt recente ma updatedAt vecchio -> INCLUSO
            {
                _id: '505',
                schemaVersion: 1,
                title: 'ListSeen fresco ma updatedAt vecchio',
                sub: { season: 1, episode: 12 },
                listSeenAt: daysAgo(1),
                updatedAt: daysAgo(25),
                orderIndex: 4
            }
        ];

        const snapshot = animeAiringState.buildSnapshot(docs);
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW, listWindowDays: 14, freshnessHours: 12 });
        const includedIds = entries.map(e => e.doc.tmdbId);

        // Casi inclusi: 501 (10gg fa), 504 (legacy 2h fa), 505 (listSeen 1gg fa con updatedAt 25gg fa)
        expect(includedIds).toContain('501');
        expect(includedIds).toContain('504');
        expect(includedIds).toContain('505');

        // Casi esclusi: 502 (20gg fa), 503 (legacy 3gg fa)
        expect(includedIds).not.toContain('502');
        expect(includedIds).not.toContain('503');

        // Ordine: 505 (listSeenAt 1gg fa), 501 (listSeenAt 10gg fa), 504 (listSeenAt mancante, legacy 2h fa)
        expect(includedIds).toEqual(['505', '501', '504']);
    });

    test('ordinamento getAiringEntries: airedAt decrescente vince su orderIndex; fallback su listSeenAt poi orderIndex', () => {
        const docs = [
            // Serie A: airedAt 10 giorni fa, orderIndex: 0 (in cima alla lista AnimeUnity)
            {
                _id: '1001',
                schemaVersion: 1,
                title: 'Aired 10gg fa, orderIndex 0',
                sub: { season: 1, episode: 10, airedAt: daysAgo(10) },
                listSeenAt: daysAgo(1),
                orderIndex: 0,
                updatedAt: daysAgo(1)
            },
            // Serie B: airedAt ieri (1 giorno fa), orderIndex: 5 (più in basso nella lista)
            {
                _id: '1002',
                schemaVersion: 1,
                title: 'Aired ieri, orderIndex 5',
                sub: { season: 1, episode: 11, airedAt: daysAgo(1) },
                listSeenAt: daysAgo(1),
                orderIndex: 5,
                updatedAt: daysAgo(1)
            },
            // Serie C: airedAt oggi su DUB (anche se SUB è vecchio) -> vince la più recente tra sub e dub
            {
                _id: '1003',
                schemaVersion: 1,
                title: 'Dub aired oggi, sub 12gg fa',
                sub: { season: 1, episode: 8, airedAt: daysAgo(12) },
                dub: { season: 1, episode: 6, airedAt: daysAgo(0.2) },
                listSeenAt: daysAgo(1),
                orderIndex: 8,
                updatedAt: daysAgo(1)
            },
            // Serie D: airedAt mancante, ma listSeenAt fresco (2 giorni fa)
            {
                _id: '1004',
                schemaVersion: 1,
                title: 'Aired mancante, listSeen 2gg fa',
                sub: { season: 1, episode: 1 },
                listSeenAt: daysAgo(2),
                orderIndex: 20,
                updatedAt: daysAgo(2)
            },
            // Serie E: airedAt mancante, listSeenAt vecchio (8 giorni fa), orderIndex basso (1)
            {
                _id: '1005',
                schemaVersion: 1,
                title: 'Aired mancante, listSeen 8gg fa, orderIndex 1',
                sub: { season: 1, episode: 2 },
                listSeenAt: daysAgo(8),
                orderIndex: 1,
                updatedAt: daysAgo(8)
            },
            // Serie F: airedAt mancante, listSeenAt mancante, orderIndex 2
            {
                _id: '1006',
                schemaVersion: 1,
                title: 'Aired mancante, listSeen mancante, orderIndex 2',
                sub: { season: 1, episode: 3 },
                orderIndex: 2,
                updatedAt: daysAgo(0.1)
            },
            // Serie G: airedAt mancante, listSeenAt mancante, orderIndex 9
            {
                _id: '1007',
                schemaVersion: 1,
                title: 'Aired mancante, listSeen mancante, orderIndex 9',
                sub: { season: 1, episode: 4 },
                orderIndex: 9,
                updatedAt: daysAgo(0.1)
            }
        ];

        const snapshot = animeAiringState.buildSnapshot(docs);
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW, listWindowDays: 14 });
        const ids = entries.map(e => e.doc.tmdbId);

        // 1. Serie con airedAt ordinate decrescente:
        //    1003 (aired 0.2gg fa) > 1002 (aired 1gg fa) > 1001 (aired 10gg fa)
        //    Nota che 1002 (ieri) PRECEDE 1001 (10gg fa) anche se 1001 ha orderIndex 0 vs 5!
        expect(ids.slice(0, 3)).toEqual(['1003', '1002', '1001']);

        // 2. Serie senza airedAt: fallback su listSeenAt decrescente:
        //    1004 (listSeen 2gg fa) > 1005 (listSeen 8gg fa)
        expect(ids.slice(3, 5)).toEqual(['1004', '1005']);

        // 3. Serie senza airedAt e senza listSeenAt: fallback su orderIndex crescente:
        //    1006 (orderIndex 2) > 1007 (orderIndex 9)
        expect(ids.slice(5, 7)).toEqual(['1006', '1007']);
    });

    test('compatibilità: doc vecchi con episodes[] e freschi vengono inclusi da getAiringEntries', () => {
        const fixtureDocs = buildFixtureDocs(); // 240411 ha updatedAt: daysAgo(0)
        const snapshot = animeAiringState.buildSnapshot(fixtureDocs);

        // Con getNoveltyEntries la serie 999001 (60 giorni fa) era esclusa
        expect(animeAiringState.getNoveltyEntries(snapshot, WINDOW).map(e => e.doc.tmdbId)).not.toContain('999001');

        // Dandadan (240411) è aggiornato a daysAgo(0), quindi è fresco ed entra in getAiringEntries
        const airingEntries = animeAiringState.getAiringEntries(snapshot, { now: NOW });
        expect(airingEntries.map(e => e.doc.tmdbId)).toContain('240411');
    });

    test('doc con episode: null gestito senza errori', () => {
        const docNullEp = {
            _id: '888',
            schemaVersion: 1,
            title: 'Ep Null',
            sub: { season: 1, episode: null },
            updatedAt: daysAgo(0.1)
        };
        const snapshot = animeAiringState.buildSnapshot([docNullEp]);
        const doc = snapshot.byTmdbId.get('888');

        expect(doc.sub).toEqual({ season: 1, episode: null });
        const winInfo = animeAiringState.getWindowInfo(doc);
        expect(winInfo.hasSub).toBe(true);
        expect(winInfo.hasDub).toBe(false);

        const cardInfo = animeAiringState.getCardInfo(doc);
        expect(cardInfo.sub).toEqual({ season: 1, episode: null });
        expect(cardInfo.dub).toBeNull();
    });
});
