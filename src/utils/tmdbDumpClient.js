const axios = require('axios');
const zlib = require('zlib');
const readline = require('readline');

const TMDB_GENRES_EN_MAP = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
    10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics'
};
function getEnglishGenreName(id, originalName) {
    return TMDB_GENRES_EN_MAP[id] || originalName;
}

function extractCommonTmdbData(data) {
    const cast = (data.credits?.cast || []).slice(0, 20).map(c => ({id: c.id, name: c.name, character: c.character, order: c.order}));
    const keywordsArray = data.keywords?.keywords || data.keywords?.results || [];
    const keywords = keywordsArray.map(k => ({id: k.id, name: k.name}));
    const trailer = (data.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
    const logo = (data.images?.logos || []).find(l => l.iso_639_1 === 'it') || 
                 (data.images?.logos || []).find(l => l.iso_639_1 === 'en') || 
                 (data.images?.logos || []).find(l => l.iso_639_1 === null);
    const recommendations = (data.recommendations?.results || []).slice(0, 10).map(r => r.id);
    const watch_providers_it = data['watch/providers']?.results?.IT || null;
    const production_companies = (data.production_companies || []).map(c => ({id: c.id, name: c.name}));
    const production_countries = (data.production_countries || []).map(c => c.iso_3166_1);
    const spoken_languages = (data.spoken_languages || []).map(l => l.iso_639_1);
    const genres = JSON.stringify((data.genres || []).map(g => ({ id: g.id, name: getEnglishGenreName(g.id, g.name) })));

    return {
        cast: JSON.stringify(cast),
        keywords: JSON.stringify(keywords),
        trailer_key: trailer ? trailer.key : null,
        logo_path: logo ? logo.file_path : null,
        recommendations: JSON.stringify(recommendations),
        watch_providers_it: watch_providers_it ? JSON.stringify(watch_providers_it) : null,
        production_companies: JSON.stringify(production_companies),
        production_countries: JSON.stringify(production_countries),
        spoken_languages: JSON.stringify(spoken_languages),
        genres: genres
    };
}

class TmdbDumpClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.themoviedb.org/3';
        
        // Cache in memory per non riscaricare i daily exports ogni 6 ore durante la sync
        this.dailyExportCache = {
            dateStr: null,
            movies: null,
            tv: null
        };
    }

    async sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async fetchWithRetry(url, params = {}, retries = 5) {
        const config = {
            params: { api_key: this.apiKey, ...params },
            timeout: 15000 // 15s timeout
        };
        
        let attempt = 0;
        let delay = 5000;
        
        while (attempt <= retries) {
            try {
                const res = await axios.get(url, config);
                return res.data;
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    return null; // Risorsa non trovata o rimossa
                }
                
                if (error.response && error.response.status === 429) {
                    // Exponential backoff
                    const jitter = delay * (Math.random() * 0.4 - 0.2); // ±20%
                    const waitTime = Math.min(delay + jitter, 60000);
                    console.warn(`[TmdbDumpClient] 429 Too Many Requests. Retrying in ${Math.round(waitTime/1000)}s...`);
                    await this.sleep(waitTime);
                    delay *= 2;
                } else if (!error.response || error.response.status >= 500) {
                    console.warn(`[TmdbDumpClient] Network error (${error.message}). Retrying in 5s...`);
                    await this.sleep(5000);
                } else {
                    console.error(`[TmdbDumpClient] Fatal API Error: ${error.message}`);
                    throw error;
                }
                
                attempt++;
                if (attempt > retries) {
                    console.error(`[TmdbDumpClient] Max retries reached for ${url}`);
                    return null;
                }
            }
        }
        return null;
    }

    async fetchMovie(id) {
        const data = await this.fetchWithRetry(`${this.baseUrl}/movie/${id}`, {
            language: 'it-IT',
            append_to_response: 'keywords,credits,videos,images,recommendations,watch/providers,release_dates',
            include_image_language: 'it,en,null',
            include_video_language: 'it,en,null'
        });
        
        if (!data || data.vote_count < 10) return null;

        const common = extractCommonTmdbData(data);
        const directors = (data.credits?.crew || []).filter(c => c.job === 'Director').map(c => ({id: c.id, name: c.name}));
        const writers = (data.credits?.crew || []).filter(c => ['Screenplay', 'Writer'].includes(c.job)).map(c => ({id: c.id, name: c.name}));
        
        const itRelease = (data.release_dates?.results || []).find(r => r.iso_3166_1 === 'IT');
        const usRelease = (data.release_dates?.results || []).find(r => r.iso_3166_1 === 'US');
        const content_rating = itRelease?.release_dates?.[0]?.certification || usRelease?.release_dates?.[0]?.certification || null;

        return {
            ...common,
            id: data.id,
            imdb_id: data.imdb_id,
            title: data.title,
            original_title: data.original_title,
            original_language: data.original_language,
            overview: data.overview,
            release_date: data.release_date,
            runtime: data.runtime,
            vote_average: data.vote_average,
            vote_count: data.vote_count,
            popularity: data.popularity,
            status: data.status,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            directors: JSON.stringify(directors),
            writers: JSON.stringify(writers),
            tagline: data.tagline || null,
            collection_id: data.belongs_to_collection ? data.belongs_to_collection.id : null,
            collection_name: data.belongs_to_collection ? data.belongs_to_collection.name : null,
            content_rating: content_rating,
            adult: data.adult || false,
            budget: data.budget || 0,
            revenue: data.revenue || 0,
            _fetched_at: new Date().toISOString()
        };
    }

    async fetchTv(id) {
        const data = await this.fetchWithRetry(`${this.baseUrl}/tv/${id}`, {
            language: 'it-IT',
            append_to_response: 'keywords,credits,videos,images,recommendations,watch/providers,content_ratings,external_ids',
            include_image_language: 'it,en,null',
            include_video_language: 'it,en,null'
        });
        
        if (!data || data.vote_count < 10) return null;

        const common = extractCommonTmdbData(data);
        const created_by = (data.created_by || []).map(c => ({id: c.id, name: c.name}));
        const networks = (data.networks || []).map(n => ({id: n.id, name: n.name}));
        
        // Runtime della serie (prende il primo, se disponibile, altrimenti media, altrimenti null)
        let runtime = null;
        if (data.episode_run_time && data.episode_run_time.length > 0) {
            runtime = data.episode_run_time[0]; // Spesso è il valore primario
        }

        const itRating = (data.content_ratings?.results || []).find(r => r.iso_3166_1 === 'IT');
        const usRating = (data.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US');
        const content_rating = itRating?.rating || usRating?.rating || null;

        return {
            ...common,
            id: data.id,
            imdb_id: data.external_ids?.imdb_id || null,
            tvdb_id: data.external_ids?.tvdb_id || null,
            name: data.name,
            original_name: data.original_name,
            original_language: data.original_language,
            overview: data.overview,
            first_air_date: data.first_air_date,
            last_air_date: data.last_air_date,
            number_of_seasons: data.number_of_seasons,
            number_of_episodes: data.number_of_episodes,
            vote_average: data.vote_average,
            vote_count: data.vote_count,
            popularity: data.popularity,
            status: data.status,
            in_production: data.in_production || false,
            type: data.type,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            created_by: JSON.stringify(created_by),
            networks: JSON.stringify(networks),
            tagline: data.tagline || null,
            content_rating: content_rating,
            adult: data.adult || false,
            runtime: runtime,
            _fetched_at: new Date().toISOString()
        };
    }

    async fetchChanges(mediaType, page) {
        const data = await this.fetchWithRetry(`${this.baseUrl}/${mediaType}/changes`, { page });
        return data || { results: [], total_pages: 1 };
    }

    async downloadDailyExport(mediaType) {
        const typeStr = mediaType === 'movies' ? 'movie_ids' : 'tv_series_ids';
        
        for (let daysAgo = 0; daysAgo < 3; daysAgo++) {
            const dt = new Date();
            dt.setUTCDate(dt.getUTCDate() - daysAgo);
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(dt.getUTCDate()).padStart(2, '0');
            const yyyy = dt.getUTCFullYear();
            const dateStr = `${mm}_${dd}_${yyyy}`;
            
            // Check in-memory cache
            if (this.dailyExportCache.dateStr === dateStr && this.dailyExportCache[mediaType]) {
                console.log(`[TmdbDumpClient] Using cached daily export for ${mediaType} on ${dateStr}`);
                return this.dailyExportCache[mediaType];
            }

            const url = `http://files.tmdb.org/p/exports/${typeStr}_${dateStr}.json.gz`;
            
            try {
                const res = await axios({
                    method: 'get',
                    url: url,
                    responseType: 'stream'
                });
                
                console.log(`[TmdbDumpClient] Found daily export for ${mediaType} on ${dateStr}`);
                
                const validIds = [];
                const gunzip = zlib.createGunzip();
                const rl = readline.createInterface({
                    input: res.data.pipe(gunzip),
                    crlfDelay: Infinity
                });
                
                for await (const line of rl) {
                    if (!line.trim()) continue;
                    try {
                        const m = JSON.parse(line);
                        // Filtro pre-fetch: popularity >= 1.0 (adult solo x movies)
                        if (m.popularity >= 1.0 && m.adult !== true) {
                            validIds.push(m.id);
                        }
                    } catch (e) {}
                }
                
                // Aggiorniamo la cache 
                if (this.dailyExportCache.dateStr !== dateStr) {
                    this.dailyExportCache = { dateStr, movies: null, tv: null };
                }
                this.dailyExportCache[mediaType] = validIds;

                return validIds;
            } catch (err) {
                if (err.response && err.response.status === 404) {
                    console.log(`[TmdbDumpClient] Daily export ${dateStr} not ready yet...`);
                } else {
                    console.error(`[TmdbDumpClient] Error fetching export ${dateStr}:`, err.message);
                }
            }
        }
        throw new Error(`[TmdbDumpClient] Failed to download daily export for ${mediaType}`);
    }
}

module.exports = TmdbDumpClient;
