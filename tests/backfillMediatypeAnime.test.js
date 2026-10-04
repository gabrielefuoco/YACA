/**
 * tests/backfillMediatypeAnime.test.js
 *
 * `scripts/backfill-mediatype-anime.js`: che tipo mette in un documento di `anime_airing_state`
 * che non dichiara il tipo, e che cosa non tocca.
 *
 * Qui la mappa e Mongo sono **finti**: `decideMediaType` riceve lo store per mano e `main` accetta
 * una collection iniettata. Non è una comodità, è il motivo per cui la logica è iniettata: un test
 * che chiude la rete e il database può dire "questo id è un film" senza dipendere da AniBridge
 * e da Atlas.
 *
 * Il contratto che conta, in ordine di gravità:
 *  - **il documento che dichiara già il tipo non si tocca**: `mediaType` è la dichiarazione della
 *    fonte (`services/anime-source`), e questo script non è più la fonte;
 *  - **film ⇔ mappa certificata**: `resolveKitsuMovie` non nullo ⇒ `movie`, e nient'altro decide;
 *  - **mappa non pronta ⇒ BLOCCA**: `resolveKitsuMovie` risponde `null` anche a store scarico, quindi
 *    ignorare quel caso scriverebbe `tv` su tutti gli id e congellerebbe i film come serie. Il
 *    piano deve contarli e `main` deve uscire 1;
 *  - **id non in mappa ⇒ `tv`**, che è la regola a valle (`animeDocsToRows`), ma con un motivo
 *    diverso da "la mappa lo conosce come anime": i due casi non si fondono;
 *  - **ogni scrittura è condizionata all'assenza del campo**: la fonte vince la corsa.
 */

const {
    MEDIA_TYPES,
    MOVIE_MAX_EPISODES,
    AZIONI,
    MOTIVI,
    normalizeMediaType,
    idTmdbDaDoc,
    decideMediaType,
    pianoDaDocumenti,
    riepilogo,
    righeCampione,
    applicaPiano,
    parseArgs,
    main
} = require('../scripts/backfill-mediatype-anime');

/**
 * Mappa certificata finta, costruita sulla forma reale (`animeMappingStore.buildFribbIndex`):
 * `tmdbToKitsuMovie` tiene gli id dei film, `tmdbToKitsu` quelli delle serie.
 * I tre film sono quelli del ticket (Jin-Roh, Spirited Away, Totoro).
 */
function mappaFinta({ ready = true } = {}) {
    const film = { '823': '500', '129': '511', '8392': '523' };
    const serie = { '5112': '40022', '26209': '265' };
    return {
        isReady: ready,
        resolveKitsuMovie: (id) => film[String(id)] || null,
        isAnimeTmdbId: (id) => Object.prototype.hasOwnProperty.call(film, String(id))
            || Object.prototype.hasOwnProperty.call(serie, String(id))
    };
}

/** Documento grezzo: `_id` stringa come nel contratto di `anime_airing_state`. */
function doc(id, campi = {}) {
    return { _id: String(id), title: `Titolo ${id}`, ...campi };
}

/**
 * Collection finta che onora `$exists: false`, così il test della corsa vale quanto un test su
 * Mongo vero invece di essere un'asserzione sulla forma della chiamata.
 */
