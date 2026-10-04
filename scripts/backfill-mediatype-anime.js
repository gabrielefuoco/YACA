#!/usr/bin/env node
/**
 * backfill-mediatype-anime.js
 *
 * Riempi il campo `mediaType` nei documenti di `anime_airing_state` che NON lo dichiarano,
 * prendendo il tipo dalla mappa anime certificata (`src/data/animeMappingStore.js`).
 *
 * PERCHÉ ESISTE. `mediaType` (`'movie'|'tv'`) è il tipo **dichiarato dalla fonte**, e il writer
 * delle annotazioni lo legge prima di ogni altra regola (`services/doppiaggi-source/src/anime.js`,
 * `animeDocsToRows`): senza il campo l'annotazione esce `tv:<id>` e il badge/poster si cerca con
 * `movie:<id>` — cioè non si trova. Il campo lo scrive `services/anime-source`, che riscrive **solo
 * i titoli in onda** (64 per ciclo): **i film non lo saranno mai**, quindi il tipo non arriverà loro
 * dalla riscrittura naturale e il difetto non si guarisce da solo.
 *
 * Il tipo, però, **esiste a monte**: AniBridge lo dichiara nel prefisso (`tmdb_movie:`/`tmdb_show:`),
 * Fribb nel campo `themoviedb_id.movie`, ed `animeMappingStore.resolveKitsuMovie(tmdbId)` non nullo
 * significa esattamente " quell'id TMDB è un film". Non manca il dato: manca la scrittura.
 *
 * USO
 *   node scripts/backfill-mediatype-anime.js                    # DRY-RUN: legge e conta, non scrive
 *   node scripts/backfill-mediatype-anime.js --apply            # scrive davvero (richiede mandato)
 *   node scripts/backfill-mediatype-anime.js --env=/percorso/.env
 *   node scripts/backfill-mediatype-anime.js --sample=40         # quante voci stampare
 *   node scripts/backfill-mediatype-anime.js --limit=50 --apply  # scrive i primi 50 (cauto)
 *
 * IL DRY-RUN È IL DEFAULT e non è una cortesia: è la difesa contro il danno che questo script può
 * fare. Scrivere `tv` su un documento che è un film **congela** il difetto in un campo che a valle
 * vince su ogni altra regola, e non lo fa più tornare da solo. Perciò il default è leggere, e la
 * scrittura è un atto separato, dichiarato, di chi ha il mandato.
 *
 * CHI NON SI TOCCA.
 *  - i documenti che **già** dichiarano un tipo valido: sono la dichiarazione della fonte, e questo
 *    script non è più font. Il piano li conta e basta;
 *  - `services/anime-source` e `services/doppiaggi-source`: qui non si scrive una riga di quei due
 *    moduli. Il produttore continua a essere solo `anime-source`, e quando riscriverà un titolo in
 *    onda farà come ha sempre fatto.
 *
 * LA MAPPA NON PRONTA È UN BLOCCO, NON UNA RISPOSTA. `resolveKitsuMovie` risponde `null` anche
 * quando lo store non è ancora caricato: se il guardasimo, uno store scarico farebbe scrivere `tv`
 * a tutti gli id che ha davanti (905 documenti) e 35 film diventerebbero serie **per sempre**, in
 * silenzio e con l'uscita 0. Perciò `decideMediaType` chiede prima se lo store è pronto: se non lo
 * è, il documento non viene deciso e `main` esce 1.
 *
 * IDEMPOTENTE PER DUE MOTIVI INDEPENDENTI, e il secondo è quello che conta davvero:
 *  1. al rilancio i documenti già scritti dichiarano il campo e finiscono in "lascia";
 *  2. ogni scrittura porta con sé il filtro `{mediaType: {$exists: false}}`, quindi un documento che
 *     nel frattempo ha ricevuto il campo dalla fonte **non viene sovrascritto**: la corsa tra la
 *     nostra decisione e la riscrittura di `anime-source` si risolve a favore di chi scrive per
 *     ultimo, che in questo caso è la fonte.
 *
 * `updatedAt` NON si tocca: quel campo è la finestra di freschezza di `animeAiringState` (48h) e di
 * `backfill-airing-anime.js`. Rinfrescarlo qui rimetterebbe in coda film che non sono in onda.
 */

