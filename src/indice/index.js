/**
 * src/indice/index.js
 * 
 * Il Modulo Indice di YACA.
 * Possiede il motore (DuckDB persistito su volume + SQLite FTS5 Tier 2),
 * la freschezza, la ricostruzione e il compilatore dichiarativo.
 * 
 * Contratto unico: «dammi i titoli che soddisfano questi filtri, in quest'ordine» (+ la ricerca testuale).
 * Ha due clienti: i Cataloghi (via DuckDbProvider) e la Ricerca.
 */

const duckDbStore = require('./duckDbStore');
const compiler = require('./compiler');
const tier2 = require('./tier2');

class IndiceModule {
    constructor({ duckDb = duckDbStore, tier2Client = null, queryCompiler = compiler } = {}) {
        this.duckDb = duckDb;
        this.compiler = queryCompiler;
        this._tier2 = tier2;
        this._tier2Client = tier2Client;
        this.queryRaw = this.queryRaw.bind(this);
        this.updateAnimeMapping = this.updateAnimeMapping.bind(this);
        this.init = this.init.bind(this);
        this.resolveImdbIds = this.resolveImdbIds.bind(this);
        this.resolveTmdbToImdb = this.resolveTmdbToImdb.bind(this);
        this.swapDatabase = this.swapDatabase.bind(this);
        this.getStagingDbPath = this.getStagingDbPath.bind(this);
        this.getTargetDbPath = this.getTargetDbPath.bind(this);
        this.rebuildAndSwap = this.rebuildAndSwap.bind(this);
        this.ensureFreshHandle = this.ensureFreshHandle.bind(this);
        this.close = this.close.bind(this);
    }

    get tier2Client() {
        if (!this._tier2Client) {
            this._tier2Client = new this._tier2.Tier2SearchClient();
        }
        return this._tier2Client;
    }

    /**
     * Inizializzazione del motore indice (DuckDB e Tier 2).
     */
    async init(options = {}) {
        const duckInit = this.duckDb.init(options);
        if (this._tier2Client) {
            this._tier2Client.init();
        }
        return duckInit;
    }

    /**
     * Stato di inizializzazione del motore DuckDB (Ticket 53).
     * Letto come proprietà sincrona (getter) dai consumatori come MetadataHydrator.
     */
    get isInitialized() {
        return Boolean(this.duckDb && this.duckDb.isInitialized);
    }

    /**
     * Verifica della freschezza del database dell'indice.
     */
    isFresh() {
        if (typeof this.duckDb._isDatabaseFresh === 'function') {
            return this.duckDb._isDatabaseFresh();
        }
        return this.duckDb.isInitialized;
    }

    /**
     * Esecuzione di SQL grezza direttamente sul database DuckDB (Ticket 53).
     * Deliberatamente separato da query(), che compila filtri dichiarativi.
     *
     * @param {string} sql Stringa SQL da eseguire
     * @param {Array} [params] Parametri posizionali
     * @returns {Promise<Array<Object>>} Righe risultanti
     */
    async queryRaw(sql, params) {
        if (params !== undefined) {
            return this.duckDb.query(sql, params);
        }
        return this.duckDb.query(sql);
    }

    /**
     * Aggiorna il mapping anime in DuckDB (Ticket 53).
     *
     * @param {Object} idsByType { movie: number[], tv: number[] }
     * @returns {Promise<void>}
     */
    async updateAnimeMapping(idsByType) {
        return this.duckDb.updateAnimeMapping(idsByType);
    }

    /**
     * Contratto principale: «dammi i titoli che soddisfano questi filtri, in quest'ordine».
     * 
     * @param {Object} filtersOrPreset Oggetto filtri o preset { type, where, orderBy, uniqueById }
     * @param {Object} [options] { skip, limit, type }
     * @returns {Promise<Array<Object>>} Righe grezze dei titoli ordinati da DuckDB
     */
    async query(filtersOrPreset, { skip = 0, limit = 100, type = 'movie' } = {}) {
        const preset = {
            type: filtersOrPreset.type || type,
            where: Array.isArray(filtersOrPreset.where) ? filtersOrPreset.where : (filtersOrPreset.where ? [filtersOrPreset.where] : []),
            orderBy: filtersOrPreset.orderBy,
            uniqueById: Boolean(filtersOrPreset.uniqueById)
        };

        const compiled = await this.compiler.compileQuery(preset, skip, limit, this.duckDb);
        return this.duckDb.query(compiled.sql, compiled.params);
    }

    /**
     * Alias semantico per il contratto «dammi i titoli che soddisfano questi filtri».
     */
    async getTitles(filtersOrPreset, options = {}) {
        return this.query(filtersOrPreset, options);
    }

