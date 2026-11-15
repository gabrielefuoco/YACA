/**
 * src/anime/mapping.js
 *
 * Store di mapping anime in memoria (Ticket 32).
 *
 * CONTRATTO (Decisioni 2, 3, 5, 6, 7):
 * 1. Lettura da artefatto atomico prodotto da anime-source: nessun download di Anibridge/Fribb
 *    nel runtime dell'app (Decisione 2).
 * 2. Il parsing di Anibridge/Fribb è **uno solo** e vive nel produttore
 *    (`services/anime-source/src/mappingIndex.js`): qui si importa `buildMappingIndex` e si applica
 *    l'artefatto. Il file è dentro l'immagine dell'app (`COPY . .`, e `.dockerignore` non esclude
 *    `services/anime-source/`), quindi non serve né un pacchetto né una copia.
 *    (Decisione 3 originale — "nessun require nella cartella di servizio" — superata dal ticket 07:
 *    due parser dello stesso dump erano già divergenti su `malToTmdb`.)
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
const { buildMappingIndex, DEFAULT_FILENAME } = require('../../services/anime-source/src/mappingIndex');

const FILE_NAME = DEFAULT_FILENAME; // 'anime-mappings.json'
const LEGACY_FILE_NAME = 'anime_mapping.json';
const CACHE_TTL_MS = 60 * 1000;

function mappingDir() {
    if (process.env.ANIME_MAPPING_DIR) return process.env.ANIME_MAPPING_DIR;
    if (process.env.TMDB_DUMP_DIR) return process.env.TMDB_DUMP_DIR;
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

function mappingPath() {
    if (process.env.ANIME_MAPPING_PATH) return process.env.ANIME_MAPPING_PATH;
    if (process.env.ANIME_MAPPINGS_PATH) return process.env.ANIME_MAPPINGS_PATH;
    const dir = mappingDir();
    const canonical = path.join(dir, FILE_NAME);
    if (fs.existsSync(canonical)) return canonical;
    const legacy = path.join(dir, LEGACY_FILE_NAME);
    if (fs.existsSync(legacy)) return legacy;
    return canonical;
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

        this._rawFribbData = [];
        this._rawAnibridgeData = {};

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
        if (data.anibridgeMovieTmdbIds) {
            this.anibridgeMovieTmdbIds = toSet(data.anibridgeMovieTmdbIds);
        } else if (data.animeTmdbIdsMovie || data.movie || data.ids?.movie) {
            this.anibridgeMovieTmdbIds = toSet(data.animeTmdbIdsMovie || data.movie || data.ids?.movie);
        }
        if (data.anibridgeShowTmdbIds) {
            this.anibridgeShowTmdbIds = toSet(data.anibridgeShowTmdbIds);
        } else if (data.animeTmdbIdsShow || data.tv || data.show || data.ids?.tv || data.ids?.show) {
            this.anibridgeShowTmdbIds = toSet(data.animeTmdbIdsShow || data.tv || data.show || data.ids?.tv || data.ids?.show);
        }
        if (data.anibridgeTmdbIds) {
            this.anibridgeTmdbIds = toSet(data.anibridgeTmdbIds);
        }

        this._rebuildAnimeTmdbIds();
        this.isReady = true;
    }

    /**
     * Gli id anime certificati, per tipo. Chi ha bisogno di sapere *quali titoli sono anime*
     * lo chiede al proprietario del modello (decisione 31) invece di frugare nei suoi Set.
     */
    idsByType() {
        return {
            movie: Array.from(this.animeTmdbIdsMovie || []),
            tv: Array.from(this.animeTmdbIdsShow || [])
        };
    }

    async syncDuckDb() {
        try {
            const indice = require('../indice');
            const idsByType = this.idsByType();
            if (idsByType.movie.length > 0 || idsByType.tv.length > 0) {
                await indice.updateAnimeMapping(idsByType).catch(e => {
                    console.error('[AnimeMappingStore] Impossibile aggiornare DuckDB:', e.message);
                });
            }
        } catch (_err) {
            // indice non disponibile o ambiente di test isolato
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
        this._rawFribbData = Array.isArray(fribbData) ? fribbData : [];
        // ponytail: accepts full in-memory rebuild via buildMappingIndex on each dump call rather than incremental diffing
        const artifact = buildMappingIndex({
            fribbData: this._rawFribbData,
            anibridgeData: this._rawAnibridgeData || {},
            overridesData: {
                certify: Array.from(this.certifiedTmdbIds || []).map((tmdbId) => ({ tmdbId })),
                exclude: Array.from(this.excludedTmdbIds || []).map((tmdbId) => ({ tmdbId }))
            }
        });
        this.applyArtifact(artifact);
    }

    buildAnibridgeIndex(anibridgeData) {
        this._rawAnibridgeData = anibridgeData && typeof anibridgeData === 'object' && !Array.isArray(anibridgeData)
            ? anibridgeData
            : {};
        const artifact = buildMappingIndex({
            fribbData: this._rawFribbData || [],
            anibridgeData: this._rawAnibridgeData,
            overridesData: {
                certify: Array.from(this.certifiedTmdbIds || []).map((tmdbId) => ({ tmdbId })),
                exclude: Array.from(this.excludedTmdbIds || []).map((tmdbId) => ({ tmdbId }))
            }
        });
        this.applyArtifact(artifact);
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
module.exports.FILE_NAME = FILE_NAME;
module.exports.LEGACY_FILE_NAME = LEGACY_FILE_NAME;
module.exports.DEFAULT_FILENAME = DEFAULT_FILENAME;
