/**
 * tmdbBudget.js
 * 
 * Regole di spesa, contatori, inventory TTL e gestione cap per le chiamate TMDB.
 * Riferimento: Ticket 38 (Regole di spesa TMDB).
 * 
 * Direttive architetturali:
 * 1. NESSUNA scansione per-item su tutto il DB.
 * 2. Chiamate per-item ammesse ESCLUSIVAMENTE per:
 *    (a) backfill espliciti (daily sync incrementale, cold start controllato, migrazione libreria)
 *    (b) meta al click (dettaglio Stremio al click utente se assente in cache locale/DuckDB)
 *    (c) ricerca live non soddisfatta (autocomplete/search se miss in cache/DuckDB)
 *    (d) episodi (griglia stagioni serie TV con append_to_response a blocchi)
 * 3. Caching obbligatorio con TTL dichiarato per ogni percorso.
 * 4. Cap configurabile con degrado morbido (log warning + skip, MAI eccezioni).
 */

const {
    MOVIE_DETAILS_TTL_MS = 30 * 24 * 60 * 60 * 1000,
    SERIES_ONGOING_TTL_MS = 7 * 24 * 60 * 60 * 1000,
    SERIES_FINISHED_TTL_MS = 60 * 24 * 60 * 60 * 1000,
    SERIES_META_CACHE_TTL_MS = 24 * 60 * 60 * 1000,
    SERIES_META_SWR_MS = 12 * 60 * 60 * 1000
} = require('../config');

/**
 * Categorie ammesse per le chiamate TMDB
 */
const TMDB_CATEGORIES = Object.freeze({
    BACKFILL: 'backfill',         // (a) Daily sync, dump export, cold start, sync libreria utente
    META_CLICK: 'meta_click',     // (b) Dettagli completi al click su singolo item
    SEARCH_LIVE: 'search_live',   // (c) Ricerca live / autocomplete / normalizzazione query AI
    EPISODES: 'episodes',         // (d) Griglia episodi serie TV
    GENERAL: 'general'            // Validazione chiavi, info configurazione TMDB
});

/**
 * Tabella ufficiale dei TTL dichiarati per ogni via di chiamata TMDB
 */
const DECLARED_TTLS = Object.freeze({
    // (b) Meta Details al click
    META_DETAILS_RAM: 24 * 60 * 60 * 1000,              // 24 ore in RAM (tmdbDetailsCache)
    META_DETAILS_DB_MOVIE: MOVIE_DETAILS_TTL_MS,         // 30 giorni persistente (Mongo/DuckDB)
    META_DETAILS_DB_SERIES_ONGOING: SERIES_ONGOING_TTL_MS,   // 7 giorni per serie in corso
    META_DETAILS_DB_SERIES_FINISHED: SERIES_FINISHED_TTL_MS, // 60 giorni per serie concluse
    META_SWR: SERIES_META_SWR_MS,                       // 12 ore stale-while-revalidate

    // (d) Episodi
    EPISODES_RAM: SERIES_META_CACHE_TTL_MS,             // 24 ore in RAM (tvEpisodesCache)
    EPISODES_DB: SERIES_META_CACHE_TTL_MS,              // 24 ore persistente
    EPISODES_SWR: SERIES_META_SWR_MS,                   // 12 ore stale-while-revalidate

    // (c) Ricerca live & normalizzazioni
    SEARCH_ID_NAME: 60 * 60 * 1000,                     // 1 ora (idNameCache per attori/keyword)
    SEARCH_NORMALIZER_RAM: 6 * 60 * 60 * 1000,          // 6 ore (AiQueryNormalizer resolutionCache)
    DNA_NAMES: 30 * 24 * 60 * 60 * 1000,                // 30 giorni (dnaNamesCache)
    IMDB_TO_TMDB: 7 * 24 * 60 * 60 * 1000,              // 7 giorni (imdbIdCache) o permanente su DB
    
    // Protezione anti-hammering
    NEGATIVE_CACHE_404: 24 * 60 * 60 * 1000,            // 24 ore cache negativa per risorse inesistenti
    DAILY_EXPORT_MEMORY: 24 * 60 * 60 * 1000            // 24 ore export gz in memoria nel dump client
});

/**
 * Deduce la categoria ammessa dall'URL o dai parametri della richiesta
 * @param {string} url - URL relativo o assoluto della chiamata TMDB
 * @param {object} [options] - Parametri query o opzioni addizionali
 * @returns {string} Uno dei valori di TMDB_CATEGORIES
 */