    /**
     * Ricerca testuale sull'indice locale (DuckDB Tier 1 BM25).
     * 
     * @param {string} textSearch Termine o frase di ricerca
     * @param {Object} [options] { type, limit, skip }
     * @returns {Promise<Array<Object>>}
     */
    async search(textSearch, { type = 'movie', limit = 20, skip = 0 } = {}) {
        if (!textSearch || typeof textSearch !== 'string' || !textSearch.trim()) {
            return [];
        }
        return this.query({
            type,
            where: [{ _fts: textSearch.trim() }]
        }, { skip, limit, type });
    }

    /**
     * Ricerca testuale sulla coda lunga (SQLite FTS5 Tier 2).
     * 
     * @param {string} rawQuery
     * @param {Object} [options] { type, limit }
     * @returns {Array<Object>}
     */
    searchTier2(rawQuery, { type = 'movie', limit = 20 } = {}) {
        // Il client è pigro (getter): istanziarlo qui eviterebbe l'unico scopo del getter —
        // non costruire Tier 2 quando l'indice viene solo importato (mock Jest, boot).
        // Leggere `_tier2Client` direttamente dava `TypeError: Cannot read properties of null`,
        // perché il campo è null finché il getter non lo crea.
        return this.tier2Client.search(rawQuery, { type, limit });
    }

    /**
     * Lookup puntuale di un titolo per TMDB ID (usato per i meta details).
     * 
     * @param {number|string} tmdbId
     * @param {'movie'|'tv'|'series'} [type]
     * @returns {Promise<Object|null>}
     */
    async getById(tmdbId, type = 'movie') {
        const cleanId = Number(String(tmdbId).replace(/^tmdb:/i, ''));
        if (!Number.isFinite(cleanId) || cleanId <= 0) return null;

        const table = (type === 'tv' || type === 'series') ? 'tv' : 'movies';
        const rows = await this.duckDb.query(`SELECT * FROM ${table} WHERE id = ?`, [cleanId]);
        return (rows && rows.length > 0) ? rows[0] : null;
    }

    /**
     * Dettagli meta di un titolo (usato dal serving meta).
     *
     * @param {number|string} tmdbId
     * @param {'movie'|'tv'|'series'} [type]
     * @returns {Promise<Object|null>}
     */
    async getMetaDetails(tmdbId, type = 'movie') {
        try {
            const duckDbProvider = require('./duckDbProvider');
            if (typeof duckDbProvider.getDuckDbMetaDetails === 'function') {
                return await duckDbProvider.getDuckDbMetaDetails(tmdbId, type);
            }
        } catch (_e) {}
        return null;
    }

    /**
     * Alias per compatibilità con il fornitore DuckDb.
     */
    async getDuckDbMetaDetails(tmdbId, type = 'movie') {
        return this.getMetaDetails(tmdbId, type);
    }

    /**
     * Risolve un catalogo di titoli filtrati attraverso la compilazione dichiarativa.
     */
    async getCatalogFromFilters(filters, type = 'movie', skip = 0, limit = 100, options = {}) {
        try {
            const duckDbProvider = require('./duckDbProvider');
            if (typeof duckDbProvider.getDuckDbCatalogFromFilters === 'function') {
                return await duckDbProvider.getDuckDbCatalogFromFilters(filters, type, skip, limit, options);
            }
        } catch (_e) {}
        return [];
    }

    /**
     * Risolve un catalogo di titoli a partire da un preset DuckDb.
     */
    async getCatalogFromPreset(preset, skip = 0, limit = 100, options = {}) {
        try {
            const duckDbProvider = require('./duckDbProvider');
            if (typeof duckDbProvider.getDuckDbCatalogFromPreset === 'function') {
                return await duckDbProvider.getDuckDbCatalogFromPreset(preset, skip, limit, options);
            }
        } catch (_e) {}
        return [];
    }

    async getDuckDbCatalogFromPreset(preset, skip = 0, limit = 100, options = {}) {
        return this.getCatalogFromPreset(preset, skip, limit, options);
    }

    /**
     * Risoluzione IMDb IDs -> TMDB IDs
     */
    async resolveImdbIds(imdbIds) {
        return this.duckDb.resolveImdbIds(imdbIds);
    }

    /**
     * Risoluzione TMDB IDs -> IMDb IDs
     */
    async resolveTmdbToImdb(tmdbIds, type = 'both') {
        return this.duckDb.resolveTmdbToImdb(tmdbIds, type);
    }

    /**
     * Fornitore di candidati spiegati per gusto (Ticket 41 - Prima fetta).
     *
     * @param {Object} contesto Contesto profilo già RISOLTO (contestoDi)
     * @param {Object} [options] Opzioni { mediaType, strategia, limit }
     * @returns {Promise<{ candidati: Array<Object>, motivi: Array<string> }>}
     */
    async candidati(contesto, options = {}) {
        const { candidati } = require('./candidati');
        return candidati(contesto, {
            db: this.duckDb,
            queryCompiler: this.compiler,
            ...options
        });
    }

