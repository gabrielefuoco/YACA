const { fetchTmdbCatalog, createTmdbClient, getTmdbIdByName, getTmdbMovieDetails } = require('../clients/tmdb');
const { fetchKitsuCatalog } = require('../clients/kitsu');
const { fetchTraktCatalog } = require('../clients/trakt');
const { fetchMDBListItems, parseMDBListItems } = require('../utils/mdblist');
const { routeLiveStremioSearch } = require('../ai/router');
const { getHybridCatalog } = require('../engines/hybridRecommendations');
const UserList = require('../db/models/UserList');
const TasteProfile = require('../db/models/TasteProfile');
const UserActivity = require('../db/models/UserActivity');
const ProfileScorer = require('../profile/ProfileScorer');
const CacheEntry = require('../db/models/CacheEntry');
const { getPresets } = require('../data/presets');
const {
    CACHE_TTL_MS,
    FAST_CACHE_TTL_MS,
    SLOW_CACHE_TTL_MS,
    FORCED_FAST_CATALOG_IDS,
    FORCED_FAST_PRESET_IDS,
    FORCED_SLOW_PRESET_IDS,
    ENRICHMENT_BUDGET,
    ENRICHMENT_CHUNK_SIZE,
    ENRICHMENT_DELAY_MS
} = require('../config');

const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };
const FORCED_FAST_CATALOGS = new Set(FORCED_FAST_CATALOG_IDS);
const FORCED_FAST_PRESETS = new Set(FORCED_FAST_PRESET_IDS);
const FORCED_SLOW_PRESETS = new Set(FORCED_SLOW_PRESET_IDS);

// Cataloghi che mostrano episodi recenti (badge numero episodio sul poster)
const EPISODE_CATALOG_IDS = new Set([
    'preset_new_series_eps',
    'preset_new_anime_eps'
]);

/**
 * Aggiunge il badge con numero episodio ai poster per cataloghi di episodi recenti.
 * Trova l'ultimo episodio trasmesso e genera l'URL del poster con badge.
 */
function applyEpisodeBadge(metas, hostUrl) {
    const host = hostUrl || process.env.HOST_URL || 'http://localhost:7000';
    const now = new Date();

    for (const meta of metas) {
        if (!meta || !meta.poster || !meta.videos || meta.videos.length === 0) continue;

        // Trova l'ultimo episodio già trasmesso
        const airedEpisodes = meta.videos.filter(v => v.released && new Date(v.released) <= now);
        if (airedEpisodes.length === 0) continue;

        airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
        const latest = airedEpisodes[0];

        const badgeText = latest.season && latest.season > 1
            ? `S${latest.season}E${latest.episode}`
            : `E${latest.episode || 1}`;

        meta.poster = `${host}/badge/poster.jpg?url=${encodeURIComponent(meta.poster)}&text=${encodeURIComponent(badgeText)}`;
    }
}

/**
 * Funzione di "Enrichment" progressivo (Fase 9).
 * Scarica asincronamente i dettagli TMDB per i primi X elementi della pagina se mancano in cache.
 */
async function enrichResultsWithDeepMetadata(metas, tmdbApiKey, type) {
    if (!metas || metas.length === 0 || !tmdbApiKey) return;

    // Prendiamo solo i primi 40-60 (quelli che influenzano il sorting della prima pagina)
    const candidates = metas.slice(0, 60);
    let budget = ENRICHMENT_BUDGET;

    for (const item of candidates) {
        if (budget <= 0) break;

        // Se l'item non ha già i dettagli (keywords/cast), proviamo a scaricarli
        // getTmdbMovieDetails controlla internamente la cache MongoDB (L2)
        if (!item.keywords || !item.cast) {
            const tmdbId = item.id.toString().replace('tmdb:', '').trim();

            // Usiamo un piccolo delay per non bloccare l'event loop e per distanziare le chiamate API
            await new Promise(resolve => setTimeout(resolve, ENRICHMENT_DELAY_MS));

            try {
                const details = await getTmdbMovieDetails(tmdbApiKey, tmdbId, type === 'series' ? 'tv' : 'movie');
                if (details) {
                    // Update dell'oggetto in memoria (per la prossima iterazione dello scorer)
                    item.keywords = details.keywords?.keywords || details.keywords?.results || [];
                    item.cast = details.credits?.cast || [];
                    budget--;
                }
            } catch (err) {
                console.error(`[Enrichment] Errore per ${tmdbId}:`, err.message);
            }
        }
    }
}

