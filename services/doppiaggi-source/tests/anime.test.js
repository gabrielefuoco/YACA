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
    maxEpisodeNumber,
    declaredMediaType,
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

test('anime.js - animeDocsToRows: la corsa di episodi vince sul dump tv filtrato (serie, non film)', () => {
    // Il caso vero misurato il 01/10/2026: `Toushou Daimos` (serie, 44 episodi) ha un id che nel nostro
    // dump tv NON c'è (è fuori Tier 1) e che esiste come film (*Europa Europa*). Senza il veto verrebbe
    // annotato come `movie` → badge ITA su un film che non c'entra. Il film vero ha 1 episodio.
    const docs = [
        { _id: '8996', dub: { episode: 44 }, episodes: [{ season: 1, episode: 44, dubIta: true }] }, // serie
        { _id: '11621', dub: { episode: 1 }, episodes: [{ season: 1, episode: 1, dubIta: true }] }   // Porco Rosso
    ];
    const tvIds = new Set(); // il dump tv filtrato non li contiene
    const movieIds = new Set([8996, 11621]); // entrambi esistono come film nel dump

    const rows = animeDocsToRows(docs, { tvIds, movieIds });
    assert.deepEqual(rows, [
        { t: 'tv', id: 8996, ita: true },    // la corsa di episodi vince: è una serie
        { t: 'movie', id: 11621, ita: true } // 1 episodio: è il film, mappato dai dump
    ]);
});

test('anime.js - maxEpisodeNumber e la soglia del veto (3 sì, 4 no)', () => {
    assert.equal(maxEpisodeNumber({ episodes: [{ episode: 1 }, { episode: 12 }] }), 12);
    assert.equal(maxEpisodeNumber({ episodes: [] }), 0);
    assert.equal(maxEpisodeNumber({}), 0);
    assert.equal(maxEpisodeNumber(null), 0);
    assert.equal(maxEpisodeNumber({ episodes: [{ episode: 'x' }, { episode: null }] }), 0);

    // Al limite: 3 episodi restano mappabili come film (un film in più parti), 4 no.
    const tre = animeDocsToRows([{ _id: '10', dub: { episode: 1 }, episodes: [{ episode: 3 }] }], { tvIds: new Set(), movieIds: new Set([10]) });
    const quattro = animeDocsToRows([{ _id: '10', dub: { episode: 1 }, episodes: [{ episode: 4 }] }], { tvIds: new Set(), movieIds: new Set([10]) });
    assert.equal(tre[0].t, 'movie');
    assert.equal(quattro[0].t, 'tv');
});

// ---------------------------------------------------------------------------
// Ticket 50: il tipo dichiarato dalla fonte vince sull'indovinello sui dump.
// Senza questo i film anime doppiati escono `tv:<id>` e il badge si cerca `movie:<id>`.
// ---------------------------------------------------------------------------

test('anime.js - mediaType dichiarato "movie" vince anche quando la regola attuale direbbe "tv"', () => {
    // Il caso vero: *Jin-Roh* (TMDB 823) e gli altri film anime doppiati. Non è nel dump tv,
    // la regola attuale cadrebbe sul default 'tv' e il badge (che cerca movie:823) non troverebbe nulla.
    const docs = [
        { _id: '823', mediaType: 'movie', dub: { episode: 1 }, episodes: [{ season: 1, episode: 1, dubIta: true }] }
    ];
    const tvIds = new Set(); // il dump tv non lo contiene
    const movieIds = new Set(); // e nemmeno il dump film: la sola fonte di verità è il documento

    const rows = animeDocsToRows(docs, { tvIds, movieIds });
    assert.deepEqual(rows, [{ t: 'movie', id: 823, ita: true }]);
});

test('anime.js - mediaType dichiarato "tv" vince sul veto dei dump (anche con una sola puntata)', () => {
    // Il caso in direzione opposta: una serie brevissima che i dump non distinguerebbero,
    // dichiarata 'tv' dalla fonte. Se la regola attuale avesse la parola uscirebbe 'movie'.
    const docs = [
        { _id: '12345', mediaType: 'tv', dub: { episode: 1 }, episodes: [{ season: 1, episode: 1, dubIta: true }] }
    ];
    const tvIds = new Set();
    const movieIds = new Set([12345]); // solo nel dump film: l'indovinello direbbe 'movie'

    const rows = animeDocsToRows(docs, { tvIds, movieIds });
    assert.deepEqual(rows, [{ t: 'tv', id: 12345, ita: true }]);
});

