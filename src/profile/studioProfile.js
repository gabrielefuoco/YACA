/**
 * studioProfile.js
 *
 * Distribuzione degli studi di produzione (case di produzione e, per le serie,
 * network) presenti nella libreria dell'utente.
 *
 * Nasce dalla richiesta "nel DNA voglio solo categorie utili": i generi arrivano
 * dal vettore DNA, gli studi da questo profilo. Gli studi restano volutamente
 * FUORI dal vettore DNA, così non influenzano punteggi e cataloghi.
 *
 * Tutto in locale: legge il parquet DuckDB e la libreria su Mongo, nessuna
 * chiamata a TMDB.
 */

const duckDbStore = require('../db/duckDbStore');
const UserLibraryItem = require('../db/models/UserLibraryItem');
const animeMappingStore = require('../data/animeMappingStore');

const DEFAULT_LIMIT = 8;

function parseJsonList(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Estrae `{ kind: 'id'|'imdb', value }` da un itemId della libreria. */
function parseLibraryId(rawId) {
    const raw = String(rawId || '').trim();
    if (!raw) return [];

    const candidates = [];
    const imdb = raw.match(/tt\d{5,}/i);
    if (imdb) {
        candidates.push({ kind: 'imdb', value: imdb[0] });
        return candidates;
    }

    const tmdb = raw.match(/tmdb:\s*(\d+)/i);
    if (tmdb) {
        candidates.push({ kind: 'id', value: tmdb[1] });
        return candidates;
    }

    // `tmdb: 12477 ` (formati legacy con spazi) e id numerici puri
    const numeric = raw.match(/^(\d+)$/);
    if (numeric) {
        candidates.push({ kind: 'id', value: numeric[1] });
        return candidates;
    }

    const kitsu = raw.match(/kitsu:\s*(\d+)/i);
    if (kitsu) {
        const tmdbId = animeMappingStore.kitsuToTmdb?.get(String(kitsu[1]));
        if (tmdbId) candidates.push({ kind: 'id', value: String(tmdbId) });
        return candidates;
    }

    return candidates;
}

async function fetchRows(table, { ids = [], imdbIds = [] }) {
    if (ids.length === 0 && imdbIds.length === 0) return [];

    const where = [];
    const quote = (list) => list.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
    if (ids.length > 0) where.push(`CAST(id AS VARCHAR) IN (${quote(ids)})`);
    if (imdbIds.length > 0) where.push(`imdb_id IN (${quote(imdbIds)})`);

    const networksColumn = table === 'tv' ? ', networks' : '';
    const sql = `SELECT CAST(id AS VARCHAR) AS id, imdb_id, production_companies${networksColumn} FROM ${table} WHERE ${where.join(' OR ')}`;

    try {
        return await duckDbStore.query(sql);
    } catch (err) {
        return [];
    }
}

/**
 * Calcola la distribuzione degli studi della libreria.
 *
 * @param {string} addonUuid
 * @param {{ limit?: number }} options
 * @returns {Promise<Array<{ id: string, name: string, weight: number, type: 'company' }>>}
 */
async function computeStudioProfile(addonUuid, { limit = DEFAULT_LIMIT } = {}) {
    if (!addonUuid) return [];

    const docs = await UserLibraryItem.collection
        .find({ addonUuid, removed: { $ne: true } })
        .toArray();

    if (!docs || docs.length === 0) return [];

    // 1. Raccogliamo le chiavi di ricerca, separate per tabella preferita
    const targets = [];
    for (const doc of docs) {
        const candidates = parseLibraryId(doc.itemId || doc._id);
        if (candidates.length === 0) continue;
        const type = String(doc.type || '').toLowerCase();
        // Le serie (e gli anime) sono per lo più in `tv`; i film in `movies`.
        const tableOrder = (type === 'series' || type === 'anime') ? ['tv', 'movies'] : ['movies', 'tv'];
        targets.push({ candidates, tableOrder });
    }

    if (targets.length === 0) return [];

    // 2. Una sola query per tabella / tipo di chiave
    const collect = (table, kind) => {
        const values = [];
        for (const target of targets) {
            for (const c of target.candidates) {
                if (c.kind === kind) values.push(c.value);
            }
        }
        return Array.from(new Set(values));
    };

    const idsFor = (table) => collect(table, 'id');
    const imdbFor = (table) => collect(table, 'imdb');

    const [movieRows, tvRows] = await Promise.all([
        fetchRows('movies', { ids: idsFor('movies'), imdbIds: imdbFor('movies') }),
        fetchRows('tv', { ids: idsFor('tv'), imdbIds: imdbFor('tv') })
    ]);

    const indexRows = (rows) => {
        const byId = new Map();
        const byImdb = new Map();
        for (const row of rows || []) {
            if (row?.id !== undefined && row?.id !== null) byId.set(String(row.id), row);
            if (row?.imdb_id) byImdb.set(String(row.imdb_id), row);
        }
        return { byId, byImdb };
    };

    const tables = { movies: indexRows(movieRows), tv: indexRows(tvRows) };

    // 3. Aggrega gli studi (nome normalizzato per evitare doppioni di maiuscole)
    const counts = new Map();
    const displayNames = new Map();
    let analyzed = 0;

    for (const target of targets) {
        let row = null;
        for (const table of target.tableOrder) {
            for (const candidate of target.candidates) {
                const index = candidate.kind === 'imdb' ? tables[table]?.byImdb : tables[table]?.byId;
                const found = index?.get(String(candidate.value));
                if (found) { row = found; break; }
            }
            if (row) break;
        }
        if (!row) continue;
        analyzed += 1;

        const studios = [
            ...parseJsonList(row.production_companies),
            ...parseJsonList(row.networks)
        ];
        const seen = new Set();
        for (const studio of studios) {
            const name = typeof studio?.name === 'string' ? studio.name.trim() : '';
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue; // un item conta una volta per studio
            seen.add(key);
            counts.set(key, (counts.get(key) || 0) + 1);
            if (!displayNames.has(key)) displayNames.set(key, name);
        }
    }

    if (counts.size === 0) return [];

    const max = Math.max(...counts.values());
    if (max <= 0) return [];

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([key, count], index) => ({
            id: `studio_${index}`,
            name: displayNames.get(key) || key,
            weight: Math.round((count / max) * 100), // 100 = studio più presente
            type: 'company'
        }));
}

module.exports = { computeStudioProfile, parseLibraryId };