/**
 * Filtra i contenuti già visti dall'utente se l'opzione è attiva (Fase 10).
 * @param {Array} metas Lista dei contenuti da filtrare
 * @param {Object} userConfig Configurazione dell'utente
 * @returns {Promise<Array>} Lista filtrata
 */
async function filterWatchedItems(metas, userConfig) {
    if (!metas || metas.length === 0 || !userConfig?.config?.hideWatched) {
        return metas;
    }

    const userId = userConfig.userId;
    // Carichiamo il profilo globale per avere la history completa (Trakt + Stremio)
    const profile = await TasteProfile.findOne({ owner: userId, context: 'global' });
    if (!profile) return metas;

    const watchedIds = new Set([
        ...(profile.processedTraktIds || []),
        ...(profile.processedStremioIds || [])
    ]);

    if (watchedIds.size === 0) return metas;

    return metas.filter(item => {
        // Estraiamo l'ID TMDB puro (es. 'tmdb:123' -> '123')
        const rawId = item.id.toString().replace('tmdb:', '').trim();
        return !watchedIds.has(rawId);
    });
}

function getCatalogCacheTtlMs(catalogId, profileSettings = {}) {
    if (FORCED_FAST_CATALOGS.has(catalogId)) return FAST_CACHE_TTL_MS;
    if (!catalogId.startsWith('yaca_preset_')) return CACHE_TTL_MS;

    const presetId = catalogId.replace('yaca_preset_', '');
    if (FORCED_FAST_PRESETS.has(presetId)) return FAST_CACHE_TTL_MS;
    if (FORCED_SLOW_PRESETS.has(presetId)) return SLOW_CACHE_TTL_MS;
    if (profileSettings.fastPresetRefresh) return FAST_CACHE_TTL_MS;
    return CACHE_TTL_MS;
}

/**
 * Mappa i generi. Se type è TV Series, TMDB ha ID diversi rispetto ai film.
 * Di base, l'AI è istruita per ritornare ID film. Se cerchiamo TV, li mappiamo.
 */
function resolveGenreIds(genreIdsArray, type) {
    if (!genreIdsArray || genreIdsArray.length === 0) return '';
    if (type === 'movie') return genreIdsArray.join(',');

    const MOVIE_TO_TV_MAP = {
        28: 10759, 12: 10759, 16: 16, 35: 35, 80: 80, 99: 99, 18: 18,
        10751: 10751, 14: 10765, 36: 10768, 27: 10765, 10402: 18,
        9648: 9648, 10749: 18, 878: 10765, 53: 80, 10752: 10768, 37: 37
    };

    const mapped = genreIdsArray.map(id => MOVIE_TO_TV_MAP[id]).filter(id => id !== undefined);
    return [...new Set(mapped)].join(',');
}

/**
 * Traduce l'oggetto filtri AI (o salvato a DB) in un oggetto query params per TMDB /discover
 */
async function buildDiscoveryParams(filters, tmdbApiKey, type, baseSettings = {}) {
    const tmdbParams = {
        ...filters, // Spread per far passare le chiavi TMDB dirette usate nei preset
        sort_by: filters.sort_by || 'popularity.desc',
        'vote_count.gte': filters['vote_count.gte'] !== undefined ? filters['vote_count.gte'] : (parseInt(baseSettings.minVoteCount) || 0),
        'vote_average.gte': filters['vote_average.gte'] !== undefined ? filters['vote_average.gte'] : (parseFloat(baseSettings.minVoteAverage) || 0),
        language: filters.language || 'it-IT'
    };

    if (filters.original_language) {
        tmdbParams.with_original_language = filters.original_language;
    }

    // Pulisci le chiavi custom dell'AI per non inviarle sporche a TMDB (opzionale ma pulito)
    delete tmdbParams.strategy;
    delete tmdbParams.similar_to;
    delete tmdbParams.text_search;
    delete tmdbParams.people_list;
    delete tmdbParams.keyword;
    delete tmdbParams.company_name;
    delete tmdbParams.genre_ids;
    delete tmdbParams.year_from;
    delete tmdbParams.year_to;
    delete tmdbParams.runtime_lte;
    delete tmdbParams.runtime_gte;
    delete tmdbParams.watch_provider;
    delete tmdbParams.original_language;
    delete tmdbParams.target;

    if (filters.genre_ids?.length) {
        const finalGenres = resolveGenreIds(filters.genre_ids, type);
        if (finalGenres) tmdbParams.with_genres = finalGenres;
    }

    if (filters.year_from) {
        const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
        tmdbParams[`${dateField}.gte`] = `${filters.year_from}-01-01`;
        if (filters.year_to) tmdbParams[`${dateField}.lte`] = `${filters.year_to}-12-31`;
    }

    if (filters.runtime_lte && type === 'movie') tmdbParams['with_runtime.lte'] = filters.runtime_lte;
    if (filters.runtime_gte && type === 'movie') tmdbParams['with_runtime.gte'] = filters.runtime_gte;

    // Risoluzione ID Asincrona: Persone, Keywords, Compagnie — in parallelo
    const asyncTasks = [];

    if (filters.people_list && filters.people_list.length > 0) {
        asyncTasks.push(
            Promise.allSettled(filters.people_list.map(name => getTmdbIdByName(tmdbApiKey, 'person', name)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (valid.length > 0) tmdbParams.with_people = valid.join(',');
                })
        );
    }

    if (filters.keyword && filters.keyword !== 'kdrama') {
        const keywords = filters.keyword.split(',').map(k => k.trim()).filter(Boolean);
        asyncTasks.push(
            Promise.allSettled(keywords.map(k => getTmdbIdByName(tmdbApiKey, 'keyword', k)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (valid.length > 0) tmdbParams.with_keywords = valid.join('|');
                })
        );
    }

    if (filters.company_name) {
        asyncTasks.push(
            getTmdbIdByName(tmdbApiKey, 'company', filters.company_name)
                .then(cid => { if (cid) tmdbParams.with_companies = cid; })
        );
    }

    await Promise.all(asyncTasks);

    // Provider (Netflix, ecc.)
    if (filters.watch_provider) {
        const pid = STREAMING_PROVIDERS[filters.watch_provider.toLowerCase()];
        if (pid) {
            tmdbParams.with_watch_providers = pid;
            tmdbParams.watch_region = 'IT';
        }
    }

    return tmdbParams;
}

