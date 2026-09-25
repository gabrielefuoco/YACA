/**
 * src/utils/dnaRarity.js
 *
 * Anti-flat DNA utilities:
 * 1. computeTimeDecay: decadimento temporale half-life (default 24 mesi).
 * 2. applyLogSaturation: saturazione logaritmica per chiave (rendimenti decrescenti).
 * 3. applySoftRarity: rarità dolce (soglia minima df, esponente ridotto, tetto al peso).
 */

const N_DOCS_DEFAULT = 100000;
const DF_MIN_DEFAULT = 15;
const RARITY_ALPHA = 0.35;
const RARITY_MAX_WEIGHT = 1.80;
const COMMON_DF_REF = 30000; // riferimento genere/keyword comune

// Cache in-memory delle frequenze (k -> df)
let globalDfCache = null;

function setGlobalDfCache(cache) {
    globalDfCache = cache;
}

function getGlobalDfCache() {
    return globalDfCache;
}

/**
 * Calcola il fattore di decadimento esponenziale half-life per un segnale.
 * @param {Date|string|number} date Data dell'interazione
 * @param {number} now Timestamp di riferimento (default Date.now())
 * @param {number} halfLifeMonths Emivita in mesi (default 24 mesi)
 * @returns {number} Moltiplicatore in (0, 1]
 */
function computeTimeDecay(date, now = Date.now(), halfLifeMonths = 24) {
    if (!date) return 1.0;
    const t = new Date(date).getTime();
    if (isNaN(t) || t >= now) return 1.0;
    const diffMonths = Math.max(0, (now - t) / (1000 * 60 * 60 * 24 * 30.4375));
    const factor = Math.pow(0.5, diffMonths / halfLifeMonths);
    return Math.max(0.01, factor);
}

/**
 * Applica la saturazione logaritmica a un vettore per prevenire
 * che i gusti dominanti schiaccino i nuovi interessi.
 * f(x) = scale * ln(1 + x / scale)
 * @param {Record<string, number>} vector
 * @param {number} scale
 * @returns {Record<string, number>}
 */
function applyLogSaturation(vector, scale = 100) {
    if (!vector || typeof vector !== 'object') return {};
    const result = {};
    for (const [key, val] of Object.entries(vector)) {
        const num = Number(val) || 0;
        if (num <= 0) continue;
        result[key] = Math.log(1 + (num / scale)) * scale;
    }
    return result;
}

/**
 * Calcola il moltiplicatore di rarità dolce per una data chiave.
 * - soglia minima df = 15 per evitare rumore su keyword spurie
 * - esponente ridotto alpha = 0.35
 * - tetto massimo cap = 1.80
 * @param {string} key Chiave DNA (es. 'g:28', 'k:123', 'L1:c_1')
 * @param {Map<string, number>|Record<string, number>|null} dfMap Mappa df opzionale
 * @returns {number} Moltiplicatore dolce in [1.0, 1.80]
 */
function getSoftRarityMultiplier(key, dfMap = null) {
    const map = dfMap || globalDfCache;
    let df = null;

    if (map) {
        if (map instanceof Map) df = map.get(key);
        else if (typeof map === 'object') df = map[key];
    }

    // Se df non è noto, usa stime prudenti per tipo di prefisso
    if (df === undefined || df === null) {
        if (key.startsWith('g:')) df = 20000;       // generi sono molto frequenti
        else if (key.startsWith('o:')) df = 15000;   // paesi di origine frequenti
        else if (key.startsWith('L5:')) df = 50000;
        else if (key.startsWith('L4:')) df = 20000;
        else if (key.startsWith('L3:')) df = 5000;
        else if (key.startsWith('L2:')) df = 1500;
        else if (key.startsWith('L1:')) df = 400;
        else if (key.startsWith('k:')) df = 150;     // keyword media
        else df = 500;
    }

    const dfNum = Number(df) || DF_MIN_DEFAULT;
    const effectiveDf = Math.max(DF_MIN_DEFAULT, dfNum);

    const idfCommon = Math.log(1 + (N_DOCS_DEFAULT / COMMON_DF_REF));
    const idfCurrent = Math.log(1 + (N_DOCS_DEFAULT / effectiveDf));

    const ratio = Math.max(1.0, idfCurrent / idfCommon);
    const softMultiplier = Math.pow(ratio, RARITY_ALPHA);

    return Math.min(RARITY_MAX_WEIGHT, Math.max(1.0, softMultiplier));
}

/**
 * Applica la rarità dolce a tutte le chiavi di un vettore.
 * @param {Record<string, number>} vector
 * @param {Map<string, number>|Record<string, number>|null} dfMap
 * @returns {Record<string, number>}
 */
function applySoftRarity(vector, dfMap = null) {
    if (!vector || typeof vector !== 'object') return {};
    const result = {};
    for (const [key, val] of Object.entries(vector)) {
        const num = Number(val) || 0;
        if (num <= 0) continue;
        const rarityMult = getSoftRarityMultiplier(key, dfMap);
        result[key] = num * rarityMult;
    }
    return result;
}

module.exports = {
    computeTimeDecay,
    applyLogSaturation,
    getSoftRarityMultiplier,
    applySoftRarity,
    setGlobalDfCache,
    getGlobalDfCache,
    DF_MIN_DEFAULT,
    RARITY_MAX_WEIGHT,
    RARITY_ALPHA
};
