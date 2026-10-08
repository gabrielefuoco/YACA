// TMDB v3 `/keyword/{id}` e `/keyword/{id}/movies|tv` restituiscono 404
// per questi ID (verifica 2026-09-24). Non hanno un nome affidabile nel
// dataset locale: vengono esclusi, senza inventare etichette o pesi negativi.
const RETIRED_TMDB_KEYWORD_IDS = Object.freeze([
    363309,
    364043,
    210086,
    208035
]);

const RETIRED_TMDB_KEYWORD_ID_SET = new Set(RETIRED_TMDB_KEYWORD_IDS);

function normalizeKeywordId(value) {
    const id = value && typeof value === 'object' ? value.id : value;
    if (id === undefined || id === null || id === '') return null;
    const normalized = String(id).trim();
    return /^\d+$/.test(normalized) ? normalized : null;
}

function isRetiredTmdbKeywordId(value) {
    const id = normalizeKeywordId(value);
    return id !== null && RETIRED_TMDB_KEYWORD_ID_SET.has(Number(id));
}

// ============================================================================
// Mappa id <-> nome delle keyword (iniettata dall'esterno).
//
// PERCHÉ ESISTE. Il grafo gerarchico (`hierarchical_graph.json`) è indicizzato
// **per nome**: `kw_to_L1['time travel']`. Il parquet, i preset e ProfileBuilder
// consegnano invece **ID numerici**. Senza questa mappa un id non può raggiungere
// la gerarchia (niente `L1:`-`L5:`), e la ricchezza del DNA finiva per dipendere
// dall'ordine delle richieste nel processo, perché `singleKwCache` usava la stessa
// chiave `id:<id>` sia per l'input oggetto `{id,name}` sia per il solo id:
// misurato sullo stesso titolo, 14 chiavi a freddo e 74 a caldo.
//
// NIENTE I/O QUI: la mappa la costruisce `src/db/duckDbStore.js` con la stessa
// query che già legge tutte le keyword del dump, come per la cache df.
// ============================================================================

let keywordIdToName = null;
let keywordNameToId = null;

const normalizeKeywordName = (value) => {
    if (typeof value !== 'string') return null;
    const clean = value.trim().toLowerCase();
    return clean.length > 0 ? clean : null;
};

/**
 * Inietta le due direzioni della mappa. Chiamata una volta all'avvio dal dump.
 * @param {{ idToName?: Map<string,string>|null, nameToId?: Map<string,string>|null }} maps
 */
function setKeywordNameMaps({ idToName = null, nameToId = null } = {}) {
    keywordIdToName = idToName instanceof Map ? idToName : null;
    keywordNameToId = nameToId instanceof Map ? nameToId : null;
}

/**
 * Nome canonico di una keyword a partire dall'id. Null se la mappa non è
 * caricata o la keyword non è nel dump: chi chiama deve degradare, non inventare.
 * @param {string|number|{id?: string|number}} value
 * @returns {string|null}
 */
function keywordNameForId(value) {
    const id = normalizeKeywordId(value);
    if (id === null || !keywordIdToName) return null;
    return keywordIdToName.get(id) || null;
}

/**
 * Id numerico di una keyword a partire dal nome (forma usata dal grafo).
 * @param {string} value
 * @returns {string|null}
 */
function keywordIdForName(value) {
    const name = normalizeKeywordName(value);
    if (name === null || !keywordNameToId) return null;
    return keywordNameToId.get(name) || null;
}

/** Solo per i test e per chi deve verificare che la mappa sia quella giusta. */
function getKeywordNameMaps() {
    return { idToName: keywordIdToName, nameToId: keywordNameToId };
}

function filterRetiredTmdbKeywords(keywords) {
    if (!Array.isArray(keywords)) return [];
    return keywords.filter(keyword => !isRetiredTmdbKeywordId(keyword));
}

/**
 * Rimuove keyword ritirati dai vettori legacy e rinormalizza solo quando
 * sono stati eliminati dei pesi. I TasteProfile già persistiti restano intatti
 * su Atlas; la sanitizzazione avviene ai confini in-memory.
 */
/**
 * Rimuove keyword ritirati e chiavi delle persone (`a:` cast, `d:` crew) dai vettori
 * legacy e rinormalizza solo quando sono stati eliminati dei pesi. Le persone non
 * devono influenzare il DNA (scelta di prodotto: lo rendevano troppo restrittivo).
 * I TasteProfile già persistiti restano intatti su Atlas; la sanitizzazione avviene
 * ai confini in-memory.
 */
function sanitizeDnaVector(vector) {
    if (!vector || typeof vector !== 'object' || Array.isArray(vector)) return {};

    const entries = Object.entries(vector).filter(([key]) => {
        if (key.startsWith('a:') || key.startsWith('d:')) return false;
        if (!key.startsWith('k:')) return true;
        return !isRetiredTmdbKeywordId(key.slice(2));
    });

    const sanitized = Object.fromEntries(entries);
    const total = Object.values(sanitized).reduce((sum, value) => {
        const numeric = Number(value);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);

    if (total <= 0) return sanitized;
    const removedEntry = entries.length !== Object.keys(vector).length;
    if (!removedEntry && Math.abs(total - 100) < 0.001) return { ...vector };

    const scale = 100 / total;
    return Object.fromEntries(
        Object.entries(sanitized).map(([key, value]) => {
            const numeric = Number(value);
            return [key, Number.isFinite(numeric) ? numeric * scale : value];
        })
    );
}

module.exports = {
    RETIRED_TMDB_KEYWORD_IDS,
    isRetiredTmdbKeywordId,
    filterRetiredTmdbKeywords,
    sanitizeDnaVector,
    setKeywordNameMaps,
    getKeywordNameMaps,
    keywordNameForId,
    keywordIdForName
};
