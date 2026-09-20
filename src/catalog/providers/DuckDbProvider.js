/**
 * DuckDbProvider.js
 * 
 * Sostituisce AiDiscoveryProvider.js.
 * Utilizza duckDbStore e il traduttore SQL per generare i cataloghi locali a latenza zero.
 */

const duckDbStore = require('../../db/duckDbStore');
const { buildCatalogQuery } = require('../../db/queryBuilder');
const { F, S } = require('../../data/filters');

function mapSortBy(s, type) {
    if (!s) return S.POPULAR;
    if (s === 'popularity.desc') return S.POPULAR;
    if (s === 'vote_average.desc') return S.TOP_RATED;
    if (s === 'revenue.desc') {
        return (type === 'tv' || type === 'series') ? S.POPULAR : S.REVENUE;
    }
    if (s === 'primary_release_date.desc' || s === 'first_air_date.desc' || s === 'release_date.desc') {
        return (type === 'tv' || type === 'series') ? S.NEWEST_TV : S.NEWEST_MOVIE;
    }
    return s.replace('.desc', ' DESC NULLS LAST').replace('.asc', ' ASC NULLS LAST');
}

const parseFilterVal = (v) => {
    const s = String(v).trim();
    return /^\d+$/.test(s) ? Number(s) : s;
};

function buildPresetFromFilters(q, type = 'movie') {
    const where = [];
    if (!q) return { type, where, orderBy: S.POPULAR };

    const isTv = type === 'tv' || type === 'series';

    if (q._search || q.text_search) {
        where.push({ _fts: q._search || q.text_search });
    }
    
    if (q.similar_to) {
        where.push({ _similar: true, tmdbId: q.similar_to });
    }

    if (q['vote_count.gte']) where.push(F.minVotes(q['vote_count.gte']));
    if (q['vote_average.gte']) where.push(F.minScore(q['vote_average.gte']));
    
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
        where.push(F.country(q.with_origin_country));
    }

    if (q.with_genres) {
        const str = String(q.with_genres);
        if (str.includes('|')) {
            where.push(F.genre(...str.split('|').map(parseFilterVal)));
        } else if (str.includes(',')) {
            where.push(F.allGenres(...str.split(',').map(parseFilterVal)));
        } else {
            where.push(F.genre(parseFilterVal(str)));
        }
    }

    if (q.without_genres) {
        where.push(F.notGenre(...String(q.without_genres).split(/[,|]/).map(parseFilterVal)));
    }

    if (q.with_keywords) {
        const str = String(q.with_keywords);
        if (str.includes('|')) {
            where.push(F.keyword(...str.split('|').map(parseFilterVal)));
        } else if (str.includes(',')) {
            where.push(F.allKeywords(...str.split(',').map(parseFilterVal)));
        } else {
            where.push(F.keyword(parseFilterVal(str)));
        }
    }

    if (q.without_keywords) {
        where.push(F.notKeyword(...String(q.without_keywords).split(/[,|]/).map(parseFilterVal)));
    }

    if (!isTv) {
        if (q.with_crew) where.push(F.crew(q.with_crew));
        if (q.with_cast) where.push(F.actor(q.with_cast));
        if (q.with_watch_providers) where.push(F.provider(q.with_watch_providers));
    }
    if (q.with_companies) where.push(F.company(q.with_companies));
    if (q.with_networks) where.push(F.network(q.with_networks));

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

    return {
        type,
        where,
        orderBy: mapSortBy(q.sort_by, type)
    };
}

function mapDuckDbRowToMeta(item, type = 'movie') {
    const isMovie = type === 'movie';
    const name = item.title || item.name || item.original_title || item.original_name || 'Unknown';
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
    const background = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null;

    let parsedGenres = [];
    let parsedProviders = null;
    try { if (item.genres) parsedGenres = JSON.parse(item.genres); } catch (e) {}
    try { if (item.watch_providers_it) parsedProviders = JSON.parse(item.watch_providers_it); } catch (e) {}

    const rawTMDB = {
        id: item.id,
        title: item.title || item.name,
        original_title: item.original_title || item.original_name,
        overview: item.overview,
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        vote_average: item.vote_average,
        popularity: item.popularity,
        release_date: item.release_date || item.first_air_date,
        first_air_date: item.first_air_date || item.release_date,
        original_language: item.original_language,
        genres: parsedGenres,
        belongs_to_collection: item.collection_id ? { id: item.collection_id, name: item.collection_name } : null,
        collection_id: item.collection_id,
        'watch/providers': { results: { IT: parsedProviders } }
    };

    if (item.logo_path) rawTMDB.images = { logos: [{ file_path: item.logo_path }] };
    if (item.trailer_key) rawTMDB.videos = { results: [{ key: item.trailer_key, type: 'Trailer', site: 'YouTube' }] };
    if (item.content_rating) rawTMDB.release_dates = { results: [{ iso_3166_1: 'IT', release_dates: [{ certification: item.content_rating }] }] };

    const d = item.release_date || item.first_air_date || item.last_air_date || '';
    const dateStr = d instanceof Date ? d.toISOString() : String(d);

    return {
        id: `tmdb:${item.id}`,
        _tmdbId: item.id,
        type: isMovie ? 'movie' : 'series',
        name,
        poster,
        posterShape: 'poster',
        background,
        releaseInfo: dateStr ? dateStr.substring(0, 4) : null,
        imdbRating: item.vote_average ? Number(item.vote_average).toFixed(1) : undefined,
        genres: parsedGenres.map(g => g.name || g),
        genre_ids: parsedGenres.map(g => g.id).filter(Boolean),
        description: item.overview || '',
        popularity: item.popularity || 0,
        rawTMDB
    };
}

