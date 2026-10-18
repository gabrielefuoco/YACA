/**
 * src/meta/index.js
 *
 * Modulo Meta di YACA (Ticket 41 - Fetta 2).
 * Confine di dominio per il serving dei metadati Stremio:
 * dettagli del titolo, arricchimento Kitsu/anime, allineamento id episodi verso IMDb,
 * doppiaggio ITA per le schede poster e cache del metadato finale.
 *
 * Il servire non conosce né DuckDB né il vecchio motore:
 * passa attraverso la porta del modulo indice (indice.resolveTmdbToImdb).
 */

const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient, resolveImdbId } = require('../clients/tmdb');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const CacheManager = require('../cache/CacheManager');
const cache = require('../cache');
const {
    animeMappingStore,
    animeAiringState,
    normalizeAnimeMarker,
    extractAnimeTmdbId
} = require('../anime');
const { schedulePromotion } = require('../indice/tier1LazyPromotion');
const indice = require('../indice');
const itaAnnotations = require('../catalog/itaAnnotations');

// Cache per l'oggetto meta finale combinato
const finalMetaCache = new CacheManager('final_meta_cache', { ramMax: 300, ramTtlMs: 3600000, swrMs: 600000 });

// --- Monitoraggio e Statistiche Kitsu Mapping (bounded in RAM) ---
const MAX_TRACKED_KEYS = 200; // Tetto massimo chiavi in memoria per il container (1536MB)
const LOG_INTERVAL_MISSES = 50; // Soglia log aggregato: ogni 50 miss
const LOG_INTERVAL_COLLISIONS = 10; // Soglia log aggregato: ogni 10 collisioni
const LOG_INTERVAL_MS = 10 * 60 * 1000; // Frequenza temporale massima per log: 10 minuti

const kitsuStats = {
    totalMisses: 0,
    totalCollisions: 0,
    misses: new Map(), // key: `${tmdbId}:${season}` -> count
    collisions: new Map() // key: targetId (`kitsu:${kitsuId}:${kitsuEpisode}`) -> count
};

let lastLoggedMisses = 0;
let lastLoggedCollisions = 0;
let lastLogTime = Date.now();

/**
 * Incrementa il contatore in una Map con tetto massimo (MAX_TRACKED_KEYS).
 */
function incrementBoundedMap(map, key) {
    if (map.has(key)) {
        map.set(key, map.get(key) + 1);
        return;
    }

    if (map.size < MAX_TRACKED_KEYS) {
        map.set(key, 1);
        return;
    }

    let minKey = null;
    let minVal = Infinity;
    for (const [k, v] of map) {
        if (v < minVal) {
            minVal = v;
            minKey = k;
            if (minVal <= 1) break;
        }
    }

    if (minVal <= 1 && minKey !== null) {
        map.delete(minKey);
        map.set(key, 1);
    }
}

function getTopEntries(map, limit = 5) {
    if (map.size === 0) return '';
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k, v]) => `${k} (${v})`)
        .join(', ');
}

function checkAndLogAggregatedStats() {
    try {
        const missDiff = kitsuStats.totalMisses - lastLoggedMisses;
        const collDiff = kitsuStats.totalCollisions - lastLoggedCollisions;
        const now = Date.now();
        const timeDiff = now - lastLogTime;

        const shouldLog =
            missDiff >= LOG_INTERVAL_MISSES ||
            collDiff >= LOG_INTERVAL_COLLISIONS ||
            ((missDiff > 0 || collDiff > 0) && timeDiff >= LOG_INTERVAL_MS);

        if (shouldLog) {
            lastLoggedMisses = kitsuStats.totalMisses;
            lastLoggedCollisions = kitsuStats.totalCollisions;
            lastLogTime = now;

            const topMisses = getTopEntries(kitsuStats.misses, 5);
            const topCollisions = getTopEntries(kitsuStats.collisions, 5);

            console.warn(
                `[KitsuMapping Stats] Misses: ${kitsuStats.totalMisses} (top: ${topMisses || 'nessuno'}), ` +
                `Collisioni: ${kitsuStats.totalCollisions} (top: ${topCollisions || 'nessuna'})`
            );
        }
    } catch (_e) {
        // Nessun errore nei log deve propagarsi o interrompere la richiesta
    }
}