    /**
     * Alias semantico per il fornitore di candidati di gusto.
     */
    async candidatiPerGusto(contesto, options = {}) {
        return this.candidati(contesto, options);
    }

    /**
     * Cache DF (Document Frequency) calcolata da DuckDB (Ticket 49).
     */
    /**
     * Stato degli artefatti parquet (esistenza + mtime). Il daemon del dump lo usa per
     * decidere se riconvertire, senza leggere i percorsi interni dello store.
     */
    parquetStats() {
        if (typeof this.duckDb.parquetStats === 'function') return this.duckDb.parquetStats();
        return { movies: { exists: false, mtimeMs: null }, tv: { exists: false, mtimeMs: null } };
    }

    getDfCache() {
        if (typeof this.duckDb.getDfCache === 'function') {
            return this.duckDb.getDfCache();
        }
        return this.duckDb.dfMap || null;
    }

    /**
     * Esegue lo swap atomico del database da staging a target (Ticket 54).
     */
    async swapDatabase(fromPath, toPath) {
        if (typeof this.duckDb.swapDatabase === 'function') {
            return this.duckDb.swapDatabase(fromPath, toPath);
        }
        return { swapped: false, reason: 'unsupported' };
    }

    getStagingDbPath() {
        if (typeof this.duckDb.getStagingDbPath === 'function') {
            return this.duckDb.getStagingDbPath();
        }
        return null;
    }

    getTargetDbPath() {
        if (typeof this.duckDb.getTargetDbPath === 'function') {
            return this.duckDb.getTargetDbPath();
        }
        return null;
    }

    /**
     * Ricostruzione completa su file temporaneo e swap atomico su target (Ticket 54).
     */
    async rebuildAndSwap(options = {}) {
        if (typeof this.duckDb.rebuildAndSwap === 'function') {
            return this.duckDb.rebuildAndSwap(options);
        }
        await this.close();
        await this.init({ ...options, forceRebuild: true, staging: true });
        await this.close();
        return this.swapDatabase();
    }

    /**
     * Verifica la freschezza dell'handle DuckDB e riapre se il database è stato scambiato (Ticket 59).
     */
    async ensureFreshHandle(forceCheck = false) {
        if (this.duckDb && typeof this.duckDb.ensureFreshHandle === 'function') {
            return this.duckDb.ensureFreshHandle(forceCheck);
        }
    }

    /**
     * Chiusura pulita delle risorse.
     */
    async close(callback) {
        if (this._tier2Client) {
            this._tier2Client.close();
        }
        await this.duckDb.close(callback);
    }
}

// Singleton di default per l'applicazione
const indice = new IndiceModule();

module.exports = indice;
module.exports.IndiceModule = IndiceModule;
module.exports.compiler = compiler;
module.exports.tier2 = tier2;
module.exports.duckDbProvider = require('./duckDbProvider');
module.exports.buildPresetFromFilters = (...args) => require('./duckDbProvider').buildPresetFromFilters(...args);
module.exports.mapDuckDbRowToMeta = (...args) => require('./duckDbProvider').mapDuckDbRowToMeta(...args);
module.exports.getDuckDbMetaDetails = (...args) => indice.getMetaDetails(...args);
module.exports.getDuckDbCatalogFromFilters = (...args) => indice.getCatalogFromFilters(...args);
module.exports.getDuckDbCatalogFromPreset = (...args) => indice.getCatalogFromPreset(...args);
// Bind esplicito: senza, `const { getDfCache } = require('./indice')` perde il ricevitore e
// il metodo esplode su `this.duckDb`. Un wrapper che chiama lo stesso nome sarebbe ricorsivo.
module.exports.getDfCache = indice.getDfCache.bind(indice);
// Stato degli artefatti parquet (esistenza + mtime), non i percorsi: lo chiede il daemon del dump.
module.exports.parquetStats = indice.parquetStats.bind(indice);
// Swap atomico DuckDB (Ticket 54): porta di scambio senza conoscere percorsi interni (decisione 31/53)
module.exports.swapDatabase = indice.swapDatabase.bind(indice);
module.exports.getStagingDbPath = indice.getStagingDbPath.bind(indice);
module.exports.getTargetDbPath = indice.getTargetDbPath.bind(indice);
module.exports.rebuildAndSwap = indice.rebuildAndSwap.bind(indice);
// Riapertura automatica dopo scambio DuckDB (Ticket 59)
module.exports.ensureFreshHandle = indice.ensureFreshHandle.bind(indice);
// La promozione Tier 2 -> Tier 1 è dell'indice: si chiede dalla porta, non dal file interno.
module.exports.schedulePromotion = (...args) => require('./tier1LazyPromotion').schedulePromotion(...args);

