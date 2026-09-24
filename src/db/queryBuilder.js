const duckDbStore = require('./duckDbStore');

function escapeSqlString(value) {
    return String(value).replace(/'/g, "''");
}

function getSearchTerms(value) {
    return [...new Set(
        String(value)
            .toLocaleLowerCase()
            .match(/[\p{L}\p{N}]+/gu) || []
    )];
}

/**
 * Converte un oggetto preset in una stringa SQL per DuckDB.
 * Gestisce nativamente la FTS (Full-Text Search) e i simili (Recommendations).
 */
async function buildCatalogQuery(preset, skip = 0, limit = 100) {
    const table = preset.type === 'movie' ? 'movies' : 'tv';
    const rawWhere = preset.where || [];
    
    const normalFilters = ['adult = false'];
    let ftsClause = null;
    let ftsSearch = null;
    let similarId = null;
    
    for (const w of rawWhere) {
        if (typeof w === 'object' && w !== null && (w._fts || w.query)) {
            const rawClause = typeof w._fts === 'string' ? w._fts : (typeof w.query === 'string' ? w.query : '');
            const trimmed = rawClause.trim();
            if (trimmed) {
                ftsSearch = rawClause;
                ftsClause = escapeSqlString(trimmed);
            }
        } else if (typeof w === 'object' && w !== null && w._similar) {
            similarId = w.tmdbId;
        } else if (w && typeof w === 'string' && w.trim()) {
            normalFilters.push(w.trim());
        }
    }
    
    // FTS: BM25 è candidato veloce, ma il filtro per termini impedisce che una
    // singola parola comune faccia entrare pagine di falsi positivi. Il match
    // esatto ha un boost esplicito: a parità di BM25 l'id non deve decidere la
    // posizione del titolo realmente cercato.
    if (ftsClause) {
        const titleColumn = table === 'movies' ? 'title' : 'name';
        const originalTitleColumn = table === 'movies' ? 'original_title' : 'original_name';
        const searchableTitle = `concat_ws(' ', coalesce(${titleColumn}, ''), coalesce(${originalTitleColumn}, ''))`;
        const searchTerms = getSearchTerms(ftsSearch);

        normalFilters.push(`fts_main_${table}.match_bm25(id, '${ftsClause}') IS NOT NULL`);
        if (searchTerms.length === 0) {
            normalFilters.push('1=0');
        } else {
            for (const term of searchTerms) {
                const sqlTerm = escapeSqlString(term);
                normalFilters.push(`${searchableTitle} ILIKE '%${sqlTerm}%'`);
            }
        }

        const score = `fts_main_${table}.match_bm25(id, '${ftsClause}')`;
        const exactTitle = `CASE WHEN lower(trim(coalesce(${titleColumn}, ''))) = lower(trim('${ftsClause}')) OR lower(trim(coalesce(${originalTitleColumn}, ''))) = lower(trim('${ftsClause}')) THEN 0 ELSE 1 END`;
        const where = normalFilters.join(' AND ');
        return `SELECT * FROM ${table} WHERE ${where} ORDER BY ${exactTitle} ASC, ${score} DESC, id ASC LIMIT ${limit} OFFSET ${skip}`;
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
    const stableOrder = /"?id"?\s+ASC/i.test(order) ? order : `${order}, id ASC`;
    return `SELECT * FROM ${table} WHERE ${where} ORDER BY ${stableOrder} LIMIT ${limit} OFFSET ${skip}`;
}

module.exports = { buildCatalogQuery };
