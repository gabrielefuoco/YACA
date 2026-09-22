const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    buildAiringStateDocument,
    cleanTitle,
    compareEpisodes
} = require('../src/aggregate');
const { groupRecordsByTmdb } = require('../cli');
const { IdentityResolver } = require('../src/identity');

describe('Aggregate & Merge (Sub + Dub + Multi-Season)', () => {
    const fixedNow = new Date('2026-09-22T12:00:00.000Z');

    const s1SubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_5660_sub.json'), 'utf8'));
    const s1DubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_5698_dub.json'), 'utf8'));
    const s2SubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_6722_sub.json'), 'utf8'));
    const s2DubFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/info_api_6723_dub.json'), 'utf8'));

    const mockSubRecordS1 = { id: 5660, title: 'Dandadan', dub: 0, status: 'Terminato', episodes_count: 12 };
    const mockDubRecordS1 = { id: 5698, title: 'Dandadan (ITA)', dub: 1, status: 'Terminato', episodes_count: 12 };
    const mockSubRecordS2 = { id: 6722, title: 'Dandadan 2', dub: 0, status: 'Terminato', episodes_count: 12 };
    const mockDubRecordS2 = { id: 6723, title: 'Dandadan 2 (ITA)', dub: 1, status: 'Terminato', episodes_count: 12 };

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

    test('fonde sub e doppiato (S1) rispettando il contratto (campi univoci, latest come coppia, no totalAired)', () => {
        const doc = buildAiringStateDocument({
            subRecord: mockSubRecordS1,
            subEpisodes: s1SubFixture.episodes,
            dubRecord: mockDubRecordS1,
            dubEpisodes: s1DubFixture.episodes,
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.ok(doc);
        assert.strictEqual(doc._id, '240411');
        assert.strictEqual(doc.schemaVersion, 1);

        // Nessun campo duplicato
        assert.strictEqual(doc.perEpisodes, undefined, 'perEpisodes deve essere assente');
        assert.strictEqual(doc.italian.sub.latestEpisode, undefined, 'latestEpisode deve essere assente');
        assert.strictEqual(doc.italian.dub.latestEpisode, undefined, 'latestEpisode deve essere assente');
        assert.strictEqual(doc.schedule.totalAired, undefined, 'schedule.totalAired deve essere assente');

        // latest come coppia { season, episode }
        assert.deepStrictEqual(doc.italian.sub.latest, { season: 1, episode: 12 });
        assert.deepStrictEqual(doc.italian.dub.latest, { season: 1, episode: 12 });

        // schedule compatto
        assert.strictEqual(doc.schedule.status, 'Terminato');
        assert.strictEqual(doc.schedule.nextEpisode, null);

        // sources con campo latest
        assert.strictEqual(doc.sources.length, 2);
        assert.deepStrictEqual(doc.sources[0].latest, { season: 1, episode: 12 });
        assert.strictEqual(doc.sources[0].latestEpisode, undefined);
    });

    test('TEST MULTI-STAGIONE: unisce Dandadan S1 e S2 dalle fixture reali in un solo documento', () => {
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
                subEpisodes: s1SubFixture.episodes,
                dubRecord: mockDubRecordS1,
                dubEpisodes: s1DubFixture.episodes,
                identity: mockIdentityS1
            },
            {
                season: 2,
                subRecord: mockSubRecordS2,
                subEpisodes: s2SubFixture.episodes,
                dubRecord: mockDubRecordS2,
                dubEpisodes: s2DubFixture.episodes,
                identity: mockIdentityS2
            }
        ];

        const doc = buildAiringStateDocument({ seasons: seasonsInput, now: fixedNow });

        assert.ok(doc);
        assert.strictEqual(doc._id, '240411');
        assert.strictEqual(doc.title, 'Dandadan');

        // Contratto: italian.sub.latest e italian.dub.latest devono essere la coppia massima { season: 2, episode: 12 }
        assert.deepStrictEqual(doc.italian.sub.latest, { season: 2, episode: 12 });
        assert.deepStrictEqual(doc.italian.dub.latest, { season: 2, episode: 12 });

        // Contratto: episodes deve contenere episodi di ENTRAMBE le stagioni
        const hasS1 = doc.episodes.some(ep => ep.season === 1);
        const hasS2 = doc.episodes.some(ep => ep.season === 2);
        assert.ok(hasS1, 'La coda episodes deve contenere episodi della Stagione 1');
        assert.ok(hasS2, 'La coda episodes deve contenere episodi della Stagione 2');

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
            subEpisodes: s1SubFixture.episodes,
            dubRecord: null,
            dubEpisodes: [],
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.deepStrictEqual(docSubOnly.italian.sub.latest, { season: 1, episode: 12 });
        assert.strictEqual(docSubOnly.italian.dub.latest, null);
        assert.strictEqual(docSubOnly.italian.dub.isSimuldub, false);

        const docDubOnly = buildAiringStateDocument({
            subRecord: null,
            subEpisodes: [],
            dubRecord: mockDubRecordS1,
            dubEpisodes: s1DubFixture.episodes,
            identity: mockIdentityS1,
            now: fixedNow
        });

        assert.strictEqual(docDubOnly.italian.sub.latest, null);
        assert.deepStrictEqual(docDubOnly.italian.dub.latest, { season: 1, episode: 12 });
    });
});
