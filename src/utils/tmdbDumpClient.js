const axios = require('axios');
const zlib = require('zlib');
const readline = require('readline');
const { promisify } = require('util');
const stream = require('stream');

const pipeline = promisify(stream.pipeline);

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

        const directors = (data.credits?.crew || []).filter(c => c.job === 'Director').map(c => ({id: c.id, name: c.name}));
        const cast = (data.credits?.cast || []).slice(0, 20).map(c => ({id: c.id, name: c.name, character: c.character, order: c.order}));
        const keywords = (data.keywords?.keywords || []).map(k => ({id: k.id, name: k.name}));
        const trailer = (data.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
        const recommendations = (data.recommendations?.results || []).slice(0, 10).map(r => r.id);
        const watch_providers_it = data['watch/providers']?.results?.IT || null;
        const production_companies = (data.production_companies || []).map(c => ({id: c.id, name: c.name}));
        const production_countries = (data.production_countries || []).map(c => c.iso_3166_1);
        
        const itRelease = (data.release_dates?.results || []).find(r => r.iso_3166_1 === 'IT');
        const usRelease = (data.release_dates?.results || []).find(r => r.iso_3166_1 === 'US');
        const content_rating = itRelease?.release_dates?.[0]?.certification || usRelease?.release_dates?.[0]?.certification || null;

        return {
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
            genres: JSON.stringify(data.genres || []),
            keywords: JSON.stringify(keywords),
            cast: JSON.stringify(cast),
            directors: JSON.stringify(directors),
            production_companies: JSON.stringify(production_companies),
            production_countries: JSON.stringify(production_countries),
            trailer_key: trailer ? trailer.key : null,
            tagline: data.tagline || null,
            collection_id: data.belongs_to_collection ? data.belongs_to_collection.id : null,
            collection_name: data.belongs_to_collection ? data.belongs_to_collection.name : null,
            recommendations: JSON.stringify(recommendations),
            watch_providers_it: watch_providers_it ? JSON.stringify(watch_providers_it) : null,
            content_rating: content_rating,
            _fetched_at: new Date().toISOString()
        };
    }

    async fetchTv(id) {
        const data = await this.fetchWithRetry(`${this.baseUrl}/tv/${id}`, {
            language: 'it-IT',
            append_to_response: 'keywords,credits,videos,images,recommendations,watch/providers,content_ratings',
            include_image_language: 'it,en,null',
            include_video_language: 'it,en,null'
        });
        
        if (!data || data.vote_count < 10) return null;

        const cast = (data.credits?.cast || []).slice(0, 20).map(c => ({id: c.id, name: c.name, character: c.character, order: c.order}));
        const keywords = (data.keywords?.results || []).map(k => ({id: k.id, name: k.name}));
        const trailer = (data.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');
        const created_by = (data.created_by || []).map(c => ({id: c.id, name: c.name}));
        const networks = (data.networks || []).map(n => ({id: n.id, name: n.name}));
        const recommendations = (data.recommendations?.results || []).slice(0, 10).map(r => r.id);
        const watch_providers_it = data['watch/providers']?.results?.IT || null;
        const production_companies = (data.production_companies || []).map(c => ({id: c.id, name: c.name}));
        const production_countries = (data.production_countries || []).map(c => c.iso_3166_1);

        const itRating = (data.content_ratings?.results || []).find(r => r.iso_3166_1 === 'IT');
        const usRating = (data.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US');
        const content_rating = itRating?.rating || usRating?.rating || null;

        return {
            id: data.id,
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
            type: data.type,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            genres: JSON.stringify(data.genres || []),
            keywords: JSON.stringify(keywords),
            cast: JSON.stringify(cast),
            created_by: JSON.stringify(created_by),
            networks: JSON.stringify(networks),
            production_companies: JSON.stringify(production_companies),
            production_countries: JSON.stringify(production_countries),
            trailer_key: trailer ? trailer.key : null,
            tagline: data.tagline || null,
            recommendations: JSON.stringify(recommendations),
            watch_providers_it: watch_providers_it ? JSON.stringify(watch_providers_it) : null,
            content_rating: content_rating,
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