function determineCategory(url, options = {}) {
    if (!url || typeof url !== 'string') return TMDB_CATEGORIES.GENERAL;
    const cleanUrl = url.toLowerCase();

    // (d) Episodi serie TV: es. /tv/123/season/1 oppure /tv/123 con append_to_response=season/1
    if (cleanUrl.includes('/season/') || /\/tv\/\d+\/season/i.test(cleanUrl)) {
        return TMDB_CATEGORIES.EPISODES;
    }
    const appendToResponse = options?.params?.append_to_response || '';
    if (typeof appendToResponse === 'string' && appendToResponse.includes('season/')) {
        return TMDB_CATEGORIES.EPISODES;
    }

    // (a) Backfill espliciti: sync changes o download export
    if (cleanUrl.includes('/changes') || cleanUrl.includes('exports/') || cleanUrl.includes('/export')) {
        return TMDB_CATEGORIES.BACKFILL;
    }

    // (c) Ricerca live / normalizzazione / find / lookup ID
    if (cleanUrl.includes('/search/') || 
        cleanUrl.includes('/find/') || 
        cleanUrl.includes('/genre/') || 
        cleanUrl.includes('/keyword/') || 
        cleanUrl.includes('/person/') || 
        cleanUrl.includes('/network/') || 
        cleanUrl.includes('/company/')) {
        return TMDB_CATEGORIES.SEARCH_LIVE;
    }

    // (b) Meta al click: /movie/{id} o /tv/{id}
    if (/\/movie\/\d+/i.test(cleanUrl) || /\/tv\/\d+/i.test(cleanUrl)) {
        return TMDB_CATEGORIES.META_CLICK;
    }

    // Ping / validazione
    if (cleanUrl.includes('/configuration')) {
        return TMDB_CATEGORIES.GENERAL;
    }

    return TMDB_CATEGORIES.GENERAL;
}

class TmdbBudgetTracker {
    constructor(options = {}) {
        // Configurazione Cap
        this.capConfig = {
            enabled: options.enabled ?? (Boolean(process.env.TMDB_CAP_LIMIT) && Number(process.env.TMDB_CAP_LIMIT) > 0),
            limit: options.limit ?? (Number(process.env.TMDB_CAP_LIMIT) || null), // Max chiamate nella finestra (null = illimitato)
            windowMs: options.windowMs ?? (Number(process.env.TMDB_CAP_WINDOW_MS) || 60 * 1000), // Default 1 minuto
            categoryLimits: options.categoryLimits || {}, // es. { search_live: 30, meta_click: 60 }
            softDegradation: options.softDegradation ?? true // Sempre true: log + skip, zero eccezioni
        };

        // Timestamp delle chiamate nella finestra corrente per rate-limiting / cap
        this.windowCalls = []; // Array di { timestamp, category, endpoint }

        // Metriche cumulative
        this.metrics = {
            totalCalls: 0,
            totalSkippedByCap: 0,
            byCategory: {
                [TMDB_CATEGORIES.BACKFILL]: 0,
                [TMDB_CATEGORIES.META_CLICK]: 0,
                [TMDB_CATEGORIES.SEARCH_LIVE]: 0,
                [TMDB_CATEGORIES.EPISODES]: 0,
                [TMDB_CATEGORIES.GENERAL]: 0
            },
            skippedByCategory: {
                [TMDB_CATEGORIES.BACKFILL]: 0,
                [TMDB_CATEGORIES.META_CLICK]: 0,
                [TMDB_CATEGORIES.SEARCH_LIVE]: 0,
                [TMDB_CATEGORIES.EPISODES]: 0,
                [TMDB_CATEGORIES.GENERAL]: 0
            },
            byEndpoint: {},
            lastReset: Date.now()
        };

        // Throttling log per non intasare stdout in caso di cap saturato
        this._lastLogTime = 0;
        this._logThrottleMs = 5000;
    }

    /**
     * Deduce la categoria da URL o parametri
     */
    determineCategory(url, options = {}) {
        return determineCategory(url, options);
    }

