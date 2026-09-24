/**
 * DuckDbProvider.js
 * 
 * Sostituisce AiDiscoveryProvider.js.
 * Utilizza duckDbStore e il traduttore SQL per generare i cataloghi locali a latenza zero.
 */

const duckDbStore = require('../../db/duckDbStore');
const { buildCatalogQuery } = require('../../db/queryBuilder');
const { F, S } = require('../../data/filters');
const animeMappingStore = require('../../data/animeMappingStore');
const { normalizeAnimeMarker } = require('../../utils/animeIdentity');
const { applyKidsMode, ADULT_GENRE_IDS, ADULT_KEYWORD_IDS } = require('../../utils/kidsModeFilters');

const SUPPORTED_SORT_BY = Object.freeze([
    'popularity.desc',
    'vote_average.desc',
    'revenue.desc',
    'primary_release_date.desc',
    'first_air_date.desc',
    'release_date.desc',
    'primary_release_date.asc',
    'first_air_date.asc',
    'release_date.asc'
]);

function isMappedSortBy(s) {
    return Boolean(s && SUPPORTED_SORT_BY.includes(s));
}

function mapSortBy(s, type = 'movie') {
    const isTv = type === 'tv' || type === 'series';
    if (!s) return S.POPULAR;
    if (s === 'popularity.desc') return S.POPULAR;
    if (s === 'vote_average.desc') return S.TOP_RATED;
    if (s === 'revenue.desc') {
        return isTv ? S.POPULAR : S.REVENUE;
    }
    if (s === 'primary_release_date.desc' || s === 'first_air_date.desc' || s === 'release_date.desc') {
        return isTv ? S.NEWEST_TV : S.NEWEST_MOVIE;
    }
    if (s === 'primary_release_date.asc' || s === 'first_air_date.asc' || s === 'release_date.asc') {
        return isTv ? '"first_air_date" ASC NULLS LAST' : '"release_date" ASC NULLS LAST';
    }
    return s.replace('.desc', ' DESC NULLS LAST').replace('.asc', ' ASC NULLS LAST');
}

