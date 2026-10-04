/**
 * Test del lettore `anime_airing_state` (ticket 13; regola del catalogo novità aggiornata dal
 * ticket 52: la fonte è la HOME di AnimeUnity, `homeReleases`).
 * Fixture locali, nessun Mongo vivo.
 * Copre: degrado (collezione vuota/errore), schemaVersion più alta ignorata, validazione
 * difensiva, il backfill di novità (finestra 14 giorni sulle nostre date, consumatore
 * diverso), card sub/ITA dalla home, freschezza della fonte, ordinamento e identità.
 */

const animeAiringState = require('../src/data/animeAiringState');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0); // 2026-09-22T12:00:00Z
const daysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString();
const WINDOW = { now: NOW, windowDays: 14 };

function buildFixtureDocs() {
    return [
        {
            // Serie in corso: la home ha visto l'episodio sub di 2 giorni fa e quello doppiato
            // di 3 giorni fa -> due card (EP 12 / ITA 8)
            _id: '240411',
            schemaVersion: 1,
            ids: { tmdb: 240411, kitsu: '48269', anilist: 171018, mal: 57334 },
            title: 'Dandadan',
            schedule: { status: 'In corso', nextEpisode: null },
            homeReleases: {
                checkedAt: daysAgo(0.1),
                sub: { episode: 12, airedAt: daysAgo(2) },
                dub: { episode: 8, airedAt: daysAgo(3) }
            },
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
            // Serie conclusa 60 giorni fa: la home non la nomina, quindi per il catalogo non
            // esiste (per il backfill di novità resta comunque fuori finestra).
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
            // Doppiato fermo a 40 giorni: la home ha visto solo il sub -> nessuna card ITA
            _id: '999002',
            schemaVersion: 1,
            ids: { tmdb: 999002, kitsu: '222' },
            title: 'Dub Fermo',
            homeReleases: {
                checkedAt: daysAgo(0.1),
                sub: { episode: 20, airedAt: daysAgo(1) },
                dub: null
            },
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
            // Solo doppiato nella finestra: card base nuda + card ITA
            _id: '999004',
            schemaVersion: 1,
            ids: { tmdb: 999004, kitsu: '444' },
            title: 'Solo Dub',
            homeReleases: {
                checkedAt: daysAgo(0.1),
                sub: null,
                dub: { episode: 3, airedAt: daysAgo(4) }
            },
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

describe('AnimeAiringState - card dalla home (la fonte del catalogo novità)', () => {
    let snapshot;

    beforeAll(() => {
        snapshot = animeAiringState.buildSnapshot(buildFixtureDocs());
    });

    test('serie in corso: sub EP 12 e card ITA presente con ITA 8', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 240411), WINDOW);
        expect(info.hasSub).toBe(true);
        expect(info.hasDub).toBe(true);
        expect(info.sub).toEqual({ episode: 12 });
        expect(info.dub).toEqual({ episode: 8 });
    });

    test('serie conclusa: se la home non la nomina, per il catalogo non esiste', () => {
        // Il documento dichiara sub e doppiato, ma 60 giorni fa e la home non l'ha visto:
        // nessuna card. La novità (`getNoveltyEntries`, backfill) continua a usare le nostre
        // date: è un'altra domanda, e lì questa serie resta fuori finestra come prima.
        expect(animeAiringState.getNoveltyEntries(snapshot, WINDOW).map((e) => e.doc.tmdbId))
            .not.toContain('999001');

        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999001), WINDOW);
        expect(info).toBeNull();
        expect(animeAiringState.getWindowInfo(getDoc(snapshot, 999001), WINDOW).hasSub).toBe(false);
        expect(animeAiringState.getAiringEntries(snapshot, WINDOW).map((e) => e.doc.tmdbId))
            .not.toContain('999001');
    });

    test('doppiato fermo: nessuna card ITA (la home non ha visto uscite doppiate)', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999002), WINDOW);
        expect(info.hasSub).toBe(true);
        expect(info.hasDub).toBe(false);
        expect(info.sub).toEqual({ episode: 20 });
        expect(info.dub).toBeNull();
    });

    test('solo doppiato: la card base non ha `sub`, ma c\'è il clone ITA', () => {
        const info = animeAiringState.getCardInfo(getDoc(snapshot, 999004), WINDOW);
        expect(info.hasSub).toBe(false);
        expect(info.hasDub).toBe(true);
        expect(info.sub).toBeNull();
        expect(info.dub).toEqual({ episode: 3 });
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

describe('AnimeAiringState - documenti senza episodes[], e cosa NON decide più niente', () => {
    test('doc senza episodes[] con sub/dub: getWindowInfo le vede, la card chiede alla home', () => {
        const docNoEpisodes = {
            _id: '37854',
            schemaVersion: 1,
            ids: { tmdb: 37854, kitsu: '12' },
            title: 'One Piece',
            homeReleases: {
                checkedAt: daysAgo(0.1),
                sub: { episode: 1180, airedAt: daysAgo(1) },
                dub: { episode: 936, airedAt: daysAgo(2) }
            },
            sub: { season: 22, episode: 1180 },
            dub: { season: 22, episode: 936 },
            orderIndex: 0,
            updatedAt: daysAgo(0.1)
        };

        const snapshot = animeAiringState.buildSnapshot([docNoEpisodes]);
        const doc = snapshot.byTmdbId.get('37854');

        // Il backfill di novità continua a leggere i nostri campi: è un altro consumatore.
        const winInfo = animeAiringState.getWindowInfo(doc, WINDOW);
        expect(winInfo.hasSub).toBe(true);
        expect(winInfo.hasDub).toBe(true);

        // La card, invece, prende i numeri dalla home.
        const cardInfo = animeAiringState.getCardInfo(doc, WINDOW);
        expect(cardInfo).not.toBeNull();
        expect(cardInfo.sub).toEqual({ episode: 1180 });
        expect(cardInfo.dub).toEqual({ episode: 936 });

        expect(animeAiringState.getDubEpisode(doc)).toBe(936);
        expect(animeAiringState.getDubEpisodeForId(snapshot, 'kitsu:12')).toBe(936);
    });

    test('senza passata home la card non c\'è, ma il backfill la vede lo stesso', () => {
        const senzaHome = animeAiringState.buildSnapshot([{
            _id: '37855',
            schemaVersion: 1,
            ids: { tmdb: 37855, kitsu: '13' },
            title: 'Non nominata dalla home',
            sub: { season: 1, episode: 5, airedAt: daysAgo(1) },
            episodes: [{ season: 1, episode: 5, airedAt: daysAgo(1), subIta: true, dubIta: false }]
        }]);
        const doc = senzaHome.byTmdbId.get('37855');

        expect(animeAiringState.getCardInfo(doc, WINDOW)).toBeNull();
        expect(animeAiringState.getAiringEntries(senzaHome, { now: NOW })).toEqual([]);
        expect(animeAiringState.getNoveltyEntries(senzaHome, WINDOW).map((e) => e.doc.tmdbId))
            .toEqual(['37855']);
    });

    test('getAiringEntries: dentro solo chi ha una passata home, ordine = ultimo episodio uscito', () => {
        const docs = [
            { _id: '100', schemaVersion: 1, title: 'Uscito 5 giorni fa', homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 5, airedAt: daysAgo(5) }, dub: null }, orderIndex: 2 },
            { _id: '200', schemaVersion: 1, title: 'Uscito ieri', homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 1, airedAt: daysAgo(1) }, dub: { episode: 3, airedAt: daysAgo(0.5) } }, orderIndex: 0 },
            { _id: '300', schemaVersion: 1, title: 'Solo doppiato', homeReleases: { checkedAt: daysAgo(0.1), sub: null, dub: { episode: 10, airedAt: daysAgo(2) } }, orderIndex: 1 },
            { _id: '400', schemaVersion: 1, title: 'Niente home', sub: { season: 1, episode: 5 }, updatedAt: daysAgo(0.1) }
        ];

        const snapshot = animeAiringState.buildSnapshot(docs);
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW });

        // `orderIndex` non conta più: 200 (0.5 gg, il dub) prima di 300 (2 gg) prima di 100 (5 gg).
        expect(entries.map((e) => e.doc.tmdbId)).toEqual(['200', '300', '100']);
        expect(entries.map((e) => [e.subEpisode, e.dubEpisode])).toEqual([[1, 3], [null, 10], [5, null]]);
        expect(entries.find((e) => e.doc.tmdbId === '400')).toBeUndefined();
    });

    test('la freschezza è quella della fonte: `checkedAt`, e n\'altro', () => {
        const clock = jest.spyOn(Date, 'now').mockReturnValue(NOW);
        const doc = (id, checkedAtDays) => ({
            _id: id,
            schemaVersion: 1,
            title: `Titolo ${id}`,
            homeReleases: { checkedAt: daysAgo(checkedAtDays), sub: { episode: 5, airedAt: daysAgo(1) }, dub: null },
            listSeenAt: daysAgo(0.1),
            updatedAt: daysAgo(0.1)
        });
        const snapshot = animeAiringState.buildSnapshot([doc('601', 0.2), doc('602', 2.5), doc('603', 4)]);

        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW });
        // 601 confermato ieri e 602 due giorni fa entrano; 603 non ha conferma da quattro giorni.
        expect(entries.map((e) => e.doc.tmdbId)).toEqual(['601', '602']);
        expect(snapshot.homeInWindow).toBe(2);
        expect(snapshot.homeStale).toBe(1);
        clock.mockRestore();
    });

    test('`listSeenAt` e `updatedAt` non decidono più l\'appartenenza (i 5 scenari del vecchio brief)', () => {
        // Prima decidevano: listSeenAt entro 14 giorni, altrimenti updatedAt entro 12 ore. Ora la
        // domanda è una sola — la home ha visto l\'episodio? — e questi due campi non la pongono.
        const docs = [
            { _id: '701', schemaVersion: 1, title: 'listSeenAt 10gg fa, senza home', listSeenAt: daysAgo(10), sub: { season: 1, episode: 10 }, updatedAt: daysAgo(10) },
            { _id: '702', schemaVersion: 1, title: 'listSeenAt fresco, senza home', listSeenAt: daysAgo(0.1), sub: { season: 1, episode: 8 }, updatedAt: daysAgo(0.1) },
            { _id: '703', schemaVersion: 1, title: 'updatedAt vecchio ma home confermata', updatedAt: daysAgo(25), homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 12, airedAt: daysAgo(1) }, dub: null } },
            { _id: '704', schemaVersion: 1, title: 'aggiornato adesso ma senza home', updatedAt: daysAgo(2 / 24), sub: { season: 1, episode: 6 } },
            { _id: '705', schemaVersion: 1, title: 'home confermata e listSeenAt vecchissimo', listSeenAt: daysAgo(20), homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 4, airedAt: daysAgo(0.4) }, dub: null } }
        ];

        const snapshot = animeAiringState.buildSnapshot(docs);
        const included = animeAiringState.getAiringEntries(snapshot, { now: NOW }).map((e) => e.doc.tmdbId);

        expect(included).toContain('703');
        expect(included).toContain('705');
        expect(included).not.toContain('701');
        expect(included).not.toContain('702');
        expect(included).not.toContain('704');
        // Ordine dalla fonte: 704 no; 705 (0.4 gg) prima di 703 (1 gg).
        expect(included).toEqual(['705', '703']);
    });

    test('a parità di data l\'ordine è stabile (titolo), non un ordineIndex sparito', () => {
        const stessoGiorno = (id, titolo, orderIndex) => ({
            _id: id, schemaVersion: 1, title: titolo, orderIndex,
            homeReleases: { checkedAt: daysAgo(0.1), sub: { episode: 1, airedAt: daysAgo(3) }, dub: null }
        });
        const snapshot = animeAiringState.buildSnapshot([
            stessoGiorno('801', 'Zeta', 0),
            stessoGiorno('802', 'Alfa', 9),
            stessoGiorno('803', 'Mida', 4)
        ]);
        const entries = animeAiringState.getAiringEntries(snapshot, { now: NOW });
        expect(entries.map((e) => e.doc.title)).toEqual(['Alfa', 'Mida', 'Zeta']);
    });

    test('documento senza home ma con episodi freschi: il backfill continua a vederlo', () => {
        const fixtureDocs = buildFixtureDocs();
        const snapshot = animeAiringState.buildSnapshot(fixtureDocs);

        // Il backfill esclude 999001 (conclusa 60 giorni fa)...
        expect(animeAiringState.getNoveltyEntries(snapshot, WINDOW).map(e => e.doc.tmdbId)).not.toContain('999001');
        // ...e per il simulcast vale la home: 999001 non c'è, perché la fonte non la nomina.
        expect(animeAiringState.getAiringEntries(snapshot, { now: NOW }).map(e => e.doc.tmdbId)).not.toContain('999001');
    });

    test('doc con episode: null gestito senza errori', () => {
        const docNullEp = {
            _id: '888',
            schemaVersion: 1,
            title: 'Ep Null',
            sub: { season: 1, episode: null },
            homeReleases: { checkedAt: daysAgo(0.1), sub: null, dub: null },
            updatedAt: daysAgo(0.1)
        };
        const snapshot = animeAiringState.buildSnapshot([docNullEp]);
        const doc = snapshot.byTmdbId.get('888');

        expect(doc.sub).toEqual({ season: 1, episode: null });
        const winInfo = animeAiringState.getWindowInfo(doc);
        expect(winInfo.hasSub).toBe(true);
        expect(winInfo.hasDub).toBe(false);

        // Un episodio che non esiste (null) non è un episodio di home: nessuna card.
        expect(doc.home).toBeNull();
        expect(animeAiringState.getCardInfo(doc)).toBeNull();
        expect(animeAiringState.getAiringEntries(snapshot, { now: NOW })).toEqual([]);
    });
});
