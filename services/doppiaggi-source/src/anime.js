/**
 * anime.js
 * Recupero e trasformazione degli anime doppiati da MongoDB anime_airing_state.
 *
 * REGOLA DEL DOPPIAGGIO:
 * Identica alla regola implementata nel core di YACA in:
 *   - src/data/animeAiringState.js:593-611 (getDubEpisode)
 *   - src/data/animeAiringState.js:173-174 (estrazione doc.dub da raw.dub || italian.dub.latest)
 *   - src/data/animeAiringState.js:156-163 (validazione schemaVersion <= 1 e tmdbId numerico)
 *
 * Se la logica in src/data/animeAiringState.js cambia, deve essere aggiornata anche qui.
 */

let MongoClient = null;
try {
    MongoClient = require('mongodb').MongoClient;
} catch {
    // Gestito a runtime se mongodb non è disponibile nel path
}

const COLLECTION_NAME = 'anime_airing_state';
const SUPPORTED_SCHEMA_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Sopra questo numero di episodi un documento non può essere un film.
 *
 * Serve perché il tipo NON si può dedurre dal nostro dump tv: quello è **filtrato** (Tier 1), quindi una
 * serie fuori soglia sparisce dal dump e — se lo stesso numero esiste anche come film — il suo id
 * finirebbe annotato come `movie`, cioè un badge ITA su un film che non c'entra.
 * Misurato il 01/10/2026 sui 260 id scritti come `movie`: **30 erano serie** con una corsa di episodi
 * (`Toushou Daimos` 44 ep → *Europa Europa*, `Kyojin no Hoshi` 182 ep, `Chou Denji Robo Combattler V` 54),
 * mentre i film veri hanno **1** episodio (`Akira`, `Porco Rosso`, `Ponyo`). Vedi
 * `../.scratch/doppiaggio-ita/tools/giudice-tipo-film-anime.js`.
 */
const MOVIE_MAX_EPISODES = 3;

/** Tipi che `anime_airing_state` può dichiarare in `mediaType` (vedi `services/anime-source`). */
const MEDIA_TYPES = ['movie', 'tv'];

/**
 * Il tipo **dichiarato** dalla fonte, o `null` se il documento non lo dichiara.
 *
 * Il campo è scritto solo quando la fonte lo dichiara e non è mai inventato
 * (`services/anime-source/src/aggregate.js:251` e `:432`), quindi la sua assenza è
 * informazione: "nessuno ha detto niente", non "serie". Perciò qui non si colma
 * nessun buco e non si deduce nulla: si legge e basta, e un valore non riconosciuto
 * vale come non dichiarato (la regola sui dump resta la risposta).
 *
 * @param {object} doc Documento da anime_airing_state
 * @returns {'movie'|'tv'|null}
 */
function declaredMediaType(doc) {
    if (!doc || typeof doc !== 'object') return null;
    const raw = doc.mediaType;
    if (typeof raw !== 'string') return null;
    const v = raw.trim().toLowerCase();
    return MEDIA_TYPES.includes(v) ? v : null;
}

/**
 * Ritorna l'episodio doppiato più recente dal documento, oppure null se non è doppiato.
 * Legge `dub.episode` o `italian.dub.latest.episode`, con fallback sull'episodio più
 * recente con `dubIta: true` in `episodes[]`.
 *
 * Citazione esatta core YACA:
 * src/data/animeAiringState.js:593-611
 *
 * @param {object} doc Documento da anime_airing_state
 * @returns {number|null} Numero di episodio o null
 */
function getDubEpisode(doc) {
    if (!doc || typeof doc !== 'object') return null;

    // src/data/animeAiringState.js:173-174 e 598-600
    const dub = doc.dub || (doc.italian && doc.italian.dub && doc.italian.dub.latest);
    if (dub && Number.isFinite(dub.episode) && dub.episode > 0) {
        return dub.episode;
    }

    // src/data/animeAiringState.js:601-610
    if (Array.isArray(doc.episodes)) {
        let maxEp = 0;
        for (const ep of doc.episodes) {
            if (ep && ep.dubIta && Number.isFinite(ep.episode) && ep.episode > maxEp) {
                maxEp = ep.episode;
            }
        }
        if (maxEp > 0) return maxEp;
    }

    return null;
}