function buildPresetFromFilters(q, type = 'movie', options = {}) {
    const where = [];
    if (options?.kidsMode) q = applyKidsMode(q || {});
    if (!q) return { type, where, orderBy: S.POPULAR };

    const isTv = type === 'tv' || type === 'series';

    if (q._search || q.text_search) {
        where.push({ _fts: q._search || q.text_search });
    }
    
    if (q.similar_to) {
        where.push({ _similar: true, tmdbId: q.similar_to });
    }

    if (q['vote_count.gte']) where.push(F.minVotes(q['vote_count.gte']));
    if (q['vote_count.lte']) where.push(F.maxVotes(q['vote_count.lte']));
    if (q['vote_average.gte']) where.push(F.minScore(q['vote_average.gte']));
    if (q['popularity.lte']) where.push(F.maxPopularity(q['popularity.lte']));
    if (q.with_status) where.push(F.status(q.with_status));
    if (q['number_of_seasons.lte'] !== undefined) where.push(F.maxSeasons(q['number_of_seasons.lte']));
    if (q['number_of_episodes.lte'] !== undefined) where.push(F.maxEpisodes(q['number_of_episodes.lte']));
    
    if (q.with_original_language) {
        const langs = q.with_original_language.split('|');
        if (langs.length === 1) where.push(F.lang(langs[0]));
        else where.push(F.any(...langs.map(l => F.lang(l))));
    }

    if (q.without_original_language) {
        const notLangs = q.without_original_language.split('|');
        where.push(F.notLang(...notLangs));
    }

    if (q.with_origin_country) {
        const countries = String(q.with_origin_country)
            .split('|')
            .map(code => code.trim())
            .filter(Boolean);
        where.push(
            countries.length === 0 ? '1=0'
                : countries.length === 1 ? F.country(countries[0])
                    : F.any(...countries.map(code => F.country(code)))
        );
    }

    if (q.with_genres) {
        const str = String(q.with_genres);
        if (str.includes('|')) {
            where.push(F.genre(...str.split('|').map(Number)));
        } else if (str.includes(',')) {
            where.push(F.allGenres(...str.split(',').map(Number)));
        } else {
            where.push(F.genre(Number(str)));
        }
    }

    if (q.without_genres) {
        where.push(F.notGenre(...String(q.without_genres).split(/[,|]/).map(Number)));
    }

    if (q.with_keywords) {
        // `a,b` = AND; `a|b` = OR. I gruppi separati da virgola possono
        // contenere alternative OR: `a,b|c` = a AND (b OR c).
        const keywordGroups = String(q.with_keywords)
            .split(',')
            .map(group => group.split('|').map(Number))
            .filter(ids => ids.length > 0 && ids.every(Number.isFinite));
        where.push(keywordGroups.length > 0
            ? keywordGroups.map(ids => F.keyword(...ids)).join(' AND ')
            : '1=0');
    }

    if (q.without_keywords) {
        where.push(F.notKeyword(...String(q.without_keywords).split(/[,|]/).map(Number)));
    }

    // Nota architetturale: la tabella 'tv' del parquet TMDB include 'cast' e le colonne
    // watch_providers_it/us, ma NON include 'directors' e 'writers' (in TMDB le serie TV usano 'created_by').
    // Pertanto, F.crew DEVE rimanere guardato da !isTv per evitare errori Binder SQL in DuckDB
    // ("Referenced column directors not found in FROM clause").
    if (!isTv) {
        if (q.with_crew) where.push(F.crew(q.with_crew));
    }
    if (q.with_cast) where.push(F.actor(...String(q.with_cast).split('|').map(Number)));
    if (q.with_watch_providers) where.push(F.provider(q.with_watch_providers, q.watch_region));
    if (q.with_companies) where.push(F.company(...String(q.with_companies).split('|').map(Number)));
    if (q.with_collections) where.push(F.collections(...String(q.with_collections).split('|').map(Number)));
    if (q.with_networks) where.push(F.network(...String(q.with_networks).split('|').map(Number)));

    const dateCol = isTv ? '"first_air_date"' : '"release_date"';
    const dateGte = q['primary_release_date.gte'] || q['first_air_date.gte'] || q['air_date.gte'];
    const dateLte = q['primary_release_date.lte'] || q['first_air_date.lte'] || q['air_date.lte'];
    if (dateGte) where.push(`${dateCol} >= '${dateGte}'`);
    if (dateLte) where.push(`${dateCol} <= '${dateLte}'`);

    if (q.primary_release_year) {
        if (isTv) {
            where.push(F.airedInYear(q.primary_release_year));
        } else {
            where.push(F.releasedInYear(q.primary_release_year));
        }
    }

    if (Array.isArray(q.tmdbIds)) {
        const validIds = q.tmdbIds.map(Number).filter(n => Number.isFinite(n) && n > 0);
        if (validIds.length > 0) {
            where.push(`"id" IN (${validIds.join(',')})`);
        } else {
            where.push('1=0');
        }
    }

    if (q.without_tmdbIds) {
        const validIds = String(q.without_tmdbIds)
            .split(/[,|]/)
            .map(Number)
            .filter(n => Number.isSafeInteger(n) && n > 0);
        where.push(validIds.length > 0 ? `"id" NOT IN (${validIds.join(',')})` : '1=1');
    }

    if (q.with_id || q.params?.with_id) {
        const singleId = Number(String(q.with_id || q.params.with_id).replace(/^tmdb:/i, ''));
        if (Number.isFinite(singleId) && singleId > 0) {
            where.push(`"id" = ${singleId}`);
        }
    }

    if (Array.isArray(q.items)) {
        const validItemIds = q.items
            .map(it => Number(String(typeof it === 'object' && it !== null ? (it.tmdbId || it.id) : it).replace(/^tmdb:/i, '')))
            .filter(n => Number.isFinite(n) && n > 0);
        if (validItemIds.length > 0) {
            where.push(`"id" IN (${validItemIds.join(',')})`);
        } else {
            where.push('1=0');
        }
    }

    const preset = {
        type,
        where,
        orderBy: mapSortBy(q.sort_by, type)
    };
    if (q.uniqueById) preset.uniqueById = true;
    return preset;
}