const fs = require('fs');
const path = require('path');

const COLLECTION_NAME = 'anime_airing_state';

/** Gli unici due tipi che `anime_airing_state` può dichiarare (cfr. `services/anime-source`). */
const MEDIA_TYPES = ['movie', 'tv'];

/**
 * Soglia del veto: oltre, il documento è una serie. **Copia** di `MOVIE_MAX_EPISODES` in
 * `services/doppiaggi-source/src/anime.js` e in `src/data/animeAiringState.js`. Serve solo come
 * **controllo incrociato** nel riepilogo: qui il tipo NON si deduce dagli episodi (la fonte non lo
 * deduce e non ce l'ha), ma se la mappa dicesse `movie` per un documento con una corsa di episodi
 * quella sarebbe una contraddizione da vedere, non da tacere.
 */
const MOVIE_MAX_EPISODES = 3;

/** Azioni del piano. `blocca` = non decidibile, e il piano non è applicabile. */
const AZIONI = Object.freeze({
    LASCIA: 'lascia',
    SCRIVI: 'scrivi',
    BLOCCA: 'blocca'
});

/**
 * Perché un documento è stato deciso come è stato. Stringhe corte e stabili: ci rispondono il
 * riepilogo e i test, quindi non vanno riformulate.
 *
 *  GIA_DICHIARATO       il documento porta già un tipo valido: non si tocca.
 *  CAMPO_NON_VALIDO     porta il campo ma non è 'movie'/'tv' (o non è una stringa): non è una
 *                       dichiarazione, ma non lo si sovrascrive senza sapere chi l'ha messo.
 *  FILM_IN_MAPPA        `resolveKitsuMovie` non nullo: l'id TMDB è un film (AniBridge/Fribb).
 *  ANIME_TV_IN_MAPPA    non è un film e la mappa lo conosce come anime: serie.
 *  ID_NON_IN_MAPPA      la mappa non conosce affatto quell'id: serie per default (vedi sotto).
 *  MAPPA_NON_PRONTA     store non pronto: BLOCCA (mai `tv` tirato a caso).
 *  ID_NON_VALIDO        `_id` non numerico: documento malformato, si salta.
 */
const MOTIVI = Object.freeze({
    GIA_DICHIARATO: 'gia_dichiarato',
    CAMPO_NON_VALIDO: 'campo_non_valido',
    FILM_IN_MAPPA: 'film_in_mappa',
    ANIME_TV_IN_MAPPA: 'anime_tv_in_mappa',
    ID_NON_IN_MAPPA: 'id_non_in_mappa',
    MAPPA_NON_PRONTA: 'mappa_non_pronta',
    ID_NON_VALIDO: 'id_non_valido'
});

/**
 * Cosa mettiamo a un id che la mappa **non** dice essere un film: `tv`, e il motivo è che è
 * esattamente quello che la regola a valle fa già (`animeDocsToRows`: `t = 'tv'` quando nessuna
 * prova dice `movie`). Scrivere `tv` non cambia nulla di come viene annotato oggi: cambia solo il
 * *perché*, e diventa una dichiarazione esplicita e verificabile invece di un default silenzioso.
 * Il rischio residuo è dichiarare `tv` su un film che la mappa non conosce — ma è il difetto che
 * già c'è, non uno nuovo: nessuna scrittura può crearlo, può solo renderlo visibile (è il motivo
 * per cui il conteggio di questi casi finisce nel riepilogo invece di passare inosservato).
 */

/**
 * Normalizza il tipo dichiarato. Stessa semantica di `declaredMediaType` in
 * `services/doppiaggi-source/src/anime.js`: solo 'movie'|'tv', tutto il resto non è una
 * dichiarazione. Non accettiamo nient'altro, perché il campo è della fonte e non nostro.
 *
 * @param {*} value
 * @returns {'movie'|'tv'|null}
 */