function recordMiss(tmdbId, season) {
    if (tmdbId === null || tmdbId === undefined) return;
    const cleanSeason = season !== undefined && season !== null ? season : 1;
    const key = `${tmdbId}:${cleanSeason}`;

    kitsuStats.totalMisses++;
    incrementBoundedMap(kitsuStats.misses, key);
    checkAndLogAggregatedStats();
}

function recordCollision(targetId) {
    if (!targetId) return;
    const key = String(targetId);

    kitsuStats.totalCollisions++;
    incrementBoundedMap(kitsuStats.collisions, key);
    checkAndLogAggregatedStats();
}

function getKitsuMappingStats() {
    return {
        totalMisses: kitsuStats.totalMisses,
        totalCollisions: kitsuStats.totalCollisions,
        missesCount: kitsuStats.misses.size,
        collisionsCount: kitsuStats.collisions.size,
        misses: new Map(kitsuStats.misses),
        collisions: new Map(kitsuStats.collisions)
    };
}

function resetKitsuMappingStats() {
    kitsuStats.totalMisses = 0;
    kitsuStats.totalCollisions = 0;
    kitsuStats.misses.clear();
    kitsuStats.collisions.clear();
    lastLoggedMisses = 0;
    lastLoggedCollisions = 0;
    lastLogTime = Date.now();
}

async function applyKitsuMappingToMeta(meta, tmdbId) {
    if (!meta) return;

    const isAnime = normalizeAnimeMarker(meta);
    if (!isAnime) return;

    if (meta.type === 'movie') {
        const kitsuId = animeMappingStore.resolveKitsuMovie(tmdbId);
        if (kitsuId) {
            meta.behaviorHints = meta.behaviorHints || {};
            meta.behaviorHints.defaultVideoId = `kitsu:${kitsuId}`;
        } else if (meta._isAnime) {
            console.log(`[Mapping Fallback] Film Anime TMDB ${tmdbId} non ha Kitsu ID. Usa ID TMDB nativo.`);
        }
        return;
    }

    if (meta.type === 'series' && Array.isArray(meta.videos)) {
        let fallbackCount = 0;
        const usedKitsuIds = new Set();

        for (const video of meta.videos) {
            const mapped = animeMappingStore.resolveKitsu(tmdbId, video.season, video.episode);
            
            if (mapped && mapped.success) {
                const targetId = `kitsu:${mapped.kitsuId}:${mapped.kitsuEpisode}`;
                if (usedKitsuIds.has(targetId)) {
                    fallbackCount++;
                    recordCollision(targetId);
                } else {
                    usedKitsuIds.add(targetId);
                    video.id = targetId;
                }
            } else if (isAnime) {
                fallbackCount++;
                recordMiss(tmdbId, video.season);
            }
        }
        if (fallbackCount > 0) {
             console.log(`[Mapping Fallback] Serie Anime TMDB ${tmdbId} ha ${fallbackCount} episodi non mappati (mantenuto ID nativo).`);
        }
    }
}

/**
 * Gli id degli episodi vanno in forma IMDb (`tt…:S:E`), se l'id IMDb è noto.
 */
