/**
 * annotations.js
 * Gestione e unione delle annotazioni doppiaggio ITA.
 *
 * Contratto:
 * - chiave (t, id)
 * - precedenza: true > null > assente
 * - non declassa mai un true
 * - ordinamento stabile (t, id)
 */

const fs = require('fs');
const readline = require('readline');

/**
 * Normalizza una singola riga o record di annotazione.
 * Restituisce { t: 'movie'|'tv', id: number, ita: true|null } oppure null se assente / non valida.
 * @param {object|string} item
 * @returns {{ t: 'movie'|'tv', id: number, ita: true|null } | null}
 */
function parseAnnotationRow(item) {
    if (!item) return null;
    let obj = item;
    if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return null;
        try {
            obj = JSON.parse(trimmed);
        } catch (_) {
            return null;
        }
    }

    if (!obj || (obj.ita !== true && obj.ita !== null)) {
        return null; // assente o false non entra nel file
    }

    let t = obj.t;
    let numericId = null;

    if (obj.id !== undefined && obj.id !== null) {
        if (typeof obj.id === 'string' && obj.id.includes(':')) {
            const parts = obj.id.split(':');
            numericId = Number(parts[parts.length - 1]);
            if (parts[1] === 'movie' || parts[1] === 'tv') {
                t = parts[1];
            }
        } else {
            numericId = Number(obj.id);
        }
    }

    if (!t && obj.type) {
        t = obj.type === 'movie' ? 'movie' : 'tv';
    } else if (t === 'series') {
        t = 'tv';
    }

    if ((t !== 'movie' && t !== 'tv') || !Number.isFinite(numericId)) {
        return null;
    }

    return {
        t,
        id: numericId,
        ita: obj.ita === true ? true : null
    };
}

/**
 * Unisce due insiemi di righe di annotazioni.
 * Precedenza per chiave (t, id): true > null > assente.
 * Non declassa mai un true.
 *
 * @param {Array<object>} base Righe di base (es. dal file esistente)
 * @param {Array<object>} extra Righe aggiuntive (es. nuove risoluzioni)
 * @returns {Array<{ t: 'movie'|'tv', id: number, ita: true|null }>} Array ordinato stabile per (t, id)
 */
function mergeAnnotationRows(base = [], extra = []) {
    const map = new Map();

    function addRow(r) {
        const parsed = parseAnnotationRow(r);
        if (!parsed) return;
        const key = `${parsed.t}:${parsed.id}`;
        if (!map.has(key)) {
            map.set(key, parsed);
        } else {
            const existing = map.get(key);
            // Precedenza: true > null. Non declassa mai un true.
            if (existing.ita !== true && parsed.ita === true) {
                existing.ita = true;
            }
        }
    }

    for (const r of base || []) {
        addRow(r);
    }
    for (const r of extra || []) {
        addRow(r);
    }

    const rows = Array.from(map.values());
    rows.sort((x, y) => (x.t === y.t ? x.id - y.id : x.t < y.t ? -1 : 1));
    return rows;
}

/**
 * Legge le righe di annotazioni da un file NDJSON.
 * @param {string} filePath
 * @returns {Promise<Array<{ t: 'movie'|'tv', id: number, ita: true|null }>>}
 */
async function readAnnotationRows(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return [];
    }

    const rows = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const parsed = parseAnnotationRow(line);
        if (parsed) {
            rows.push(parsed);
        }
    }

    return rows;
}

module.exports = {
    parseAnnotationRow,
    mergeAnnotationRows,
    readAnnotationRows
};