test('anime.js - senza mediaType il comportamento resta esattamente quello di prima', () => {
    // I 954 documenti già in produzione non hanno il campo: le tre regole di prima devono valere
    // immutate (veto episodi -> regola sui dump -> default tv).
    const docs = [
        // 1 episodio, solo nel dump film -> 'movie' (regola 2, invariata)
        { _id: '372058', dub: { episode: 1 }, episodes: [{ season: 1, episode: 1, dubIta: true }] },
        // corsa di episodi -> 'tv' anche se il solo id film coincide (regola 1, invariata)
        { _id: '8996', dub: { episode: 44 }, episodes: [{ season: 1, episode: 44, dubIta: true }] },
        // nei due dump -> vince 'tv' (regola 2, invariata)
        { _id: '30984', dub: { episode: 1 } },
        // in nessun dump -> default 'tv' (regola 3, invariata)
        { _id: '999999', dub: { episode: 1 } },
        // senza set di dump e senza mediaType -> 'tv' (nessuna regola applicabile, invariata)
        { _id: '55555', dub: { episode: 1 } }
    ];
    const tvIds = new Set([30984, 8996]);
    const movieIds = new Set([372058, 30984, 8996]);

    const rows = animeDocsToRows(docs, { tvIds, movieIds });
    assert.deepEqual(rows, [
        { t: 'movie', id: 372058, ita: true },
        { t: 'tv', id: 8996, ita: true },
        { t: 'tv', id: 30984, ita: true },
        { t: 'tv', id: 999999, ita: true },
        { t: 'tv', id: 55555, ita: true }
    ]);
});

test('anime.js - senza mediaType la riga e\' byte per byte quella di prima, anche senza dump', () => {
    // Stessi documenti, stessi set vuoti: senza il campo deve uscire esattamente 'tv' ovunque,
    // cioè nessuna riga cambia tipo per il solo fatto che il campo non ci sia ancora.
    const docs = [
        { _id: '1', dub: { episode: 1 } },
        { _id: '2', mediaType: undefined, dub: { episode: 7 } },
        { _id: '3', mediaType: null, dub: { episode: 1 } },
        { _id: '4', mediaType: '', dub: { episode: 1 } },
        { _id: '5', mediaType: '   ', dub: { episode: 1 } }
    ];
    const rows = animeDocsToRows(docs);
    assert.deepEqual(rows, [
        { t: 'tv', id: 1, ita: true },
        { t: 'tv', id: 2, ita: true },
        { t: 'tv', id: 3, ita: true },
        { t: 'tv', id: 4, ita: true },
        { t: 'tv', id: 5, ita: true }
    ]);
});

test('anime.js - declaredMediaType: legge il campo, e non inventa nulla', () => {
    assert.equal(declaredMediaType({ mediaType: 'movie' }), 'movie');
    assert.equal(declaredMediaType({ mediaType: 'tv' }), 'tv');
    assert.equal(declaredMediaType({ mediaType: ' MOVIE ' }), 'movie', 'normalizza come la fonte');
    assert.equal(declaredMediaType({}), null);
    assert.equal(declaredMediaType(null), null);
    assert.equal(declaredMediaType({ mediaType: null }), null);
    assert.equal(declaredMediaType({ mediaType: 42 }), null);
    assert.equal(declaredMediaType({ mediaType: 'tvshow' }), null, 'un valore ignoto non è una dichiarazione');
});

test('anime.js - mediaType dichiarato non vale sugli altri casi che restano scartati', () => {
    // Lo dichiaratore non cambia le altre porte: non doppiato, schema troppo nuovo, id non numerico.
    const docs = [
        { _id: '1', mediaType: 'movie', sub: { episode: 3 } },
        { _id: '2', mediaType: 'movie', schemaVersion: 2, dub: { episode: 1 } },
        { _id: 'abc', mediaType: 'movie', dub: { episode: 1 } }
    ];
    assert.deepEqual(animeDocsToRows(docs), []);
});

test('anime.js - fetch: la proiezione chiede mediaType, o il tipo dichiarato non arriverebbe', async () => {
    // Se la proiezione non includesse il campo, in produzione il documento arriverebbe senza tipo
    // e la riga ripartirebbe dall'indovinello: la correzione sarebbe solo nei test.
    let proiezione = null;
    const mockCollection = {
        find: (_filter, opts) => {
            proiezione = opts && opts.projection;
            return {
                toArray: async () => [{ _id: '823', mediaType: 'movie', dub: { episode: 1 } }]
            };
        }
    };

    const res = await fetchAnimeAiringDocs({ collection: mockCollection });
    assert.equal(res.ok, true);
    assert.ok(proiezione && typeof proiezione === 'object', 'la proiezione deve essere presente');
    assert.equal(proiezione.mediaType, 1, 'mediaType deve essere nella proiezione');

    const rowsRes = await loadAnimeDubbedRows({ collection: mockCollection });
    assert.deepEqual(rowsRes.rows, [{ t: 'movie', id: 823, ita: true }]);
});

test('anime.js - due documenti dello stesso id con tipi diversi: entrambe le righe restano', () => {
    // Il dedup è sulla chiave (t, id): cambiare il tipo dichiarato cambia la chiave, quindi non
    // si perde nulla rispetto a prima (prima le due righe avrebbero avuto la stessa chiave).
    const docs = [
        { _id: '777', mediaType: 'movie', dub: { episode: 1 } },
        { _id: '777', mediaType: 'tv', dub: { episode: 1 } }
    ];
    assert.deepEqual(animeDocsToRows(docs), [
        { t: 'movie', id: 777, ita: true },
        { t: 'tv', id: 777, ita: true }
    ]);
});
