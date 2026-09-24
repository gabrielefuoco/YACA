const { createTmdbClient } = require('../clients/tmdb');
const { getCacheConfig } = require('../cache/CacheManager');
const { catalogRequestCache } = require('../cache/cacheInstances');
const { getPresets } = require('../data/presets');
const { generateRequestHash } = require('../utils/requestHash');
const { getBaseId } = require('../utils/contentId');
const { EPISODE_CATALOG_IDS } = require('../catalog/constants');

const { routeCatalogRequest } = require('../catalog/CatalogRouter');
const { hydrateEpisodeBadgesFromCache } = require('../catalog/processors/MetadataHydrator');
const { formatStremioCatalog, sanitizeCatalogMeta, findLatestAiredEpisode } = require('../catalog/formatters/StremioFormatter');
const StreamBadge = require('../db/models/StreamBadge');
const animeAiringState = require('../data/animeAiringState');
const { isAnimeContent } = require('../utils/animeIdentity');
const animeMappingStore = require('../data/animeMappingStore');
const { isCatalogConformant, isAlwaysVisible } = require('../catalog/catalogKind');
const { applyKidsMode } = require('../utils/kidsModeFilters');

function extractTmdbId(item) {
    if (!item) return null;
    if (item.tmdbId) return String(item.tmdbId);
    if (item._tmdbId) return String(item._tmdbId);
    const strId = String(item.id || '').replace(/_ita_offset$/, '').trim();
    if (/^\d+$/.test(strId)) return strId;
    if (strId.startsWith('tmdb:')) {
        const parts = strId.split(':');
        // tmdb:12345 or tmdb:12345:1:1
        if (/^\d+$/.test(parts[1])) return parts[1];
        // tmdb:tv:12345 or tmdb:movie:12345
        if (parts.length > 2 && /^\d+$/.test(parts[2])) return parts[2];
    }
    return null;
}

function extractGenreIds(item) {
    const rawGenres = item.genre_ids || item.genres || item.rawTMDB?.genre_ids || item.rawTMDB?.genres;
    if (Array.isArray(rawGenres) && rawGenres.length > 0) {
        return rawGenres.map(g => {
            if (typeof g === 'number') return g;
            if (typeof g === 'object' && g !== null && g.id) return g.id;
            if (typeof g === 'string') {
                const lower = g.toLowerCase();
                if (lower === 'animation' || lower === 'animazione') return 16;
            }
            return g;
        });
    }
    return [];
}

function isItemAnime(item) {
    if (!item) return false;
    // Marcatore esistente: se _isAnime è già valorizzato come boolean (es. da DuckDbProvider), usalo direttamente
    if (typeof item._isAnime === 'boolean') return item._isAnime;
    if (item.type === 'anime') return true;

    const id = String(item.id || '');
    if (id.startsWith('kitsu:') || id.startsWith('anilist:')) return true;

    const tmdbId = extractTmdbId(item);
    const genreIds = extractGenreIds(item);
    const originalLanguage = item.original_language || item.originalLanguage || item._originalLanguage || item.rawTMDB?.original_language;
    const keywords = item.keywords || item.rawTMDB?.keywords;

    // Ricalcola con isAnimeContent (mappingStore Anibridge/Fribb + genere 16 + ja/keyword).
    // Se non porta né mapping certificato né combinazione genre/lingua/keyword -> restituisce false (fail-open).
    const isAnime = isAnimeContent({
        tmdbId,
        genreIds,
        originalLanguage,
        keywords,
        mappingStore: animeMappingStore
    });

    item._isAnime = isAnime;
    return isAnime;
}

// Marker del provider/stato esterno. `anilist_simulcast` resta accettato per le
// configurazioni già installate prima della rimozione di AniList.
const AIRING_STATE_PROVIDERS = new Set(['airing_state', 'anilist_simulcast']);