function sanitizeBigInt(val) {
    if (typeof val === 'bigint') return Number(val);
    return val;
}

function mapDuckDbRowToMeta(item, isMovie = true) {
    let name = item.title || item.name || item.original_title || item.original_name || 'Unknown';
    let poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    let background = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null;
    
    let parsedGenres = [];
    let parsedProvidersIT = null;
    let parsedProvidersUS = null;
    let parsedCast = [];
    let parsedCrew = [];
    let parsedKeywords = [];
    
    try { if (item.genres) parsedGenres = typeof item.genres === 'string' ? JSON.parse(item.genres) : item.genres; } catch(e){}
    try { if (item.watch_providers_it) parsedProvidersIT = typeof item.watch_providers_it === 'string' ? JSON.parse(item.watch_providers_it) : item.watch_providers_it; } catch(e){}
    try { if (item.watch_providers_us) parsedProvidersUS = typeof item.watch_providers_us === 'string' ? JSON.parse(item.watch_providers_us) : item.watch_providers_us; } catch(e){}
    try { if (item.cast) parsedCast = typeof item.cast === 'string' ? JSON.parse(item.cast) : item.cast; } catch(e){}
    try { 
        if (item.directors) {
            const dirs = typeof item.directors === 'string' ? JSON.parse(item.directors) : item.directors;
            parsedCrew.push(...dirs.map(d => ({ ...d, job: d.job || 'Director' })));
        }
    } catch(e){}
    try { 
        if (item.writers) {
            const wrs = typeof item.writers === 'string' ? JSON.parse(item.writers) : item.writers;
            parsedCrew.push(...wrs.map(w => ({ ...w, job: w.job || 'Writer' })));
        }
    } catch(e){}
    try { if (item.keywords) parsedKeywords = typeof item.keywords === 'string' ? JSON.parse(item.keywords) : item.keywords; } catch(e){}

    const voteCount = sanitizeBigInt(item.vote_count) || 0;
    const voteAverage = item.vote_average !== null && item.vote_average !== undefined ? Number(item.vote_average) : undefined;

    const rawTMDB = {
        id: sanitizeBigInt(item.id),
        title: item.title || item.name,
        original_title: item.original_title || item.original_name,
        overview: item.overview,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        vote_average: voteAverage,
        vote_count: voteCount,
        popularity: sanitizeBigInt(item.popularity) || 0,
        release_date: item.release_date,
        first_air_date: item.first_air_date,
        original_language: item.original_language,
        genres: parsedGenres,
        belongs_to_collection: item.collection_id ? { id: sanitizeBigInt(item.collection_id), name: item.collection_name } : null,
        collection_id: sanitizeBigInt(item.collection_id),
        'watch/providers': { results: { IT: parsedProvidersIT, US: parsedProvidersUS } },
        credits: { cast: parsedCast, crew: parsedCrew },
        keywords: { results: parsedKeywords, keywords: parsedKeywords }
    };

    if (item.logo_path) {
        rawTMDB.images = { logos: [{ file_path: item.logo_path }] };
    }
    if (item.trailer_key) {
        rawTMDB.videos = { results: [{ key: item.trailer_key, type: 'Trailer', site: 'YouTube' }] };
    }
    if (item.content_rating) {
        rawTMDB.release_dates = { results: [{ iso_3166_1: 'IT', release_dates: [{ certification: item.content_rating }] }] };
    }

    const d = item.release_date || item.first_air_date || item.last_air_date || '';
    const dateStr = d instanceof Date ? d.toISOString() : String(d);

    const meta = {
        id: `tmdb:${item.id}`,
        _tmdbId: sanitizeBigInt(item.id),
        type: isMovie ? 'movie' : 'series',
        name,
        poster,
        posterShape: 'poster',
        background,
        description: item.overview || '',
        releaseInfo: dateStr ? dateStr.substring(0, 4) : null,
        imdbRating: voteAverage ? voteAverage.toFixed(1) : undefined,
        popularity: sanitizeBigInt(item.popularity) || 0,
        genres: parsedGenres.map(g => g.name || g),
        genre_ids: parsedGenres.map(g => (g && typeof g === 'object' ? g.id : g)),
        vote_count: voteCount,
        keywords: parsedKeywords,
        rawTMDB
    };

    normalizeAnimeMarker(meta, { mappingStore: animeMappingStore });
    return meta;
}

