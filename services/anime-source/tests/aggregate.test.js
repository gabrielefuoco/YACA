const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    buildAiringStateDocument,
    mergeAiringDocuments,
    cleanTitle,
    compareEpisodes
} = require('../src/aggregate');
const { groupRecordsByTmdb, processTmdbGroup } = require('../cli');
const { IdentityResolver } = require('../src/identity');

describe('Aggregate & Merge (Sub + Dub + Multi-Season)', () => {
    const fixedNow = new Date('2026-09-22T12:00:00.000Z');

    const s1SubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_5660_sub.json'), 'utf8'));
    const s1DubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_5698_dub.json'), 'utf8'));
    const s2SubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_6722_sub.json'), 'utf8'));
    const s2DubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_6723_dub.json'), 'utf8'));

    const mockSubRecordS1 = { id: 5660, title: 'Dandadan', dub: 0, status: 'Terminato', real_episodes_count: 12 };
    const mockDubRecordS1 = { id: 5698, title: 'Dandadan (ITA)', dub: 1, status: 'Terminato', real_episodes_count: 12 };
    const mockSubRecordS2 = { id: 6722, title: 'Dandadan 2', dub: 0, status: 'Terminato', real_episodes_count: 12 };
    const mockDubRecordS2 = { id: 6723, title: 'Dandadan 2 (ITA)', dub: 1, status: 'Terminato', real_episodes_count: 12 };

    const mockIdentityS1 = { tmdbId: '240411', kitsuId: '48269', anilistId: 171018, malId: 57334, season: 1 };
    const mockIdentityS2 = { tmdbId: '240411', kitsuId: '49425', anilistId: 185660, malId: 60543, season: 2 };

    test('cleanTitle pulisce suffissi lingua e numeri di stagione', () => {
        assert.strictEqual(cleanTitle('Dandadan (ITA)'), 'Dandadan');
        assert.strictEqual(cleanTitle('Dandadan 2 (ITA)'), 'Dandadan');
        assert.strictEqual(cleanTitle('Chainsaw Man (Dub)'), 'Chainsaw Man');
        assert.strictEqual(cleanTitle('Frieren'), 'Frieren');
    });

    test('compareEpisodes ordina correttamente per stagione ed episodio', () => {
        assert.ok(compareEpisodes({ season: 2, episode: 1 }, { season: 1, episode: 12 }) > 0);
        assert.ok(compareEpisodes({ season: 1, episode: 12 }, { season: 1, episode: 5 }) > 0);
        assert.strictEqual(compareEpisodes({ season: 1, episode: 5 }, { season: 1, episode: 5 }), 0);
        assert.ok(compareEpisodes(null, { season: 1, episode: 1 }) < 0);
    });

    test('fonde sub e doppiato (S1) rispettando il contratto (sub/dub diretti, no episodes[])', () => {
        const doc = buildAiringStateDocument({
            subRecord: mockSubRecordS1,
            dubRecord: mockDubRecordS1,
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.ok(doc);
        assert.strictEqual(doc._id, '240411');
        assert.strictEqual(doc.schemaVersion, 1);

        // Nessun array episodes[]
        assert.strictEqual(doc.episodes, undefined, 'episodes deve essere assente');
        assert.strictEqual(doc.perEpisodes, undefined, 'perEpisodes deve essere assente');

        // sub e dub diretti al top level
        assert.deepStrictEqual(doc.sub, { season: 1, episode: 12, airedAt: null });
        assert.deepStrictEqual(doc.dub, { season: 1, episode: 12, airedAt: null });

        // latest come coppia { season, episode, airedAt } per compatibilità
        assert.deepStrictEqual(doc.italian.sub.latest, { season: 1, episode: 12, airedAt: null });
        assert.deepStrictEqual(doc.italian.dub.latest, { season: 1, episode: 12, airedAt: null });

        // schedule compatto
        assert.strictEqual(doc.schedule.status, 'Terminato');
        assert.strictEqual(doc.schedule.nextEpisode, null);

        // sources
        assert.strictEqual(doc.sources.length, 2);
        assert.deepStrictEqual(doc.sources[0].latest, { season: 1, episode: 12, airedAt: null });
    });

    test('TEST MULTI-STAGIONE: unisce Dandadan S1 e S2 in un solo documento con sub e dub della stagione massima', () => {
        const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
        const anibridgeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/anibridge_dandadan.json'), 'utf8'));
        const archiveHtml = fs.readFileSync(path.join(__dirname, 'fixtures/dandadan_archive.html'), 'utf8');

        const { extractArchiveRecords } = require('../src/animeunity');
        const rawRecords = extractArchiveRecords(archiveHtml);
        assert.strictEqual(rawRecords.length, 4, 'La fixture contiene 4 record per Dandadan');

        const resolver = new IdentityResolver();
        resolver.loadFromData({ fribbData: fribbFixture, anibridgeData: anibridgeFixture });

        const tmdbGroups = groupRecordsByTmdb(rawRecords, resolver);
        assert.strictEqual(tmdbGroups.length, 1, 'Tutti i 4 record devono confluire in UN SOLO gruppo TMDB (240411)');

        const group = tmdbGroups[0];
        assert.strictEqual(group.tmdbId, '240411');
        assert.strictEqual(group.seasonsMap.size, 2, 'Devono esserci 2 stagioni (S1 e S2)');

        // Costruiamo il documento aggregando entrambe le stagioni
        const seasonsInput = [
            {
                season: 1,
                subRecord: mockSubRecordS1,
                dubRecord: mockDubRecordS1,
                identity: mockIdentityS1
            },
            {
                season: 2,
                subRecord: mockSubRecordS2,
                dubRecord: mockDubRecordS2,
                identity: mockIdentityS2
            }
        ];

        const doc = buildAiringStateDocument({ seasons: seasonsInput, orderIndex: 0, now: fixedNow });

        assert.ok(doc);
        assert.strictEqual(doc._id, '240411');
        assert.strictEqual(doc.title, 'Dandadan');
        assert.strictEqual(doc.orderIndex, 0);

        // sub e dub al top level devono essere della stagione massima { season: 2, episode: 12 }
        assert.deepStrictEqual(doc.sub, { season: 2, episode: 12, airedAt: null });
        assert.deepStrictEqual(doc.dub, { season: 2, episode: 12, airedAt: null });
        assert.deepStrictEqual(doc.italian.sub.latest, { season: 2, episode: 12, airedAt: null });
        assert.deepStrictEqual(doc.italian.dub.latest, { season: 2, episode: 12, airedAt: null });

        // Nessun array episodes
        assert.strictEqual(doc.episodes, undefined);

        // Verifica fonti grezze di entrambe le stagioni (4 fonti)
        assert.strictEqual(doc.sources.length, 4, 'sources deve contenere tutti e 4 i record (S1 sub/dub, S2 sub/dub)');
        assert.ok(doc.sources.find(s => s.animeId === 5660 && s.season === 1));
        assert.ok(doc.sources.find(s => s.animeId === 5698 && s.season === 1));
        assert.ok(doc.sources.find(s => s.animeId === 6722 && s.season === 2));
        assert.ok(doc.sources.find(s => s.animeId === 6723 && s.season === 2));
    });

    test('gestisce serie con un solo canale disponibile (solo sub o solo dub)', () => {
        const docSubOnly = buildAiringStateDocument({
            subRecord: mockSubRecordS1,
            dubRecord: null,
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.deepStrictEqual(docSubOnly.sub, { season: 1, episode: 12, airedAt: null });
        assert.strictEqual(docSubOnly.dub, undefined);
        assert.deepStrictEqual(docSubOnly.italian.sub.latest, { season: 1, episode: 12, airedAt: null });
        assert.strictEqual(docSubOnly.italian.dub, null);

        const docDubOnly = buildAiringStateDocument({
            subRecord: null,
            dubRecord: mockDubRecordS1,
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.strictEqual(docDubOnly.sub, undefined);
        assert.deepStrictEqual(docDubOnly.dub, { season: 1, episode: 12, airedAt: null });
        assert.strictEqual(docDubOnly.italian.sub, null);
        assert.deepStrictEqual(docDubOnly.italian.dub.latest, { season: 1, episode: 12, airedAt: null });
    });

    test('quando real_episodes_count manca, lascia episode: null e non crasha', () => {
        const docMissingCount = buildAiringStateDocument({
            subRecord: { id: 9999, title: 'No Count', dub: 0, status: 'In corso' },
            identity: { tmdbId: '8888', season: 1 },
            now: fixedNow
        });

        assert.ok(docMissingCount);
        assert.deepStrictEqual(docMissingCount.sub, { season: 1, episode: null, airedAt: null });
        assert.strictEqual(docMissingCount.dub, undefined);
    });

    test('listSeenAt: scritto solo se passato e preservato/aggiornato nel merge', () => {
        const seenDate = '2026-10-01T12:00:00.000Z';
        const docOngoing = buildAiringStateDocument({
            subRecord: mockSubRecordS1,
            identity: mockIdentityS1,
            listSeenAt: seenDate,
            now: fixedNow
        });
        assert.strictEqual(docOngoing.listSeenAt, seenDate, 'doc ongoing deve avere listSeenAt');

        const docBulk = buildAiringStateDocument({
            subRecord: mockSubRecordS1,
            identity: mockIdentityS1,
            now: fixedNow
        });
        assert.strictEqual(docBulk.listSeenAt, undefined, 'doc bulk non deve avere listSeenAt');

        // Merge: passata doppiati (bulk) su doc esistente con listSeenAt -> preserva listSeenAt esistente
        const mergedAfterDub = mergeAiringDocuments(docOngoing, docBulk);
        assert.strictEqual(mergedAfterDub.listSeenAt, seenDate, 'merge con bulk incoming preserva listSeenAt esistente');

        // Merge: nuovo ciclo ongoing con data più recente -> aggiorna listSeenAt
        const newerDate = '2026-10-01T18:00:00.000Z';
        const docNewer = { ...docBulk, listSeenAt: newerDate };
        const mergedNewer = mergeAiringDocuments(docOngoing, docNewer);
        assert.strictEqual(mergedNewer.listSeenAt, newerDate, 'merge aggiorna a listSeenAt più recente');

        // Merge: doc vecchi senza listSeenAt -> resta undefined
        const mergedLegacy = mergeAiringDocuments(docBulk, { ...docBulk, title: 'Updated' });
        assert.strictEqual(mergedLegacy.listSeenAt, undefined, 'merge tra doc senza listSeenAt non imposta listSeenAt');
    });

    test('airedAt: scritto in sub e dub in formato ISO (o null) e preservato nel merge', () => {
        const subDate = '2026-09-27 17:47:24';
        const dubDate = '2026-09-30 20:49:15';
        const expectedSubIso = '2026-09-27T17:47:24.000Z';
        const expectedDubIso = '2026-09-30T20:49:15.000Z';

        const doc = buildAiringStateDocument({
            subRecord: { ...mockSubRecordS1, airedAt: subDate },
            dubRecord: { ...mockDubRecordS1, airedAt: dubDate },
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.ok(doc);
        assert.deepStrictEqual(doc.sub, { season: 1, episode: 12, airedAt: expectedSubIso });
        assert.deepStrictEqual(doc.dub, { season: 1, episode: 12, airedAt: expectedDubIso });
        assert.deepStrictEqual(doc.italian.sub.latest, { season: 1, episode: 12, airedAt: expectedSubIso });
        assert.deepStrictEqual(doc.italian.dub.latest, { season: 1, episode: 12, airedAt: expectedDubIso });

        // Merge preserves airedAt
        const incomingNoAired = buildAiringStateDocument({
            subRecord: mockSubRecordS1,
            dubRecord: mockDubRecordS1,
            identity: mockIdentityS1,
            now: fixedNow
        });
        const merged = mergeAiringDocuments(doc, incomingNoAired);
        assert.strictEqual(merged.sub.airedAt, expectedSubIso);
        assert.strictEqual(merged.dub.airedAt, expectedDubIso);
    });

    test('merge conserva airedAt anche quando il doc esistente ha un episodio piu\' alto (legacy senza data)', () => {
        // Doc legacy: numero di episodi piu' alto (es. Bleach S2 13 vs 8 della lista) e nessuna data.
        const legacy = {
            _id: '30984',
            schemaVersion: 1,
            ids: { tmdb: '30984', kitsu: '1' },
            title: 'Bleach: Sennen Kessen-hen - Kashin-tan',
            sub: { season: 2, episode: 13 },
            dub: { season: 2, episode: 13 },
            italian: { sub: { latest: { season: 2, episode: 13 } }, dub: { latest: { season: 2, episode: 13 } } },
            updatedAt: '2026-09-22T10:00:00.000Z'
        };
        const incoming = {
            ...legacy,
            sub: { season: 2, episode: 8, airedAt: '2026-09-12T18:47:02.000Z' },
            dub: { season: 2, episode: 8, airedAt: '2026-09-15T20:00:00.000Z' },
            italian: {
                sub: { latest: { season: 2, episode: 8, airedAt: '2026-09-12T18:47:02.000Z' } },
                dub: { latest: { season: 2, episode: 8, airedAt: '2026-09-15T20:00:00.000Z' } }
            },
            updatedAt: '2026-10-01T18:58:00.000Z'
        };

        const merged = mergeAiringDocuments(legacy, incoming);

        assert.strictEqual(merged.sub.episode, 13, 'il numero piu' + ' alto resta (regola attuale)');
        assert.strictEqual(merged.sub.airedAt, '2026-09-12T18:47:02.000Z', 'la data del ciclo corrente non si perde');
        assert.strictEqual(merged.dub.airedAt, '2026-09-15T20:00:00.000Z');
        assert.strictEqual(merged.italian.sub.latest.airedAt, '2026-09-12T18:47:02.000Z');
    });

    test('processTmdbGroup: per varianti con real_episodes_count = N > 0 fa richiesta minima con startRange/endRange = N e non blocca il ciclo se fallisce', async () => {
        const calls = [];
        const mockClient = {
            findSubCounterpart: async () => null,
            getEpisodes: async (animeId, dub, rangeOpts) => {
                calls.push({ animeId, dub, rangeOpts });
                if (animeId === 12) {
                    return {
                        episodes_count: 1180,
                        episodes: [{ number: '1180', created_at: '2026-09-27 17:47:24' }]
                    };
                }
                if (animeId === 2998) {
                    return {
                        episodes_count: 936,
                        episodes: [{ number: '936', created_at: '2026-09-30 20:49:15' }]
                    };
                }
                if (animeId === 99999) {
                    throw new Error('Network timeout');
                }
                return null;
            }
        };

        const testGroup = {
            tmdbId: '37854',
            title: 'One Piece',
            orderIndex: 0,
            seasonsMap: new Map([
                [22, {
                    season: 22,
                    subRecord: { id: 12, dub: 0, real_episodes_count: 1180 },
                    dubRecord: { id: 2998, dub: 1, real_episodes_count: 936 },
                    identity: { tmdbId: '37854', season: 22 }
                }]
            ])
        };

        const doc = await processTmdbGroup(testGroup, mockClient, { listSeenAt: '2026-10-01T12:00:00.000Z' });

        assert.ok(doc);
        assert.strictEqual(calls.length, 2, 'Deve effettuare esattamente una chiamata minima per ciascuna variante');
        assert.deepStrictEqual(calls[0], { animeId: 12, dub: 0, rangeOpts: { startRange: 1180, endRange: 1180 } });
        assert.deepStrictEqual(calls[1], { animeId: 2998, dub: 1, rangeOpts: { startRange: 936, endRange: 936 } });

        assert.strictEqual(doc.sub.airedAt, '2026-09-27T17:47:24.000Z');
        assert.strictEqual(doc.dub.airedAt, '2026-09-30T20:49:15.000Z');

        // Test resilienza: se getEpisodes lancia un errore, airedAt resta null e non crasha
        const failingGroup = {
            tmdbId: '99999',
            title: 'Fail Show',
            orderIndex: 1,
            seasonsMap: new Map([
                [1, {
                    season: 1,
                    subRecord: { id: 99999, dub: 0, real_episodes_count: 5 },
                    dubRecord: null,
                    identity: { tmdbId: '99999', season: 1 }
                }]
            ])
        };

        const failingDoc = await processTmdbGroup(failingGroup, mockClient);
        assert.ok(failingDoc, 'Non deve bloccare il ciclo');
        assert.strictEqual(failingDoc.sub.airedAt, null);
    });
});

