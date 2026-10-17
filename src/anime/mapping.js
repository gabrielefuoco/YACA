/**
 * src/anime/mapping.js
 *
 * Store di mapping anime in memoria (Ticket 32).
 *
 * CONTRATTO (Decisioni 2, 3, 5, 6, 7):
 * 1. Lettura da artefatto atomico prodotto da anime-source: nessun download di Anibridge/Fribb
 *    nel runtime dell'app (Decisione 2).
 * 2. Nessun require nella cartella di servizio: certify ed exclude arrivano dall'artefatto (Decisione 3).
 * 3. Uso di snapshotDaArtefatto con politica 'keepLastKnown': su errore o artefatto mancante,
 *    mantiene l'ultimo stato noto ed emette un log chiaro (mai silenzioso) (Decisione 5).
 * 4. Risponde tre stati su statoAnime(): 'si' | 'non-lo-so' | 'no' (Decisione 6).
 *    Exclude vince su indici e certify (con warning se presente in entrambi).
 * 5. Al refresh esegue il flush del log aggregato dei candidati certify (Decisione 7).
 */

const fs = require('fs');
const path = require('path');
const { normalizeTipoAnime, flusheLogCandidatiCertify } = require('./identita');
const { snapshotDaArtefatto } = require('../infra/snapshotDaArtefatto');

const FILE_NAME = 'anime_mapping.json';
const CACHE_TTL_MS = 60 * 1000;