function applyKidsModeToPreset(preset, options = {}) {
    if (!options?.kidsMode) return preset;
    return {
        ...preset,
        where: [
            ...(preset.where || []),
            F.notGenre(...ADULT_GENRE_IDS.split(',').map(Number)),
            F.notKeyword(...ADULT_KEYWORD_IDS.split(',').map(Number))
        ]
    };
}

async function getDuckDbCatalogFromPreset(preset, skip = 0, limit = 100, options = {}) {
    try {
        const safePreset = applyKidsModeToPreset(preset, options);
        const sql = await buildCatalogQuery(safePreset, skip, limit);
        const rows = await duckDbStore.query(sql);
        return rows.map(item => mapDuckDbRowToMeta(item, safePreset.type === 'movie'));
    } catch (e) {
        console.error('[DuckDbProvider] Error in getDuckDbCatalogFromPreset:', e);
        return [];
    }
}

async function getDuckDbCatalogFromFilters(filters, type = 'movie', skip = 0, limit = 100, options = {}) {
    try {
        const preset = buildPresetFromFilters(filters, type, options);
        const sql = await buildCatalogQuery(preset, skip, limit);
        const rows = await duckDbStore.query(sql);
        return rows.map(item => mapDuckDbRowToMeta(item, type === 'movie'));
    } catch (err) {
        console.error(`[DuckDbProvider] Errore nella generazione del catalogo:`, err);
        return [];
    }
}

