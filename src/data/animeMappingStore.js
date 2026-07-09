const axios = require('axios');
const logger = require('../utils/logger'); // Assumendo esista un logger, lo adatterò se non c'è

const ANIBRIDGE_URL = 'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const FRIBB_MINI_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 ore

class AnimeMappingStore {
    constructor() {
        this.fribbIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
        this.tmdbToAnimeNode = new Map();
        this.kitsuToTmdb = new Map();
        this.tmdbToKitsuMovie = new Map();
        this.malToTmdb = new Map();
        
        this.etags = {
            anibridge: null,
            fribb: null
        };
        
        this.isReady = false;
        this.syncInterval = null;
    }

    async init() {
        logger.info('[AnimeMappingStore] Inizializzazione in corso...');
        await this.sync();
        
        // Avvia il polling in background ogni 12 ore
        this.syncInterval = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
        this.isReady = true;
    }

    async sync() {
        try {
            logger.info('[AnimeMappingStore] Avvio sincronizzazione mapping...');
            let anibridgeUpdated = false;
            let fribbUpdated = false;
            let anibridgeData = null;
            let fribbData = null;

            // 1. Fetch Anibridge (Conditional)
            try {
                const aniHeaders = this.etags.anibridge ? { 'If-None-Match': this.etags.anibridge } : {};
                const aniRes = await axios.get(ANIBRIDGE_URL, { headers: aniHeaders, validateStatus: (s) => s === 200 || s === 304 });
                if (aniRes.status === 200) {
                    anibridgeData = aniRes.data;
                    this.etags.anibridge = aniRes.headers['etag'];
                    anibridgeUpdated = true;
                    logger.info('[AnimeMappingStore] Anibridge mappings scaricati (Nuova versione)');
                } else {
                    logger.info('[AnimeMappingStore] Anibridge mappings non modificati (304 Not Modified)');
                }
            } catch (err) {
                logger.error(`[AnimeMappingStore] Errore fetch Anibridge: ${err.message}`);
            }

            // 2. Fetch Fribb (Conditional)
            try {
                const fribbHeaders = this.etags.fribb ? { 'If-None-Match': this.etags.fribb } : {};
                const fribbRes = await axios.get(FRIBB_MINI_URL, { headers: fribbHeaders, validateStatus: (s) => s === 200 || s === 304 });
                if (fribbRes.status === 200) {
                    fribbData = fribbRes.data;
                    this.etags.fribb = fribbRes.headers['etag'];
                    fribbUpdated = true;
                    logger.info('[AnimeMappingStore] Fribb-mini scaricato (Nuova versione)');
                } else {
                    logger.info('[AnimeMappingStore] Fribb-mini non modificato (304 Not Modified)');
                }
            } catch (err) {
                logger.error(`[AnimeMappingStore] Errore fetch Fribb: ${err.message}`);
            }

            // 3. Rebuild Indexes if needed
            if (fribbUpdated && fribbData) {
                this.buildFribbIndex(fribbData);
            }
            if (anibridgeUpdated && anibridgeData) {
                this.buildAnibridgeIndex(anibridgeData);
            }
            
            logger.info(`[AnimeMappingStore] Sincronizzazione completata. TMDB chiavi: ${this.tmdbToAnimeNode.size}`);
        } catch (error) {
            logger.error(`[AnimeMappingStore] Errore critico durante il sync: ${error.message}`);
        }
    }

    buildFribbIndex(fribbData) {
        const newIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
        const newKitsuToTmdb = new Map();
        const newTmdbToKitsuMovie = new Map();
        const newMalToTmdb = new Map();
        
        for (const item of fribbData) {
            if (item.kitsu_id) {
                if (item.anidb_id) newIndex.anidb.set(String(item.anidb_id), item.kitsu_id);
                if (item.anilist_id) newIndex.anilist.set(String(item.anilist_id), item.kitsu_id);
                if (item.mal_id) newIndex.mal.set(String(item.mal_id), item.kitsu_id);
                
                if (item.themoviedb_id) {
                    newKitsuToTmdb.set(String(item.kitsu_id), String(item.themoviedb_id));
                    if (item.mal_id) {
                        newMalToTmdb.set(String(item.mal_id), String(item.themoviedb_id));
                    }
                    // Fribb list ha anche type = "Movie" per i film? mini non ce l'ha, ma se mappiamo 1:1 va bene per i movie
                    if (item.type === 'Movie') {
                        newTmdbToKitsuMovie.set(String(item.themoviedb_id), item.kitsu_id);
                    }
                }
            }
        }
        this.fribbIndex = newIndex;
        this.kitsuToTmdb = newKitsuToTmdb;
        this.tmdbToKitsuMovie = newTmdbToKitsuMovie;
        this.malToTmdb = newMalToTmdb;
    }