function isAiringStateCatalog(baseId, catalogMeta) {
    return baseId === 'preset_anime_simulcast' || AIRING_STATE_PROVIDERS.has(catalogMeta?._provider);
}

/**
 * Badge del catalogo novità anime: le due card (sub e ITA) leggono lo stato esterno,
 * non TMDB/StreamBadge. Card sub -> `EP {italian.sub.latest.episode}`;
 * card ITA (clone `_ita_offset`) -> `ITA {italian.dub.latest.episode}` e solo se nella
 * finestra di 14 giorni è uscito un episodio doppiato. Entrambe condividono lo stesso id.
 * Non lancia mai: in caso di problemi serve le card senza badge.
 */
async function applyAiringStateBadges(metas, { userConfig, hostUrl, catalogMeta, type, snapshot = null } = {}) {
    if (!Array.isArray(metas) || metas.length === 0) return { metas: [] };

    try {
        const state = snapshot || await animeAiringState.getSnapshot(); // getSnapshot non lancia mai
        const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
        const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
        const sanitizeOptions = {
            shouldApplyEpisodeBadge: type === 'series' || type === 'anime',
            isLandscapeEnabled: isLandscape,
            userConfig,
            hostUrl
        };

        const processed = [];
        for (const item of metas) {
            if (String(item.id).endsWith('_ita_offset')) {
                processed.push(item);
                continue;
            }
            const info = animeAiringState.getCardInfoForId(state, item.id);
            if (!info) {
                // Nessuno stato per questa serie: la card resta, senza badge.
                processed.push({ ...item, _itaBadge: false });
                continue;
            }

            if (info.sub) {
                processed.push(sanitizeCatalogMeta({
                    ...item,
                    _itaBadge: false,
                    _forceBadgeText: `EP ${info.sub.episode}`
                }, sanitizeOptions));
            }

            if (info.dub) {
                processed.push(sanitizeCatalogMeta({
                    ...item,
                    id: `${item.id}_ita_offset`,
                    _itaBadge: false,
                    _forceBadgeText: `ITA ${info.dub.episode}`
                }, sanitizeOptions));
            }
        }

        return { metas: processed };
    } catch (error) {
        console.error('[Catalog] Errore badge stato anime:', error.message);
        return { metas };
    }
}

function getLatestEpisodeInfo(item) {
    if (!item) return null;
    
    // Check rawTMDB
    if (item.rawTMDB && (item.type === 'series' || item.type === 'anime')) {
        const nextEp = item.rawTMDB.next_episode_to_air;
        const lastEp = item.rawTMDB.last_episode_to_air;
        if (nextEp?.episode_number) {
            return { season: nextEp.season_number || 1, episode: nextEp.episode_number };
        }
        if (lastEp?.episode_number) {
            return { season: lastEp.season_number || 1, episode: lastEp.episode_number };
        }
    }
    
    // Check item.videos
    const latest = findLatestAiredEpisode(item.videos);
    if (latest) {
        return { season: latest.season || 1, episode: latest.episode || 1 };
    }
    
    return null;
}