async function getDuckDbMetaDetails(tmdbId, type = 'movie') {
    try {
        const sql = `SELECT * FROM ${type === 'movie' ? 'movies' : 'tv'} WHERE id = ${Number(tmdbId)}`;
        const rows = await duckDbStore.query(sql);

        if (rows.length === 0) return null;
        
        const item = rows[0];
        const isMovie = type === 'movie';
        let name = item.title || item.name || item.original_title || item.original_name || 'Unknown';
        let poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
        let background = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null;

        let parsedGenres = [];
        let parsedProvidersIT = null;
        let parsedProvidersUS = null;
        let parsedCast = [];
        let parsedCrew = [];
        let parsedKeywords = [];
        
        try { if (item.genres) parsedGenres = typeof item.genres === 'string' ? JSON.parse(item.genres) : item.genres; } catch(e){}
        try { if (item.watch_providers_it) parsedProvidersIT = typeof item.watch_providers_it === 'string' ? JSON.parse(item.watch_providers_it) : item.watch_providers_it; } catch(e){}
        try { if (item.watch_providers_us) parsedProvidersUS = typeof item.watch_providers_us === 'string' ? JSON.parse(item.watch_providers_us) : item.watch_providers_us; } catch(e){}
        try { if (item.cast) parsedCast = typeof item.cast === 'string' ? JSON.parse(item.cast) : item.cast; } catch(e){}
        try { 
            if (item.directors) {
                const dirs = typeof item.directors === 'string' ? JSON.parse(item.directors) : item.directors;
                parsedCrew.push(...dirs.map(d => ({ ...d, job: d.job || 'Director' })));
            }
        } catch(e){}
        try { 
            if (item.writers) {
                const wrs = typeof item.writers === 'string' ? JSON.parse(item.writers) : item.writers;
                parsedCrew.push(...wrs.map(w => ({ ...w, job: w.job || 'Writer' })));
            }
        } catch(e){}
        try { if (item.keywords) parsedKeywords = typeof item.keywords === 'string' ? JSON.parse(item.keywords) : item.keywords; } catch(e){}

        const voteCount = sanitizeBigInt(item.vote_count) || 0;
        const voteAverage = item.vote_average !== null && item.vote_average !== undefined ? Number(item.vote_average) : undefined;

        const rawTMDB = {
            id: sanitizeBigInt(item.id),
            title: item.title || item.name,
            original_title: item.original_title || item.original_name,
            overview: item.overview,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            vote_average: voteAverage,
            vote_count: voteCount,
            popularity: sanitizeBigInt(item.popularity) || 0,
            release_date: item.release_date,
            first_air_date: item.first_air_date,
            original_language: item.original_language,
            genres: parsedGenres,
            'watch/providers': { results: { IT: parsedProvidersIT, US: parsedProvidersUS } },
            credits: { cast: parsedCast, crew: parsedCrew },
            keywords: { results: parsedKeywords, keywords: parsedKeywords }
        };

        if (type === 'tv') {
            rawTMDB.keywords = { results: parsedKeywords }; // TMDB api difference (keywords vs results)
        }

        if (item.logo_path) rawTMDB.images = { logos: [{ file_path: item.logo_path }] };
        if (item.trailer_key) rawTMDB.videos = { results: [{ key: item.trailer_key, type: 'Trailer', site: 'YouTube' }] };
        if (item.content_rating) rawTMDB.release_dates = { results: [{ iso_3166_1: 'IT', release_dates: [{ certification: item.content_rating }] }] };

        const d = item.release_date || item.first_air_date || item.last_air_date || '';
        const dateStr = d instanceof Date ? d.toISOString() : String(d || '');

        const metaObj = {
            id: `tmdb:${item.id}`,
            _tmdbId: sanitizeBigInt(item.id),
            type: isMovie ? 'movie' : 'series',
            name,
            poster,
            posterShape: 'poster',
            background,
            description: item.overview || '',
            releaseInfo: dateStr.substring(0, 4),
            imdbRating: item.vote_average ? Number(item.vote_average).toFixed(1) : undefined,
            popularity: sanitizeBigInt(item.popularity) || 0,
            genre_ids: parsedGenres.map(g => (g && typeof g === 'object' ? g.id : g)),
            behaviorHints: isMovie ? { defaultVideoId: `tmdb:${item.id}` } : { hasScheduledVideos: true },
            rawTMDB
        };

        metaObj._originalLanguage = item.original_language;
        normalizeAnimeMarker(metaObj, {
            tmdbId: item.id,
            originalLanguage: item.original_language,
            keywords: parsedKeywords,
            mappingStore: animeMappingStore
        });

        if (!isMovie) {
            // DuckDB restituisce le colonne BIGINT come BigInt: senza la conversione,
            // chi fa aritmetica su questo valore (fetchTmdbEpisodes) lancia
            // "Cannot convert a BigInt value to a number" e la serie resta senza episodi.
            metaObj._numberOfSeasons = sanitizeBigInt(item.number_of_seasons) || 1;
        }

        return metaObj;

    } catch (err) {
        console.error(`[DuckDbProvider] Errore in getDuckDbMetaDetails per TMDB ${tmdbId}:`, err);
        return null;
    }
}

module.exports = {
    SUPPORTED_SORT_BY,
    isMappedSortBy,
    mapSortBy,
    buildPresetFromFilters,
    applyKidsModeToPreset,
    getDuckDbCatalogFromFilters,
    getDuckDbCatalogFromPreset,
    getDuckDbMetaDetails,
    mapDuckDbRowToMeta
};
