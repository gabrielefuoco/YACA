/**
 * DuckDbProvider.js
 * 
 * Sostituisce AiDiscoveryProvider.js.
 * Utilizza duckDbStore e il traduttore SQL per generare i cataloghi locali a latenza zero.
 */

const duckDbStore = require('../../db/duckDbStore');
const { processTmdbQueryToPreset } = require('../../utils/legacyTmdbAdapter');
const { buildCatalogQuery } = require('../../db/queryBuilder');

async function getDuckDbCatalogFromPreset(preset, skip = 0, limit = 50) {
    try {
        const sql = await buildCatalogQuery(preset, skip, limit);
        const rows = await duckDbStore.query(sql);
        
        return rows.map(item => {
            const isMovie = preset.type === 'movie';
            let name = item.title || item.name || item.original_title || item.original_name || 'Unknown';
            let poster = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null;
            let background = item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null;
            
            let parsedGenres = [];
            let parsedProviders = null;
            try { if (item.genres) parsedGenres = JSON.parse(item.genres); } catch(e){}
            try { if (item.watch_providers_it) parsedProviders = JSON.parse(item.watch_providers_it); } catch(e){}

            const rawTMDB = {
                id: item.id,
                title: item.title || item.name,
                original_title: item.original_title || item.original_name,
                overview: item.overview,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                vote_average: item.vote_average,
                popularity: item.popularity,
                release_date: item.release_date,
                original_language: item.original_language,
                genres: parsedGenres,
                belongs_to_collection: item.collection_id ? { id: item.collection_id, name: item.collection_name } : null,
                collection_id: item.collection_id,
                'watch/providers': { results: { IT: parsedProviders } }
            };

            let releaseStr = '';
            if (item.release_date) {
                releaseStr = item.release_date instanceof Date ? item.release_date.toISOString() : String(item.release_date);
            } else if (item.first_air_date) {
                releaseStr = item.first_air_date instanceof Date ? item.first_air_date.toISOString() : String(item.first_air_date);
            }
            
            return {
                id: `tmdb:${item.id}`,
                type: isMovie ? 'movie' : 'series',
                name: name,
                poster: poster,
                background: background,
                releaseInfo: releaseStr ? releaseStr.substring(0, 4) : null,
                imdbRating: item.vote_average ? String(item.vote_average.toFixed(1)) : null,
                genres: parsedGenres.map(g => g.name || g),
                description: item.overview || null,
                rawTMDB: rawTMDB
            };
        });
    } catch (e) {
        console.error('[DuckDbProvider] Error in getDuckDbCatalogFromPreset:', e);
        return [];
    }
}

async function getDuckDbCatalogFromFilters(filters, type = 'movie', skip = 0, limit = 50, options = {}) {
    try {
        const preset = processTmdbQueryToPreset(filters, type);
        const sql = await buildCatalogQuery(preset, skip, limit);
        
        // 2. Esecuzione query in millisecondi
        const rows = await duckDbStore.query(sql);

        // 3. Mappatura nel formato base Stremio (stile TMDB "lightMeta")
        const lightMetas = rows.map(item => {
            const isMovie = type === 'movie';
            let name = item.title || item.name || item.original_title || item.original_name || 'Unknown';
            let poster = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null;
            let background = item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null;
            
            // Parsing dei campi JSON stringificati per ricreare l'oggetto TMDB completo atteso dal Formatter
            let parsedGenres = [];
            let parsedProviders = null;
            
            try { if (item.genres) parsedGenres = JSON.parse(item.genres); } catch(e){}
            try { if (item.watch_providers_it) parsedProviders = JSON.parse(item.watch_providers_it); } catch(e){}

            // Ricostruiamo un rawTMDB "fittizio" ma ultra-ricco usando i nostri dati estratti
            const rawTMDB = {
                id: item.id,
                title: item.title || item.name,
                original_title: item.original_title || item.original_name,
                overview: item.overview,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                vote_average: item.vote_average,
                popularity: item.popularity,
                release_date: item.release_date,
                original_language: item.original_language,
                genres: parsedGenres,
                'watch/providers': {
                    results: {
                        IT: parsedProviders
                    }
                }
            };

            // Inseriamo i dati premium estratti (logo, trailer, content_rating)
            if (item.logo_path) {
                rawTMDB.images = { logos: [{ file_path: item.logo_path }] };
            }
            if (item.trailer_key) {
                rawTMDB.videos = { results: [{ key: item.trailer_key, type: 'Trailer', site: 'YouTube' }] };
            }
            if (item.content_rating) {
                rawTMDB.release_dates = { results: [{ iso_3166_1: 'IT', release_dates: [{ certification: item.content_rating }] }] };
            }

            const d = item.release_date || item.last_air_date || '';
            const dateStr = d instanceof Date ? d.toISOString() : String(d);
            
            return {
                id: `tmdb:${item.id}`,
                _tmdbId: item.id,
                type: isMovie ? 'movie' : 'series',
                name: item.title || item.name || item.original_title || item.original_name || 'Unknown',
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                posterShape: 'poster',
                background: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
                description: item.overview || '',
                releaseInfo: dateStr.substring(0, 4),
                imdbRating: item.vote_average ? Number(item.vote_average).toFixed(1) : undefined,
                popularity: item.popularity || 0,
                rawTMDB // Il formatter lo userà per abbellire UI, logo, badge, ecc.
            };
        });

        // 4. Ritorna i lightMetas (il catalogHandler si occuperà di sanitizeCatalogMeta)
        return lightMetas;

    } catch (err) {
        console.error(`[DuckDbProvider] Errore nella generazione del catalogo:`, err);
        return [];
    }
}

function sanitizeBigInt(val) {
    if (typeof val === 'bigint') return Number(val);
    return val;
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
            release_date: item.release_date,
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

        const d = item.release_date || item.last_air_date || '';
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
    getDuckDbCatalogFromFilters,
    getDuckDbCatalogFromPreset,
    getDuckDbMetaDetails
};
