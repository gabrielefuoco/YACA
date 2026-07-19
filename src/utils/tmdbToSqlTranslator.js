/**
 * tmdbToSqlTranslator.js
 * 
 * Traduce i parametri API di TMDB in query SQL valide per DuckDB.
 * Permette di usare i cataloghi esistenti senza modificare i preset.
 */

function buildSqlFromTmdbQuery(tmdbParams = {}, mediaType = 'movie', skip = 0, limit = 50) {
    const table = mediaType === 'movie' ? 'movies' : 'tv'; // Per ora abbiamo solo movies, ma predisponiamo.
    
    let whereClauses = [];
    let orderByClause = '';
    
    for (const [key, value] of Object.entries(tmdbParams)) {
        if (!value) continue;

        switch (key) {
            case '_search':
                // Evitiamo SQL injection ripulendo la stringa (replace single quotes)
                const safeVal = String(value).replace(/'/g, "''");
                whereClauses.push(`(title ILIKE '%${safeVal}%' OR original_title ILIKE '%${safeVal}%')`);
                break;
            case 'vote_count.gte':
                whereClauses.push(`vote_count >= ${Number(value)}`);
                break;
            case 'vote_average.gte':
                whereClauses.push(`vote_average >= ${Number(value)}`);
                break;
            case 'primary_release_date.gte':
                whereClauses.push(`release_date >= '${value}'`);
                break;
            case 'primary_release_date.lte':
                whereClauses.push(`release_date <= '${value}'`);
                break;
            case 'first_air_date.gte':
            case 'air_date.gte':
                whereClauses.push(`last_air_date >= '${value}'`);
                break;
            case 'first_air_date.lte':
            case 'air_date.lte':
                whereClauses.push(`last_air_date <= '${value}'`);
                break;
            case 'with_original_language':
                whereClauses.push(`original_language = '${value}'`);
                break;
            case 'without_original_language':
                whereClauses.push(`original_language != '${value}'`);
                break;
            case 'with_genres':
                whereClauses.push(buildArrayLikeClause('genres', value));
                break;
            case 'without_genres':
                whereClauses.push(buildArrayNotLikeClause('genres', value));
                break;
            case 'with_keywords':
                whereClauses.push(buildArrayLikeClause('keywords', value));
                break;
            case 'without_keywords':
                whereClauses.push(buildArrayNotLikeClause('keywords', value));
                break;
            case 'with_crew':
                // with_crew cerca sia in registi che in sceneggiatori
                const crewOr = buildArrayLikeClauseMulti(['directors', 'writers'], value);
                whereClauses.push(crewOr);
                break;
            case 'with_watch_providers':
                // Per ora abbiamo solo l'Italia
                whereClauses.push(buildArrayLikeClauseProvider('watch_providers_it', value));
                break;
            case 'sort_by':
                orderByClause = buildOrderBy(value);
                break;
        }
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    // Di default ordiniamo per popolarità se non specificato
    const orderString = orderByClause ? `ORDER BY ${orderByClause}` : 'ORDER BY popularity DESC';
    const limitString = `LIMIT ${limit} OFFSET ${skip}`;

    return `SELECT * FROM ${table} ${whereString} ${orderString} ${limitString}`;
}

// Helpers per parsare le virgole (OR) e i pipe (AND) di TMDB
function buildArrayLikeClause(column, valueStr) {
    const value = String(valueStr);
    if (value.includes('|')) {
        const ids = value.split('|');
        const conditions = ids.map(id => `${column} LIKE '%"id":${id}%'`);
        return `(${conditions.join(' AND ')})`;
    } else {
        const ids = value.split(',');
        const conditions = ids.map(id => `${column} LIKE '%"id":${id}%'`);
        return `(${conditions.join(' OR ')})`;
    }
}

function buildArrayNotLikeClause(column, valueStr) {
    const value = String(valueStr);
    const ids = value.split(/[,|]/); // without di solito è sempre in AND logico per le esclusioni
    const conditions = ids.map(id => `${column} NOT LIKE '%"id":${id}%'`);
    return `(${conditions.join(' AND ')})`;
}

function buildArrayLikeClauseMulti(columns, valueStr) {
    const value = String(valueStr);
    const ids = value.split(','); // Assumiamo solo OR per ora su with_crew
    const orConditions = [];
    for (const col of columns) {
        orConditions.push(...ids.map(id => `${col} LIKE '%"id":${id}%'`));
    }
    return `(${orConditions.join(' OR ')})`;
}

function buildArrayLikeClauseProvider(column, valueStr) {
    const value = String(valueStr);
    const ids = value.split('|'); // Supportiamo anche pipe per AND (più provider)
    if (ids.length > 1) {
         const conditions = ids.map(id => `${column} LIKE '%"provider_id":${id}%'`);
         return `(${conditions.join(' AND ')})`;
    }
    const orIds = value.split(',');
    const conditions = orIds.map(id => `${column} LIKE '%"provider_id":${id}%'`);
    return `(${conditions.join(' OR ')})`;
}

function buildOrderBy(sortBy) {
    switch(sortBy) {
        case 'popularity.desc': return 'popularity DESC';
        case 'popularity.asc': return 'popularity ASC';
        case 'vote_average.desc': return 'vote_average DESC, vote_count DESC';
        case 'vote_average.asc': return 'vote_average ASC';
        case 'primary_release_date.desc': return 'release_date DESC NULLS LAST';
        case 'primary_release_date.asc': return 'release_date ASC NULLS LAST';
        default: return 'popularity DESC';
    }
}

module.exports = { buildSqlFromTmdbQuery };
