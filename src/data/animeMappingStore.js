const axios = require('axios');
const duckDbStore = require('../db/duckDbStore');
// Logger non standard rimosso, usiamo console

let loadAnimeOverrides;
try {
    loadAnimeOverrides = require('../../services/anime-source/src/overrides').loadAnimeOverrides;
} catch (e) {
    try {
        loadAnimeOverrides = require('../../../services/anime-source/src/overrides').loadAnimeOverrides;
    } catch (e2) {
        loadAnimeOverrides = () => ({ version: 1, identities: [], certify: [] });
    }
}

const ANIBRIDGE_URL = 'https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json';
const FRIBB_MINI_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json';
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 ore

/**
 * Motivi che `resolveKitsuDaTmdbId` può restituire. Sono stringhe corte e stabili:
 * ci rispondono i log e i test, quindi non vanno riformulate.
 *
 *  - MAPPATO            c'è un id Kitsu: la mappa del titolo c'è.
 *  - NON_E_UN_ANIME     l'id non è un anime: il chiamante può saltarlo in silenzio.
 *  - ANIME_SENZA_KITSU  è un anime (Anibridge/certificati) ma questo store non ha
 *                       ancora il suo Kitsu: NON è "non è un anime", è una nostra
 *                       lacuna (ricalcolo da fare, non da dimenticare).
 *  - STORE_NON_PRONTO   la mappa non è ancora caricata: errore transitorio nostro,
 *                       da ritentare, non da confondere con "non è un anime".
 *  - TIPO_NON_GESTITO   `tipo` diverso da movie/tv: evento malformato.
 *  - ID_MANCANTE        l'id TMDB è vuoto o non utilizzabile.
 */
const MOTIVI_RESOLVE_KITSU = Object.freeze({
    MAPPATO: 'mappato',
    NON_E_UN_ANIME: 'non_e_un_anime',
    ANIME_SENZA_KITSU: 'anime_senza_kitsu',
    STORE_NON_PRONTO: 'store_non_pronto',
    TIPO_NON_GESTITO: 'tipo_non_gestito',
    ID_MANCANTE: 'id_mancante'
});

class AnimeMappingStore {
    constructor() {
        this.fribbIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
        this.tmdbToAnimeNode = new Map();
        this.kitsuToTmdb = new Map();
        this.tmdbToKitsuMovie = new Map();
        // Indice PIATTO tmdbId -> kitsuId, senza distinzione movie/tv: serve a chi
        // ha solo un id TMDB e vuole un id Kitsu (vedi resolveKitsuDaTmdbId).
        this.tmdbToKitsu = new Map();
        this.malToTmdb = new Map();
        this.anibridgeTmdbIds = new Set();
        this.certifiedTmdbIds = new Set();
        this.animeTmdbIds = new Set();
        
        this.etags = {
            anibridge: null,
            fribb: null
        };
        
        this.isReady = false;
        this.syncInterval = null;
        this.motiviResolveKitsu = MOTIVI_RESOLVE_KITSU;
    }

    async init() {
        console.log('[AnimeMappingStore] Inizializzazione in corso...');
        this.loadOverrides();
        await this.sync();
        
        // Avvia il polling in background ogni 12 ore
        this.syncInterval = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
        if (this.syncInterval?.unref) {
            this.syncInterval.unref();
        }
        this.isReady = true;
    }