function alignVideoIdsToRequestedForm(meta, requestedId, imdbIdPerEpisodi) {
    if (!meta) return meta;
    if (!Array.isArray(meta.videos) || meta.videos.length === 0) return meta;
    if (normalizeAnimeMarker(meta)) return meta;

    const prefisso =
        typeof imdbIdPerEpisodi === 'string' && imdbIdPerEpisodi.startsWith('tt')
            ? imdbIdPerEpisodi
            : typeof requestedId === 'string' && requestedId.startsWith('tt')
                ? requestedId
                : null;

    if (!prefisso) return meta;

    let rewritten = false;
    const videos = meta.videos.map((video) => {
        if (!video || typeof video.id !== 'string') return video;

        const parts = video.id.split(':');
        if (parts.length < 3 || video.id.startsWith('kitsu:')) return video;

        const season = video.season !== undefined && video.season !== null ? video.season : parts[parts.length - 2];
        const episode = video.episode !== undefined && video.episode !== null ? video.episode : parts[parts.length - 1];

        const alignedId = `${prefisso}:${season}:${episode}`;
        if (alignedId === video.id) return video;

        rewritten = true;
        return { ...video, id: alignedId };
    });

    if (!rewritten) return meta;
    return { ...meta, videos };
}

/**
 * Id IMDb del titolo per gli id degli episodi, prima dal dump e poi dalla cache dedicata.
 */
async function resolveImdbIdPerEpisodi(meta, { requestedId, tmdbId, type, apiKey }) {
    if (!meta || !Array.isArray(meta.videos) || meta.videos.length === 0) return null;
    if (normalizeAnimeMarker({ ...meta })) return null;
    if (typeof requestedId === 'string' && requestedId.startsWith('tt')) return null;
    if (!tmdbId) return null;

    // 1) Il dump: nessuna rete quando il titolo è in Tier 1.
    const dalDump = await resolveImdbIdFromDump(tmdbId, type);
    if (dalDump) return dalDump;

    // 2) Coda lunga (Tier 2): cache dedicata, e rete solo se proprio non c'è.
    try {
        const imdbId = await resolveImdbId(String(tmdbId), type === 'movie' ? 'movie' : 'tv', apiKey);
        return typeof imdbId === 'string' && imdbId.startsWith('tt') ? imdbId : null;
    } catch (_e) {
        return null;
    }
}

/**
 * Id IMDb di un titolo letto dal dump (Tier 1 via modulo indice).
 * Non conosce DuckDB direttamente: interroga la porta pubblica del modulo indice.
 */
async function resolveImdbIdFromDump(tmdbId, type) {
    try {
        if (!indice || typeof indice.resolveTmdbToImdb !== 'function') return null;
        const mapping = await indice.resolveTmdbToImdb([String(tmdbId)], type === 'movie' ? 'movie' : 'tv');
        if (!mapping || typeof mapping !== 'object') return null;
        const imdbId = mapping[String(tmdbId)] ?? mapping[String(Number(tmdbId))];
        return typeof imdbId === 'string' && imdbId.startsWith('tt') ? imdbId : null;
    } catch (_e) {
        return null;
    }
}

/**
 * La lista episodi che vede Stremio: nessun episodio imposto, gli speciali in fondo.
 */
function preparaListaEpisodi(meta, { type, isAnime }) {
    if (!meta || type !== 'series' || isAnime) return meta;

    let risposta = meta;

    if (risposta.behaviorHints && risposta.behaviorHints.defaultVideoId !== undefined) {
        const behaviorHints = { ...risposta.behaviorHints };
        delete behaviorHints.defaultVideoId;
        risposta = { ...risposta, behaviorHints };
    }

    const videos = risposta.videos;
    if (!Array.isArray(videos) || videos.length < 2) return risposta;

    const normali = [];
    const speciali = [];
    for (const video of videos) {
        const season = video && video.season !== undefined && video.season !== null ? Number(video.season) : null;
        (season === 0 ? speciali : normali).push(video);
    }

    if (speciali.length === 0 || normali.length === 0) return risposta;

    return { ...risposta, videos: [...normali, ...speciali] };
}

/**
 * Costruisce la scheda da restituire a partire dall'ingresso di cache, senza mutarlo.
 */
