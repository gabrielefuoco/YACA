/**
 * anime.test.js
 * Test unitari offline per il modulo anime.js e la regola del doppiaggio.
 * Nessuna connessione di rete e nessun database reale richiesto.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getDubEpisode,
    isAnimeDubbed,
    animeDocsToRows,
    fetchAnimeAiringDocs,
    loadAnimeDubbedRows
} = require('../src/anime');
const { mergeAnnotationRows } = require('../src/annotations');

test('anime.js - regola doppiaggio: riconosce doc.dub.episode', () => {
    const doc = {
        _id: '100',
        title: 'Anime con dub top-level',
        dub: { season: 1, episode: 5 }
    };
    assert.equal(getDubEpisode(doc), 5);
    assert.equal(isAnimeDubbed(doc), true);
});

test('anime.js - regola doppiaggio: riconosce doc.italian.dub.latest', () => {
    const doc = {
        _id: '101',
        title: 'Anime con italian.dub.latest',
        italian: {
            sub: { latest: { season: 1, episode: 24 } },
            dub: { latest: { season: 1, episode: 12 } }
        }
    };
    assert.equal(getDubEpisode(doc), 12);
    assert.equal(isAnimeDubbed(doc), true);
});

test('anime.js - regola doppiaggio: fallback su episodes[] con dubIta: true', () => {
    const doc = {
        _id: '102',
        title: 'Anime con storico episodi',
        episodes: [
            { season: 1, episode: 1, subIta: true, dubIta: true },
            { season: 1, episode: 2, subIta: true, dubIta: true },
            { season: 1, episode: 3, subIta: true, dubIta: false }
        ]
    };
    assert.equal(getDubEpisode(doc), 2, 'deve estrarre l episodio doppiato più recente (2)');
    assert.equal(isAnimeDubbed(doc), true);
});

test('anime.js - regola doppiaggio: anime solo sub non è doppiato', () => {
    const doc = {
        _id: '103',
        title: 'Anime solo sub',
        sub: { season: 1, episode: 12 },
        italian: {
            sub: { latest: { season: 1, episode: 12 } },
            dub: null
        },
        episodes: [
            { season: 1, episode: 1, subIta: true, dubIta: false },
            { season: 1, episode: 2, subIta: true, dubIta: false }
        ]
    };
    assert.equal(getDubEpisode(doc), null);
    assert.equal(isAnimeDubbed(doc), false);
});

test('anime.js - regola doppiaggio: input null o malformato ritorna null', () => {
    assert.equal(getDubEpisode(null), null);
    assert.equal(getDubEpisode({}), null);
    assert.equal(getDubEpisode({ dub: { episode: 0 } }), null);
    assert.equal(getDubEpisode({ dub: { episode: -1 } }), null);
    assert.equal(getDubEpisode({ dub: { episode: 'abc' } }), null);
});

test('anime.js - animeDocsToRows: aggiunge id doppiati e ignora i non doppiati', () => {
    const docs = [
        { _id: '10', dub: { episode: 1 } },          // doppiato -> aggiunto
        { _id: '20', sub: { episode: 12 } },         // solo sub -> ignorato
        { _id: '30', italian: { dub: { latest: { episode: 3 } } } } // doppiato -> aggiunto
    ];

    const rows = animeDocsToRows(docs);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows, [
        { t: 'tv', id: 10, ita: true },
        { t: 'tv', id: 30, ita: true }
    ]);
});

test('anime.js - animeDocsToRows: scarta versioni schema non supportate (>1) e id non numerici', () => {
    const docs = [
        { _id: '10', schemaVersion: 2, dub: { episode: 1 } }, // schema non supportato
        { _id: '123,456', dub: { episode: 1 } },              // id non numerico
        { _id: '50', schemaVersion: 1, dub: { episode: 4 } }  // valido
    ];
    const rows = animeDocsToRows(docs);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { t: 'tv', id: 50, ita: true });
});

test('anime.js - animeDocsToRows: risolve t="movie" per film anime assenti in TV dump', () => {
    const docs = [
        { _id: '372058', dub: { episode: 1 } }, // Your Name (film)
        { _id: '30984', dub: { episode: 1 } },  // Bleach (serie TV, ma con omonimo movie)
        { _id: '999999', dub: { episode: 1 } }  // non in catalogo
    ];

    const tvIds = new Set([30984]);
    const movieIds = new Set([372058, 30984]); // 30984 vive in entrambi!

    const rows = animeDocsToRows(docs, { tvIds, movieIds });
    assert.equal(rows.length, 3);
    assert.deepEqual(rows, [
        { t: 'movie', id: 372058, ita: true }, // solo in movie -> t: 'movie'
        { t: 'tv', id: 30984, ita: true },     // in entrambi -> vince 'tv'
        { t: 'tv', id: 999999, ita: true }     // in nessuno -> default 'tv'
    ]);
});

test('anime.js - integrazione offline: fetch con mock collection', async () => {
    const mockCollection = {
        find: () => ({
            toArray: async () => [
                { _id: '10', dub: { episode: 1 } },
                { _id: '20', sub: { episode: 5 } }
            ]
        })
    };

    const res = await fetchAnimeAiringDocs({ collection: mockCollection });
    assert.equal(res.ok, true);
    assert.equal(res.docs.length, 2);

    const rowsRes = await loadAnimeDubbedRows({ collection: mockCollection });
    assert.equal(rowsRes.ok, true);
    assert.equal(rowsRes.rows.length, 1);
    assert.equal(rowsRes.rows[0].id, 10);
});

test('anime.js - degrado dichiarato se Mongo non risponde o non è configurato', async () => {
    // Senza URI e senza env Mongo
    const oldUri = process.env.MONGODB_URI;
    const oldMongoUri = process.env.MONGO_URI;
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_URI;

    try {
        const res = await fetchAnimeAiringDocs({});
        assert.equal(res.ok, false);
        assert.ok(res.error.includes('Nessun URI MongoDB configurato'));

        // Con URI irraggiungibile e timeout breve (100ms)
        const timeoutRes = await fetchAnimeAiringDocs({
            mongoUri: 'mongodb://127.0.0.1:29999/unreachable',
            timeoutMs: 100
        });
        assert.equal(timeoutRes.ok, false);
        assert.ok(timeoutRes.error);
    } finally {
        if (oldUri) process.env.MONGODB_URI = oldUri;
        if (oldMongoUri) process.env.MONGO_URI = oldMongoUri;
    }
});

test('anime.js + annotations: merge offline con tutte le casistiche', () => {
    // Base da Antonio Genna
    const agRows = [
        { t: 'tv', id: 100, ita: null }, // omonimo irrisolto
        { t: 'tv', id: 200, ita: true }, // già confermato AG
        { t: 'movie', id: 300, ita: true } // film AG
    ];

    // Anime da AnimeUnity
    const animeDocs = [
        { _id: '100', dub: { episode: 12 } }, // promuove id 100 da null a true
        { _id: '200', dub: { episode: 24 } }, // conferma id 200 true (non declassa)
        { _id: '400', dub: { episode: 1 } },  // aggiunge id 400 (nuovo)
        { _id: '500', sub: { episode: 10 } }  // non doppiato -> non entra
    ];

    const animeRows = animeDocsToRows(animeDocs);
    assert.equal(animeRows.length, 3);

    const merged = mergeAnnotationRows(agRows, animeRows);
    assert.equal(merged.length, 4);

    // Verifica id 100 promosso da null a true
    const row100 = merged.find((r) => r.t === 'tv' && r.id === 100);
    assert.ok(row100);
    assert.equal(row100.ita, true, 'id 100 deve essere promosso a true');

    // Verifica id 200 intatto come true
    const row200 = merged.find((r) => r.t === 'tv' && r.id === 200);
    assert.ok(row200);
    assert.equal(row200.ita, true);

    // Verifica id 400 aggiunto come true
    const row400 = merged.find((r) => r.t === 'tv' && r.id === 400);
    assert.ok(row400);
    assert.equal(row400.ita, true);

    // Verifica id 300 rimasto intatto
    const row300 = merged.find((r) => r.t === 'movie' && r.id === 300);
    assert.ok(row300);
    assert.equal(row300.ita, true);
});
