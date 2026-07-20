const duckDbStore = require('./duckDbStore');

/**
 * Converte un oggetto preset in una stringa SQL per DuckDB.
 * Gestisce nativamente la FTS (Full-Text Search) e i simili (Recommendations).
 */
async function buildCatalogQuery(preset, skip = 0, limit = 50) {
    const table = preset.type === 'movie' ? 'movies' : 'tv';
    const rawWhere = preset.where || [];
    
    const normalFilters = ['adult = false'];
    let ftsClause = null;
    let similarId = null;
    
    for (const w of rawWhere) {
        if (typeof w === 'object' && w._fts) {
            ftsClause = w.query;
        } else if (typeof w === 'object' && w._similar) {
            similarId = w.tmdbId;
        } else {
            normalFilters.push(w);
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
        try {
            const targetRow = await duckDbStore.query(`SELECT recommendations FROM ${table} WHERE id = ${similarId}`);
            if (targetRow.length > 0 && targetRow[0].recommendations) {
                const recIds = JSON.parse(targetRow[0].recommendations);
                if (Array.isArray(recIds) && recIds.length > 0) {
                    normalFilters.push(`id IN (${recIds.join(',')})`);
                } else {
                    normalFilters.push('1=0'); // Fallback (nessun raccomandato, query fallisce deliberatamente)
                }
            } else {
                normalFilters.push('1=0');
            }
        } catch (e) {
            console.error(`[QueryBuilder] Errore recupero similar per ${similarId}:`, e);
            normalFilters.push('1=0');
        }
    }
    
    // Query Standard
    const where = normalFilters.join(' AND ');
    const order = preset.orderBy || 'popularity DESC NULLS LAST';
    return `SELECT * FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${skip}`;
}

module.exports = { buildCatalogQuery };