function buildResponseMeta(cachedMeta, { requestedId, originalId, type, imdbIdPerEpisodi }) {
    const risposta = { ...cachedMeta };

    if (cachedMeta.behaviorHints && typeof cachedMeta.behaviorHints === 'object') {
        risposta.behaviorHints = { ...cachedMeta.behaviorHints };
    }

    normalizeAnimeMarker(risposta);

    if (requestedId.startsWith('tmdb:') && risposta.id && risposta.id.startsWith('tt')) {
        if (risposta.behaviorHints && type === 'movie') {
            risposta.behaviorHints.defaultVideoId = risposta.id;
        }
    } else if (!requestedId.startsWith('tmdb:')) {
        risposta.id = requestedId;
    }

    risposta.id = originalId;

    const allineata = alignVideoIdsToRequestedForm(risposta, requestedId, imdbIdPerEpisodi);

    return preparaListaEpisodi(allineata, { type, isAnime: risposta._isAnime === true });
}

/**
 * "Questo titolo è doppiato", per il solo file del poster in cache.
 */
async function isMetaDubbed(meta, type) {
    try {
        const tmdbId = extractAnimeTmdbId(meta);
        if (!tmdbId) return false;
        const snapshot = await itaAnnotations.getSnapshot();
        const tipo = type === 'movie' ? 'movie' : 'tv';
        if (itaAnnotations.getStatus(snapshot, tipo, tmdbId) !== false) {
            return itaAnnotations.isDubbed(snapshot, tipo, tmdbId);
        }
        const doc = await findAiringDocByTmdbId(tmdbId);
        return itaAnnotations.isDubbed(snapshot, tipo, tmdbId, {
            allowTypeFallback: animeAiringState.isDubbedFilmDocForCard(doc, tmdbId, animeMappingStore)
        });
    } catch (_e) {
        return false;
    }
}

/** Documento `anime_airing_state` di un id TMDB, o `null` (mai un'eccezione). */
async function findAiringDocByTmdbId(tmdbId) {
    try {
        const state = await animeAiringState.getSnapshot();
        if (!state || !state.byTmdbId) return null;
        return state.byTmdbId.get(String(tmdbId)) || null;
    } catch (_e) {
        return null;
    }
}

async function resolveAnimeEpisodes(metaObj, tmdbId, tmdbApiKey) {
    if (metaObj._numberOfSeasons) {
        const source = metaObj._isAnime ? 'Anime' : 'TMDB';
        console.log(`[${source}] Carico episodi TMDB per ${tmdbId}`);
        const tmdbClient = createTmdbClient(tmdbApiKey);
        metaObj.videos = await fetchTmdbEpisodes(
            tmdbClient,
            tmdbId,
            metaObj._numberOfSeasons,
            metaObj.id.startsWith('tt') ? metaObj.id : null,
            metaObj._originalLanguage || null
        );
    }
}

/**
 * Gestisce la richiesta di metadati dettagliati quando l'utente clicca su un titolo
 */
