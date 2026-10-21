/**
 * src/indice/compiler.js
 * 
 * Compilatore dell'indice: filtri dichiarativi in, query parametrizzata out.
 * Nessun valore utente viene mai interpolato in SQL (Prepared Statements / Parametri DuckDB).
 */

function getSearchTerms(value) {
    return [...new Set(
        String(value)
            .toLocaleLowerCase()
            .match(/[\p{L}\p{N}]+/gu) || []
    )];
}

/**
 * Compila un preset o set di filtri in una query SQL parametrizzata per DuckDB: { sql, params }.
 * 
 * @param {Object} preset { type, where, orderBy, uniqueById }
 * @param {number} skip OFFSET
 * @param {number} limit LIMIT
 * @param {Object} [dbClient] client per lookup interni (es. similar), con metodo query(sql, params)
 * @returns {Promise<{ sql: string, params: Array<any> }>}
 */
async function compileQuery(preset, skip = 0, limit = 100, dbClient = null) {
    const table = preset.type === 'movie' ? 'movies' : 'tv';
    const rawWhere = preset.where || [];
    
    const normalFilters = ['adult = false'];
    const params = [];
    let ftsClause = null;
    let ftsSearch = null;
    let similarId = null;
    
    for (const w of rawWhere) {
        if (typeof w === 'object' && w !== null && (w._fts || w.query)) {
            const rawClause = typeof w._fts === 'string' ? w._fts : (typeof w.query === 'string' ? w.query : '');
            const trimmed = rawClause.trim();
            if (trimmed) {
                ftsSearch = rawClause;
                ftsClause = trimmed;
            }
        } else if (typeof w === 'object' && w !== null && w._similar) {
            similarId = w.tmdbId;
        } else if (typeof w === 'object' && w !== null && w.sql) {
            normalFilters.push(w.sql);
            if (Array.isArray(w.params)) params.push(...w.params);
        } else if (w && typeof w === 'string' && w.trim()) {
            normalFilters.push(w.trim());
        }
    }
    
    // FTS: BM25 con parametri preparati.
    // Nessun valore viene interpolato: il testo cercato e i termini viaggiano in params.
    if (ftsClause) {
        const titleColumn = table === 'movies' ? 'title' : 'name';
        const originalTitleColumn = table === 'movies' ? 'original_title' : 'original_name';
        const searchableTitle = `concat_ws(' ', coalesce(${titleColumn}, ''), coalesce(${originalTitleColumn}, ''))`;
        const searchTerms = getSearchTerms(ftsSearch);

        normalFilters.push(`fts_main_${table}.match_bm25(id, ?) IS NOT NULL`);
        params.push(ftsClause);

        if (searchTerms.length === 0) {
            normalFilters.push('1=0');
        } else {
            for (const term of searchTerms) {
                normalFilters.push(`${searchableTitle} ILIKE ?`);
                params.push(`%${term}%`);
            }
        }

        const exactTitle = `CASE WHEN lower(trim(coalesce(${titleColumn}, ''))) = lower(trim(?)) OR lower(trim(coalesce(${originalTitleColumn}, ''))) = lower(trim(?)) THEN 0 ELSE 1 END`;
        const score = `fts_main_${table}.match_bm25(id, ?)`;
        const where = normalFilters.join(' AND ');

        // Sequenza ordinata dei parametri:
        // 1..N: filtri WHERE
        // N+1, N+2: exactTitle
        // N+3: score ORDER BY
        // N+4: LIMIT
        // N+5: OFFSET
        const fullParams = [
            ...params,
            ftsClause,
            ftsClause,
            ftsClause,
            Number(limit),
            Number(skip)
        ];

        const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ${exactTitle} ASC, ${score} DESC, id ASC LIMIT ? OFFSET ?`;
        return { sql, params: fullParams };
    }
    
    // SIMILAR: legge i consigliati archiviati nativamente nei metadati via query parametrizzata
    if (similarId) {
        const cleanSimilarId = Number(String(similarId).replace(/^tmdb:/i, ''));
        let foundRecs = false;
        if (Number.isFinite(cleanSimilarId) && cleanSimilarId > 0) {
            try {
                const client = dbClient || require('./duckDbStore');
                const targetRow = await client.query(`SELECT recommendations FROM ${table} WHERE id = ?`, [cleanSimilarId]);
                if (targetRow.length > 0 && targetRow[0].recommendations) {
                    const recIds = typeof targetRow[0].recommendations === 'string'
                        ? JSON.parse(targetRow[0].recommendations)
                        : targetRow[0].recommendations;
                    const validRecIds = Array.isArray(recIds) ? recIds.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
                    if (validRecIds.length > 0) {
                        const placeholders = validRecIds.map(() => '?').join(',');
                        normalFilters.push(`id IN (${placeholders})`);
                        params.push(...validRecIds);
                        foundRecs = true;
                    }
                }
            } catch (e) {
                console.error(`[QueryCompiler] Errore recupero similar per ${cleanSimilarId}:`, e);
            }
        }
        if (!foundRecs) {
            normalFilters.push('1=0');
        }
    }
    
    // Query Standard
    const where = normalFilters.join(' AND ');
    const order = preset.orderBy || 'popularity DESC NULLS LAST';
    const stableOrder = /"?id"?\s+ASC/i.test(order) ? order : `${order}, id ASC`;
    const fullParams = [...params, Number(limit), Number(skip)];

    if (preset.uniqueById) {
        const ranked = `SELECT *, row_number() OVER (PARTITION BY id) AS __yaca_unique_row FROM ${table} WHERE ${where}`;
        const sql = `SELECT * EXCLUDE (__yaca_unique_row) FROM (${ranked}) unique_rows WHERE __yaca_unique_row = 1 ORDER BY ${stableOrder} LIMIT ? OFFSET ?`;
        return { sql, params: fullParams };
    }
    const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ${stableOrder} LIMIT ? OFFSET ?`;
    return { sql, params: fullParams };
}

module.exports = {
    compileQuery,
};
