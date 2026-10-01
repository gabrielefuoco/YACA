/**
 * tvdbBridge.js
 * Bridge TheTVDB -> TMDB via endpoint ufficiale TMDB:
 * GET /3/find/{tvdb_id}?external_source=tvdb_id&api_key=...
 *
 * Consente di risolvere con certezza del 100% record anime presenti nei cluster
 * di AniBridge con nodo tvdb_show:XXXX:sY ma privi di tmdb_show.
 * Risultati cachati su disco in <cacheDir>/tvdb-tmdb-cache.json.
 */

const fs = require('fs');
const path = require('path');

class TvdbBridgeResolver {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || path.join(__dirname, '../.cache');
        this.apiKey = options.apiKey || process.env.TMDB_API_KEY;
        this.fetchFn = options.fetch || globalThis.fetch;
        this.cachePath = path.join(this.cacheDir, 'tvdb-tmdb-cache.json');
        this.cache = new Map();
        this.isLoaded = false;
    }

    async loadCache() {
        if (this.isLoaded) return;
        if (fs.existsSync(this.cachePath)) {
            try {
                const content = fs.readFileSync(this.cachePath, 'utf8');
                const parsed = JSON.parse(content);
                if (parsed && typeof parsed === 'object') {
                    for (const [k, v] of Object.entries(parsed)) {
                        this.cache.set(String(k), v);
                    }
                }
            } catch (err) {
                console.warn(`[TvdbBridge] Impossibile leggere cache bridge TVDB: ${err.message}`);
            }
        }
        this.isLoaded = true;
    }

    saveCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            const obj = {};
            for (const [k, v] of this.cache.entries()) {
                obj[k] = v;
            }
            fs.writeFileSync(this.cachePath, JSON.stringify(obj, null, 2), 'utf8');
        } catch (err) {
            console.warn(`[TvdbBridge] Errore salvataggio cache bridge TVDB: ${err.message}`);
        }
    }

    /**
     * Risolve un tvdb_id in TMDB id tramite /3/find/{tvdb_id}?external_source=tvdb_id
     * @param {string|number} tvdbId
     * @param {Object} [options]
     * @param {boolean} [options.refresh]
     * @returns {Promise<{ tmdbId: string, name: string, mediaType: string }|null>}
     */
    async resolveTvdb(tvdbId, options = {}) {
        if (!tvdbId) return null;
        const idStr = String(tvdbId).trim();
        if (!idStr) return null;

        await this.loadCache();

        if (!options.refresh && this.cache.has(idStr)) {
            const cached = this.cache.get(idStr);
            return cached ? { ...cached, fromCache: true } : null;
        }

        if (!this.apiKey) {
            console.warn('[TvdbBridge] TMDB_API_KEY assente: bridge TVDB->TMDB disabilitato.');
            return null;
        }

        const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(idStr)}?external_source=tvdb_id&api_key=${this.apiKey}`;

        try {
            const res = await this.fetchFn(url);
            if (!res.ok) {
                if (res.status === 404) {
                    this.cache.set(idStr, null);
                }
                return null;
            }

            const data = await res.json();
            let match = null;

            if (Array.isArray(data.tv_results) && data.tv_results.length > 0) {
                const tv = data.tv_results[0];
                match = {
                    tmdbId: String(tv.id),
                    name: tv.name || tv.original_name,
                    mediaType: 'tv'
                };
            } else if (Array.isArray(data.movie_results) && data.movie_results.length > 0) {
                const movie = data.movie_results[0];
                match = {
                    tmdbId: String(movie.id),
                    name: movie.title || movie.original_title,
                    mediaType: 'movie'
                };
            }

            this.cache.set(idStr, match);
            return match ? { ...match, fromCache: false } : null;
        } catch (err) {
            console.warn(`[TvdbBridge] Errore richiesta TMDB /find per tvdb_id ${idStr}: ${err.message}`);
            return null;
        }
    }
}

module.exports = {
    TvdbBridgeResolver
};