function mappingDir() {
    if (process.env.ANIME_MAPPING_DIR) return process.env.ANIME_MAPPING_DIR;
    if (process.env.TMDB_DUMP_DIR) return process.env.TMDB_DUMP_DIR;
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

function mappingPath() {
    return process.env.ANIME_MAPPING_PATH || path.join(mappingDir(), FILE_NAME);
}

function toMap(val) {
    if (val instanceof Map) return new Map(val);
    if (!val) return new Map();
    if (Array.isArray(val)) {
        return new Map(val);
    }
    if (typeof val === 'object') {
        return new Map(Object.entries(val));
    }
    return new Map();
}

function toSet(val) {
    if (val instanceof Set) return new Set(val);
    if (!val) return new Set();
    const set = new Set();
    const arr = Array.isArray(val) ? val : (typeof val === 'object' ? Object.keys(val) : [val]);
    for (const item of arr) {
        if (item === null || item === undefined || item === '') continue;
        const id = typeof item === 'object' && item.tmdbId !== undefined ? item.tmdbId : item;
        const clean = String(id).trim();
        if (clean) set.add(clean);
    }
    return set;
}

/**
 * Motivi che resolveKitsuDaTmdbId può restituire.
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
        this.kitsuToTmdbType = new Map();
        this.tmdbToKitsuMovie = new Map();
        this.tmdbToKitsu = new Map();
        this.malToTmdb = new Map();
        this.anibridgeTmdbIds = new Set();
        this.anibridgeShowTmdbIds = new Set();
        this.anibridgeMovieTmdbIds = new Set();
        this.certifiedTmdbIds = new Set();
        this.excludedTmdbIds = new Set();

        this.animeTmdbIdsMovie = new Set();
        this.animeTmdbIdsShow = new Set();
        this._warnedMissingTipo = false;

        this.schemaVersion = 1;
        this.generatedAt = null;
        this.isReady = false;
        this.motiviResolveKitsu = MOTIVI_RESOLVE_KITSU;

        // Inizializza il lettore di snapshot atomico da artefatto
        this.snapshotReader = snapshotDaArtefatto({
            leggi: async () => this._leggiArtefatto(),
            ttlMs: CACHE_TTL_MS,
            suErrore: 'keepLastKnown',
            vuoto: (err) => ({
                schemaVersion: 1,
                generatedAt: null,
                loadedAt: Date.now(),
                error: err?.message || 'artefatto non disponibile',
                degraded: true
            })
        });
    }

    async init() {
        console.log('[AnimeMappingStore] Inizializzazione in corso...');
        await this.sync();
        this.isReady = true;
    }

    async sync() {
        try {
            await this.snapshotReader.getSnapshot({ force: true });
        } catch (err) {
            console.warn(`[AnimeMappingStore] Sync completato con fallback degradato: ${err.message}`);
        }
    }

    async getSnapshot(options = {}) {
        return this.snapshotReader.getSnapshot(options);
    }

    async _leggiArtefatto() {
        const filePath = mappingPath();
        if (!fs.existsSync(filePath)) {
            const msg = `File artefatto assente: "${filePath}"`;
            console.warn(`[AnimeMappingStore] ${msg}. Mantenuto ultimo stato noto.`);
            const err = new Error(msg);
            err.code = 'ENOENT';
            throw err;
        }

        let raw;
        try {
            raw = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            console.warn(`[AnimeMappingStore] Errore lettura file artefatto "${filePath}": ${err.message}. Mantenuto ultimo stato noto.`);
            throw err;
        }

        let data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            console.warn(`[AnimeMappingStore] Errore parsing JSON artefatto "${filePath}": ${err.message}. Mantenuto ultimo stato noto.`);
            throw err;
        }

        if (!data || typeof data !== 'object') {
            const msg = `Contenuto artefatto non valido (atteso oggetto JSON): "${filePath}"`;
            console.warn(`[AnimeMappingStore] ${msg}.`);
            throw new Error(msg);
        }

        this.applyArtifact(data);

        // Decisione 7: al refresh emette l'eventuale riga aggregata di candidati certify
        flusheLogCandidatiCertify();

        // Aggiorna DuckDB in RAM con i set caricati
        await this.syncDuckDb();

        return {
            schemaVersion: this.schemaVersion,
            generatedAt: this.generatedAt,
            loadedAt: Date.now(),
            path: filePath,
            movieCount: this.animeTmdbIdsMovie.size,
            showCount: this.animeTmdbIdsShow.size,
            certifiedCount: this.certifiedTmdbIds.size,
            excludedCount: this.excludedTmdbIds.size
        };
    }

    /**
     * Applica i dati letti dall'artefatto JSON alla memoria dello store.
     */
    applyArtifact(data) {
        if (!data || typeof data !== 'object') return;

        this.schemaVersion = Number(data.schemaVersion) || 1;
        this.generatedAt = data.generatedAt || null;

        // 1. Risoluzioni Kitsu / MAL / Fribb
        if (data.tmdbToKitsu) this.tmdbToKitsu = toMap(data.tmdbToKitsu);
        if (data.tmdbToKitsuMovie) this.tmdbToKitsuMovie = toMap(data.tmdbToKitsuMovie);
        if (data.kitsuToTmdb) this.kitsuToTmdb = toMap(data.kitsuToTmdb);
        if (data.kitsuToTmdbType) this.kitsuToTmdbType = toMap(data.kitsuToTmdbType);
        if (data.malToTmdb) this.malToTmdb = toMap(data.malToTmdb);
        if (data.tmdbToAnimeNode) this.tmdbToAnimeNode = toMap(data.tmdbToAnimeNode);

        if (data.fribbIndex && typeof data.fribbIndex === 'object') {
            this.fribbIndex = {
                anidb: toMap(data.fribbIndex.anidb),
                anilist: toMap(data.fribbIndex.anilist),
                mal: toMap(data.fribbIndex.mal)
            };
        }

        // 2. Overrides: certify ed exclude
        const rawCertify = data.certifiedTmdbIds || data.certified || data.certify || [];
        this.certifiedTmdbIds = toSet(rawCertify);

        const rawExclude = data.excludedTmdbIds || data.excluded || data.exclude || [];
        this.excludedTmdbIds = toSet(rawExclude);

        // 3. Set TMDB: se presenti nell'artefatto usali, altrimenti fall back sui set dedicati o ricostruzione
        if (data.animeTmdbIdsMovie || data.movie || data.ids?.movie) {
            this.anibridgeMovieTmdbIds = toSet(data.animeTmdbIdsMovie || data.movie || data.ids?.movie);
        }
        if (data.animeTmdbIdsShow || data.tv || data.show || data.ids?.tv || data.ids?.show) {
            this.anibridgeShowTmdbIds = toSet(data.animeTmdbIdsShow || data.tv || data.show || data.ids?.tv || data.ids?.show);
        }

        this._rebuildAnimeTmdbIds();
        this.isReady = true;
    }

    async syncDuckDb() {
        try {
            const duckDbStore = require('../indice/duckDbStore');
            const idsByType = {
                movie: Array.from(this.animeTmdbIdsMovie || []),
                tv: Array.from(this.animeTmdbIdsShow || [])
            };
            if (idsByType.movie.length > 0 || idsByType.tv.length > 0) {
                await duckDbStore.updateAnimeMapping(idsByType).catch(e => {
                    console.error('[AnimeMappingStore] Impossibile aggiornare DuckDB:', e.message);
                });
            }
        } catch (_err) {
            // duckDbStore non disponibile o ambiente di test isolato
        }
    }

    /**
     * Override manuali per i test: accetta { certify: [...], exclude: [...] }
     * senza toccare file esterni.
     */
    loadOverrides(customDataOrPath) {
        try {
            if (customDataOrPath && typeof customDataOrPath === 'object') {
                if (Array.isArray(customDataOrPath.certify)) {
                    this.certifiedTmdbIds = toSet(customDataOrPath.certify);
                }
                if (Array.isArray(customDataOrPath.exclude)) {
                    this.excludedTmdbIds = toSet(customDataOrPath.exclude);
                }
                this._rebuildAnimeTmdbIds();
            }
        } catch (err) {
            console.warn(`[AnimeMappingStore] Warning caricamento overrides: ${err.message}`);
        }
    }

    _rebuildAnimeTmdbIds() {
        const movieSet = new Set();
        const showSet = new Set();

        // 1. Film anime
        if (this.anibridgeMovieTmdbIds) {
            for (const id of this.anibridgeMovieTmdbIds) {
                movieSet.add(String(id));
            }
        }
        if (this.tmdbToKitsuMovie) {
            for (const id of this.tmdbToKitsuMovie.keys()) {
                movieSet.add(String(id));
            }
        }

        // 2. Serie anime
        if (this.anibridgeShowTmdbIds) {
            for (const id of this.anibridgeShowTmdbIds) {
                showSet.add(String(id));
            }
        }
        if (this.tmdbToKitsu) {
            for (const id of this.tmdbToKitsu.keys()) {
                showSet.add(String(id));
            }
        }

        // 3. Titoli certificati
        if (this.certifiedTmdbIds) {
            for (const id of this.certifiedTmdbIds) {
                const clean = String(id).trim();
                if (clean) {
                    movieSet.add(clean);
                    showSet.add(clean);
                }
            }
        }

        // 4. Exclude vince: rimuovi dai set gli id esclusi
        if (this.excludedTmdbIds) {
            for (const id of this.excludedTmdbIds) {
                const clean = String(id).trim();
                if (clean) {
                    movieSet.delete(clean);
                    showSet.delete(clean);
                }
            }
        }

        this.animeTmdbIdsMovie = movieSet;
        this.animeTmdbIdsShow = showSet;

        if (movieSet.size > 0 || showSet.size > 0) {
            let onlyMovie = 0;
            for (const id of movieSet) {
                if (!showSet.has(id)) onlyMovie++;
            }
            let onlyShow = 0;
            for (const id of showSet) {
                if (!movieSet.has(id)) onlyShow++;
            }
            console.log(`[AnimeMappingStore] Build indici completata: ${onlyShow} solo serie, ${onlyMovie} solo film (totale film: ${movieSet.size}, serie: ${showSet.size})`);
        }
    }

    /**
     * Risponde ai tre stati (Decisione 6):
     *  - 'si': presente negli insiemi o certificato
     *  - 'no': presente in exclude (con log se presente sia in exclude che negli indici)
     *  - 'non-lo-so': assente dagli insiemi
     *
     * @param {string|number} tmdbId
     * @param {'movie'|'tv'|'series'|'anime'} [tipo]
     * @returns {'si'|'non-lo-so'|'no'}
     */
    statoAnime(tmdbId, tipo) {
        const cleanId = this._tmdbIdPuro(tmdbId);
        if (!cleanId) return 'non-lo-so';

        const isExcluded = this.excludedTmdbIds?.has(cleanId) === true;
        const storeTipo = normalizeTipoAnime(tipo);

        const inSets = storeTipo
            ? this.isAnimeTmdbId(cleanId, storeTipo)
            : this.isAnimeTmdbIdAny(cleanId);

        if (isExcluded) {
            const wasInRawSets = (this.animeTmdbIdsMovie?.has(cleanId) === true)
                || (this.animeTmdbIdsShow?.has(cleanId) === true)
                || (this.certifiedTmdbIds?.has(cleanId) === true);
            if (wasInRawSets) {
                console.warn(`[AnimeMappingStore] ID TMDB ${cleanId} presente sia in exclude che negli indici/certify: exclude vince (stato: 'no').`);
            }
            return 'no';
        }

        if (inSets) {
            return 'si';
        }

        return 'non-lo-so';
    }

    buildFribbIndex(fribbData) {
        const newIndex = { anidb: new Map(), anilist: new Map(), mal: new Map() };
        const newKitsuToTmdb = new Map();
        const newKitsuToTmdbType = new Map();
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
                    let detectedType = null;
                    let tmdbVal = null;

                    if (typeof rawTmdb === 'object' && rawTmdb !== null) {
                        if (rawTmdb.tv !== undefined && rawTmdb.tv !== null && rawTmdb.tv !== '') {
                            detectedType = 'tv';
                            tmdbVal = rawTmdb.tv;
                        } else if (rawTmdb.movie !== undefined && rawTmdb.movie !== null && rawTmdb.movie !== '') {
                            detectedType = 'movie';
                            tmdbVal = rawTmdb.movie;
                        } else {
                            tmdbVal = rawTmdb;
                        }
                    } else if (rawTmdb) {
                        tmdbVal = rawTmdb;
                    }

                    if (!detectedType) {
                        const itemType = String(item.type || '').toUpperCase();
                        if (itemType === 'MOVIE') {
                            detectedType = 'movie';
                        } else if (['TV', 'OVA', 'ONA', 'SPECIAL'].includes(itemType)) {
                            detectedType = 'tv';
                        }
                    }

                    const tmdbIds = Array.isArray(tmdbVal)
                        ? tmdbVal.filter(id => id !== null && id !== undefined && id !== '')
                        : (tmdbVal ? [tmdbVal] : []);

                    if (tmdbIds.length > 0) {
                        const primaryTmdb = String(tmdbIds[0]);
                        newKitsuToTmdb.set(String(item.kitsu_id), primaryTmdb);
                        if (detectedType) {
                            newKitsuToTmdbType.set(String(item.kitsu_id), detectedType);
                        }
                        if (item.mal_id) {
                            newMalToTmdb.set(String(item.mal_id), primaryTmdb);
                        }

                        if (detectedType === 'movie') {
                            for (const tmdbId of tmdbIds) {
                                newTmdbToKitsuMovie.set(String(tmdbId), item.kitsu_id);
                            }
                        } else {
                            for (const tmdbId of tmdbIds) {
                                newTmdbToKitsu.set(String(tmdbId), item.kitsu_id);
                            }
                        }
                    }
                }
            }
        }
        this.fribbIndex = newIndex;
        this.kitsuToTmdb = newKitsuToTmdb;
        this.kitsuToTmdbType = newKitsuToTmdbType;
        this.tmdbToKitsuMovie = newTmdbToKitsuMovie;
        this.tmdbToKitsu = newTmdbToKitsu;
        this.malToTmdb = newMalToTmdb;
        this._rebuildAnimeTmdbIds();
    }

    buildAnibridgeIndex(anibridgeData) {
        const newIndex = new Map();
        const newAnibridgeTmdbIds = new Set();
        const newAnibridgeShowTmdbIds = new Set();
        const newAnibridgeMovieTmdbIds = new Set();

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
                        if (providerKey.startsWith('tmdb_show:')) {
                            newAnibridgeShowTmdbIds.add(String(tmdbId));
                        } else if (providerKey.startsWith('tmdb_movie:')) {
                            newAnibridgeMovieTmdbIds.add(String(tmdbId));
                        }
                    }

                    const key = `${tmdbId}:${season}`;
                    const rules = [];
                    for (const [animeRange, tmdbRange] of Object.entries(episodesMap)) {
                        const anime = parseRange(animeRange);
                        const tmdb = parseRange(tmdbRange);
                        const offset = anime.start - tmdb.start;
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
        this.anibridgeShowTmdbIds = newAnibridgeShowTmdbIds;
        this.anibridgeMovieTmdbIds = newAnibridgeMovieTmdbIds;
        this._rebuildAnimeTmdbIds();
    }

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

        const providerWeights = {
            'anilist': 5,
            'mal': 4,
            'anidb': 3,
            'livechart': 2,
            'kitsu': 1
        };

        let bestCandidate = null;
        let maxScore = -1;

        for (const key in votes) {
            const v = votes[key];
            const bestProviderScore = Math.max(...v.providers.map(p => providerWeights[p] || 0));
            const score = (v.count * 100) + bestProviderScore;

            if (score > maxScore) {
                maxScore = score;
                bestCandidate = v;
            }
        }

        return { success: true, kitsuId: bestCandidate.kitsuId, kitsuEpisode: bestCandidate.kitsuEpisode };
    }

    resolveTmdbFromKitsu(kitsuId) {
        if (!this.isReady) return null;
        return this.kitsuToTmdb.get(String(kitsuId)) || null;
    }

    resolveMediaTypeFromKitsu(kitsuId) {
        if (!this.isReady) return null;
        return this.kitsuToTmdbType.get(String(kitsuId)) || null;
    }

    resolveTmdbEntryFromKitsu(kitsuId) {
        if (!this.isReady) return null;
        const tmdbId = this.kitsuToTmdb.get(String(kitsuId));
        if (!tmdbId) return null;
        const type = this.kitsuToTmdbType.get(String(kitsuId)) || null;
        return { tmdbId, type };
    }

    resolveMediaTypeDaTmdbId(tmdbId) {
        if (!this.isReady) return null;
        const idPuro = this._tmdbIdPuro(tmdbId);
        if (!idPuro) return null;
        if (this.anibridgeMovieTmdbIds?.has(idPuro) || this.resolveKitsuMovie(idPuro)) {
            return 'movie';
        }
        if (this.anibridgeShowTmdbIds?.has(idPuro) || this.tmdbToAnimeNode?.has(idPuro + ':1')) {
            return 'tv';
        }
        return null;
    }

    resolveKitsuMovie(tmdbId) {
        if (!this.isReady) return null;
        return this.tmdbToKitsuMovie.get(String(tmdbId)) || null;
    }

    resolveTmdbFromMal(malId) {
        if (!this.isReady) return null;
        return this.malToTmdb.get(String(malId)) || null;
    }

    resolveKitsuFromMal(malId) {
        return this.fribbIndex.mal.get(String(malId));
    }

    resolveKitsuDaTmdbId(tmdbId, tipo) {
        const tipoNorm = tipo === null || tipo === undefined ? '' : String(tipo).trim().toLowerCase();
        if (tipoNorm !== 'movie' && tipoNorm !== 'tv') {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.TIPO_NON_GESTITO, tmdbId: this._tmdbIdPuro(tmdbId) };
        }

        const idPuro = this._tmdbIdPuro(tmdbId);
        if (!idPuro) {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.ID_MANCANTE, tmdbId: null };
        }

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

        if (this.isAnimeTmdbId(idPuro, tipoNorm)) {
            return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.ANIME_SENZA_KITSU, tmdbId: idPuro };
        }

        return { kitsuId: null, motivo: MOTIVI_RESOLVE_KITSU.NON_E_UN_ANIME, tmdbId: idPuro };
    }

    _tmdbIdPuro(id) {
        if (id === null || id === undefined || id === '') return '';
        const clean = String(id).replace(/^tmdb:(tv:|movie:)?/i, '').split(':')[0].trim();
        return clean;
    }

    isAnimeTmdbIdAny(id) {
        const cleanId = this._tmdbIdPuro(id);
        if (!cleanId) return false;
        if (this.excludedTmdbIds?.has(cleanId)) return false;
        return (this.animeTmdbIdsMovie?.has(cleanId) === true) || (this.animeTmdbIdsShow?.has(cleanId) === true);
    }

    isAnimeTmdbId(id, tipo) {
        const cleanId = this._tmdbIdPuro(id);
        if (!cleanId) return false;
        if (this.excludedTmdbIds?.has(cleanId)) return false;

        if (tipo !== undefined && tipo !== null) {
            const t = normalizeTipoAnime(tipo);
            if (t === 'movie') return this.animeTmdbIdsMovie?.has(cleanId) === true;
            if (t === 'tv') return this.animeTmdbIdsShow?.has(cleanId) === true;
            return false;
        }

        if (!this._warnedMissingTipo) {
            this._warnedMissingTipo = true;
            const err = new Error();
            const stack = (err.stack || '')
                .split('\n')
                .slice(2, 6)
                .map(line => line.trim())
                .join('\n  ');
            console.warn(`[AnimeMappingStore] Chiamata a isAnimeTmdbId senza 'tipo' (fallback su unione legacy). Stack del chiamante:\n  ${stack}`);
        }

        return this.isAnimeTmdbIdAny(cleanId);
    }
}

const store = new AnimeMappingStore();

module.exports = store;
module.exports.AnimeMappingStore = AnimeMappingStore;
module.exports.MOTIVI_RESOLVE_KITSU = MOTIVI_RESOLVE_KITSU;
module.exports.mappingPath = mappingPath;
module.exports.mappingDir = mappingDir;