/**
 * Esegue una query complessa determinando la strategia (similar, discovery, search)
 */
async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}, cacheOptions = {}) {
    let results = [];
    const searchType = type === 'series' ? 'tv' : 'movie';

    // === STRATEGIA 1: SIMILARITÀ ===
    if (filters.strategy === "similar" && filters.similar_to) {
        const targetId = await getTmdbIdByName(tmdbApiKey, searchType, filters.similar_to);
        if (targetId) {
            results = await fetchTmdbCatalog(
                tmdbClient,
                `/${searchType}/${targetId}/recommendations`,
                skip,
                { language: 'it-IT' },
                type,
                cacheOptions
            );
        }
    }
    // === STRATEGIA 2: RICERCA DIRETTA (Titoli esatti) ===
    else if (filters.strategy === "multi_search") {
        const ep = type === 'movie' ? '/search/movie' : '/search/tv';
        results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: filters.text_search || filters.keyword }, type, cacheOptions);
    }
    // === STRATEGIA 3: DISCOVERY (Filtri) ===
    else {
        const tmdbParams = await buildDiscoveryParams(filters, tmdbApiKey, type, settings);
        const endpoint = `/discover/${searchType}`;
        results = await fetchTmdbCatalog(tmdbClient, endpoint, skip, tmdbParams, type, cacheOptions);

        // === LOGICA DI FALLBACK PER RISULTATI SCARSI (< 20) ===
        // Solo se siamo sulla prima pagina (skip === 0)
        if (skip === 0 && results.length < 20) {
            let relaxedParams = { ...tmdbParams };
            let changed = false;

            // Step 1: Abbassa il limite dei voti (vote_count.gte)
            if (relaxedParams['vote_count.gte'] > 5) {
                relaxedParams['vote_count.gte'] = 5;
                changed = true;
            } else if (relaxedParams['vote_count.gte'] > 0) {
                relaxedParams['vote_count.gte'] = 0;
                changed = true;
            }

            if (changed) {
                const extraResults = await fetchTmdbCatalog(tmdbClient, endpoint, skip, relaxedParams, type, cacheOptions);
                // Unione e deduplicazione manuale per ID
                const existingIds = new Set(results.map(r => r.id));
                for (const item of extraResults) {
                    if (!existingIds.has(item.id)) {
                        results.push(item);
                        existingIds.add(item.id);
                    }
                }
            }

            // Step 2: Se ancora pochi risultati, rimuovi le keyword ma tieni i generi
            if (results.length < 20 && relaxedParams.with_keywords) {
                delete relaxedParams.with_keywords;
                const broadResults = await fetchTmdbCatalog(tmdbClient, endpoint, skip, relaxedParams, type, cacheOptions);
                const existingIds = new Set(results.map(r => r.id));
                for (const item of broadResults) {
                    if (!existingIds.has(item.id)) {
                        results.push(item);
                        existingIds.add(item.id);
                    }
                }
            }
        }
    }

    // Metadati originali per supporto interleave
    const originalResults = results;
    return results;
}