/**
 * Verifica se un documento di anime_airing_state è doppiato in italiano.
 * @param {object} doc
 * @returns {boolean}
 */
function isAnimeDubbed(doc) {
    return getDubEpisode(doc) !== null;
}

/**
 * Numero di episodio più alto presente nel documento (0 se non c'è nessun episodio numerato).
 * @param {object} doc
 * @returns {number}
 */
function maxEpisodeNumber(doc) {
    if (!doc || !Array.isArray(doc.episodes)) return 0;
    let max = 0;
    for (const ep of doc.episodes) {
        const n = Number(ep && ep.episode);
        if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
}

/**
 * Converte documenti anime in righe di annotazione { t, id, ita: true }.
 *
 * Risoluzione t ('tv' vs 'movie'):
 * 0. **il tipo dichiarato vince**: se il documento porta `mediaType` ('movie'|'tv'), quello è il `t`.
 *    È la dichiarazione della fonte (non un indovinello): *Jin-Roh*, *Totoro*, *Mononoke* sono film e senza
 *    questa riga escono `tv:<id>`, mentre il badge si cerca con `movie:<id>` — cioè non si trova.
 *    Ticket 50 della mappa motore-raccomandazioni. Quando il campo non c'è (i documenti già in produzione,
 *    o le fonti che non dichiarano il tipo) si applica la regola di prima, invariata:
 * 1. **veto degli episodi**: se il documento ha una corsa di episodi (`maxEpisodeNumber > 3`) è una serie,
 *    punto: `t = 'tv'`. Il dump tv non basta a dirlo (è filtrato), la corsa di episodi sì;
 * 2. se l'id **non** è nel dump tv ma **è** in quello film → `t = 'movie'` (es. *Kimi no Na wa*, *Ponyo*);
 * 3. altrimenti → `t = 'tv'` (anche quando l'id non è in nessuno dei due: annotazione in attesa).
 *
 * @param {Array<object>} docs
 * @param {object} [options]
 * @param {Set<number>} [options.tvIds]
 * @param {Set<number>} [options.movieIds]
 * @returns {Array<{t: 'tv'|'movie', id: number, ita: true}>}
 */
function animeDocsToRows(docs, { tvIds = null, movieIds = null } = {}) {
    const rows = [];
    const seen = new Set();

    for (const doc of docs || []) {
        if (!isAnimeDubbed(doc)) continue;

        // src/data/animeAiringState.js:156-159: versione schema
        if (doc.schemaVersion !== undefined && doc.schemaVersion !== null) {
            const ver = Number(doc.schemaVersion);
            if (Number.isFinite(ver) && ver > SUPPORTED_SCHEMA_VERSION) continue;
        }

        // src/data/animeAiringState.js:161-163: id numerico obbligatorio
        const rawId = doc._id === null || doc._id === undefined ? '' : String(doc._id).trim();
        if (!/^\d+$/.test(rawId)) continue;

        const numId = Number(rawId);

        // Il tipo dichiarato dalla fonte è la risposta: la regola sui dump è un ripiego per i
        // documenti che non lo dichiarano (i 954 già scritti), e non deve più avere voce su quelli.
        let t = declaredMediaType(doc);
        if (!t) {
            t = 'tv';
            if (maxEpisodeNumber(doc) <= MOVIE_MAX_EPISODES && tvIds && movieIds) {
                if (!tvIds.has(numId) && movieIds.has(numId)) {
                    t = 'movie';
                }
            }
        }

        const key = `${t}:${numId}`;
        if (!seen.has(key)) {
            seen.add(key);
            rows.push({ t, id: numId, ita: true });
        }
    }

    return rows;
}

/**
 * Campi chiesti a MongoDB per ogni documento.
 *
 * Stessa proiezione per la lettura vera e per le collection mock dei test: altrimenti un mock
 * potrebbe nascondere un campo mancante, ed è successo (`mediaType` non era proiettato, quindi
 * in produzione il tipo dichiarato non arrivava e la riga ripartiva dall'indovinello sui dump).
 */
const DOC_PROJECTION = {
    _id: 1,
    schemaVersion: 1,
    title: 1,
    dub: 1,
    italian: 1,
    episodes: 1,
    mediaType: 1
};

/**
 * Legge i documenti da MongoDB anime_airing_state (sola lettura).
 *
 * @param {object} [opts]
 * @param {string} [opts.mongoUri]
 * @param {string} [opts.dbName]
 * @param {object} [opts.client] Client MongoDB istanziato o mock per test
 * @param {object} [opts.collection] Collection MongoDB o mock per test
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok: boolean, docs: Array<object>, error?: string}>}
 */
async function fetchAnimeAiringDocs(opts = {}) {
    if (opts.collection && typeof opts.collection.find === 'function') {
        try {
            const docs = await opts.collection.find({}, { projection: { ...DOC_PROJECTION } }).toArray();
            return { ok: true, docs };
        } catch (err) {
            return { ok: false, docs: [], error: err.message };
        }
    }

    let client = opts.client || null;
    let ownClient = false;

    try {
        if (!client) {
            if (!MongoClient) {
                return {
                    ok: false,
                    docs: [],
                    error: 'Driver "mongodb" non trovato.'
                };
            }
            const uri = opts.mongoUri || process.env.MONGODB_URI || process.env.MONGO_URI;
            if (!uri) {
                return {
                    ok: false,
                    docs: [],
                    error: 'Nessun URI MongoDB configurato (specificare --mongo-uri o variabile MONGODB_URI).'
                };
            }
            const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
            client = new MongoClient(uri, {
                serverSelectionTimeoutMS: timeoutMs,
                connectTimeoutMS: timeoutMs
            });
            ownClient = true;
            await client.connect();
        }

        const db = opts.dbName ? client.db(opts.dbName) : client.db();
        const collection = db.collection(COLLECTION_NAME);

        const docs = await collection.find({}, {
            projection: { ...DOC_PROJECTION }
        }).toArray();

        return { ok: true, docs };
    } catch (err) {
        return { ok: false, docs: [], error: err.message };
    } finally {
        if (ownClient && client && typeof client.close === 'function') {
            try {
                await client.close();
            } catch (_) {}
        }
    }
}

/**
 * Carica gli anime doppiati e restituisce le relative righe di annotazione.
 * Supporta iniezione di fixture offline tramite `opts.docs`.
 *
 * @param {object} [opts]
 * @param {Array<object>} [opts.docs]
 * @param {string} [opts.mongoUri]
 * @param {Set<number>} [opts.tvIds]
 * @param {Set<number>} [opts.movieIds]
 * @returns {Promise<{ok: boolean, rows: Array<object>, count: number, error?: string}>}
 */
async function loadAnimeDubbedRows(opts = {}) {
    if (Array.isArray(opts.docs)) {
        const rows = animeDocsToRows(opts.docs, opts);
        return { ok: true, rows, count: rows.length };
    }

    const res = await fetchAnimeAiringDocs(opts);
    if (!res.ok) {
        return { ok: false, rows: [], count: 0, error: res.error };
    }

    const rows = animeDocsToRows(res.docs, opts);
    return { ok: true, rows, count: rows.length };
}

module.exports = {
    COLLECTION_NAME,
    DOC_PROJECTION,
    SUPPORTED_SCHEMA_VERSION,
    MOVIE_MAX_EPISODES,
    getDubEpisode,
    isAnimeDubbed,
    maxEpisodeNumber,
    declaredMediaType,
    animeDocsToRows,
    fetchAnimeAiringDocs,
    loadAnimeDubbedRows
};
