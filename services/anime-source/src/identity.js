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
const { TvdbBridgeResolver } = require('./tvdbBridge');

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
        this.tvdbBridgeResolver = options.tvdbBridgeResolver || new TvdbBridgeResolver({
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

        this.anilistToTvdb = new Map(); // anilistId -> { tvdbId: string, season: number }
        this.malToTvdb = new Map();      // malId -> { tvdbId: string, season: number }

        this.officialAnilist = new Set();
        this.officialMal = new Set();
        this.resolutionLevelMap = new Map(); // 'anilist:X' | 'mal:Y' -> 'official' | 'bridge_tvdb' | 'title_fallback'

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
                if (anilistId) {
                    if (!this.anilistToTmdb.has(anilistId)) {
                        this.anilistToTmdb.set(anilistId, tmdbVal);
                    }
                    this.officialAnilist.add(anilistId);
                    this.resolutionLevelMap.set('anilist:' + anilistId, 'official');
                }
                if (malId) {
                    if (!this.malToTmdb.has(malId)) {
                        this.malToTmdb.set(malId, tmdbVal);
                    }
                    this.officialMal.add(malId);
                    this.resolutionLevelMap.set('mal:' + malId, 'official');
                }
            }
        }
    }

    _buildAnibridgeIndex(anibridgeData) {
        for (const [clusterKey, mappings] of Object.entries(anibridgeData)) {
            if (clusterKey === '$meta' || !mappings || typeof mappings !== 'object') continue;

            const allNodes = [clusterKey, ...Object.keys(mappings)];
            const anilistList = [];
            const malList = [];
            const tvdbList = [];

            for (const node of allNodes) {
                if (node.startsWith('anilist:')) anilistList.push(node.split(':')[1]);
                if (node.startsWith('mal:')) malList.push(node.split(':')[1]);
                if (node.startsWith('tvdb_show:') || node.startsWith('tvdb_movie:')) {
                    const parts = node.split(':');
                    const tvdbId = parts[1];
                    let season = 1;
                    if (parts.length > 2 && parts[2].startsWith('s')) {
                        season = parseInt(parts[2].replace('s', ''), 10) || 1;
                    }
                    if (tvdbId) {
                        tvdbList.push({ tvdbId: String(tvdbId), season });
                    }
                }
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
                        for (const clusterAnilist of anilistList) {
                            if (!this.anilistToTmdb.has(clusterAnilist)) {
                                this.anilistToTmdb.set(clusterAnilist, strTmdb);
                            }
                            this.anilistToSeason.set(clusterAnilist, season);
                            this.officialAnilist.add(clusterAnilist);
                            this.resolutionLevelMap.set('anilist:' + clusterAnilist, 'official');
                        }
                        for (const clusterMal of malList) {
                            if (!this.malToTmdb.has(clusterMal)) {
                                this.malToTmdb.set(clusterMal, strTmdb);
                            }
                            this.malToSeason.set(clusterMal, season);
                            this.officialMal.add(clusterMal);
                            this.resolutionLevelMap.set('mal:' + clusterMal, 'official');
                        }
                    }
                }
            }

            for (const tv of tvdbList) {
                for (const aId of anilistList) {
                    if (!this.anilistToTvdb.has(aId)) {
                        this.anilistToTvdb.set(aId, tv);
                    }
                }
                for (const mId of malList) {
                    if (!this.malToTvdb.has(mId)) {
                        this.malToTvdb.set(mId, tv);
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
        console.log(`[Identity] Indice inizializzato: ${this.anilistToTmdb.size} AniList->TMDB, ${this.malToTmdb.size} MAL->TMDB, ${this.kitsuToTmdb.size} Kitsu->TMDB, ${this.anilistToTvdb.size} AniList->TVDB, ${this.malToTvdb.size} MAL->TVDB`);
    }

    /**
     * Verifica se il record possiede un mapping ufficiale pre-esistente (Fribb o AniBridge)
     * @param {Object} params
     * @param {number|string} [params.anilistId]
     * @param {number|string} [params.malId]
     * @returns {boolean}
     */
    isOfficiallyMapped({ anilistId, malId } = {}) {
        const aId = anilistId ? String(anilistId) : null;
        const mId = malId ? String(malId) : null;
        return (aId && this.officialAnilist.has(aId)) || (mId && this.officialMal.has(mId)) || false;
    }

    /**
     * Restituisce i metadati TVDB indicizzati (tvdb_id e stagione) da AniBridge
     * @param {Object} params
     * @param {number|string} [params.anilistId]
     * @param {number|string} [params.malId]
     * @returns {{ tvdbId: string, season: number }|null}
     */
    getTvdb({ anilistId, malId } = {}) {
        const aId = anilistId ? String(anilistId) : null;
        const mId = malId ? String(malId) : null;
        return (aId && this.anilistToTvdb.get(aId)) || (mId && this.malToTvdb.get(mId)) || null;
    }

    /**
     * Restituisce il livello che ha risolto il record ('official' | 'bridge_tvdb' | 'title_fallback' | null)
     * @param {Object} params
     * @param {number|string} [params.anilistId]
     * @param {number|string} [params.malId]
     * @returns {string|null}
     */
    getResolutionLevel({ anilistId, malId } = {}) {
        const aId = anilistId ? String(anilistId) : null;
        const mId = malId ? String(malId) : null;

        if (this.isOfficiallyMapped({ anilistId, malId })) {
            return 'official';
        }
        if (aId && this.resolutionLevelMap.has('anilist:' + aId)) {
            return this.resolutionLevelMap.get('anilist:' + aId);
        }
        if (mId && this.resolutionLevelMap.has('mal:' + mId)) {
            return this.resolutionLevelMap.get('mal:' + mId);
        }
        return null;
    }

    /**
     * Risolve un record AnimeUnity nell'identità unificata (TMDB + Kitsu) in modo sincrono
     * @param {Object} params
     * @param {number|string} [params.anilistId]
     * @param {number|string} [params.malId]
     * @returns {{ tmdbId: string, kitsuId: string|null, anilistId: number|null, malId: number|null, season: number, level: string }|null}
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
        const level = this.getResolutionLevel({ anilistId, malId }) || 'official';

        return {
            tmdbId: String(tmdbId),
            kitsuId: kitsuId ? String(kitsuId) : null,
            anilistId: aId ? Number(aId) : null,
            malId: mId ? Number(mId) : null,
            season,
            level
        };
    }

    /**
     * Arricchisce i record non risolti seguendo l'ordine di priorità:
     * 1. Ufficiale (AniBridge/Fribb) -> vince sempre
     * 2. Bridge TVDB -> TMDB (/3/find/{tvdb_id}?external_source=tvdb_id)
     * 3. Fallback per Titolo (/3/search/tv)
     *
     * In --dry-run non scrive su disco le cache di fallback/bridge.
     * @param {Array<Object>} records
     * @param {Object} [options]
     * @param {boolean} [options.dryRun]
     * @param {boolean} [options.refreshFallbacks]
     * @returns {Promise<Array<{ record: Object, level: string, match: Object }>>}
     */
    async enrichWithFallbacks(records, options = {}) {
        if (!Array.isArray(records) || records.length === 0) return [];
        const dryRun = !!options.dryRun;
        const refreshFallbacks = !!options.refreshFallbacks;

        await this.tvdbBridgeResolver.loadCache();
        await this.fallbackResolver.loadCache();

        const enriched = [];
        const stats = { official: 0, bridge_tvdb: 0, title_fallback: 0, unresolved: 0 };
        for (const rec of records) {
            const anilistId = rec.anilist_id;
            const malId = rec.mal_id;
            const aId = anilistId ? String(anilistId) : null;
            const mId = malId ? String(malId) : null;
            const rawTitle = rec.title || rec.title_eng || rec.title_it || rec.slug || `Anime #${rec.id}`;

            // 1. Livello Ufficiale: se già presente da Fribb/AniBridge, non fare nulla
            if (this.isOfficiallyMapped({ anilistId, malId })) {
                stats.official++;
                continue;
            }

            // Se è già stato risolto in questo stesso batch (es. SUB seguito da DUB dello stesso anime)
            const existing = this.resolve({ anilistId, malId });
            if (existing && existing.tmdbId) {
                const currentLevel = this.getResolutionLevel({ anilistId, malId }) || 'bridge_tvdb';
                stats[currentLevel] = (stats[currentLevel] || 0) + 1;
                enriched.push({
                    record: rec,
                    level: currentLevel,
                    match: {
                        tmdbId: existing.tmdbId,
                        season: existing.season,
                        source: currentLevel
                    }
                });
                continue;
            }

            // 2. Livello Bridge TVDB → TMDB
            const tvdbInfo = this.getTvdb({ anilistId, malId });
            let bridgeResolved = false;

            if (tvdbInfo && tvdbInfo.tvdbId) {
                const bridgeMatch = await this.tvdbBridgeResolver.resolveTvdb(tvdbInfo.tvdbId, {
                    refresh: refreshFallbacks
                });

                if (bridgeMatch && bridgeMatch.tmdbId) {
                    const season = Number(tvdbInfo.season) || 1;
                    const cacheLabel = bridgeMatch.fromCache ? 'da cache' : 'nuova chiamata TMDB';
                    console.log(`[IdentityBridge] Record "${rawTitle}" (id: ${rec.id}) risolto livello=bridge_tvdb in TMDB ${bridgeMatch.tmdbId} S${season} ("${bridgeMatch.name}") [tvdb:${tvdbInfo.tvdbId}, ${cacheLabel}]${dryRun ? ' (DRY-RUN)' : ''}`);

                    if (aId) {
                        if (!this.anilistToTmdb.has(aId)) this.anilistToTmdb.set(aId, String(bridgeMatch.tmdbId));
                        this.anilistToSeason.set(aId, season);
                        this.resolutionLevelMap.set('anilist:' + aId, 'bridge_tvdb');
                    }
                    if (mId) {
                        if (!this.malToTmdb.has(mId)) this.malToTmdb.set(mId, String(bridgeMatch.tmdbId));
                        this.malToSeason.set(mId, season);
                        this.resolutionLevelMap.set('mal:' + mId, 'bridge_tvdb');
                    }

                    enriched.push({
                        record: rec,
                        level: 'bridge_tvdb',
                        match: {
                            tmdbId: String(bridgeMatch.tmdbId),
                            name: bridgeMatch.name,
                            season,
                            tvdbId: tvdbInfo.tvdbId,
                            source: 'tvdb_bridge'
                        }
                    });
                    bridgeResolved = true;
                    stats.bridge_tvdb++;
                }
            }

            if (bridgeResolved) {
                continue;
            }

            // 3. Livello Fallback Titolo (/3/search/tv)
            const titleMatch = await this.fallbackResolver.resolveFallback({
                title: rec.title,
                title_eng: rec.title_eng,
                title_it: rec.title_it,
                slug: rec.slug,
                date: rec.date,
                anilistId,
                malId
            }, { refreshFallbacks, dryRun });

            if (titleMatch && titleMatch.tmdbId) {
                console.log(`[IdentityFallback] Record "${rawTitle}" (id: ${rec.id}) risolto livello=title_fallback in TMDB ${titleMatch.tmdbId} ("${titleMatch.name}") [matched: "${titleMatch.matchedTitle}", conf: ${titleMatch.confidence}]${dryRun ? ' (DRY-RUN)' : ''}`);

                if (aId) {
                    if (!this.anilistToTmdb.has(aId)) this.anilistToTmdb.set(aId, String(titleMatch.tmdbId));
                    this.resolutionLevelMap.set('anilist:' + aId, 'title_fallback');
                }
                if (mId) {
                    if (!this.malToTmdb.has(mId)) this.malToTmdb.set(mId, String(titleMatch.tmdbId));
                    this.resolutionLevelMap.set('mal:' + mId, 'title_fallback');
                }

                enriched.push({
                    record: rec,
                    level: 'title_fallback',
                    match: titleMatch
                });
                stats.title_fallback++;
            } else {
                stats.unresolved++;
            }
        }

        console.log(`[Identity] Livelli di risoluzione: ${stats.official} ufficiali (skip), ${stats.bridge_tvdb} bridge_tvdb, ${stats.title_fallback} title_fallback, ${stats.unresolved} non risolti.`);

        if (!dryRun) {
            this.tvdbBridgeResolver.saveCache();
            this.fallbackResolver.saveCache();
        }

        return enriched;
    }
}

module.exports = {
    IdentityResolver,
    TvdbBridgeResolver,
    TmdbFallbackResolver,
    ANIBRIDGE_URL,
    FRIBB_MINI_URL,
    DEFAULT_MAX_AGE_MS
};