/**
 * Interseca due liste di risultati alternandoli (interleaving).
 * Deduplica per ID.
 */
function interleaveResults(listA = [], listB = [], skip, limit) {
    const safeListA = Array.isArray(listA) ? listA : [];
    const safeListB = Array.isArray(listB) ? listB : [];
    const combined = [];
    const maxLen = Math.max(safeListA.length, safeListB.length);
    const seen = new Set();
    const appendIfNotSeen = (item) => {
        if (!item) return;
        const itemId = item.id;
        if (itemId === undefined || itemId === null) {
            combined.push(item);
            return;
        }
        if (!seen.has(itemId)) {
            combined.push(item);
            seen.add(itemId);
        }
    };

    for (let i = 0; i < maxLen; i++) {
        appendIfNotSeen(safeListA[i]);
        appendIfNotSeen(safeListB[i]);
    }
    return combined.slice(skip, skip + limit);
}

/**
 * Arricchisce i filtri con le preferenze del profilo utente (Automatic Query Injection).
 */
async function injectProfilePreferences(filters, userId, profileId) {
    if (!userId) return filters;
    const profile = await TasteProfile.findOne({ owner: userId, context: profileId || 'global' });
    if (!profile) return filters;

    const enriched = { ...filters };

    // Estrai top 3 keyword e top 2 generi dal profilo
    const topKeywords = [...profile.keywordScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(e => e[0]);

    const topGenres = [...profile.genreScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(e => e[0]);

    if (topKeywords.length > 0) {
        const existingKws = enriched.with_keywords ? enriched.with_keywords.split(/[|,]/) : [];
        enriched.with_keywords = [...new Set([...existingKws, ...topKeywords])].join('|');
    }

    if (topGenres.length > 0) {
        const existingGenres = enriched.with_genres ? enriched.with_genres.split(/[|,]/) : [];
        enriched.with_genres = [...new Set([...existingGenres, ...topGenres])].join('|');
    }

    return enriched;
}

/**
 * Esegue la Triple Search: Simple, Preset, AI.
 */
async function executeCombinedSearch(search, userConfig, type, skip, activeProfileSettings, cacheOptions) {
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const mistralKey = userConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const userId = userConfig.userId;
    const profileId = userConfig.activeProfileId;

    // Recupera il profilo per lo scoring finale
    const profileDoc = userId ? await TasteProfile.findOne({ owner: userId, context: profileId || 'global' }) : null;

    const tasks = [
        // 1. Simple Search (Priorità Max)
        (async () => {
            const ep = type === 'movie' ? '/search/movie' : '/search/tv';
            const results = await fetchTmdbCatalog(tmdbClient, ep, 0, { query: search }, type, cacheOptions);
            return results.map(r => ({ ...r, weight: 1.5, source: 'simple' }));
        })(),

        // 2. Preset Search (Cache/Database)
        (async () => {
            try {
                // Cerchiamo nel namespace 'tmdb_catalog' per item che matchano il titolo
                const cachedEntries = await CacheEntry.find({
                    namespace: 'tmdb_catalog',
                    'value.stremioData.name': { $regex: search, $options: 'i' }
                }).limit(5).lean();

                const items = [];
                cachedEntries.forEach(entry => {
                    const matched = entry.value.stremioData.filter(m =>
                        m.name.toLowerCase().includes(search.toLowerCase())
                    );
                    items.push(...matched);
                });

                return items.map(r => ({ ...r, weight: 1.1, source: 'cache' }));
            } catch (e) {
                console.error('Errore search cache:', e.message);
                return [];
            }
        })(),

        // 3. AI Search + Query Injection
        (async () => {
            if (!mistralKey) return [];
            const routing = await routeLiveStremioSearch(search, mistralKey);
            if (routing.target === 'kitsu' && type === 'series') return [];

            // Injection!
            const mergedFilters = await injectProfilePreferences(routing.filters, userId, profileId);
            const items = await executeComplexStrategy(mergedFilters, tmdbClient, tmdbApiKey, type, 0, activeProfileSettings, cacheOptions);
            return items.map(r => ({ ...r, weight: 0.8, source: 'ai' }));
        })()
    ];

    const allResults = await Promise.all(tasks);
    const flatResults = allResults.flat();

    // Fusione e Deduplicazione con Ranking (SUM dei pesi per duplicati)
    const mergedMap = new Map();
    for (const item of flatResults) {
        if (!item || !item.id) continue;
        if (mergedMap.has(item.id)) {
            const existing = mergedMap.get(item.id);
            existing.weight += item.weight;
            if (!existing.sources.includes(item.source)) {
                existing.sources.push(item.source);
            }
        } else {
            mergedMap.set(item.id, { ...item, sources: [item.source] });
        }
    }

    let finalItems = Array.from(mergedMap.values());

    // Re-ranking tramite ProfileScorer se il profilo esiste
    if (profileDoc) {
        for (const item of finalItems) {
            // Se non abbiamo i dati raw (estesi), usiamo quelli disponibili per lo scoring
            const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc);
            item.affinity = affinity;
            item.finalScore = (item.weight * 2) + affinity;
        }
        finalItems.sort((a, b) => b.finalScore - a.finalScore);
    } else {
        finalItems.sort((a, b) => b.weight - a.weight);
    }

    // Fase 9: Enrichment Progressivo in background (non blocca la risposta)
    enrichResultsWithDeepMetadata(finalItems, tmdbApiKey, type);

    return finalItems.slice(skip, skip + 40);
}

/**
 * Gestisce la rotta "catalog" inviata da Stremio (es. /catalog/movie/tmdb_discover.json)
 */
async function catalogHandler(args, userConfig, hostUrl) {
    try {
        const { type, id, extra, filters: directFilters } = args;
        const skip = extra.skip || 0;
        const search = extra.search || null;
        const sortBy = extra.sortBy || null;

        let results = [];

        // Preview mode: minimal userConfig if missing
        const effectiveUserConfig = userConfig || { apiKeys: { tmdb: process.env.TMDB_API_KEY, mistral: process.env.MISTRAL_API_KEY } };

        const tmdbApiKey = effectiveUserConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");

        const mistralKey = effectiveUserConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
        const tmdbClient = createTmdbClient(tmdbApiKey);

        // Recupera impostazioni del profilo attivo
        let activeProfileSettings = { minVoteAverage: 0, minVoteCount: 0 };
        let profileDoc = null;
        if (userConfig.profiles && userConfig.activeProfileId) {
            profileDoc = await TasteProfile.findOne({ owner: userConfig.userId, context: userConfig.activeProfileId });
            if (profileDoc && profileDoc.settings) {
                activeProfileSettings = profileDoc.settings;
            }
        }
        const cacheOptions = { cacheTtlMs: getCatalogCacheTtlMs(id || 'preview', activeProfileSettings) };

        // Pulisce l'ID nel caso arrivi come Preset dalla Dashboard
        const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');

        // Carica i preset con date dinamiche (ricalcolate ad ogni richiesta)
        const presetsList = getPresets();

        // Risoluzione metadati catalogo (Preset o Lista Utente)
        let catalogMeta = presetsList.find(p => p.id === baseId);
        if (!catalogMeta && (id?.length === 21 || id?.length === 24)) { // Lunghezza tipica nanoid o ObjectId
            catalogMeta = await UserList.findOne({ listId: id }).lean();
        }

        // ==========================================
        // SCENARIO -1: YACA PROFILES
        // ==========================================
        if (id === 'yaca-profiles') {
            if (!userConfig.profiles || userConfig.profiles.length === 0) {
                return { metas: [] };
            }
            const profilesMeta = userConfig.profiles.map(p => {
                const isActive = p.id === userConfig.activeProfileId;
                const displayName = isActive ? `✅ ${p.name}` : p.name;
                return {
                    id: `yaca-profile-${p.id}`,
                    type: args.type || 'other',
                    name: displayName,
                    poster: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random&color=fff&size=512`,
                    description: isActive ? 'Profilo attualmente attivo' : 'Seleziona per impostare come Profilo Attivo'
                };
            });
            return { metas: profilesMeta };
        }

        // ==========================================
        // SCENARIO 0: CRONOLOGIA RICERCHE (New)
        // ==========================================
        if (baseId === 'yaca_search_history') {
            const lastActivities = await UserActivity.find({
                userId: userConfig.userId,
                type: 'search'
            }).sort({ timestamp: -1 }).limit(3).lean();

            if (lastActivities.length > 0) {
                const searchTasks = lastActivities.map(act =>
                    executeCombinedSearch(act.value, userConfig, type, 0, activeProfileSettings, cacheOptions)
                );
                const searchResults = await Promise.all(searchTasks);
                results = searchResults.flat();

                // Deduplica e applica ranking profilo
                const seen = new Set();
                results = results.filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });

                if (profileDoc) {
                    results.sort((a, b) => (b.affinity || 0) - (a.affinity || 0));
                }
            }
            return { metas: results.slice(skip, skip + 40) };
        }

        // ==========================================
        // SCENARIO 1: RICERCA VIVA TRAMITE BARRA
        // ==========================================
        if (search) {
            // Track activity
            if (userConfig.userId) {
                UserActivity.create({
                    userId: userConfig.userId,
                    type: 'search',
                    value: search,
                    metadata: { type, id }
                }).catch(e => console.error('Errore tracking search:', e.message));
            }

            let currentSkip = skip;
            let combinedResults = [];
            let depth = 0;
            const MAX_DEPTH = 3;

            while (combinedResults.length < 20 && depth < MAX_DEPTH) {
                let pageResults = await executeCombinedSearch(search, userConfig, type, currentSkip, activeProfileSettings, cacheOptions);
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);

                if (pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
                currentSkip += 20;
                depth++;
            }
            results = combinedResults.slice(0, 40);
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 2: CATALOGHI ESPLORATIVI STANDARD
        // ==========================================
        if (id === 'yaca_discover_movies' || id === 'yaca_discover_series') {
            const isMovie = id === 'yaca_discover_movies';
            const endpoint = isMovie ? '/discover/movie' : '/discover/tv';
            const contentType = isMovie ? 'movie' : 'series';
            const tmdbType = isMovie ? 'movie' : 'tv';

            let currentSkip = skip;
            let combinedResults = [];
            let depth = 0;
            const MAX_DEPTH = 3;

            while (combinedResults.length < 20 && depth < MAX_DEPTH) {
                const params = {
                    sort_by: sortBy || 'popularity.desc',
                    'vote_average.gte': activeProfileSettings.minVoteAverage,
                    'vote_count.gte': activeProfileSettings.minVoteCount
                };
                let pageResults = await fetchTmdbCatalog(tmdbClient, endpoint, currentSkip, params, contentType, cacheOptions);

                // Filtro "Hide Watched"
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);

                if (pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
                currentSkip += 20;
                depth++;
            }

            results = combinedResults.slice(0, 40);
            enrichResultsWithDeepMetadata(results, tmdbApiKey, contentType);
            return { metas: results };
        }

        if (id === 'yaca_anime_trending') {
            results = await fetchKitsuCatalog('/anime', skip, { sort: '-popularityRank' });
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 2.5: CATALOGHI IBRIDI (Hybrid Recommendations - Taste-Based)
        // ==========================================
        const TASTE_BASED_IDS = new Set([
            'yaca_signature_core_movies', 'yaca_signature_core_series',
            'yaca_signature_blend_movies', 'yaca_signature_blend_series',
            'yaca_signature_star_movies', 'yaca_signature_star_series',
            'yaca_hybrid_movies', 'yaca_hybrid_series', // Keep for backward compatibility
            'yaca_discovery_movies', 'yaca_discovery_series',
            'yaca_top20_movies', 'yaca_top20_series',
            'yaca_top_genres_mix'
        ]);
        if (TASTE_BASED_IDS.has(baseId)) {
            const traktToken = userConfig.apiKeys?.trakt;
            let currentSkip = skip;
            let combinedResults = [];
            let depth = 0;
            const MAX_DEPTH = 3;

            while (combinedResults.length < 20 && depth < MAX_DEPTH) {
                let pageResults = [];
                if (traktToken) {
                    pageResults = await getHybridCatalog(baseId, currentSkip, traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId);
                }

                // Filtro "Hide Watched"
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);

                if (pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
                currentSkip += 20;
                depth++;
            }
            results = combinedResults.slice(0, 40);
            enrichResultsWithDeepMetadata(results, tmdbApiKey, type);
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 2.6: IBRIDO POPOLARI (TMDB + Trakt fusi e deduplicati)
        // ==========================================
        if (baseId === 'yaca_hybrid_popular_movies' && type === 'movie' || baseId === 'yaca_hybrid_popular_series' && type === 'series') {
            const isMovie = type === 'movie';
            const tmdbEp = isMovie ? '/discover/movie' : '/discover/tv';
            const traktEp = isMovie ? 'popular_movies' : 'popular_shows';
            const contentType = isMovie ? 'movie' : 'series';

            let currentSkip = skip;
            let combinedResults = [];
            let depth = 0;
            const MAX_DEPTH = 3;

            while (combinedResults.length < 20 && depth < MAX_DEPTH) {
                const [tmdbResults, traktResults] = await Promise.all([
                    fetchTmdbCatalog(tmdbClient, tmdbEp, currentSkip, { sort_by: 'popularity.desc', 'vote_count.gte': 50 }, contentType, cacheOptions),
                    fetchTraktCatalog(traktEp, currentSkip, null, tmdbApiKey).catch(() => [])
                ]);
                const seen = new Set();
                let merged = [...tmdbResults, ...traktResults].filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });

                // Filtro "Hide Watched"
                merged = await filterWatchedItems(merged, userConfig);
                combinedResults.push(...merged);

                if (merged.length === 0 || !userConfig?.config?.hideWatched) break;
                currentSkip += 20;
                depth++;
            }
            results = combinedResults.slice(0, 40);
            enrichResultsWithDeepMetadata(results, tmdbApiKey, contentType);
            return { metas: results };
        }

        // ==========================================
        // SCENARIO 3: CATALOGHI TRAKT
        // ==========================================
        const traktUname = userConfig.apiKeys?.trakt;
        // Contesto per auto-refresh token Trakt (usato solo per endpoint autenticati)
        const refreshContext = (userConfig.apiKeys?.traktRefreshToken && hostUrl)
            ? { userConfig, hostUrl } : null;

        if (baseId.startsWith('trakt_')) {
            const traktTypeMap = {
                'trakt_watchlist_movies': 'watchlist_movies',
                'trakt_watchlist_series': 'watchlist_shows',
                'trakt_recommendations_movies': 'recommendations_movies',
                'trakt_recommendations_series': 'recommendations_shows',
                'trakt_history_movies': 'history_movies',
                'trakt_history_series': 'history_shows',
                'trakt_ratings_movies': 'ratings_movies',
                'trakt_ratings_series': 'ratings_shows',
                'trakt_trending_movies': 'trending_movies',
                'trakt_trending_series': 'trending_shows',
                'trakt_popular_movies': 'popular_movies',
                'trakt_popular_series': 'popular_shows'
            };

            const traktEp = traktTypeMap[baseId];
            if (traktEp) {
                const needsAuth = baseId.includes('watchlist') || baseId.includes('recommendations') || baseId.includes('history') || baseId.includes('ratings');
                const finalTraktUname = needsAuth ? traktUname : null;

                let currentSkip = skip;
                let combinedResults = [];
                let depth = 0;
                const MAX_DEPTH = 3;

                while (combinedResults.length < 20 && depth < MAX_DEPTH) {
                    let pageResults = await fetchTraktCatalog(traktEp, currentSkip, finalTraktUname, tmdbApiKey, refreshContext);
                    pageResults = await filterWatchedItems(pageResults, userConfig);
                    combinedResults.push(...pageResults);

                    if (pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
                    currentSkip += 20;
                    depth++;
                }

                results = combinedResults.slice(0, 40);
                if (!baseId.includes('ratings')) {
                    enrichResultsWithDeepMetadata(results, tmdbApiKey, type);
                }
                return { metas: results };
            }
        }
        if (baseId === 'trakt_favorites_movies' && type === 'movie') {
            results = await fetchTraktCatalog('favorites', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results.filter(r => r.type === 'movie') };
        }
        if (baseId === 'trakt_favorites_series' && type === 'series') {
            results = await fetchTraktCatalog('favorites', skip, traktUname, tmdbApiKey, refreshContext);
            return { metas: results.filter(r => r.type === 'series') };
        }

        // ==========================================
        // SCENARIO 4: CATALOGHI MDBLIST
        // ==========================================
        if (id.startsWith('mdblist_') || id.startsWith('yaca_preset_mdblist_')) {
            const listId = id.replace('yaca_preset_mdblist_', '').replace('mdblist_', '');
            const mdblistKey = userConfig.apiKeys?.mdblist || null;

            let currentSkip = skip;
            let combinedResults = [];
            let depth = 0;
            const MAX_DEPTH = 3;

            while (combinedResults.length < 20 && depth < MAX_DEPTH) {
                const page = Math.floor(currentSkip / 20) + 1;
                const items = await fetchMDBListItems(listId, mdblistKey, 'it', page);
                let pageResults = await parseMDBListItems(items, type, tmdbApiKey, 'it-IT');

                // Filtro "Hide Watched"
                pageResults = await filterWatchedItems(pageResults, userConfig);
                combinedResults.push(...pageResults);

                if (pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
                currentSkip += 20;
                depth++;
            }

            results = combinedResults.slice(0, 40);
            enrichResultsWithDeepMetadata(results, tmdbApiKey, type);
            return { metas: results };
        }

        if (catalogMeta || directFilters) {
            let filters = directFilters || catalogMeta.filters;

            if (filters) {
                // ==========================================
                // FASE 9.1: CATALOGHI FUSI (MERGED)
                // ==========================================
                if (catalogMeta.source === 'merged' || catalogMeta.sourceType === 'merged' || filters.merge) {
                    const mergeConfig = filters.merge || { catalogs: catalogMeta.mergedFrom || [] };
                    const sourceIds = mergeConfig.catalogs;
                    const strategy = mergeConfig.strategy || 'popularity'; // 'popularity' or 'mixed'

                    if (sourceIds && sourceIds.length >= 2) {
                        // Fetch sources (recursively calling catalogHandler for each source)
                        const fetchLimit = skip + 40;
                        const [resA, resB] = await Promise.all([
                            catalogHandler({ type, id: sourceIds[0], extra: { ...extra, skip: 0, limit: fetchLimit } }, userConfig, hostUrl),
                            catalogHandler({ type, id: sourceIds[1], extra: { ...extra, skip: 0, limit: fetchLimit } }, userConfig, hostUrl)
                        ]);

                        const listA = Array.isArray(resA?.metas) ? resA.metas : [];
                        const listB = Array.isArray(resB?.metas) ? resB.metas : [];

                        if (strategy === 'mixed') {
                            results = interleaveResults(listA, listB, skip, 20);
                        } else {
                            // Popularity: combine, deduplicate, and sort
                            const combined = [...listA, ...listB];
                            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
                            results = unique
                                .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                                .slice(skip, skip + 20);
                        }

                        return { metas: results };
                    }
                }

                // Crea una copia per evitare mutazioni sull'oggetto originale
                const finalFilters = { ...filters };
                if (!finalFilters.strategy) finalFilters.strategy = 'discovery';
                if (sortBy) finalFilters.sort_by = sortBy;

                results = await executeComplexStrategy(finalFilters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions);

                // ==========================================
                // FASE 10: HIDE WATCHED (WITH FILL)
                // ==========================================
                if (userConfig?.config?.hideWatched) {
                    let filtered = await filterWatchedItems(results, userConfig);
                    let currentSkip = skip + 20;
                    let depth = 0;
                    const MAX_DEPTH = 3;

                    while (filtered.length < 20 && depth < MAX_DEPTH) {
                        const nextPage = await executeComplexStrategy(finalFilters, tmdbClient, tmdbApiKey, type, currentSkip, activeProfileSettings, cacheOptions);
                        if (!nextPage || nextPage.length === 0) break;

                        const nextFiltered = await filterWatchedItems(nextPage, userConfig);
                        filtered.push(...nextFiltered);

                        currentSkip += 20;
                        depth++;
                    }
                    results = filtered;
                }

                const withGenres = Array.isArray(finalFilters.with_genres)
                    ? finalFilters.with_genres.map(String)
                    : String(finalFilters.with_genres ?? '').split(',');

                if ((!results || results.length === 0) && withGenres.includes('99') && finalFilters.with_keywords) {
                    const relaxedFilters = { ...finalFilters };
                    delete relaxedFilters.with_keywords;
                    results = await executeComplexStrategy(relaxedFilters, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions);
                }

                // Badge episodio
                if (EPISODE_CATALOG_IDS.has(baseId)) {
                    results = results.map(m => ({ ...m }));
                    applyEpisodeBadge(results, hostUrl);
                }

                // ==========================================
                // PERSONALIZZAZIONE FINALE (RANKING)
                // ==========================================
                if (profileDoc && results.length > 0) {
                    // Cerca pesi specifici del preset se presenti
                    let presetWeights = { tmdb: 1.0, trakt: 1.0 };
                    if (id.startsWith('yaca_preset_')) {
                        const presetId = id.replace('yaca_preset_', '');
                        const presetDef = presetsList.find(p => p.id === presetId);
                        if (presetDef && presetDef.weights) {
                            presetWeights = presetDef.weights;
                        }
                    }

                    for (const item of results) {
                        const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc);
                        item.affinity = affinity;

                        // Formula: (Voto TMDB * Peso TMDB) + (Affinity * Peso Trakt)
                        const tmdbScore = parseFloat(item.imdbRating || 0);
                        item.finalScore = (tmdbScore * presetWeights.tmdb) + (affinity * 10 * presetWeights.trakt);
                    }

                    // Ordina per score finale (solo se non è una lista ordinata esplicitamente dall'utente come "newest")
                    if (!sortBy || sortBy === 'popularity.desc') {
                        results.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
                    }
                }

                // Fase 9: Enrichment Progressivo in background (non blocca la risposta)
                enrichResultsWithDeepMetadata(results, tmdbApiKey, type);

                return { metas: results };
            }
        }

        return { metas: [] };

    } catch (err) {
        console.error("Errore Catalog Handler:", err.stack);
        return { metas: [] };
    }
}

module.exports = { catalogHandler, buildDiscoveryParams, interleaveResults };
