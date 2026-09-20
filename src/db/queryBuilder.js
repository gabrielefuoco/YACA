const duckDbStore = require('./duckDbStore');

/**
 * Converte un oggetto preset in una stringa SQL per DuckDB.
 * Gestisce nativamente la FTS (Full-Text Search) e i simili (Recommendations).
 */
async function buildCatalogQuery(preset, skip = 0, limit = 100) {
    const table = preset.type === 'movie' ? 'movies' : 'tv';
    const rawWhere = preset.where || [];
    
    const normalFilters = ['adult = false'];
    let ftsClause = null;
    let similarId = null;
    
    for (const w of rawWhere) {
        if (typeof w === 'object' && w !== null && (w._fts || w.query)) {
            const rawClause = typeof w._fts === 'string' ? w._fts : (typeof w.query === 'string' ? w.query : '');
            const trimmed = rawClause.trim();
            if (trimmed) {
                ftsClause = trimmed.replace(/'/g, "''");
            }
        } else if (typeof w === 'object' && w !== null && w._similar) {
            similarId = w.tmdbId;
        } else if (w && typeof w === 'string' && w.trim()) {
            normalFilters.push(w.trim());
        }
    }
    
    // FTS: aggiunge il filtro BM25 e forza l'ordinamento per rilevanza
    if (ftsClause) {
        normalFilters.push(`fts_main_${table}.match_bm25(id, '${ftsClause}') IS NOT NULL`);
        const where = normalFilters.join(' AND ');
        return `SELECT * FROM ${table} WHERE ${where} ORDER BY fts_main_${table}.match_bm25(id, '${ftsClause}') DESC LIMIT ${limit} OFFSET ${skip}`;
    }
    
    // SIMILAR: legge i consigliati archiviati nativamente nei metadati
    if (similarId) {
        const cleanSimilarId = Number(String(similarId).replace(/^tmdb:/i, ''));
        let foundRecs = false;
        if (Number.isFinite(cleanSimilarId) && cleanSimilarId > 0) {
            try {
                const targetRow = await duckDbStore.query(`SELECT recommendations FROM ${table} WHERE id = ${cleanSimilarId}`);
                if (targetRow.length > 0 && targetRow[0].recommendations) {
                    const recIds = JSON.parse(targetRow[0].recommendations);
                    const validRecIds = Array.isArray(recIds) ? recIds.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
                    if (validRecIds.length > 0) {
                        normalFilters.push(`id IN (${validRecIds.join(',')})`);
                        foundRecs = true;
                    }
                }
            } catch (e) {
                console.error(`[QueryBuilder] Errore recupero similar per ${cleanSimilarId}:`, e);
            }
        }
        if (!foundRecs) {
            normalFilters.push('1=0');
        }
    }
    
    // Query Standard
    const where = normalFilters.join(' AND ');
    const order = preset.orderBy || 'popularity DESC NULLS LAST';
    return `SELECT * FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${skip}`;
}

module.exports = { buildCatalogQuery };
