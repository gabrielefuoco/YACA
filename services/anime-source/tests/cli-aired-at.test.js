const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { processTmdbGroup } = require('../cli');

/**
 * Client finto: registra le richieste e delega a un handler per id/dub/range.
 */
function makeClient(handler) {
    const calls = [];
    return {
        calls,
        async getEpisodes(id, dub, range = {}) {
            calls.push({ id, dub, start: range.startRange, end: range.endRange });
            return handler(id, dub, range, calls.length - 1);
        }
    };
}

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

describe('processTmdbGroup - data di uscita (airedAt)', () => {
    test('legge la data con una sola richiesta mirata per variante', async () => {
        const client = makeClient((id) => {
            if (id === 12) return { episodes_count: 1180, episodes: [{ number: 1180, created_at: '2026-09-27 17:47:24' }] };
            return { episodes_count: 936, episodes: [{ number: 936, created_at: '2026-09-30 20:49:15' }] };
        });

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 12, title: 'One Piece', dub: 0, real_episodes_count: 1180 },
            dubRecord: { id: 2998, title: 'One Piece (ITA)', dub: 1, real_episodes_count: 936 },
            identity
        }), client, noSubSearch);

        assert.strictEqual(doc.sub.airedAt, '2026-09-27T17:47:24.000Z');
        assert.strictEqual(doc.dub.airedAt, '2026-09-30T20:49:15.000Z');
        assert.strictEqual(client.calls.length, 2, 'una richiesta per variante');
        assert.deepStrictEqual(client.calls.map(c => [c.id, c.dub, c.start, c.end]), [[12, 0, 1180, 1180], [2998, 1, 936, 936]]);
    });

    test('senza real_episodes_count usa episodes_count della lista', async () => {
        const client = makeClient(() => ({ episodes_count: 14, episodes: [{ number: 14, created_at: '2026-09-20 09:00:00' }] }));

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 500, title: 'Senza conteggio reale', dub: 0, episodes_count: 14 },
            identity
        }), client, noSubSearch);

        assert.strictEqual(doc.sub.airedAt, '2026-09-20T09:00:00.000Z');
        assert.deepStrictEqual([client.calls[0].start, client.calls[0].end], [14, 14]);
    });

    test('conteggio sfasato: la coda esatta e\' vuota, riprova col conteggio reale dell\'API', async () => {
        const client = makeClient((id, dub, range) => {
            if (range.startRange === 28) return { episodes_count: 28, episodes: [{ number: 28, created_at: '2026-09-27 10:00:00' }] };
            return { episodes_count: 28, episodes: [] };
        });

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 7402, title: 'Meitantei Conan Simulcast', dub: 0, real_episodes_count: 29 },
            identity
        }), client, noSubSearch);

        assert.strictEqual(doc.sub.airedAt, '2026-09-27T10:00:00.000Z');
        assert.ok(client.calls.some(c => c.start === 28 && c.end === 28), 'ha riprovato col conteggio reale');
    });

    test('senza alcun conteggio non chiama l\'API e lascia airedAt null', async () => {
        const client = makeClient(() => ({ episodes_count: 0, episodes: [] }));

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 501, title: 'Senza conteggi', dub: 0 },
            identity
        }), client, noSubSearch);

        assert.strictEqual(client.calls.length, 0);
        assert.strictEqual(doc.sub.airedAt, null);
        assert.strictEqual(doc.sub.episode, null);
    });

    test('errori di rete non bloccano il ciclo', async () => {
        const client = makeClient(() => { throw new Error('boom'); });

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 502, title: 'Errore', dub: 0, real_episodes_count: 12 },
            identity
        }), client, noSubSearch);

        assert.ok(doc, 'il documento viene comunque costruito');
        assert.strictEqual(doc.sub.airedAt, null);
        assert.strictEqual(client.calls.length, 2, 'esatto + finestra finale, poi si ferma');
    });

    test('sceglie la data piu\' recente dentro la finestra', async () => {
        const client = makeClient((id, dub, range) => {
            if (range.startRange === range.endRange) return { episodes_count: 12, episodes: [] };
            return {
                episodes_count: 12,
                episodes: [
                    { number: 8, created_at: '2026-08-01 10:00:00' },
                    { number: 12, created_at: '2026-09-15 10:00:00' },
                    { number: 11, created_at: '2026-09-08 10:00:00' }
                ]
            };
        });

        const doc = await processTmdbGroup(makeGroup({
            season: 1,
            subRecord: { id: 503, title: 'Finestra', dub: 0, real_episodes_count: 12 },
            identity
        }), client, noSubSearch);

        assert.strictEqual(doc.sub.airedAt, '2026-09-15T10:00:00.000Z');
    });
});