function normalizeMediaType(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return MEDIA_TYPES.includes(v) ? v : null;
}

/**
 * Il `_id` del documento è l'id TMDB in stringa (il contratto di `anime_airing_state`).
 * @param {object} doc
 * @returns {number|null} null se l'id non è un numero.
 */
function idTmdbDaDoc(doc) {
    if (!doc || typeof doc !== 'object') return null;
    const grezzo = doc._id === null || doc._id === undefined ? '' : String(doc._id).trim();
    if (!/^\d+$/.test(grezzo)) return null;
    const n = Number(grezzo);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Il titolo, per l'elenco: i documenti senza titolo sono comunque elencati con l'id. */
function titoloDaDoc(doc) {
    const t = doc && typeof doc.title === 'string' ? doc.title.trim() : '';
    return t || '(senza titolo)';
}

/**
 * Episodio più alto presente nel documento (0 se non ce n'è). Solo per il controllo incrociato.
 * @param {object} doc
 */
function maxEpisodeNumber(doc) {
    let max = 0;
    for (const ep of Array.isArray(doc && doc.episodes) ? doc.episodes : []) {
        const n = Number(ep && ep.episode);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
}

/**
 * IL CUORE: che tipo ha questo documento, e che cosa ne facciamo.
 *
 * Funzione pura salvo lo store, che è iniettato — è questo che rende il contratto testabile senza
 * rete e senza Mongo (vedi `tests/backfillMediatypeAnime.test.js`).
 *
 * L'ordine dei controlli non è decorativo: prima "ha già il campo", perché un documento che
 * dichiara il tipo non è un nostro problema; poi "la mappa è pronta", perché una mappa scarica
 * risponde `null` a tutto e `null` significa "film" in aria; e solo dopo si guarda l'id.
 *
 * @param {object} doc Documento grezzo di `anime_airing_state`.
 * @param {{isReady?: boolean, resolveKitsuMovie?: Function, isAnimeTmdbId?: Function}} mappingStore
 * @returns {{azione: string, motivo: string, tmdbId: number|null, titolo: string, dichiarato: string|null,
 *            da: string|null, a: string|null, maxEpisodi: number}}
 */
function decideMediaType(doc, mappingStore) {
    const tmdbId = idTmdbDaDoc(doc);
    const titolo = titoloDaDoc(doc);
    const dichiarato = normalizeMediaType(doc && doc.mediaType);
    const base = { tmdbId, titolo, dichiarato, maxEpisodi: maxEpisodeNumber(doc) };

    // 1. La fonte ha già parlato. Non si tocca: `mediaType` è la sua dichiarazione e questo script
    //    non è più `anime-source`. Nota che conta: i 57 documenti che lo hanno oggi (tutti `tv`)
    //    escono di qui senza una sola scrittura.
    if (dichiarato) {
        return { ...base, azione: AZIONI.LASCIA, motivo: MOTIVI.GIA_DICHIARATO, da: dichiarato, a: dichiarato };
    }

    // 2. Il campo c'è ma non è un tipo. Non è una dichiarazione (a valle vale come assente), ma non
    //    lo si sovrascrive: può essere roba di una versione futura del contratto, e cancellare un
    //    campo che non abbiamo scritto noi è l'unico modo di perdere informazione qui.
    if (doc && doc.mediaType !== null && doc.mediaType !== undefined) {
        return { ...base, azione: AZIONI.LASCIA, motivo: MOTIVI.CAMPO_NON_VALIDO, da: null, a: null };
    }

    if (!tmdbId) {
        return { ...base, azione: AZIONI.LASCIA, motivo: MOTIVI.ID_NON_VALIDO, da: null, a: null };
    }

    // 3. La mappa è pronta? Se no, nessuna decisione (vedi il blocco in testa al file).
    if (!mappingStore || mappingStore.isReady !== true ||
        typeof mappingStore.resolveKitsuMovie !== 'function' ||
        typeof mappingStore.isAnimeTmdbId !== 'function') {
        return { ...base, azione: AZIONI.BLOCCA, motivo: MOTIVI.MAPPA_NON_PRONTA, da: null, a: null };
    }

    // 4. È un film? Lo dice la mappa certificata, non un indovinello sugli episodi.
    const kitsuMovie = mappingStore.resolveKitsuMovie(tmdbId);
    if (kitsuMovie !== null && kitsuMovie !== undefined && kitsuMovie !== '') {
        return { ...base, azione: AZIONI.SCRIVI, motivo: MOTIVI.FILM_IN_MAPPA, da: null, a: 'movie' };
    }

    // 5. Non è un film. Se la mappa conosce l'id come anime, è una serie: `tv`, detto per quello
    //    che è. Se non lo conosce, `tv` lo stesso ma con un motivo diverso — i due casi non si
    //    confondono, perché il secondo è una lacuna della mappa e va contato.
    const noto = mappingStore.isAnimeTmdbId(tmdbId) === true;
    return {
        ...base,
        azione: AZIONI.SCRIVI,
        motivo: noto ? MOTIVI.ANIME_TV_IN_MAPPA : MOTIVI.ID_NON_IN_MAPPA,
        da: null,
        a: 'tv'
    };
}

/** Contatore vuoto per un piano (così i numeri ci sono sempre, anche a zero). */
function pianoVuoto() {
    return {
        totale: 0,
        giaDichiarati: { movie: 0, tv: 0 },
        campoNonValido: 0,
        idNonValido: 0,
        daScrivere: { movie: 0, tv: 0 },
        bloccati: 0,
        perMotivo: {},
        // Controllo incrociato: un `movie` con una corsa di episodi sarebbe una contraddizione.
        filmConCorsaEpisodi: [],
        serieSenzaCorsaEpisodi: 0,
        scritte: [],
        lasciati: [],
        bloccatiLista: []
    };
}

/** Una riga per documento, nell'elenco e nel log: id, titolo, da → a, motivo. */
function rigaVoce(v) {
    const da = v.da || v.dichiarato || '—';
    const a = v.a || '—';
    return `${v.tmdbId === null ? '(id?)' : v.tmdbId} "${v.titolo}" [${da} → ${a}] ${v.motivo} (ep. max ${v.maxEpisodi})`;
}

/**
 * Il piano: cosa farebbe questo script, documento per documento, e i numeri per dirlo a parole.
 *
 * Non scrive niente e non parla con Mongo: dati in, piano fuori. È la parte che il test copre.
 *
 * @param {Array<object>} docs Documenti grezzi.
 * @param {object} mappingStore
 * @returns {object} piano
 */
function pianoDaDocumenti(docs, mappingStore) {
    const piano = pianoVuoto();
    for (const doc of Array.isArray(docs) ? docs : []) {
        piano.totale++;
        const v = decideMediaType(doc, mappingStore);
        piano.perMotivo[v.motivo] = (piano.perMotivo[v.motivo] || 0) + 1;

        if (v.azione === AZIONI.BLOCCA) {
            piano.bloccati++;
            if (piano.bloccatiLista.length < 20) piano.bloccatiLista.push(rigaVoce(v));
            continue;
        }

        if (v.motivo === MOTIVI.GIA_DICHIARATO) {
            piano.giaDichiarati[v.dichiarato] = (piano.giaDichiarati[v.dichiarato] || 0) + 1;
            if (piano.lasciati.length < 20) piano.lasciati.push(rigaVoce(v));
            continue;
        }

        if (v.motivo === MOTIVI.CAMPO_NON_VALIDO) {
            piano.campoNonValido++;
            if (piano.lasciati.length < 20) piano.lasciati.push(rigaVoce(v));
            continue;
        }

        if (v.motivo === MOTIVI.ID_NON_VALIDO) {
            piano.idNonValido++;
            if (piano.lasciati.length < 20) piano.lasciati.push(rigaVoce(v));
            continue;
        }

        // Da qui in poi il documento è nostro: lo scriviamo.
        piano.daScrivere[v.a] = (piano.daScrivere[v.a] || 0) + 1;
        if (v.a === 'movie' && v.maxEpisodi > MOVIE_MAX_EPISODES) {
            piano.filmConCorsaEpisodi.push(rigaVoce(v));
        }
        if (v.a === 'tv' && v.maxEpisodi > 0 && v.maxEpisodi <= MOVIE_MAX_EPISODES) {
            piano.serieSenzaCorsaEpisodi++;
        }
        piano.scritte.push({ _id: String(doc._id).trim(), tmdbId: v.tmdbId, titolo: v.titolo, a: v.a, motivo: v.motivo, maxEpisodi: v.maxEpisodi });
    }
    return piano;
}

/**
 * Il riepilogo, tutto in un pezzo di testo: i numeri che il mandato chiede di portare a casa.
 * @param {object} piano
 */
function riepilogo(piano) {
    const daScrivereTotale = (piano.daScrivere.movie || 0) + (piano.daScrivere.tv || 0);
    const giaTotale = (piano.giaDichiarati.movie || 0) + (piano.giaDichiarati.tv || 0);
    // "Restano senza" = dopo il giro non avranno un tipo che a valle venga riconosciuto. Ci
    // finiscono anche il campo non valido e i bloccati, ed è per questo che le tre righe sotto
    // dicono chi sono: un numero solo, senza le sue tre righe, sarebbe una bugia di comodo.
    const restanoSenza = piano.totale - giaTotale - daScrivereTotale;
    const L = [];
    L.push('─'.repeat(72));
    L.push(`[Backfill mediaType] documenti letti: ${piano.totale}`);
    L.push(`  col campo già dichiarato (NON si toccano): ${giaTotale}  → movie ${piano.giaDichiarati.movie || 0}, tv ${piano.giaDichiarati.tv || 0}`);
    L.push(`  da riempire con la mappa certificata:      ${daScrivereTotale}  → movie ${piano.daScrivere.movie || 0}, tv ${piano.daScrivere.tv || 0}`);
    L.push(`  restano senza mediaType dopo il giro:     ${restanoSenza}`);
    L.push(`  campo presente ma non valido (lasciati):  ${piano.campoNonValido}`);
    L.push(`  id non valido (lasciati):                 ${piano.idNonValido}`);
    L.push(`  bloccati (mappa non pronta):              ${piano.bloccati}`);
    const motivi = Object.keys(piano.perMotivo).sort();
    if (motivi.length) {
        L.push(`  per motivo: ${motivi.map((m) => `${m}=${piano.perMotivo[m]}`).join(', ')}`);
    }
    L.push(`  controllo incrociato: movie con corsa di episodi (> ${MOVIE_MAX_EPISODES}) = ${piano.filmConCorsaEpisodi.length}, tv con 1-3 episodi = ${piano.serieSenzaCorsaEpisodi}`);
    L.push('─'.repeat(72));
    return L.join('\n');
}

/**
 * Le voci da stampare: i film per primi (sono il motivo per cui lo script esiste), poi un po' di
 * `tv`, così l'elenco dice anche cosa NON succede. `sample` è un tetto, non un conto esatto.
 *
 * @param {object} piano
 * @param {number} sample
 * @returns {string[]} righe
 */
function righeCampione(piano, sample = 20) {
    const righe = [];
    const film = piano.scritte.filter((s) => s.a === 'movie');
    const serie = piano.scritte.filter((s) => s.a === 'tv');
    const nFilm = Math.min(film.length, Math.ceil(sample / 2));
    for (const s of film.slice(0, nFilm)) {
        righe.push(`  ${s._id} "${s.titolo}" → movie  (${s.motivo}, ep. max ${s.maxEpisodi})`);
    }
    const nSerie = Math.max(0, sample - righe.length);
    for (const s of serie.slice(0, nSerie)) {
        righe.push(`  ${s._id} "${s.titolo}" → tv  (${s.motivo}, ep. max ${s.maxEpisodi})`);
    }
    if (film.length > nFilm) righe.push(`  … e altri ${film.length - nFilm} film`);
    if (serie.length > nSerie) righe.push(`  … e altri ${serie.length - nSerie} serie`);
    return righe;
}

/** Cerca i documenti senza tipo già dichiarato, con la proiezione minima. */
const PROIEZIONE = {
    _id: 1,
    schemaVersion: 1,
    title: 1,
    mediaType: 1,
    episodes: 1
};

/**
 * Applica il piano. Ogni scrittura è condizionata all'assenza del campo: un documento che nel
 * frattempo l'ha ricevuto dalla fonte non viene sovrascritto (`matchedCount === 0`).
 *
 * @param {object} collection Collection Mongo.
 * @param {Array<object>} scritte Voci del piano.
 * @param {{log?: Function}} [opts]
 * @returns {Promise<{applicati: number, saltati: number, errori: number}>}
 */
async function applicaPiano(collection, scritte, opts = {}) {
    const log = opts.log || console.log;
    let applicati = 0, saltati = 0, errori = 0;
    for (const s of scritte) {
        try {
            const res = await collection.updateOne(
                { _id: s._id, mediaType: { $exists: false } },
                { $set: { mediaType: s.a } }
            );
            if (!res || res.matchedCount === 0) {
                saltati++;
                log(`[Backfill mediaType] ${s._id} "${s.titolo}" saltato: il campo c'è già (o il doc non c'è più).`);
                continue;
            }
            applicati += Number(res.modifiedCount) || 1;
        } catch (err) {
            errori++;
            log(`[Backfill mediaType] ${s._id} "${s.titolo}" ERRORE: ${err.message}`);
        }
    }
    return { applicati, saltati, errori };
}

/**
 * Le opzioni. `--flag` e `--flag=valore` contano come la stessa cosa, come nei sibling.
 * @param {string[]} argv
 */
function parseArgs(argv = []) {
    const opts = {
        apply: false,
        help: false,
        env: null,
        mongoUri: null,
        dbName: null,
        limit: null,
        sample: 20,
        timeoutMs: 20000
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const eq = arg.indexOf('=');
        const flag = eq === -1 ? arg : arg.slice(0, eq);
        const inline = eq === -1 ? null : arg.slice(eq + 1);
        const valore = () => (inline !== null ? inline : (argv[i + 1] !== undefined ? argv[++i] : null));

        if (arg === '--help' || arg === '-h') opts.help = true;
        else if (flag === '--apply') opts.apply = true;
        else if (flag === '--env') opts.env = valore('--env');
        else if (flag === '--mongo-uri') opts.mongoUri = valore('--mongo-uri');
        else if (flag === '--db') opts.dbName = valore('--db');
        else if (flag === '--limit') opts.limit = Number(valore('--limit'));
        else if (flag === '--sample') opts.sample = Number(valore('--sample'));
        else if (arg.startsWith('-')) throw new Error(`Opzione sconosciuta: ${arg}`);
    }
    if (opts.limit !== null && (!Number.isFinite(opts.limit) || opts.limit < 0)) {
        throw new Error(`--limit non è un numero: ${opts.limit}`);
    }
    if (!Number.isFinite(opts.sample) || opts.sample < 0) {
        throw new Error(`--sample non è un numero: ${opts.sample}`);
    }
    return opts;
}

/**
 * Dov'è il `.env`. `--env` prima; poi il `.env` più vicino in su (il checkout in cui si è lanciato);
 * e infine i due posti in cui questo repo vive davvero: il checkout principale è **fratello dei
 * worktree**, non antenato, e senza questa riga uno script lanciato da un worktree non troverebbe
 * mai l'URI e direbbe "manca MONGODB_URI" su un checkout che ce l'ha.
 *
 * Il file non viene mai copiato: si legge e si sta zitti.
 *
 * @param {string|null] esplicito
 * @returns {string|null}
 */
function trovaEnv(esplicito = null) {
    if (esplicito) {
        const p = path.resolve(esplicito);
        if (!fs.existsSync(p)) throw new Error(`--env: file non trovato: ${p}`);
        return p;
    }
    if (process.env.MONGODB_URI) return null; // l'ambiente è già armato: non serve nessun file

    let dir = __dirname;
    while (true) {
        const cand = path.join(dir, '.env');
        if (fs.existsSync(cand)) return cand;
        const padre = path.dirname(dir);
        if (padre === dir) break;
        dir = padre;
    }
    const parenti = [
        path.resolve(__dirname, '..', '..', '..', 'YACA', '.env'),
        path.resolve(__dirname, '..', '..', 'YACA', '.env')
    ];
    for (const p of parenti) if (fs.existsSync(p)) return p;
    return null;
}

/** Il piano su documenti già letti. Separato da `main` perché il test lo chiama senza Mongo. */
async function caricaStoreMappa(log = console.log) {
    const store = require('../src/data/animeMappingStore');
    if (store.isReady) return store;
    log('[Backfill mediaType] Carico la mappa anime certificata (AniBridge + Fribb)...');
    await store.init();
    if (!store.isReady) {
        throw new Error('Mappa anime non pronta dopo init(): niente viene deciso e niente viene scritto.');
    }
    return store;
}

/**
 * Il corpo. Torna con un codice di uscita: 0 tutto bene, 1 c'è qualcosa che non sta andando
 * (mappa non pronta, scritture fallite, URI mancante). Il silenzio non è mai un successo.
 *
 * @param {string[]} argv
 * @param {{env?: object, store?: object, collection?: object}} [dipendenze]
 *   Test: `env` (senza `MONGODB_URI` lo script esce 1), `store` (mappa iniettata, niente rete)
 *   e `collection` (Mongo finto, niente connessione). In produzione i due non si passano.
 * @returns {Promise<number>}
 */
async function main(argv = process.argv.slice(2), dipendenze = {}) {
    let opts;
    try {
        opts = parseArgs(argv);
    } catch (err) {
        console.error(`[Backfill mediaType] ${err.message}`);
        return 1;
    }

    if (opts.help) {
        console.log(`Uso: node scripts/backfill-mediatype-anime.js [opzioni]
Opzioni:
  --apply            scrive davvero (default: DRY-RUN, nessuna scrittura)
  --env=PERCORSO     .env da leggere (default: il più vicino, poi il checkout principale)
  --mongo-uri=URI    connessione esplicita, ha precedenza su MONGODB_URI
  --db=NOME          nome del database (default: dalla URI)
  --limit=N          scrive i primi N (con --apply)
  --sample=N         quante voci stampare nell'elenco (default: 20)
  -h, --help         questo messaggio`);
        return 0;
    }

    const iniettato = Boolean(dipendenze.store || dipendenze.collection);
    const envPath = iniettato ? null : trovaEnv(opts.env);
    const env = dipendenze.env || process.env;
    if (!iniettato && envPath) {
        require('dotenv').config({ path: envPath });
        console.log(`[Backfill mediaType] .env: ${envPath}`);
    }

    const uri = opts.mongoUri || env.MONGODB_URI || env.MONGO_URI || null;
    if (!uri && !dipendenze.collection) {
        console.error('[Backfill mediaType] MONGODB_URI non trovata: passo --env=/percorso/.env (o --mongo-uri).');
        return 1;
    }

    console.log(`[Backfill mediaType] MODALITÀ: ${opts.apply ? '⚠️  APPLICAZIONE (scrive)' : '🔍 DRY-RUN (non scrive nulla)'}`);

    // 1. La mappa prima di tutto: senza mappa non c'è una decisione, solo un'uscita 1.
    let store = dipendenze.store || null;
    if (!store) {
        try {
            store = await caricaStoreMappa();
        } catch (err) {
            console.error(`[Backfill mediaType] ${err.message}`);
            return 1;
        }
    }

    // 2. I documenti. Lettura e basta: il driver nativo sulla connessione mongoose è quello che
    //    usa anche `src/data/animeAiringState.js`, e qui non si definisce nessun model (gli `_id`
    //    sono stringa e nessun casting serve).
    let mongoose;
    let collection = dipendenze.collection || null;
    let connessioneAperta = false;
    try {
        if (!collection) {
            mongoose = require('mongoose');
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                collection = mongoose.connection.db.collection(COLLECTION_NAME);
            } else {
                await mongoose.connect(uri, { serverSelectionTimeoutMS: opts.timeoutMs });
                connessioneAperta = true;
                collection = mongoose.connection.db.collection(COLLECTION_NAME);
            }
        }
    } catch (err) {
        console.error(`[Backfill mediaType] Connessione Mongo fallita: ${err.message}`);
        return 1;
    }

    try {
        const docs = await collection.find({}, { projection: PROIEZIONE }).toArray();
        console.log(`[Backfill mediaType] ${docs.length} documenti in ${COLLECTION_NAME}.`);

        const piano = pianoDaDocumenti(docs, store);
        console.log(riepilogo(piano));

        if (piano.filmConCorsaEpisodi.length) {
            console.warn(`[Backfill mediaType] ATTENZIONE: ${piano.filmConCorsaEpisodi.length} documenti che la mappa dice film hanno una corsa di episodi:`);
            for (const r of piano.filmConCorsaEpisodi.slice(0, 10)) console.warn(`  ${r}`);
        }

        const campione = righeCampione(piano, opts.sample);
        if (campione.length) {
            console.log(`[Backfill mediaType] Primi casi (${campione.length}):`);
            for (const r of campione) console.log(r);
        }
        if (piano.lasciati.length) {
            console.log('[Backfill mediaType] Primi documenti già dichiarati / non toccati:');
            for (const r of piano.lasciati) console.log(`  ${r}`);
        }

        if (piano.bloccati > 0) {
            console.error(`[Backfill mediaType] ${piano.bloccati} documenti non decisi (mappa non pronta): niente scritto.`);
            for (const r of piano.bloccatiLista) console.error(`  ${r}`);
            return 1;
        }

        if (!opts.apply) {
            const daScrivere = piano.scritte.length;
            console.log(`[Backfill mediaType] DRY-RUN: ${daScrivere} documenti prenderebbero il tipo. Nessuna scrittura eseguita.`);
            return 0;
        }

        const daScrivere = opts.limit && opts.limit > 0 ? piano.scritte.slice(0, opts.limit) : piano.scritte;
        if (opts.limit && opts.limit > 0 && opts.limit < piano.scritte.length) {
            console.log(`[Backfill mediaType] --limit=${opts.limit}: scrivo i primi ${daScrivere.length} di ${piano.scritte.length}.`);
        }
        console.log(`[Backfill mediaType] Scrivo ${daScrivere.length} documenti (filtro: il campo non deve esistere).`);
        const esito = await applicaPiano(collection, daScrivere);
        console.log(`[Backfill mediaType] Scritti ${esito.applicati}, saltati ${esito.saltati}, errori ${esito.errori}.`);
        return esito.errori > 0 ? 1 : 0;
    } finally {
        if (connessioneAperta && mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect().catch(() => {});
        }
    }
}

if (require.main === module) {
    main().then((codice) => { process.exitCode = codice; });
}

module.exports = {
    COLLECTION_NAME,
    MEDIA_TYPES,
    MOVIE_MAX_EPISODES,
    AZIONI,
    MOTIVI,
    PROIEZIONE,
    normalizeMediaType,
    idTmdbDaDoc,
    maxEpisodeNumber,
    decideMediaType,
    pianoDaDocumenti,
    pianoVuoto,
    riepilogo,
    righeCampione,
    rigaVoce,
    applicaPiano,
    parseArgs,
    trovaEnv,
    main
};