    buildAnibridgeIndex(anibridgeData) {
        const newIndex = new Map();
        
        const parseRange = (str) => {
            const [start, end] = str.split('-').map(Number);
            return { start, end: end || start };
        };

        for (const [clusterKey, mappings] of Object.entries(anibridgeData)) {
            if (clusterKey === '$meta') continue;

            let bridgeNode = null;
            const allNodes = [clusterKey, ...Object.keys(mappings)];
            
            for (const node of allNodes) {
                if (node.startsWith('anidb:')) { bridgeNode = { p: 'anidb', id: node.split(':')[1] }; break; }
                if (node.startsWith('anilist:')) { bridgeNode = { p: 'anilist', id: node.split(':')[1] }; break; }
                if (node.startsWith('mal:')) { bridgeNode = { p: 'mal', id: node.split(':')[1] }; break; }
            }

            if (!bridgeNode) continue;

            for (const [providerKey, episodesMap] of Object.entries(mappings)) {
                if (providerKey.startsWith('tmdb_show:') || providerKey.startsWith('tmdb_movie:')) {
                    const parts = providerKey.split(':');
                    const tmdbId = parts[1];
                    let season = '1';
                    if (parts.length > 2) {
                        season = parts[2].replace('s', '');
                    }

                    const key = `${tmdbId}:${season}`;
                    const rules = [];
                    for (const [targetRange, sourceRange] of Object.entries(episodesMap)) {
                        const target = parseRange(targetRange); 
                        const source = parseRange(sourceRange); 
                        const offset = source.start - target.start;
                        rules.push({ start: target.start, end: target.end, offset });
                    }

                    if (!newIndex.has(key)) {
                        newIndex.set(key, []);
                    }
                    newIndex.get(key).push({ bridgeNode, rules });
                }
            }
        }
        this.tmdbToAnimeNode = newIndex;
    }

    /**
     * Risolve un Kitsu ID a partire da un TMDB
     * @param {string|number} tmdbId ID su TMDB
     * @param {string|number} season Stagione TMDB
     * @param {string|number} episode Episodio TMDB
     * @returns {Object} { success, kitsuId, kitsuEpisode, error }
     */
    resolveKitsu(tmdbId, season = 1, episode = 1) {
        if (!this.isReady) {
            return { error: 'AnimeMappingStore non ancora pronto' };
        }

        const tSeason = Number(season);
        const tEpisode = Number(episode);
        const key = `${tmdbId}:${tSeason}`;
        const nodeMappings = this.tmdbToAnimeNode.get(key);

        if (!nodeMappings) {
            return { error: `TMDB ID ${key} non presente in Anibridge` };
        }

        for (const mapping of nodeMappings) {
            for (const rule of mapping.rules) {
                if (tEpisode >= rule.start && tEpisode <= rule.end) {
                    const animeEpisode = tEpisode + rule.offset;
                    const mapToUse = this.fribbIndex[mapping.bridgeNode.p];
                    const kitsuId = mapToUse.get(mapping.bridgeNode.id);
                    
                    if (!kitsuId) {
                        return { error: `Nodo ponte ${mapping.bridgeNode.p}:${mapping.bridgeNode.id} non trovato in Fribb` };
                    }

                    return { success: true, kitsuId, kitsuEpisode: animeEpisode };
                }
            }
        }
        
        return { error: `Episodio ${tEpisode} non coperto dai mapping per ${key}` };
    }

    /**
     * Risolve un TMDB ID a partire da un Kitsu ID
     */
    resolveTmdbFromKitsu(kitsuId) {
        if (!this.isReady) return null;
        return this.kitsuToTmdb.get(String(kitsuId)) || null;
    }

    /**
     * Risolve un Kitsu ID a partire da un TMDB (Film)
     */
    resolveKitsuMovie(tmdbId) {
        if (!this.isReady) return null;
        return this.tmdbToKitsuMovie.get(String(tmdbId)) || null;
    }
    /**
     * Risolve un TMDB ID a partire da un MAL ID
     */
    resolveTmdbFromMal(malId) {
        if (!this.isReady) return null;
        return this.malToTmdb.get(String(malId)) || null;
    }
}

// Esporta un singleton
const store = new AnimeMappingStore();
module.exports = store;