async function getDuckDbCatalogFromPreset(preset, skip = 0, limit = 50) {
    try {
        const sql = await buildCatalogQuery(preset, skip, limit);
        const rows = await duckDbStore.query(sql);
        return rows.map(item => mapDuckDbRowToMeta(item, preset.type));
    } catch (e) {
        console.error('[DuckDbProvider] Error in getDuckDbCatalogFromPreset:', e);
        return [];
    }
}

async function getDuckDbCatalogFromFilters(filters, type = 'movie', skip = 0, limit = 50) {
    const preset = buildPresetFromFilters(filters, type);
    return getDuckDbCatalogFromPreset(preset, skip, limit);
}

function sanitizeBigInt(val) {
    if (typeof val === 'bigint') return Number(val);
    return val;
}

async function getDuckDbMetaDetails(tmdbId, type = 'movie') {
    try {
        if (typeof tmdbId === 'string' && (tmdbId === 'movie' || tmdbId === 'tv' || tmdbId === 'series') && (typeof type === 'number' || (typeof type === 'string' && !['movie', 'tv', 'series'].includes(type)))) {
            const temp = tmdbId;
            tmdbId = type;
            type = temp;
        }
        const cleanId = Number(String(tmdbId).replace(/^tmdb:/i, ''));
        if (!Number.isFinite(cleanId) || cleanId <= 0) return null;
        const sql = `SELECT * FROM ${type === 'movie' ? 'movies' : 'tv'} WHERE id = ${cleanId}`;
        const rows = await duckDbStore.query(sql);

        if (rows.length === 0) return null;
        
        const item = rows[0];
        const isMovie = type === 'movie';
        let name = item.title || item.name || item.original_title || item.original_name || 'Unknown';
        let poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
        let background = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null;

        let parsedGenres = [];
        let parsedProviders = null;
        let parsedCast = [];
        let parsedCrew = [];
        let parsedKeywords = [];
        
        try { if (item.genres) parsedGenres = JSON.parse(item.genres); } catch(e){}
        try { if (item.watch_providers_it) parsedProviders = JSON.parse(item.watch_providers_it); } catch(e){}
        try { if (item.cast) parsedCast = JSON.parse(item.cast); } catch(e){}
        try { if (item.directors) parsedCrew.push(...JSON.parse(item.directors)); } catch(e){}
        try { if (item.writers) parsedCrew.push(...JSON.parse(item.writers)); } catch(e){}
        try { if (item.keywords) parsedKeywords = JSON.parse(item.keywords); } catch(e){}

        const rawTMDB = {
            id: sanitizeBigInt(item.id),
            title: item.title || item.name,
            original_title: item.original_title || item.original_name,
            overview: item.overview,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            vote_average: sanitizeBigInt(item.vote_average),
            popularity: sanitizeBigInt(item.popularity),
            release_date: item.release_date || item.first_air_date,
            first_air_date: item.first_air_date || item.release_date,
            original_language: item.original_language,
            genres: parsedGenres,
            'watch/providers': { results: { IT: parsedProviders } },
            credits: { cast: parsedCast, crew: parsedCrew },
            keywords: { results: parsedKeywords } // Per film
        };

        if (type === 'tv') {
            rawTMDB.keywords = { results: parsedKeywords }; // TMDB api difference (keywords vs results)
        }

        if (item.logo_path) rawTMDB.images = { logos: [{ file_path: item.logo_path }] };
        if (item.trailer_key) rawTMDB.videos = { results: [{ key: item.trailer_key, type: 'Trailer', site: 'YouTube' }] };
        if (item.content_rating) rawTMDB.release_dates = { results: [{ iso_3166_1: 'IT', release_dates: [{ certification: item.content_rating }] }] };

        const d = item.release_date || item.first_air_date || item.last_air_date || '';
        const dateStr = d instanceof Date ? d.toISOString() : String(d);

        const metaObj = {
            id: `tmdb:${item.id}`,
            _tmdbId: item.id,
            type: isMovie ? 'movie' : 'series',
            name,
            poster,
            posterShape: 'poster',
            background,
            description: item.overview || '',
            releaseInfo: dateStr.substring(0, 4),
            imdbRating: item.vote_average ? Number(item.vote_average).toFixed(1) : undefined,
            popularity: item.popularity || 0,
            genre_ids: parsedGenres.map(g => g.id),
            behaviorHints: isMovie ? { defaultVideoId: `tmdb:${item.id}` } : { hasScheduledVideos: true },
            rawTMDB
        };

        if (!isMovie) {
            metaObj._numberOfSeasons = item.number_of_seasons || 1;
            metaObj._originalLanguage = item.original_language;
            const genreIds = parsedGenres.map(g => g.id);
            metaObj._isAnime = item.original_language === 'ja' && genreIds.includes(16);
        }

        return metaObj;

    } catch (err) {
        console.error(`[DuckDbProvider] Errore in getDuckDbMetaDetails per TMDB ${tmdbId}:`, err);
        return null;
    }
}

module.exports = {
    mapSortBy,
    buildPresetFromFilters,
    getDuckDbCatalogFromFilters,
    getDuckDbCatalogFromPreset,
    getDuckDbMetaDetails
};
