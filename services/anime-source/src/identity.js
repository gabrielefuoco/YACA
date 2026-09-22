/**
 * identity.js
 * Risolve l'identità di un anime (anilist_id / mal_id) in TMDB id e Kitsu id.
 * Costruisce indici in-memory leggeri dai dump di Anibridge e Fribb.
 * Nessuna dipendenza dal codice di YACA.
 */

const fs = require('fs');
const path = require('path');

const ANIBRIDGE_URL = 'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const FRIBB_MINI_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';

class IdentityResolver {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || path.join(__dirname, '../.cache');
        this.fetchFn = options.fetch || globalThis.fetch;

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

    async init() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        const fribbPath = path.join(this.cacheDir, 'fribb-mini.json');
        const anibridgePath = path.join(this.cacheDir, 'anibridge-mappings.json');

        let fribbData = null;
        let anibridgeData = null;

        // 1. Fribb data
        if (fs.existsSync(fribbPath)) {
            try {
                const content = fs.readFileSync(fribbPath, 'utf8');
                fribbData = JSON.parse(content);
            } catch (e) {
                console.warn(`[Identity] Errore lettura cache Fribb: ${e.message}`);
            }
        }

        if (!fribbData) {
            console.log('[Identity] Download dump Fribb in corso...');
            const res = await this.fetchFn(FRIBB_MINI_URL);
            if (!res.ok) throw new Error(`Download Fribb fallito con status ${res.status}`);
            fribbData = await res.json();
            fs.writeFileSync(fribbPath, JSON.stringify(fribbData));
            console.log('[Identity] Dump Fribb scaricato e memorizzato in cache.');
        }

        // 2. Anibridge data
        if (fs.existsSync(anibridgePath)) {
            try {
                const content = fs.readFileSync(anibridgePath, 'utf8');
                anibridgeData = JSON.parse(content);
            } catch (e) {
                console.warn(`[Identity] Errore lettura cache Anibridge: ${e.message}`);
            }
        }

        if (!anibridgeData) {
            console.log('[Identity] Download dump Anibridge in corso...');
            const res = await this.fetchFn(ANIBRIDGE_URL);
            if (!res.ok) throw new Error(`Download Anibridge fallito con status ${res.status}`);
            anibridgeData = await res.json();
            fs.writeFileSync(anibridgePath, JSON.stringify(anibridgeData));
            console.log('[Identity] Dump Anibridge scaricato e memorizzato in cache.');
        }

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
}

module.exports = {
    IdentityResolver,
    ANIBRIDGE_URL,
    FRIBB_MINI_URL
};