    /**
     * Configura o aggiorna i parametri del cap
     * @param {object} cfg
     * @param {number|null} [cfg.limit] - Max chiamate totali per finestra (null per disabilitare cap globale)
     * @param {number} [cfg.windowMs] - Durata della finestra temporale in ms (default 60000ms)
     * @param {object} [cfg.categoryLimits] - Limiti specifici per categoria (es. { search_live: 20 })
     * @param {boolean} [cfg.enabled] - Se true abilita il cap
     * @param {boolean} [cfg.softDegradation] - Se true degrada senza sollevare eccezioni
     */
    configureCap(cfg = {}) {
        if (cfg.limit !== undefined) this.capConfig.limit = cfg.limit;
        if (cfg.windowMs !== undefined) this.capConfig.windowMs = cfg.windowMs;
        if (cfg.categoryLimits !== undefined) this.capConfig.categoryLimits = { ...cfg.categoryLimits };
        if (cfg.enabled !== undefined) this.capConfig.enabled = Boolean(cfg.enabled);
        if (cfg.softDegradation !== undefined) this.capConfig.softDegradation = Boolean(cfg.softDegradation);

        // Se limit è impostato > 0 e non specificato altrimenti, abilita automaticamente
        if (this.capConfig.limit && this.capConfig.limit > 0 && cfg.enabled === undefined) {
            this.capConfig.enabled = true;
        }
    }

    /**
     * Pulisce i timestamp scaduti dalla finestra corrente
     * @private
     */
    _pruneWindow(now) {
        const cutoff = now - this.capConfig.windowMs;
        while (this.windowCalls.length > 0 && this.windowCalls[0].timestamp <= cutoff) {
            this.windowCalls.shift();
        }
    }

    /**
     * Verifica se una chiamata è consentita dal budget/cap
     * @param {string} category - Categoria TMDB
     * @param {string} [endpoint] - Endpoint o URL
     * @returns {{ allowed: boolean, reason?: string, currentCount: number, limit: number|null }}
     */
    checkBudget(category = TMDB_CATEGORIES.GENERAL, endpoint = '') {
        const now = Date.now();
        this._pruneWindow(now);

        if (!this.capConfig.enabled) {
            return { allowed: true, currentCount: this.windowCalls.length, limit: null };
        }

        // 1. Controllo Cap Globale
        if (this.capConfig.limit !== null && this.capConfig.limit > 0) {
            if (this.windowCalls.length >= this.capConfig.limit) {
                this._handleCapExceeded('global', category, endpoint, this.windowCalls.length, this.capConfig.limit);
                return {
                    allowed: false,
                    reason: `Cap globale raggiunto (${this.windowCalls.length}/${this.capConfig.limit} in ${this.capConfig.windowMs}ms)`,
                    currentCount: this.windowCalls.length,
                    limit: this.capConfig.limit
                };
            }
        }

        // 2. Controllo Cap Categoria
        const catLimit = this.capConfig.categoryLimits[category];
        if (typeof catLimit === 'number' && catLimit > 0) {
            const countInCat = this.windowCalls.filter(c => c.category === category).length;
            if (countInCat >= catLimit) {
                this._handleCapExceeded('category', category, endpoint, countInCat, catLimit);
                return {
                    allowed: false,
                    reason: `Cap categoria "${category}" raggiunto (${countInCat}/${catLimit} in ${this.capConfig.windowMs}ms)`,
                    currentCount: countInCat,
                    limit: catLimit
                };
            }
        }

        return { allowed: true, currentCount: this.windowCalls.length, limit: this.capConfig.limit };
    }

    /**
     * Gestisce e logga il superamento del cap con throttling
     * @private
     */
    _handleCapExceeded(scope, category, endpoint, current, limit) {
        this.metrics.totalSkippedByCap += 1;
        if (this.metrics.skippedByCategory[category] !== undefined) {
            this.metrics.skippedByCategory[category] += 1;
        } else {
            this.metrics.skippedByCategory[category] = 1;
        }

        const now = Date.now();
        if (now - this._lastLogTime > this._logThrottleMs) {
            this._lastLogTime = now;
            console.warn(
                `[TmdbBudget] Cap TMDB ${scope} raggiunto (${current}/${limit} in ${this.capConfig.windowMs}ms) ` +
                `per categoria "${category}" [${endpoint}]. Degrado morbido attivo: chiamata saltata senza eccezioni.`
            );
        }
    }

