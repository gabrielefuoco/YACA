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
 * Converte documenti anime in righe di annotazione { t, id, ita: true }.
 *
 * Risoluzione t ('tv' vs 'movie'):
 * - Se `tvIds` contiene l'id -> t = 'tv' (anche se presente in movie: è la serie anime TV)
 * - Se `tvIds` non contiene l'id ma `movieIds` lo contiene -> t = 'movie' (es. Kimi no Na wa, Tenki no Ko)
 * - Se non presente in nessuno dei due (o set non forniti) -> t = 'tv' (default serie TV)
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
        let t = 'tv';
        if (tvIds && movieIds) {
            if (!tvIds.has(numId) && movieIds.has(numId)) {
                t = 'movie';
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
            const docs = await opts.collection.find({}).toArray();
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
            projection: {
                _id: 1,
                schemaVersion: 1,
                title: 1,
                dub: 1,
                italian: 1,
                episodes: 1
            }
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
    SUPPORTED_SCHEMA_VERSION,
    getDubEpisode,
    isAnimeDubbed,
    animeDocsToRows,
    fetchAnimeAiringDocs,
    loadAnimeDubbedRows
};
