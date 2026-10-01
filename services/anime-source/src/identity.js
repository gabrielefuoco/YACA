/**
 * identity.js
 * Risolve l'identità di un anime (anilist_id / mal_id) in TMDB id e Kitsu id.
 * Costruisce indici in-memory leggeri dai dump di Anibridge e Fribb.
 * Include refresh della cache a TTL (default 3 ore) e fallback TMDB per titoli non mappati.
 * Nessuna dipendenza dal codice di YACA.
 */

const fs = require('fs');
const path = require('path');
const { TmdbFallbackResolver } = require('./tmdbFallback');

const ANIBRIDGE_URL = 'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const FRIBB_MINI_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';
const DEFAULT_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 ore

class IdentityResolver {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || path.join(__dirname, '../.cache');
        this.fetchFn = options.fetch || globalThis.fetch;
        this.maxAgeMs = options.maxAgeMs !== undefined
            ? Number(options.maxAgeMs)
            : (process.env.MAPPINGS_MAX_AGE_MS ? Number(process.env.MAPPINGS_MAX_AGE_MS) : DEFAULT_MAX_AGE_MS);

        this.tmdbApiKey = options.tmdbApiKey || process.env.TMDB_API_KEY;
        this.fallbackResolver = options.fallbackResolver || new TmdbFallbackResolver({
            cacheDir: this.cacheDir,
            apiKey: this.tmdbApiKey,
            fetch: this.fetchFn
        });

        this.anilistToTmdb = new Map();
        this.malToTmdb = new Map();
        this.kitsuToTmdb = new Map();

        this.anilistToKitsu = new Map();
        this.malToKitsu = new Map();

        this.anilistToSeason = new Map();
        this.malToSeason = new Map();

