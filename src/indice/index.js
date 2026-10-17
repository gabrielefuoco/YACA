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

const duckDbStore = require('../db/duckDbStore');
const compiler = require('./compiler');
const tier2 = require('./tier2');

class IndiceModule {
    constructor({ duckDb = duckDbStore, tier2Client = null, queryCompiler = compiler } = {}) {
        this.duckDb = duckDb;
        this.compiler = queryCompiler;
        this._tier2 = tier2;
        this._tier2Client = tier2Client || new tier2.Tier2SearchClient();
    }

    /**
     * Inizializzazione del motore indice (DuckDB e Tier 2).
     */
    async init(options = {}) {
        const duckInit = this.duckDb.init(options);
        this._tier2Client.init();
        return duckInit;
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
        return this._tier2Client.search(rawQuery, { type, limit });
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