    /**
     * Registra una chiamata TMDB effettivamente eseguita
     * @param {string} category - Categoria TMDB
     * @param {string} [endpoint] - Endpoint o URL
     */
    recordCall(category = TMDB_CATEGORIES.GENERAL, endpoint = '') {
        const now = Date.now();
        this._pruneWindow(now);

        // Aggiungi alla finestra temporale per i controlli di cap
        this.windowCalls.push({ timestamp: now, category, endpoint });

        // Aggiorna metriche cumulative
        this.metrics.totalCalls += 1;
        if (this.metrics.byCategory[category] !== undefined) {
            this.metrics.byCategory[category] += 1;
        } else {
            this.metrics.byCategory[category] = 1;
        }

        if (endpoint) {
            // Normalizza l'endpoint per non esplodere la mappa (es. sostituisce cifre ID con :id)
            const normalizedEndpoint = String(endpoint)
                .replace(/^https?:\/\/[^/]+(?:\/3)?/, '')
                .replace(/\/\d+/g, '/:id')
                .split('?')[0];

            this.metrics.byEndpoint[normalizedEndpoint] = (this.metrics.byEndpoint[normalizedEndpoint] || 0) + 1;
        }
    }

    /**
     * Wrapper di esecuzione con verifica budget e degrado morbido.
     * Se il budget è esaurito, restituisce fallbackValue senza sollevare eccezioni.
     * @param {string} category - Categoria ammessa
     * @param {string} endpoint - Endpoint della chiamata
     * @param {Function} asyncFn - Funzione asincrona che esegue la fetch
     * @param {*} [fallbackValue=null] - Valore da restituire in caso di degrado o cap
     * @returns {Promise<*>}
     */
    async executeWithBudget(category, endpoint, asyncFn, fallbackValue = null) {
        const check = this.checkBudget(category, endpoint);
        if (!check.allowed) {
            return fallbackValue;
        }

        try {
            const result = await asyncFn();
            this.recordCall(category, endpoint);
            return result;
        } catch (err) {
            // Registra comunque la chiamata effettuata
            this.recordCall(category, endpoint);
            throw err;
        }
    }

    /**
     * Restituisce un'istantanea delle metriche correnti
     */
    getMetrics() {
        const now = Date.now();
        this._pruneWindow(now);

        return {
            totalCalls: this.metrics.totalCalls,
            totalSkippedByCap: this.metrics.totalSkippedByCap,
            callsInCurrentWindow: this.windowCalls.length,
            byCategory: { ...this.metrics.byCategory },
            skippedByCategory: { ...this.metrics.skippedByCategory },
            topEndpoints: { ...this.metrics.byEndpoint },
            capConfig: {
                enabled: this.capConfig.enabled,
                limit: this.capConfig.limit,
                windowMs: this.capConfig.windowMs,
                categoryLimits: { ...this.capConfig.categoryLimits }
            },
            uptimeMs: now - this.metrics.lastReset
        };
    }

    /**
     * Resetta contatori e metriche (utile per test o rotazioni)
     */
    resetMetrics() {
        this.windowCalls = [];
        this.metrics = {
            totalCalls: 0,
            totalSkippedByCap: 0,
            byCategory: {
                [TMDB_CATEGORIES.BACKFILL]: 0,
                [TMDB_CATEGORIES.META_CLICK]: 0,
                [TMDB_CATEGORIES.SEARCH_LIVE]: 0,
                [TMDB_CATEGORIES.EPISODES]: 0,
                [TMDB_CATEGORIES.GENERAL]: 0
            },
            skippedByCategory: {
                [TMDB_CATEGORIES.BACKFILL]: 0,
                [TMDB_CATEGORIES.META_CLICK]: 0,
                [TMDB_CATEGORIES.SEARCH_LIVE]: 0,
                [TMDB_CATEGORIES.EPISODES]: 0,
                [TMDB_CATEGORIES.GENERAL]: 0
            },
            byEndpoint: {},
            lastReset: Date.now()
        };
    }
}

// Istanza singleton condivisa nell'applicazione
const tmdbBudget = new TmdbBudgetTracker();

module.exports = {
    TMDB_CATEGORIES,
    DECLARED_TTLS,
    TmdbBudgetTracker,
    tmdbBudget,
    determineCategory,
    configureCap: (cfg) => tmdbBudget.configureCap(cfg),
    checkBudget: (cat, endpoint) => tmdbBudget.checkBudget(cat, endpoint),
    recordCall: (cat, endpoint) => tmdbBudget.recordCall(cat, endpoint),
    getMetrics: () => tmdbBudget.getMetrics(),
    resetMetrics: () => tmdbBudget.resetMetrics(),
    executeWithBudget: (cat, ep, fn, fallback) => tmdbBudget.executeWithBudget(cat, ep, fn, fallback)
};