        this.isReady = false;
    }

    /**
     * Carica direttamente i dati in memoria (utile per test offline e fixture)
     * @param {Object} params
     * @param {Array<Object>} [params.fribbData]
     * @param {Object} [params.anibridgeData]
     */
    loadFromData({ fribbData, anibridgeData } = {}) {
        if (fribbData && Array.isArray(fribbData)) {
            this._buildFribbIndex(fribbData);
        }
        if (anibridgeData && typeof anibridgeData === 'object') {
            this._buildAnibridgeIndex(anibridgeData);
        }
        this.isReady = true;
    }

    _buildFribbIndex(fribbData) {
        for (const item of fribbData) {
            const kitsuId = item.kitsu_id ? String(item.kitsu_id) : null;
            const anilistId = item.anilist_id ? String(item.anilist_id) : null;
            const malId = item.mal_id ? String(item.mal_id) : null;

            let tmdbVal = null;
            if (item.themoviedb_id) {
                tmdbVal = typeof item.themoviedb_id === 'object' && item.themoviedb_id !== null
                    ? (item.themoviedb_id.tv || item.themoviedb_id.movie)
                    : item.themoviedb_id;
                if (tmdbVal) tmdbVal = String(tmdbVal);
            }

            if (kitsuId) {
                if (anilistId) this.anilistToKitsu.set(anilistId, kitsuId);
                if (malId) this.malToKitsu.set(malId, kitsuId);
                if (tmdbVal) {
                    this.kitsuToTmdb.set(kitsuId, tmdbVal);
                }
            }

            if (tmdbVal) {
                if (anilistId && !this.anilistToTmdb.has(anilistId)) {
                    this.anilistToTmdb.set(anilistId, tmdbVal);
                }
                if (malId && !this.malToTmdb.has(malId)) {
                    this.malToTmdb.set(malId, tmdbVal);
                }
            }
        }
    }

    _buildAnibridgeIndex(anibridgeData) {
        for (const [clusterKey, mappings] of Object.entries(anibridgeData)) {
            if (clusterKey === '$meta' || !mappings || typeof mappings !== 'object') continue;

            const allNodes = [clusterKey, ...Object.keys(mappings)];
            let clusterAnilist = null;
            let clusterMal = null;

            for (const node of allNodes) {
                if (node.startsWith('anilist:')) clusterAnilist = node.split(':')[1];
                if (node.startsWith('mal:')) clusterMal = node.split(':')[1];
            }

            for (const providerKey of Object.keys(mappings)) {
                if (providerKey.startsWith('tmdb_show:') || providerKey.startsWith('tmdb_movie:')) {
                    const parts = providerKey.split(':');
                    const tmdbId = parts[1];
                    let season = 1;
                    if (parts.length > 2) {
                        season = parseInt(parts[2].replace('s', ''), 10) || 1;
                    }

                    if (tmdbId) {
                        const strTmdb = String(tmdbId);
                        if (clusterAnilist) {
                            if (!this.anilistToTmdb.has(clusterAnilist)) {
                                this.anilistToTmdb.set(clusterAnilist, strTmdb);
                            }
                            this.anilistToSeason.set(clusterAnilist, season);
                        }
                        if (clusterMal) {
                            if (!this.malToTmdb.has(clusterMal)) {
                                this.malToTmdb.set(clusterMal, strTmdb);
                            }
                            this.malToSeason.set(clusterMal, season);
                        }
                    }
                }
            }
        }
    }

    /**
     * Carica un file di dump con refresh basato su TTL (default 3 ore).
     * Se il file è scaduto, tenta il download; se il download fallisce,
     * la cache precedente viene mantenuta valida senza crashare.
     */
    async _loadDumpWithRefresh({ filePath, url, name }) {
        let fileExists = false;
        let isFresh = false;

        if (fs.existsSync(filePath)) {
            fileExists = true;
            try {
                const stat = fs.statSync(filePath);
                const ageMs = Date.now() - stat.mtimeMs;
                if (ageMs < this.maxAgeMs) {
                    isFresh = true;
                }
            } catch (e) {
                // Se stat fallisce, consideralo scaduto
            }
        }

        // Se esiste ed è fresco, leggiamo direttamente dalla cache
        if (fileExists && isFresh) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            } catch (e) {
                console.warn(`[Identity] Errore lettura cache ${name} (${e.message}). Tento riscaricamento...`);
            }
        }

        // Non esiste o è scaduto o lettura fallita: tentiamo il download
        try {
            console.log(`[Identity] Download dump ${name} in corso...`);
            const res = await this.fetchFn(url);
            if (!res.ok) throw new Error(`Download ${name} fallito con status ${res.status}`);
            const data = await res.json();
            fs.writeFileSync(filePath, JSON.stringify(data));
            console.log(`[Identity] Dump ${name} scaricato e memorizzato in cache.`);
            return data;
        } catch (err) {
            console.warn(`[Identity] Download ${name} fallito: ${err.message}`);
            // Se avevamo già una cache precedente su disco, usala senza crashare
            if (fileExists) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    console.warn(`[Identity] Cache precedente per ${name} mantenuta valida.`);
                    return data;
                } catch (readErr) {
                    console.warn(`[Identity] Errore lettura fallback cache precedente ${name}: ${readErr.message}`);
                }
            }
            // Se non esiste alcuna cache precedente e il download fallisce, rilanciamo l'errore
            throw new Error(`Download ${name} fallito: ${err.message}`);
        }
    }

    async init() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        const fribbPath = path.join(this.cacheDir, 'fribb-mini.json');
        const anibridgePath = path.join(this.cacheDir, 'anibridge-mappings.json');

        const fribbData = await this._loadDumpWithRefresh({
            filePath: fribbPath,
            url: FRIBB_MINI_URL,
            name: 'Fribb'
        });

        const anibridgeData = await this._loadDumpWithRefresh({
            filePath: anibridgePath,
            url: ANIBRIDGE_URL,
            name: 'Anibridge'
        });

        this.loadFromData({ fribbData, anibridgeData });
        console.log(`[Identity] Indice inizializzato: ${this.anilistToTmdb.size} AniList->TMDB, ${this.malToTmdb.size} MAL->TMDB, ${this.kitsuToTmdb.size} Kitsu->TMDB`);
    }

    /**
     * Risolve un record AnimeUnity nell'identità unificata (TMDB + Kitsu)
     * @param {Object} params
     * @param {number|string} [params.anilistId]
     * @param {number|string} [params.malId]
     * @returns {{ tmdbId: string, kitsuId: string|null, anilistId: number|null, malId: number|null, season: number }|null}
     */
    resolve({ anilistId, malId } = {}) {
        const aId = anilistId ? String(anilistId) : null;
        const mId = malId ? String(malId) : null;

        let tmdbId = (aId && this.anilistToTmdb.get(aId)) || (mId && this.malToTmdb.get(mId)) || null;
        const kitsuId = (aId && this.anilistToKitsu.get(aId)) || (mId && this.malToKitsu.get(mId)) || null;

        if (!tmdbId && kitsuId) {
            tmdbId = this.kitsuToTmdb.get(kitsuId) || null;
        }

        if (!tmdbId) {
            return null;
        }

        const season = (aId && this.anilistToSeason.get(aId)) || (mId && this.malToSeason.get(mId)) || 1;

        return {
            tmdbId: String(tmdbId),
            kitsuId: kitsuId ? String(kitsuId) : null,
            anilistId: aId ? Number(aId) : null,
            malId: mId ? Number(mId) : null,
            season
        };
    }

    /**
     * Arricchisce i record non risolti cercando su TMDB tramite TmdbFallbackResolver.
     * I mapping ufficiali vincono sempre; le mappe interne in memoria vengono popolate solo
     * per le chiavi mancanti. In --dry-run non scrive su disco, solo log.
     * @param {Array<Object>} records
     * @param {Object} [options]
     * @param {boolean} [options.dryRun]
     * @param {boolean} [options.refreshFallbacks]
     * @returns {Promise<Array<{ record: Object, match: Object }>>}
     */
    async enrichWithFallbacks(records, options = {}) {
        if (!Array.isArray(records) || records.length === 0) return [];
        const dryRun = !!options.dryRun;
        const refreshFallbacks = !!options.refreshFallbacks;

        await this.fallbackResolver.loadCache();

        const enriched = [];
        for (const rec of records) {
            const anilistId = rec.anilist_id;
            const malId = rec.mal_id;

            // Il mapping ufficiale vince sempre: se già mappato, non fare nulla
            const existing = this.resolve({ anilistId, malId });
            if (existing && existing.tmdbId) {
                continue;
            }

            const rawTitle = rec.title || rec.title_eng || rec.title_it || rec.slug || `Anime #${rec.id}`;

            const match = await this.fallbackResolver.resolveFallback({
                title: rec.title,
                title_eng: rec.title_eng,
                title_it: rec.title_it,
                slug: rec.slug,
                date: rec.date,
                anilistId,
                malId
            }, { refreshFallbacks, dryRun });

            if (match && match.tmdbId) {
                console.log(`[IdentityFallback] Record "${rawTitle}" (id: ${rec.id}) risolto in TMDB ${match.tmdbId} ("${match.name}") [matched: "${match.matchedTitle}", conf: ${match.confidence}]${dryRun ? ' (DRY-RUN)' : ''}`);

                const aId = anilistId ? String(anilistId) : null;
                const mId = malId ? String(malId) : null;

                if (aId && !this.anilistToTmdb.has(aId)) {
                    this.anilistToTmdb.set(aId, String(match.tmdbId));
                }
                if (mId && !this.malToTmdb.has(mId)) {
                    this.malToTmdb.set(mId, String(match.tmdbId));
                }

                enriched.push({ record: rec, match });
            }
        }

        if (!dryRun) {
            this.fallbackResolver.saveCache();
        }

        return enriched;
    }
}

module.exports = {
    IdentityResolver,
    ANIBRIDGE_URL,
    FRIBB_MINI_URL,
    DEFAULT_MAX_AGE_MS
};