function collectionFinta(docs) {
    const stato = new Map(docs.map((d) => [String(d._id), { ...d }]));
    const chiamate = [];
    return {
        stato,
        chiamate,
        find(_filtro, _opzioni) {
            // Non `async`: il driver vero restituisce il cursore, non una promise.
            return { async toArray() { return Array.from(stato.values()).map((d) => ({ ...d })); } };
        },
        async updateOne(filtro, update) {
            chiamate.push({ filtro, update });
            const chiave = String(filtro._id);
            const vivo = stato.get(chiave);
            const esiste = vivo !== undefined;
            // `$exists: false` come in Mongo: il campo non può esserci.
            if (esiste && filtro.mediaType && filtro.mediaType.$exists === false
                && vivo.mediaType !== null && vivo.mediaType !== undefined) {
                return { matchedCount: 0, modifiedCount: 0 };
            }
            if (!esiste) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(vivo, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
        }
    };
}

describe('normalizeMediaType: che cosa è una dichiarazione di tipo', () => {
    test('accetta solo i due tipi del contratto', () => {
        expect(normalizeMediaType('movie')).toBe('movie');
        expect(normalizeMediaType('tv')).toBe('tv');
        expect(normalizeMediaType('  MOVIE ')).toBe('movie');
        expect(MEDIA_TYPES).toEqual(['movie', 'tv']);
    });

    test('tutto il resto non è una dichiarazione', () => {
        for (const v of ['serie', 'Movie2', '', 'anime', 1, null, undefined, {}, ['movie']]) {
            expect(normalizeMediaType(v)).toBeNull();
        }
    });
});

describe('decideMediaType: il documento che dichiara già il tipo', () => {
    test('non si tocca, e non si chiede niente alla mappa', () => {
        const store = mappaFinta();
        const storeSenzaFilm = jest.spyOn(store, 'resolveKitsuMovie');
        for (const dichiarato of ['movie', 'tv']) {
            const v = decideMediaType(doc(823, { mediaType: dichiarato }), store);
            expect(v.azione).toBe(AZIONI.LASCIA);
            expect(v.motivo).toBe(MOTIVI.GIA_DICHIARATO);
            expect(v.dichiarato).toBe(dichiarato);
        }
        // Anche se la mappa dicesse il contrario: la fonte ha già parlato, non si riscrive.
        storeSenzaFilm.mockReturnValue(null);
        expect(decideMediaType(doc(823, { mediaType: 'movie' }), store).azione).toBe(AZIONI.LASCIA);
        expect(storeSenzaFilm).not.toHaveBeenCalled();
    });

    test('un campo presente ma non valido non è una dichiarazione, e non viene sovrascritto', () => {
        const v = decideMediaType(doc(823, { mediaType: 'serie' }), mappaFinta());
        expect(v.azione).toBe(AZIONI.LASCIA);
        expect(v.motivo).toBe(MOTIVI.CAMPO_NON_VALIDO);
        expect(v.a).toBeNull(); // niente da scrivere: non si cancella un campo che non è nostro
    });

    test('campo non stringa: idem, non è una dichiarazione', () => {
        expect(decideMediaType(doc(823, { mediaType: 42 }), mappaFinta()).motivo).toBe(MOTIVI.CAMPO_NON_VALIDO);
    });
});

describe('decideMediaType: il tipo viene dalla mappa certificata', () => {
    test('film per la mappa → movie (i tre del ticket)', () => {
        const casi = [['823', 'Jin-Roh'], ['129', 'Spirited Away'], ['8392', 'Totoro']];
        for (const [id, titolo] of casi) {
            const v = decideMediaType(doc(id, { title: titolo }), mappaFinta());
            expect(v.azione).toBe(AZIONI.SCRIVI);
            expect(v.a).toBe('movie');
            expect(v.motivo).toBe(MOTIVI.FILM_IN_MAPPA);
            expect(v.titolo).toBe(titolo);
        }
    });

    test('non film ma anime noto → tv, e il motivo lo dice', () => {
        const v = decideMediaType(doc(5112), mappaFinta());
        expect(v.a).toBe('tv');
        expect(v.motivo).toBe(MOTIVI.ANIME_TV_IN_MAPPA);
    });

    test('id che la mappa non conosce → tv, ma con il motivo "non in mappa"', () => {
        const v = decideMediaType(doc(424242), mappaFinta());
        expect(v.a).toBe('tv');
        expect(v.motivo).toBe(MOTIVI.ID_NON_IN_MAPPA);
    });

    test('la mappa non pronta BLOCCA: niente "tv" tirato a caso', () => {
        const v = decideMediaType(doc(823), mappaFinta({ ready: false }));
        expect(v.azione).toBe(AZIONI.BLOCCA);
        expect(v.motivo).toBe(MOTIVI.MAPPA_NON_PRONTA);
        expect(v.a).toBeNull();
    });

    test('store assente o senza il metodo: BLOCCA (non "non è un film")', () => {
        expect(decideMediaType(doc(823), null).azione).toBe(AZIONI.BLOCCA);
        expect(decideMediaType(doc(823), { isReady: true }).azione).toBe(AZIONI.BLOCCA);
        expect(decideMediaType(doc(823), { isReady: true, resolveKitsuMovie: () => 1 }).azione).toBe(AZIONI.BLOCCA);
    });

    test('un id non numerico si salta, non si indovina', () => {
        expect(decideMediaType({ _id: 'film-823' }, mappaFinta()).motivo).toBe(MOTIVI.ID_NON_VALIDO);
        expect(idTmdbDaDoc({ _id: '  ' })).toBeNull();
    });
});

describe('pianoDaDocumenti: i numeri', () => {
    const DOCS = [
        doc(57, { mediaType: 'tv' }),       // già dichiarato
        doc(58, { mediaType: 'movie' }),    // già dichiarato (anche se non è un film: la fonte vuole)
        doc(823, { title: 'Jin-Roh' }),
        doc(129, { title: 'Spirited Away' }),
        doc(8392, { title: 'Totoro' }),
        doc(5112, { title: 'Una serie' }),
        doc(77777, { title: 'Qualcosa che la mappa non conosce' }),
        doc(999, { mediaType: 'serie' }),   // campo non valido
        { _id: 'non-un-id', title: 'Malformato' }
    ];

    test('conta tutto una volta sola e non misura i documenti già dichiarati fra i "da scrivere"', () => {
        const piano = pianoDaDocumenti(DOCS, mappaFinta());
        expect(piano.totale).toBe(9);
        expect(piano.giaDichiarati).toEqual({ movie: 1, tv: 1 });
        expect(piano.daScrivere).toEqual({ movie: 3, tv: 2 });
        expect(piano.campoNonValido).toBe(1);
        expect(piano.idNonValido).toBe(1);
        expect(piano.bloccati).toBe(0);
        expect(piano.scritte).toHaveLength(5);
        expect(piano.scritte.map((s) => s._id)).toEqual(['823', '129', '8392', '5112', '77777']);
    });

    test('il riepilogo dice i tre numeri del mandato e il totale torna', () => {
        const testo = riepilogo(pianoDaDocumenti(DOCS, mappaFinta()));
        expect(testo).toMatch(/col campo già dichiarato .*: 2/);
        expect(testo).toMatch(/da riempire .*:\s+5\s+→ movie 3, tv 2/);
        expect(testo).toMatch(/restano senza mediaType dopo il giro:\s+2/); // il campo non valido + l'id malformato
    });

    test('con la mappa non pronta nulla viene deciso e tutto il resto è bloccato', () => {
        const piano = pianoDaDocumenti(DOCS, mappaFinta({ ready: false }));
        expect(piano.scritte).toHaveLength(0);
        // Bloccati sono i 5 che potrebbero prendere un tipo; i 2 già dichiarati, il campo non
        // valido e l'id malformato si fermano prima, e non sono un problema della mappa.
        expect(piano.bloccati).toBe(5);
        expect(piano.giaDichiarati).toEqual({ movie: 1, tv: 1 });
        expect(piano.campoNonValido).toBe(1);
        expect(piano.idNonValido).toBe(1);
    });

    test('il campione mette i film per primi (sono il motivo dello script)', () => {
        const righe = righeCampione(pianoDaDocumenti(DOCS, mappaFinta()), 3);
        expect(righe[0]).toMatch(/^ {2}823 "Jin-Roh" → movie/);
        expect(righe.filter((r) => r.includes('→ movie')).length).toBeGreaterThan(0);
    });

    test('incrocio con gli episodi: un film con una corsa di episodi viene segnalato', () => {
        const piano = pianoDaDocumenti([
            doc(823, { episodes: [{ episode: 1 }, { episode: 9 }] })
        ], mappaFinta());
        expect(piano.daScrivere.movie).toBe(1);
        expect(piano.filmConCorsaEpisodi).toHaveLength(1);
        expect(piano.filmConCorsaEpisodi[0]).toMatch(/823/);
        expect(MOVIE_MAX_EPISODES).toBe(3);
    });

    test('i documenti malformati finiscono in un campiano loro, non spariscono', () => {
        const piano = pianoDaDocumenti([
            doc(823, { mediaType: 'serie' }),
            { _id: 'x-1', title: 'Rottame' },
            { _id: '', title: 'Vuoto' }
        ], mappaFinta());
        expect(piano.campioni.campoNonValido).toHaveLength(1);
        expect(piano.campioni.idNonValido).toHaveLength(2);
        expect(piano.scritte).toHaveLength(0);
    });

    test('conta i doppiati: sono gli unici la cui chiave di annotazione cambia', () => {
        // `getDubEpisode` guarda `dub.episode`, poi `episodes[]` con `dubIta`.
        const piano = pianoDaDocumenti([
            doc(823, { title: 'Jin-Roh', dub: { season: 1, episode: 1 } }),
            doc(129, { title: 'Spirited Away', episodes: [{ episode: 1, dubIta: true }] }),
            doc(8392, { title: 'Totoro' }),                        // film in onda, senza dop
            doc(5112, { title: 'Serie', dub: { season: 1, episode: 4 } })
        ], mappaFinta());
        expect(piano.doppiati).toEqual({ movie: 2, tv: 1 });
        expect(piano.daScrivere).toEqual({ movie: 3, tv: 1 });
        expect(riepilogo(piano)).toMatch(/DOPPIATI \(cambiano la chiave\):\s+movie 2, tv 1/);
    });
});

describe('il veto degli episodi è una correzione esplicita, non un ripiego', () => {
    const DOC = [doc(823, { title: 'Serie che la mappa dice film', episodes: [{ episode: 1 }, { episode: 9 }] })];

    test('di default la mappa vince e il documento resta movie (ma viene segnalato)', () => {
        const piano = pianoDaDocumenti(DOC, mappaFinta());
        expect(piano.daScrivere).toEqual({ movie: 1, tv: 0 });
        expect(piano.scritte[0].motivo).toBe(MOTIVI.FILM_IN_MAPPA);
        expect(piano.filmConCorsaEpisodi).toHaveLength(1);
    });

    test('con --veto-episodi vince il veto, col motivo che dice perché', () => {
        const piano = pianoDaDocumenti(DOC, mappaFinta(), { vetoEpisodi: true });
        expect(piano.daScrivere).toEqual({ movie: 0, tv: 1 });
        expect(piano.scritte[0].motivo).toBe(MOTIVI.FILM_VETO_EPISODI);
        expect(piano.perMotivo[MOTIVI.FILM_VETO_EPISODI]).toBe(1);
    });

    test('il veto non tocca i film veri (un episodio)', () => {
        const piano = pianoDaDocumenti([doc(129, { episodes: [{ episode: 1 }] })], mappaFinta(), { vetoEpisodi: true });
        expect(piano.daScrivere).toEqual({ movie: 1, tv: 0 });
    });

    test('parseArgs: --veto-episodi è spento di default', () => {
        expect(parseArgs([]).vetoEpisodi).toBe(false);
        expect(parseArgs(['--veto-episodi']).vetoEpisodi).toBe(true);
    });

    test('i tv con forma film sono contati: sono la direzione che può togliere un badge', () => {
        const piano = pianoDaDocumenti([
            doc(5112, { dub: { season: 1, episode: 1 }, episodes: [{ episode: 1 }] }),// serie, 1 ep, doppiata
            doc(26209, { episodes: [{ episode: 1 }, { episode: 2 }] }),        // serie, 2 ep, NON doppiata
            doc(300001, { dub: { season: 1, episode: 7 }, episodes: [{ episode: 7 }] }) // corsa di episodi
        ], mappaFinta());
        expect(piano.serieSenzaCorsaEpisodi).toBe(2);
        expect(piano.ambigui).toBe(1); // solo il primo: forma film E doppiato
        expect(riepilogo(piano)).toMatch(/ATTENZIONE tv con forma film .*: 1/);
    });

    test('--solo-film scrive solo i movie, e --limit vale sul risultato', async () => {
        const coll = collectionFinta([
            doc(823), doc(129), doc(5112), doc(26209), doc(57, { mediaType: 'tv' })
        ]);
        const codice = await main(['--apply', '--solo-film'], { env: {}, store: mappaFinta(), collection: coll });
        expect(codice).toBe(0);
        expect(coll.stato.get('823').mediaType).toBe('movie');
        expect(coll.stato.get('129').mediaType).toBe('movie');
        expect(coll.stato.get('5112').mediaType).toBeUndefined(); // serie: restano senza
        expect(coll.stato.get('26209').mediaType).toBeUndefined();
        expect(coll.stato.get('57').mediaType).toBe('tv'); // chi dichiarava non si tocca
    });
});

describe('applicaPiano: la scrittura è condizionata', () => {
    test('ogni updateOne porta {mediaType: {$exists: false}} e scrive solo il tipo', async () => {
        const coll = collectionFinta([doc(823)]);
        const esito = await applicaPiano(coll, [{ _id: '823', titolo: 'Jin-Roh', a: 'movie' }], { log: () => {} });
        expect(esito).toEqual({ applicati: 1, saltati: 0, errori: 0 });
        expect(coll.chiamate[0].filtro).toEqual({ _id: '823', mediaType: { $exists: false } });
        expect(coll.chiamate[0].update).toEqual({ $set: { mediaType: 'movie' } });
        // E non si tocca `updatedAt`: è la finestra di freschezza dell'ariazione.
        expect(Object.keys(coll.chiamate[0].update.$set)).toEqual(['mediaType']);
    });

    test('un documento che ha già ricevuto il campo NON viene sovrascritto', async () => {
        const coll = collectionFinta([doc(823, { mediaType: 'tv' })]);
        const esito = await applicaPiano(coll, [{ _id: '823', titolo: 'Jin-Roh', a: 'movie' }], { log: () => {} });
        expect(esito).toEqual({ applicati: 0, saltati: 1, errori: 0 });
        expect(coll.stato.get('823').mediaType).toBe('tv');
    });

    test('rilanciarlo non è un danno: il secondo giro non ha più niente da scrivere', async () => {
        const coll = collectionFinta([doc(823), doc(5112), doc(57, { mediaType: 'tv' })]);
        const store = mappaFinta();

        const primo = pianoDaDocumenti(Array.from(coll.stato.values()), store);
        await applicaPiano(coll, primo.scritte, { log: () => {} });
        expect(coll.stato.get('823').mediaType).toBe('movie');
        expect(coll.stato.get('5112').mediaType).toBe('tv');
        expect(coll.stato.get('57').mediaType).toBe('tv');

        const secondo = pianoDaDocumenti(Array.from(coll.stato.values()), store);
        expect(secondo.scritte).toHaveLength(0);
        expect(secondo.giaDichiarati).toEqual({ movie: 1, tv: 2 });
        const esito = await applicaPiano(coll, secondo.scritte, { log: () => {} });
        expect(esito.applicati).toBe(0);
    });
});

describe('parseArgs: il dry-run è il default e --apply va detto', () => {
    test('senza opzioni non si scrive', () => {
        expect(parseArgs([]).apply).toBe(false);
    });

    test('--apply e --apply=... sono la stessa cosa', () => {
        expect(parseArgs(['--apply']).apply).toBe(true);
    });

    test('accetta --flag e --flag=valore', () => {
        const a = parseArgs(['--limit=5', '--sample', '7', '--env', '/tmp/.env']);
        expect(a.limit).toBe(5);
        expect(a.sample).toBe(7);
        expect(a.env).toBe('/tmp/.env');
    });

    test('opzione sconosciuta o numero rotto: errore, non un default silenzioso', () => {
        expect(() => parseArgs(['--applly'])).toThrow(/sconosciuta/);
        expect(() => parseArgs(['--limit=abc'])).toThrow(/--limit/);
    });
});

describe('main: il contratto con chi lo lancia', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    afterAll(() => { log.mockRestore(); error.mockRestore(); warn.mockRestore(); });
    beforeEach(() => { log.mockClear(); error.mockClear(); warn.mockClear(); });

    const DOCS = [doc(57, { mediaType: 'tv' }), doc(823, { title: 'Jin-Roh' }), doc(5112, { title: 'Una serie' })];

    test('dry-run: esce 0 e NON scrive niente', async () => {
        const coll = collectionFinta(DOCS);
        const codice = await main([], { env: {}, store: mappaFinta(), collection: coll });
        expect(codice).toBe(0);
        expect(coll.chiamate).toHaveLength(0);
        expect(coll.stato.get('823').mediaType).toBeUndefined();
        const detto = log.mock.calls.map((c) => String(c[0])).join('\n');
        expect(detto).toMatch(/DRY-RUN \(non scrive nulla\)/);
        expect(detto).toMatch(/DRY-RUN: 2 documenti prenderebbero il tipo/);
    });

    test('--apply scrive, e poi il giro è a vuoto', async () => {
        const coll = collectionFinta(DOCS);
        expect(await main(['--apply'], { env: {}, store: mappaFinta(), collection: coll })).toBe(0);
        expect(coll.stato.get('823').mediaType).toBe('movie');
        expect(coll.stato.get('5112').mediaType).toBe('tv');
        expect(await main(['--apply'], { env: {}, store: mappaFinta(), collection: coll })).toBe(0);
    });

    test('--limit scrive solo i primi N', async () => {
        const coll = collectionFinta(DOCS);
        await main(['--apply', '--limit=1'], { env: {}, store: mappaFinta(), collection: coll });
        const scritti = ['823', '5112'].filter((id) => coll.stato.get(id).mediaType !== undefined);
        expect(scritti).toHaveLength(1);
    });

    test('mappa non pronta: esce 1 e non scrive niente', async () => {
        const coll = collectionFinta(DOCS);
        const codice = await main(['--apply'], { env: {}, store: mappaFinta({ ready: false }), collection: coll });
        expect(codice).toBe(1);
        expect(coll.chiamate).toHaveLength(0);
        expect(coll.stato.get('823').mediaType).toBeUndefined();
    });

    test('senza URI e senza opzioni: esce 1 e dice come dargliela', async () => {
        const codice = await main([], { env: {} });
        expect(codice).toBe(1);
        expect(error.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/--env=/);
    });

    test('--help non tocca niente e spiega il dry-run', async () => {
        const coll = collectionFinta(DOCS);
        expect(await main(['--help'], { env: {}, store: mappaFinta(), collection: coll })).toBe(0);
        expect(coll.chiamate).toHaveLength(0);
        const detto = log.mock.calls.map((c) => String(c[0])).join('\n');
        expect(detto).toMatch(/--apply\s+scrive davvero \(default: DRY-RUN/);
    });

    test('il dry-run con --solo-film dice il numero che si scriverebbe davvero', async () => {
        const coll = collectionFinta(DOCS);
        expect(await main(['--solo-film'], { env: {}, store: mappaFinta(), collection: coll })).toBe(0);
        const detto = log.mock.calls.map((c) => String(c[0])).join('\n');
        expect(detto).toMatch(/DRY-RUN: 1 documenti prenderebbero il tipo/); // solo Jin-Roh
        expect(detto).toMatch(/--solo-film: da scrivere 1 film, 1 serie restano senza il campo/);
        expect(coll.chiamate).toHaveLength(0);
    });
});