async function applyPostCacheBadges(cachedData, userConfig, hostUrl, catalogMeta, type, baseId, options = {}) {
    if (!cachedData || !Array.isArray(cachedData.metas) || cachedData.metas.length === 0) {
        return cachedData || { metas: [] };
    }

    // Clone metas to avoid modifying cached objects in place
    const metas = cachedData.metas.map(m => ({ ...m }));

    // Snapshot in RAM per gli anime (una sola lettura, cache TTL breve, non lancia mai)
    let animeSnapshot = options.snapshot || null;
    if (!animeSnapshot && metas.some(isItemAnime)) {
        try {
            animeSnapshot = await animeAiringState.getSnapshot();
        } catch (_e) {
            animeSnapshot = null;
        }
    }

    // Catalogo novità anime: i badge vengono dallo stato esterno, non da StreamBadge/TMDB.
    if (isAiringStateCatalog(baseId, catalogMeta)) {
        return await applyAiringStateBadges(metas, { userConfig, hostUrl, catalogMeta, type, snapshot: animeSnapshot });
    }

    const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
    const sanitizeOptions = {
        shouldApplyEpisodeBadge: (type === 'series' || type === 'anime') && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId)),
        isLandscapeEnabled: isLandscape,
        userConfig,
        hostUrl
    };

    // Escludiamo gli anime dallo scanner torrent ITA a monte (resta attivo per serie e film non-anime)
    const nonAnimeMetas = metas.filter(item => !isItemAnime(item));
    const itemIds = nonAnimeMetas
        .map(item => getBaseId(item.id))
        .filter(id => id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:') || id.startsWith('tt'));

    let allBadges = [];
    if (itemIds.length > 0) {
        try {
            allBadges = await StreamBadge.find({ baseId: { $in: itemIds } }).lean();
        } catch (badgeErr) {
            console.error('[Catalog Post-Cache] Error fetching stream badges:', badgeErr.message);
        }
    }

    const getEpNum = (stremioId) => {
        const parts = stremioId.split(':');
        return parseInt(parts[parts.length - 1]) || 0;
    };

    const processedMetas = [];

    for (let i = 0; i < metas.length; i++) {
        const item = metas[i];

        // Titolo anime: lo scanner torrent e i suoi badge/cloni non si applicano.
        // La verità ITA arriva dallo stato esterno (anime_airing_state).
        // Badge ITA ovunque se il titolo è doppiato (formato 'ITA n'), ma MAI cloni nei cataloghi standard.
        if (isItemAnime(item)) {
            const isAlreadyCloned = String(item.id).endsWith('_ita_offset');

            let doc = null;
            if (animeSnapshot) {
                doc = animeAiringState.findDocument(animeSnapshot, item.id);
                if (!doc) {
                    const tmdbId = extractTmdbId(item);
                    if (tmdbId && animeSnapshot.byTmdbId) {
                        doc = animeSnapshot.byTmdbId.get(tmdbId) || null;
                    }
                }
                if (!doc && item.id && String(item.id).startsWith('kitsu:')) {
                    const kitsuId = String(item.id).replace('kitsu:', '').replace(/_ita_offset$/, '');
                    try {
                        const mappedTmdbId = animeMappingStore.resolveTmdbFromKitsu(kitsuId);
                        if (mappedTmdbId && animeSnapshot.byTmdbId) {
                            doc = animeSnapshot.byTmdbId.get(String(mappedTmdbId)) || null;
                        }
                    } catch (_e) {
                        // Lookup difensivo, mai crash
                    }
                }
            }

            const dubEpisode = animeAiringState.getDubEpisode(doc);
            // Fuori dal catalogo novità un anime mostra SOLO il badge ITA (o niente):
            // niente badge episodio e niente badge di stagione. Il flag lo rispetta il formatter.
            const animeItem = { ...item, _itaBadge: false, _itaOnlyBadge: true };
            if (dubEpisode !== null) {
                animeItem._forceBadgeText = `ITA ${dubEpisode}`;
            }

            if ((sanitizeOptions.shouldApplyEpisodeBadge || animeItem._forceBadgeText) && !isAlreadyCloned) {
                processedMetas.push(sanitizeCatalogMeta(animeItem, sanitizeOptions));
            } else {
                processedMetas.push(animeItem);
            }
            continue;
        }

        const id = String(item.id);
        let bId = id;
        if (id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:')) {
            const parts = id.split(':');
            bId = `${parts[0]}:${parts[1]}`;
        }

        const itemBadges = allBadges.filter(b => b.baseId === bId);
        const itaBadges = itemBadges.filter(b => b.hasIta === true);
        const noItaBadges = itemBadges.filter(b => b.hasIta === false);
        const isAlreadyCloned = id.endsWith('_ita_offset');

        if (itaBadges.length > 0) {
            // Troviamo maxItaEp e maxNoItaEp per calcolare l'offset
            const sortedIta = itaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);
            const sortedNoIta = noItaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);

            const maxIta = sortedIta[sortedIta.length - 1];
            const maxNoIta = sortedNoIta.find(ep => ep > maxIta);

            const hasOffset = maxNoIta && (maxNoIta > maxIta);

            if (hasOffset && !isAlreadyCloned && sanitizeOptions.shouldApplyEpisodeBadge && (item.type === 'series' || item.type === 'anime')) {
                // 1. Elemento originale (Sub): badge ITA disattivato
                const subItem = { ...item };
                subItem._itaBadge = false;
                if (sanitizeOptions.shouldApplyEpisodeBadge) {
                    processedMetas.push(sanitizeCatalogMeta(subItem, sanitizeOptions));
                } else {
                    processedMetas.push(subItem);
                }

                // 2. Elemento clone (Dub): badge ITA attivato, forziamo stagione ed episodio
                const dubItem = { ...item };
                dubItem.id = `${item.id}_ita_offset`;
                dubItem._itaBadge = true;

                // Troviamo il badge specifico per recuperare stagione ed episodio originali
                const maxItaBadge = itaBadges.find(b => getEpNum(b.stremioId) === maxIta);
                let maxItaSeason = 1;
                let maxItaEpisode = maxIta;
                
                if (maxItaBadge) {
                    const parts = maxItaBadge.stremioId.split(':');
                    if (maxItaBadge.stremioId.startsWith('tmdb:tv:')) {
                        maxItaSeason = parseInt(parts[3]) || 1;
                        maxItaEpisode = parseInt(parts[4]) || maxIta;
                    } else if (parts.length === 4) {
                        maxItaSeason = parseInt(parts[2]) || 1;
                        maxItaEpisode = parseInt(parts[3]) || maxIta;
                    }
                }
                
                dubItem._forceSeason = maxItaSeason;
                dubItem._forceEpisode = maxItaEpisode;

                processedMetas.push(sanitizeCatalogMeta(dubItem, sanitizeOptions));
            } else {
                // Nessun offset: badge ITA standard
                const standardItem = { ...item };
                standardItem._itaBadge = true;
                processedMetas.push(sanitizeCatalogMeta(standardItem, sanitizeOptions));
            }
        } else {
            // Non ci sono flussi ita, disattiva il badge
            const subItem = { ...item };
            subItem._itaBadge = false;
            if (sanitizeOptions.shouldApplyEpisodeBadge) {
                processedMetas.push(sanitizeCatalogMeta(subItem, sanitizeOptions));
            } else {
                processedMetas.push(subItem);
            }
        }
    }

    return { metas: processedMetas };
}

