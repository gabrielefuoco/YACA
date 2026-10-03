const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient } = require('../clients/tmdb');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const CacheManager = require('../cache/CacheManager');
const animeMappingStore = require('../data/animeMappingStore');
const { getDuckDbMetaDetails } = require('../catalog/providers/DuckDbProvider');
const { schedulePromotion } = require('../db/tier1LazyPromotion');
const { normalizeAnimeMarker } = require('../utils/animeIdentity');

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
 * Scelta di limitazione memoria: se la mappa è piena, espelle la prima chiave con frequenza minima
 * (minVal <= 1) per accogliere nuove chiavi emergenti; se tutte le 200 chiavi hanno già occorrenze
 * ripetute (> 1), smette di aggiungere nuove chiavi per prevenire thrashing da miss isolati.
 * In entrambi i casi i contatori globali (totalMisses, totalCollisions) continuano a salire.
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
            if (minVal <= 1) break; // Ottimizzazione: non può scendere sotto 1
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

    // Stesso resolver e stesso default del catalogo. Un marker assente senza
    // prove diventa false e non avvia enrichment Kitsu.
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
                // Se questo Kitsu ID è già stato assegnato a un altro episodio TMDB, c'è una collisione in Anibridge.
                // Invece di far sparire l'episodio da Stremio (che deduplica gli id), facciamo fallback all'ID TMDB nativo.
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
 * Allinea gli id dei video alla forma con cui è arrivata la richiesta.
 *
 * Stremio chiede poi gli stream con gli id che trova in `meta.videos`: se la scheda è aperta
 * con l'id IMDb (`tt0108778`) ma gli episodi portano `tmdb:1668:S:E`, le fonti che conoscono
 * solo gli id IMDb non rispondono → una sola fonte, e quella che risponde non riconosce
 * l'episodio → sempre lo stesso. La forma giusta è quindi quella della richiesta: gli id
 * nascono "sbagliati" solo quando l'id IMDb si è perso (arriva dai dati TMDB via
 * `append_to_response`, che viene chiesto solo a cache vuota), ma a Stremio la forma che
 * conta è quella che ha usato lui per aprire la scheda.
 *
 * ATTENZIONE — la trappola: `meta.videos` arriva da `tvEpisodesCache`, cioè è lo stesso
 * array (e gli stessi oggetti video) conservati in cache. Riscrivere ids *sull'oggetto
 * ricevuto* avvelenerebbe la cache: la richiesta successiva con l'altra forma troverebbe
 * gli id della prima. Qui si lavora quindi su una copia e si restituisce una meta nuova,
 * lasciando intatti l'oggetto in cache e l'array degli episodi.
 *
 * Gli anime non si toccano: hanno già il loro percorso (`kitsu:...`) e il fallback sugli
 * id nativi TMDB è voluto.
 *
 * @param {Object} meta Scheda (non viene mutata).
 * @param {string} requestedId Id come richiesto da Stremio, senza il suffisso `_ita_offset`.
 * @returns {Object} Scheda con gli id allineati (la stessa se non c'è nulla da fare).
 */
function alignVideoIdsToRequestedForm(meta, requestedId) {
    if (!meta || typeof requestedId !== 'string' || !requestedId.startsWith('tt')) return meta;
    if (!Array.isArray(meta.videos) || meta.videos.length === 0) return meta;
    if (normalizeAnimeMarker(meta)) return meta;

    let rewritten = false;
    const videos = meta.videos.map((video) => {
        if (!video || typeof video.id !== 'string') return video;

        const parts = video.id.split(':');
        // Id episodio = <prefisso>:<stagione>:<episodio> (o `kitsu:<kitsuId>:<episodio>`).
        if (parts.length < 3 || video.id.startsWith('kitsu:')) return video;

        const season = video.season !== undefined && video.season !== null ? video.season : parts[parts.length - 2];
        const episode = video.episode !== undefined && video.episode !== null ? video.episode : parts[parts.length - 1];

        const alignedId = `${requestedId}:${season}:${episode}`;
        if (alignedId === video.id) return video;

        rewritten = true;
        return { ...video, id: alignedId };
    });

    if (!rewritten) return meta;
    return { ...meta, videos };
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

        const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");
        let meta = null;

        // Fetch metadata via TMDB
        if (id.startsWith('tmdb:') || id.startsWith('tt') || id.startsWith('kitsu:')) {
            let tmdbId = null;
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
                const cacheKey = `meta_${tmdbId}_${type}`;

                // Use getWithStatus for SWR support
                const { value: cachedMeta, status: cacheStatus } = await finalMetaCache.getWithStatus(cacheKey);



                if (cacheStatus === 'fresh') {
                    meta = cachedMeta;
                } else {
                    // If stale, return cached data and trigger background revalidation
                    if (cacheStatus === 'stale' && cachedMeta) {
                        meta = cachedMeta;
                        // Fire-and-forget background revalidation
                        (async () => {
                            try {
                                const bgMeta = await getDuckDbMetaDetails(tmdbId, type);
                                
                                // Fallback live TMDB solo se DuckDB fallisce
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
                                    await finalMetaCache.set(cacheKey, finalBgMeta);
                                }
                            } catch (_e) { /* silent background revalidation */ }
                        })();
                    } else {
                        meta = await getDuckDbMetaDetails(tmdbId, type);
                        
                        // Fallback API live SOLO se non lo troviamo nel DB offline e i fallback non sono disabilitati.
                        if (!meta) {
                             meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});

                             // DuckDB non l'ha servito ⇒ il titolo non è (ancora) in Tier 1: è il
                             // momento giusto per scaricare i dettagli e promuoverlo (ticket 42).
                             // Fire-and-forget e dentro un try/catch: la promozione **non** può mai
                             // cambiare (o rallentare) la scheda che l'utente sta aprendo.
                             if (meta) {
                                 try {
                                     schedulePromotion({ tmdbId, type, apiKey: tmdbApiKey });
                                 } catch (_e) { /* promozione mai sul percorso di risposta */ }
                             }
                        }
                        
                        if (meta) {
                            // Anime series: fetch Kitsu episodes (TMDB episodes were skipped)
                            if (type === 'series') {
                                // Lazy fetch episodi per serie tv normali e anime
                                await resolveAnimeEpisodes(meta, tmdbId, tmdbApiKey);
                            }

                            await applyKitsuMappingToMeta(meta, tmdbId);

                            delete meta._keywordNames;
                            delete meta._numberOfSeasons;
                            delete meta._originalLanguage;

                            await finalMetaCache.set(cacheKey, meta);
                        }
                    }
                }
            }
        }


        if (meta) {
            // Anche una entry dalla cache storica deve rispettare il boundary
            // corrente prima di raggiungere formatter e consumer.
            normalizeAnimeMarker(meta);

            // Per richieste con tmdb: ID, manteniamo l'IMDB ID risolto per compatibilità streaming
            if (id.startsWith('tmdb:') && meta.id && meta.id.startsWith('tt')) {
                if (meta.behaviorHints && type === 'movie') {
                    meta.behaviorHints.defaultVideoId = meta.id;
                }
            } else if (!id.startsWith('tmdb:')) {
                // Per kitsu: e altri ID (non tradotti), forziamo l'ID originale
                meta.id = id;
            }

            // Ripristina l'ID richiesto originale per Stremio (incluso eventuale _ita_offset)
            meta.id = originalId;

            // Gli id degli episodi devono avere la forma con cui è arrivata la richiesta
            // (`tt…:S:E` se aperta con l'IMDb, `tmdb:…:S:E` altrimenti). La riscrittura
            // lavora su una copia: `meta.videos` è anche ciò che sta in `tvEpisodesCache`.
            const metaAllineata = alignVideoIdsToRequestedForm(meta, id);

            return { meta: metaAllineata };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

module.exports = {
    metaHandler,
    applyKitsuMappingToMeta,
    alignVideoIdsToRequestedForm,
    getKitsuMappingStats,
    resetKitsuMappingStats
};