async function metaHandler(args, userConfig) {
    try {
        const { type, id: originalId } = args;
        const id = typeof originalId === 'string' ? originalId.replace('_ita_offset', '') : originalId;

        if (!userConfig) throw new Error("Configurazione utente mancante");

        const { chiaveEffettiva } = require('../configurazione');
        const tmdbApiKey = chiaveEffettiva({ account: userConfig, servizio: 'tmdb' });
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");
        let meta = null;
        let tmdbId = null;

        // Fetch metadata via TMDB
        if (id.startsWith('tmdb:') || id.startsWith('tt') || id.startsWith('kitsu:')) {
            if (id.startsWith('tmdb:')) {
                tmdbId = id.replace('tmdb:', '');
            } else if (id.startsWith('tt')) {
                const tmdbIdResult = await translateImdbToTmdb(id, tmdbApiKey);
                tmdbId = tmdbIdResult?.id;
            } else if (id.startsWith('kitsu:')) {
                const kitsuId = id.split(':')[1];
                tmdbId = animeMappingStore.resolveTmdbFromKitsu(kitsuId);
            }

            if (tmdbId) {
                const metaDesc = {
                    nome: 'meta',
                    dipendenze: {
                        varia: { id: tmdbId, type }
                    },
                    ttl: type === 'movie' ? (14 * 24 * 60 * 60 * 1000) : (6 * 60 * 60 * 1000)
                };

                const cached = await cache.leggi(metaDesc, null, { instance: finalMetaCache });
                const cacheStatus = cached.status;
                const cachedMeta = cached.value;

                if (cacheStatus === 'fresh') {
                    meta = cachedMeta;
                } else {
                    if (cacheStatus === 'stale' && cachedMeta) {
                        meta = cachedMeta;
                        (async () => {
                            try {
                                const bgMeta = await indice.getMetaDetails(tmdbId, type);
                                
                                let finalBgMeta = bgMeta;
                                if (!finalBgMeta) {
                                    finalBgMeta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});
                                }

                                if (finalBgMeta) {
                                    if (type === 'series') {
                                        await resolveAnimeEpisodes(finalBgMeta, tmdbId, tmdbApiKey);
                                    }
                                    
                                    await applyKitsuMappingToMeta(finalBgMeta, tmdbId);

                                    delete finalBgMeta._keywordNames;
                                    delete finalBgMeta._numberOfSeasons;
                                    delete finalBgMeta._originalLanguage;
                                    await cache.scrivi(metaDesc, finalBgMeta, { instance: finalMetaCache });
                                }
                            } catch (_e) { /* silent background revalidation */ }
                        })();
                    } else {
                        meta = await indice.getMetaDetails(tmdbId, type);
                        
                        if (!meta) {
                             meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});

                             if (meta) {
                                 try {
                                     schedulePromotion({ tmdbId, type, apiKey: tmdbApiKey });
                                 } catch (_e) { /* promozione mai sul percorso di risposta */ }
                             }
                        }
                        
                        if (meta) {
                            if (type === 'series') {
                                await resolveAnimeEpisodes(meta, tmdbId, tmdbApiKey);
                            }

                            await applyKitsuMappingToMeta(meta, tmdbId);

                            delete meta._keywordNames;
                            delete meta._numberOfSeasons;
                            delete meta._originalLanguage;

                            await cache.scrivi(metaDesc, meta, { instance: finalMetaCache });
                        }
                    }
                }
            }
        }

        if (meta) {
            const imdbIdPerEpisodi = await resolveImdbIdPerEpisodi(meta, {
                requestedId: id,
                tmdbId,
                type,
                apiKey: tmdbApiKey
            });
            return { meta: buildResponseMeta(meta, { requestedId: id, originalId, type, imdbIdPerEpisodi }) };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

/**
 * Allinea l'ID delle card film a IMDb se disponibile.
 */
function allineaIdFilm(risposta) {
    if (!risposta || !Array.isArray(risposta.metas)) return risposta;
    for (const meta of risposta.metas) {
        if (!meta || meta.type !== 'movie' || !meta._imdbId) continue;
        const id = String(meta.id || '');
        if (id.startsWith('tt')) continue;
        const suffisso = id.endsWith('_ita_offset') ? '_ita_offset' : '';
        meta.id = `${meta._imdbId}${suffisso}`;
        if (meta.behaviorHints && meta.behaviorHints.defaultVideoId) {
            meta.behaviorHints.defaultVideoId = meta.id;
        }
    }
    return risposta;
}

module.exports = {
    metaHandler,
    isMetaDubbed,
    applyKitsuMappingToMeta,
    alignVideoIdsToRequestedForm,
    preparaListaEpisodi,
    buildResponseMeta,
    getKitsuMappingStats,
    resetKitsuMappingStats,
    resolveImdbIdFromDump,
    resolveImdbIdPerEpisodi,
    getMetaDetails: (tmdbId, type) => indice.getMetaDetails(tmdbId, type),
    allineaIdFilm
};
