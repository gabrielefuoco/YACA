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
    const removedEntry = entries.length !== Object.keys(vector).length;
    if (!removedEntry) return { ...vector };

    const sanitized = Object.fromEntries(entries);
    const total = Object.values(sanitized).reduce((sum, value) => {
        const numeric = Number(value);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);

    if (total <= 0) return sanitized;
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
    sanitizeDnaVector
};