    /**
     * Carica gli ID certificati dalla sezione certify di anime-overrides.json
     * @param {Object|string} [customDataOrPath]
     */
    loadOverrides(customDataOrPath) {
        try {
            const data = (customDataOrPath && typeof customDataOrPath === 'object' && Array.isArray(customDataOrPath.certify))
                ? customDataOrPath
                : loadAnimeOverrides(typeof customDataOrPath === 'string' ? customDataOrPath : undefined);

            this.certifiedTmdbIds = new Set();
            if (data && Array.isArray(data.certify)) {
                for (const item of data.certify) {
                    if (item && item.tmdbId != null && item.tmdbId !== '') {
                        const clean = String(item.tmdbId).trim();
                        if (clean) this.certifiedTmdbIds.add(clean);
                    }
                }
            }
            this._rebuildAnimeTmdbIds();
        } catch (err) {
            console.warn(`[AnimeMappingStore] Warning caricamento overrides: ${err.message}`);
        }
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
            this.loadOverrides();
            
            console.log(`[AnimeMappingStore] Sincronizzazione completata. TMDB chiavi: ${this.tmdbToAnimeNode.size}, certificati: ${this.certifiedTmdbIds.size}`);
            
            // POPOLIAMO LA TABELLA ANIME IN DUCKDB PER LE QUERY SQL
            const idsToUpdate = this.animeTmdbIds.size > 0 ? Array.from(this.animeTmdbIds) : Array.from(this.tmdbToAnimeNode.keys());
            if (idsToUpdate.length > 0) {
                await duckDbStore.updateAnimeMapping(idsToUpdate).catch(e => {
                    console.error('[AnimeMappingStore] Impossibile aggiornare DuckDB:', e.message);
                });
            }
            
        } catch (error) {
            console.error(`[AnimeMappingStore] Errore critico durante il sync: ${error.message}`);
        }
    }

    _rebuildAnimeTmdbIds() {
        const combined = new Set(this.anibridgeTmdbIds || []);
        if (this.tmdbToAnimeNode) {
            for (const key of this.tmdbToAnimeNode.keys()) {
                const id = key.split(':')[0];
                if (id) combined.add(String(id));
            }
        }
        if (this.tmdbToKitsuMovie) {
            for (const id of this.tmdbToKitsuMovie.keys()) {
                combined.add(String(id));
            }
        }
        if (this.tmdbToKitsu) {
            for (const id of this.tmdbToKitsu.keys()) {
                combined.add(String(id));
            }
        }
        if (this.certifiedTmdbIds) {
            for (const id of this.certifiedTmdbIds) {
                combined.add(String(id));
            }
        }
        this.animeTmdbIds = combined;
    }

    buildFribbIndex(fribbData) {
        const newIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
        const newKitsuToTmdb = new Map();
        const newTmdbToKitsuMovie = new Map();
        const newTmdbToKitsu = new Map();
        const newMalToTmdb = new Map();
        
        for (const item of fribbData) {
            if (item.kitsu_id) {
                if (item.anidb_id) newIndex.anidb.set(String(item.anidb_id), item.kitsu_id);
                if (item.anilist_id) newIndex.anilist.set(String(item.anilist_id), item.kitsu_id);
                if (item.mal_id) newIndex.mal.set(String(item.mal_id), item.kitsu_id);
                
                if (item.themoviedb_id) {
                    const rawTmdb = item.themoviedb_id;
                    const tmdbVal = typeof rawTmdb === 'object' && rawTmdb !== null
                        ? (rawTmdb.tv || rawTmdb.movie)
                        : rawTmdb;

                    // Nel file vero `themoviedb_id.movie` è un ARRAY di id numerici
                    // (1-4 varianti dello stesso film: rifacimenti, compilation, uscite
                    // alternative). String() su quell'array produceva "128,1390599",
                    // che non è un id TMDB: la mappa in avanti finiva spazzatura e la
                    // doppiatura cercata per id TMDB non trovava niente.
                    // In avanti vale il PRIMO id (contratto della mappa: una sola TMDB
                    // per Kitsu/MAL); in dietro vanno registrati TUTTI, così ogni
                    // titolo TMDB del gruppo sa tornare al suo Kitsu.
                    const tmdbIds = Array.isArray(tmdbVal)
                        ? tmdbVal.filter(id => id !== null && id !== undefined && id !== '')
                        : (tmdbVal ? [tmdbVal] : []);

                    if (tmdbIds.length > 0) {
                        const primaryTmdb = String(tmdbIds[0]);
                        newKitsuToTmdb.set(String(item.kitsu_id), primaryTmdb);
                        // Indice piatto: TUTTE le varianti TMDB del gruppo (movie e tv
                        // insieme) tornano al loro Kitsu. È l'unico modo che ha chi ha
                        // solo l'id TMDB dell'evento, senza stagione né episodio.
                        for (const tmdbId of tmdbIds) {
                            newTmdbToKitsu.set(String(tmdbId), item.kitsu_id);
                        }
                        if (item.mal_id) {
                            newMalToTmdb.set(String(item.mal_id), primaryTmdb);
                        }
                        if (item.type === 'Movie' || (typeof rawTmdb === 'object' && rawTmdb !== null && rawTmdb.movie)) {
                            for (const tmdbId of tmdbIds) {
                                newTmdbToKitsuMovie.set(String(tmdbId), item.kitsu_id);
                            }
                        }
                    }
                }
            }
        }
        this.fribbIndex = newIndex;
        this.kitsuToTmdb = newKitsuToTmdb;
        this.tmdbToKitsuMovie = newTmdbToKitsuMovie;
        this.tmdbToKitsu = newTmdbToKitsu;
        this.malToTmdb = newMalToTmdb;
        this._rebuildAnimeTmdbIds();
    }

    buildAnibridgeIndex(anibridgeData) {
        const newIndex = new Map();
        const newAnibridgeTmdbIds = new Set();
        
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

                    if (tmdbId) {
                        newAnibridgeTmdbIds.add(String(tmdbId));
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
        this.anibridgeTmdbIds = newAnibridgeTmdbIds;
        this._rebuildAnimeTmdbIds();
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

    /**
     * Risolve l'id Kitsu di un titolo a partire dal solo id TMDB di un evento
     * (la coda non ha stagione né episodio, quindi `resolveKitsu` non è utilizzabile).
     *
     * Restituisce un oggetto CON IL MOTIVO, non un id nudo: `resolveKitsuMovie` e
     * `isAnimeTmdbId` rispondono `null` anche quando lo store non è ancora pronto,
     * e per chi chiama "non è un anime" e "la mappa non è ancora caricata" diventerebbero
     * la stessa cosa — con 8.263 poster dimenticati in silenzio. Qui i due casi sono
     * separati da `motivo`.
     *
     * @param {string|number} tmdbId ID TMDB (accetta anche "tmdb:tv:123" e "123:1")
     * @param {string} tipo 'movie' o 'tv'
     * @returns {{kitsuId: string|null, motivo: string, tmdbId: string|null}}
     *   `motivo` è uno di MOTIVI_RESOLVE_KITSU.
     */
    resolveKitsuDaTmdbId(tmdbId, tipo) {
        const tipoNorm = tipo === null || tipo === undefined ? '' : String(tipo).trim().toLowerCase();
        if (tipoNorm !== 'movie' && tipoNorm !== 'tv') {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.TIPO_NON_GESTITO, tmdbId: this._tmdbIdPuro(tmdbId) };
        }

        const idPuro = this._tmdbIdPuro(tmdbId);
        if (!idPuro) {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.ID_MANCANTE, tmdbId: null };
        }

        // Ordine deliberato: un `tipo` malformato è un evento malformato anche a store
        // scarico, quindi si dice subito; ma uno store non pronto è un problema nostro,
        // non del titolo, e va distinto da "non è un anime".
        if (!this.isReady) {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.STORE_NON_PRONTO, tmdbId: idPuro };
        }

        if (tipoNorm === 'movie') {
            const kitsuMovie = this.resolveKitsuMovie(idPuro);
            if (kitsuMovie !== null && kitsuMovie !== undefined && kitsuMovie !== '') {
                return { kitsuId: String(kitsuMovie), motivo: MOTIVI_RESOLVE_KITSU.MAPPATO, tmdbId: idPuro };
            }
        } else {
            const kitsuTv = this.tmdbToKitsu?.get(idPuro);
            if (kitsuTv !== null && kitsuTv !== undefined && kitsuTv !== '') {
                return { kitsuId: String(kitsuTv), motivo: MOTIVI_RESOLVE_KITSU.MAPPATO, tmdbId: idPuro };
            }
        }

        // Non c'è un Kitsu in mappa. Ma se l'id è comunque riconosciuto come anime
        // (Anibridge, overrides certificati) non è "non è un anime": è un anime di cui
        // lo store non sa ancora il Kitsu. Motivo diverso, così il chiamante non lo
        // liquida come "titolo normale da saltare".
        if (this.isAnimeTmdbId(idPuro)) {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.ANIME_SENZA_KITSU, tmdbId: idPuro };
        }

        return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.NON_E_UN_ANIME, tmdbId: idPuro };
    }

    /**
     * Riduce un id TMDB alla sua parte "nuda": accetta "123", 123, "tmdb:tv:123",
     * "123:1" e ne ricava "123" (stessa normalizzazione di isAnimeTmdbId).
     * @param {string|number} id
     * @returns {string} '' se l'id non contiene niente di utilizzabile
     */
    _tmdbIdPuro(id) {
        if (id === null || id === undefined || id === '') return '';
        const clean = String(id).replace(/^tmdb:(tv:|movie:)?/i, '').split(':')[0].trim();
        return clean;
    }

    /**
     * Verifica in O(1) se un ID TMDB appartiene a un anime presente nello store (Anibridge o Fribb).
     * @param {string|number} id ID TMDB (supporta anche formati "tmdb:123" o "123:1")
     * @returns {boolean}
     */
    isAnimeTmdbId(id) {
        if (id === null || id === undefined || id === '') return false;
        const cleanId = String(id).replace(/^tmdb:(tv:|movie:)?/i, '').split(':')[0].trim();
        if (!cleanId) return false;
        if (this.animeTmdbIds.has(cleanId)) return true;
        if (this.certifiedTmdbIds?.has(cleanId)) return true;
        if (this.tmdbToKitsuMovie?.has(cleanId)) return true;
        return false;
    }
}

// Esporta un singleton
const store = new AnimeMappingStore();
module.exports = store;