/**
 * Funzione principale (Orchestrator) che riceve la richiesta da Stremio ed elabora il catalogo.
 * Utilizza il pattern Strategy deferendo a CatalogRouter, Processors e Formatters.
 */
async function catalogHandler(args, userConfig, hostUrl) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra?.skip || 0;
    
    // Resolve active profile settings directly from userConfig (instead of phantom SettingsManager)
    const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    
    // TMDB Client Initialization
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
        throw new Error("Manca la TMDB API KEY nella configurazione.");
    }
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const { cacheOptions: tmdbFetchOptions } = getCacheConfig(userConfig.ttl);
    
    // We bump this version whenever we make significant changes to how posters or badges are generated
    const BADGE_CATALOG_VERSION = 15;

    // Check Full CACHE Request
    const requestCacheKey = generateRequestHash(id, { 
        type, 
        extra, 
        directFilters, 
        user: userConfig.userId, 
        profile: userConfig.activeProfileId, 
        kidsMode: activeProfileSettings.kidsMode,
        typeSelectors: activeProfileSettings.typeSelectors,
        configVersion: userConfig.configVersion || userConfig.config?.configVersion,
        badgeV: BADGE_CATALOG_VERSION
    }, skip, type);
    
    let catalogMeta = null;
    let baseId = id;
    if (id && id.startsWith('yaca_preset_')) {
        baseId = id.replace('yaca_preset_', '');
    }

    if (baseId !== 'yaca_search_history') {
        const presets = getPresets();
        catalogMeta = presets.find(p => p.id === baseId || p.id === id);

        if (!catalogMeta && userConfig) {
            const activeProfile = userConfig.profiles?.find(p => p.id === userConfig.activeProfileId);
            if (activeProfile && activeProfile.catalogs) {
                catalogMeta = activeProfile.catalogs.find(c => c.id === id);
            }
            if (!catalogMeta && userConfig.customCatalogs) {
                catalogMeta = userConfig.customCatalogs.find(c => c.id === id);
            }
        }
    }

    // GUARDIA SELETTORI DI TIPO (Ticket 09 / Spec 06):
    // Se il catalogo richiesto è un suggerimento non conforme ai selettori del profilo attivo -> { metas: [] }
    const targetCatalog = catalogMeta || { id, type };
    if (!isCatalogConformant(targetCatalog, activeProfileSettings?.typeSelectors)) {
        return { metas: [] };
    }

    // managed SWR: Fetch or Revalidate
    const { ttl } = getCacheConfig(userConfig.ttl);
    
    const fetchCatalog = async () => {
        try {
            // Aggiungo hostUrl ad extra per essere passato ai provider se serve (es. Trakt)
            const routerArgs = { ...args, extra: { ...extra, hostUrl } };

            // 1. ROUTING: Determina il catalogo grezzo passando attraverso il Router
            let results = await routeCatalogRequest(routerArgs, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta);
            // console.log('ROUTE RESULTS:', results?.length);
            
            if (!results || results.length === 0) {
                return { metas: [] };
            }

            // 2. FILTRAGGIO POST-FETCH: Nasconde tipo sbagliato
            if (type === 'movie' || type === 'series') {
                results = results.filter(i => {
                    if (i.media_type) {
                        const expectedType = type === 'series' ? 'tv' : 'movie';
                        return i.media_type === expectedType || i.media_type === 'person';
                    }
                    return true;
                });
            }

            // console.log('POST MEDIA TYPE RESULTS:', results?.length);
            // 2.5 FILTRAGGIO POST-FETCH: guardia unica per genere + keyword.
            // I provider DuckDB applicano già i vincoli in SQL; questo secondo
            // livello copre preset, ricerche e fallback che possono perdere i campi
            // pesanti durante la normalizzazione.
            if (activeProfileSettings?.kidsMode) {
                results = applyKidsMode(results);
            }

            // 2.6 FILTRAGGIO POST-FETCH: Filtro Contenuti Anime (Ticket 13 / Spec 06 Sezione 6)
            // Perimetro: cataloghi di suggerimento (preset utente, 8 hero, custom/merged).
            // Le ricerche e la libreria personale (3 watchlist) non vengono filtrate.
            const animeSelector = activeProfileSettings?.typeSelectors?.anime;
            const isSubjectCatalog = !isAlwaysVisible(id) && !isAlwaysVisible(baseId) && !extra?.search;
            if (isSubjectCatalog && (animeSelector === 'exclude' || animeSelector === 'only')) {
                results = results.filter(item => {
                    const isAnime = isItemAnime(item);
                    if (animeSelector === 'exclude') {
                        return !isAnime;
                    }
                    if (animeSelector === 'only') {
                        return isAnime;
                    }
                    return true;
                });
            }

            // 3. POST-PROCESSING
            let finalResults = results;
            
            const shouldBadge = type === 'series' && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));
            if (shouldBadge) {
                await hydrateEpisodeBadgesFromCache(finalResults, tmdbApiKey);
            }

            // Deduplicate items by ID
            if (Array.isArray(finalResults) && finalResults.length > 0) {
                const seenIds = new Set();
                finalResults = finalResults.filter(item => {
                    const itemId = String(item?.id || item?.stremioId || '');
                    if (!itemId) return false;
                    if (seenIds.has(itemId)) return false;
                    seenIds.add(itemId);
                    return true;
                });
            }

            // 3.8 SIMULCAST SORTING (se applicabile)
            // Se il catalogo ha query basate su date di airing (es. Simulcast), ordiniamo per episodio più recente
            const hasAirDateFilter = catalogMeta?.queries?.some(q => q['air_date.gte'] || q['air_date.lte']) || false;
            if (hasAirDateFilter && type === 'series' && finalResults && finalResults.length > 0) {
                const nowStr = new Date().toISOString().split('T')[0];
                const nowMs = Date.now();
                
                finalResults.forEach(item => {
                    let latestDateStr = null;
                    
                    // 1. Prova da TMDB raw metadata
                    if (item.rawTMDB) {
                        const nextEp = item.rawTMDB.next_episode_to_air;
                        const lastEp = item.rawTMDB.last_episode_to_air;
                        
                        if (nextEp && nextEp.air_date && nextEp.air_date <= nowStr) {
                            latestDateStr = nextEp.air_date;
                        } else if (lastEp && lastEp.air_date && lastEp.air_date <= nowStr) {
                            latestDateStr = lastEp.air_date;
                        }
                    }
                    
                    // 2. Fallback su episodes (Kitsu o TMDB cache)
                    if (!latestDateStr && Array.isArray(item.videos) && item.videos.length > 0) {
                        const airedEpisodes = item.videos.filter(v => v.released && new Date(v.released).getTime() <= nowMs);
                        if (airedEpisodes.length > 0) {
                            airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
                            latestDateStr = airedEpisodes[0].released.substring(0, 10);
                        }
                    }
                    
                    item._latestAirDate = latestDateStr;
                });
                
                finalResults.sort((a, b) => {
                    if (a._latestAirDate && b._latestAirDate) {
                        return b._latestAirDate.localeCompare(a._latestAirDate);
                    }
                    if (a._latestAirDate) return -1;
                    if (b._latestAirDate) return 1;
                    return 0; // maintain original relative order
                });
            }

            // console.log('POST DEDUPLICATION RESULTS:', finalResults?.length);
            // 4. FORMATTAZIONE (STREMIO)
            const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
            const formattedData = formatStremioCatalog(
                finalResults,
                baseId,
                type,
                userConfig,
                isLandscape,
                hostUrl,
                catalogMeta
            );

            return formattedData;
        } catch (e) {
            console.error(`[CATALOG] Error in catalog generation pipeline:`, e);
            throw e;
        }
    };

    // SWR handling
    let responseData;
    if (extra?.search || baseId === 'yaca_search_history') {
        responseData = await fetchCatalog();
    } else if (extra?.warmupMode) {
        const cachedStatus = await catalogRequestCache.getWithStatus(requestCacheKey);
        if (cachedStatus.status === 'fresh') {
            // [OTTIMIZZAZIONE] Se il catalogo è intatto (fresh) e il demone sta solo riscaldando,
            // non ci serve eseguire applyPostCacheBadges (che costa migliaia di letture/scritture al DB).
            // Usciamo immediatamente restituendo il catalogo dalla cache.
            return cachedStatus.value;
        } else {
            const freshData = await fetchCatalog();
            await catalogRequestCache.set(requestCacheKey, freshData, ttl);
            responseData = freshData;
        }
    } else {
        responseData = await catalogRequestCache.getOrFetch(requestCacheKey, fetchCatalog, ttl);
    }

    return await applyPostCacheBadges(responseData, userConfig, hostUrl, catalogMeta, type, baseId);
}

module.exports = {
    catalogHandler,
    applyAiringStateBadges,
    isAiringStateCatalog,
    applyPostCacheBadges,
    isItemAnime,
    extractTmdbId
};
