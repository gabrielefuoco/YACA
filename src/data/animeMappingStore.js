const axios = require('axios');
const duckDbStore = require('../db/duckDbStore');
// Logger non standard rimosso, usiamo console

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
        console.log('[AnimeMappingStore] Inizializzazione in corso...');
        await this.sync();
        
        // Avvia il polling in background ogni 12 ore
        this.syncInterval = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
        this.isReady = true;
    }

    async sync() {
        try {
            console.log('[AnimeMappingStore] Avvio sincronizzazione mapping...');
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
                    console.log('[AnimeMappingStore] Anibridge mappings scaricati (Nuova versione)');
                } else {
                    console.log('[AnimeMappingStore] Anibridge mappings non modificati (304 Not Modified)');
                }
            } catch (err) {
                console.error(`[AnimeMappingStore] Errore fetch Anibridge: ${err.message}`);
            }

            // 2. Fetch Fribb (Conditional)
            try {
                const fribbHeaders = this.etags.fribb ? { 'If-None-Match': this.etags.fribb } : {};
                const fribbRes = await axios.get(FRIBB_MINI_URL, { headers: fribbHeaders, validateStatus: (s) => s === 200 || s === 304 });
                if (fribbRes.status === 200) {
                    fribbData = fribbRes.data;
                    this.etags.fribb = fribbRes.headers['etag'];
                    fribbUpdated = true;
                    console.log('[AnimeMappingStore] Fribb-mini scaricato (Nuova versione)');
                } else {
                    console.log('[AnimeMappingStore] Fribb-mini non modificato (304 Not Modified)');
                }
            } catch (err) {
                console.error(`[AnimeMappingStore] Errore fetch Fribb: ${err.message}`);
            }

            // 3. Rebuild Indexes if needed
            if (fribbUpdated && fribbData) {
                this.buildFribbIndex(fribbData);
            }
            if (anibridgeUpdated && anibridgeData) {
                this.buildAnibridgeIndex(anibridgeData);
            }
            
            console.log(`[AnimeMappingStore] Sincronizzazione completata. TMDB chiavi: ${this.tmdbToAnimeNode.size}`);
            
            // POPOLIAMO LA TABELLA ANIME IN DUCKDB PER LE QUERY SQL
            if (this.tmdbToAnimeNode.size > 0) {
                const allTmdbAnimeIds = Array.from(this.tmdbToAnimeNode.keys());
                await duckDbStore.updateAnimeMapping(allTmdbAnimeIds).catch(e => {
                    console.error('[AnimeMappingStore] Impossibile aggiornare DuckDB:', e.message);
                });
            }
            
        } catch (error) {
            console.error(`[AnimeMappingStore] Errore critico durante il sync: ${error.message}`);
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
                    const tmdbVal = typeof item.themoviedb_id === 'object' && item.themoviedb_id !== null
                        ? (item.themoviedb_id.tv || item.themoviedb_id.movie)
                        : item.themoviedb_id;

                    if (tmdbVal) {
                        newKitsuToTmdb.set(String(item.kitsu_id), String(tmdbVal));
                        if (item.mal_id) {
                            newMalToTmdb.set(String(item.mal_id), String(tmdbVal));
                        }
                        if (item.type === 'Movie' || (typeof item.themoviedb_id === 'object' && item.themoviedb_id.movie)) {
                            newTmdbToKitsuMovie.set(String(tmdbVal), item.kitsu_id);
                        }
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
                    for (const [animeRange, tmdbRange] of Object.entries(episodesMap)) {
                        const anime = parseRange(animeRange);  // Range episodi dell'anime
                        const tmdb = parseRange(tmdbRange);    // Range episodi su TMDB
                        // Offset per convertire TMDB ep → Anime ep: animeEp = tmdbEp + offset
                        const offset = anime.start - tmdb.start;
                        // Le boundaries usano lo spazio TMDB (perché resolveKitsu riceve ep TMDB)
                        rules.push({ start: tmdb.start, end: tmdb.end, offset });
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

        // Cerca i match più specifici (range TMDB più stretto) tra tutti i mapping
        let bestWidth = Infinity;
        let candidates = [];

        for (const mapping of nodeMappings) {
            for (const rule of mapping.rules) {
                if (tEpisode >= rule.start && tEpisode <= rule.end) {
                    const width = rule.end - rule.start;
                    if (width <= bestWidth) {
                        const mapToUse = this.fribbIndex[mapping.bridgeNode.p];
                        const kitsuId = mapToUse?.get(mapping.bridgeNode.id);
                        if (kitsuId) {
                            if (width < bestWidth) {
                                // Trovata una regola più stringente, resetta i candidati
                                candidates = [];
                                bestWidth = width;
                            }
                            candidates.push({
                                provider: mapping.bridgeNode.p,
                                kitsuId,
                                kitsuEpisode: tEpisode + rule.offset
                            });
                        }
                    }
                }
            }
        }

        if (candidates.length === 0) {
            return { error: `Episodio ${tEpisode} non coperto dai mapping per ${key}` };
        }

        // Sistema di Votazione (Consensus)
        // Raggruppa per stringa unica "kitsuId:kitsuEpisode"
        const votes = {};
        for (const cand of candidates) {
            const voteKey = `${cand.kitsuId}:${cand.kitsuEpisode}`;
            if (!votes[voteKey]) {
                votes[voteKey] = {
                    count: 0,
                    providers: [],
                    kitsuId: cand.kitsuId,
                    kitsuEpisode: cand.kitsuEpisode
                };
            }
            votes[voteKey].count++;
            votes[voteKey].providers.push(cand.provider);
        }

        // Gerarchia di affidabilità in caso di parità
        const providerWeights = {
            'anilist': 5,
            'mal': 4,
            'anidb': 3,
            'livechart': 2,
            'kitsu': 1
        };

        let bestCandidate = null;
        let maxScore = -1; // Usato per calcolare (Voti * 100) + provider score del migliore

        for (const key in votes) {
            const v = votes[key];
            // Calcoliamo lo score del miglior provider in questo gruppo per eventuali spareggi
            const bestProviderScore = Math.max(...v.providers.map(p => providerWeights[p] || 0));
            // Punteggio: diamo priorità enorme al numero di voti, e usiamo il providerScore come decimale
            const score = (v.count * 100) + bestProviderScore;

            if (score > maxScore) {
                maxScore = score;
                bestCandidate = v;
            }
        }

        return { success: true, kitsuId: bestCandidate.kitsuId, kitsuEpisode: bestCandidate.kitsuEpisode };
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

    resolveKitsuFromMal(malId) {
        return this.fribbIndex.mal.get(String(malId));
    }
}

// Esporta un singleton
const store = new AnimeMappingStore();
module.exports = store;
