const { createAxiosInstance } = require('../utils/httpClient');
const { KITSU_ENDPOINT, ITEMS_PER_PAGE } = require('../config');
const CacheManager = require('../cache/CacheManager');
const { createTmdbClient, prioritizeLocalizedImages } = require('./tmdb');

// Crea l'istanza client qui
const kitsuClient = createAxiosInstance(KITSU_ENDPOINT || 'https://kitsu.io/api/edge');


// Cache per Kitsu
const kitsuMetaCache = new CacheManager('kitsu_meta', { ramMax: 50, ramTtlMs: 3600000 });
const kitsuMappingCache = new CacheManager('kitsu_mapping', { ramMax: 50, ramTtlMs: 3600000 * 24 }); // 24 ore per il mapping
const kitsuEpisodesCache = new CacheManager('kitsu_episodes', { ramMax: 50, ramTtlMs: 3600000 * 12 });
const kitsuTmdbBasicCache = new CacheManager('kitsu_tmdb_basic', { ramMax: 200, ramTtlMs: 3600000 * 24 });

/**
 * Arricchisce un item Kitsu con dati TMDB (titolo localizzato e poster migliori)
 */
async function enrichWithTmdb(item, kitsuId) {
    if (!item) return;
    try {
        const mapping = await getTmdbIdFromKitsuId(kitsuId);
        if (!mapping) return;

        item.tmdbId = mapping.tmdbId; // Salviamo l'ID TMDB per ERDB

        const cacheKey = `${mapping.type}:${mapping.tmdbId}`;
        const { value: cached, status } = await kitsuTmdbBasicCache.getWithStatus(cacheKey);

        let tmdbData = cached;
        if (status === 'miss') {
            const tmdbKey = process.env.TMDB_API_KEY;
            if (!tmdbKey) return;
            const tmdbClient = createTmdbClient(tmdbKey);
            const endpoint = mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`;
            try {
                const tmdbRes = await tmdbClient.get(endpoint, {
                    params: {
                        language: 'it-IT',
                        append_to_response: 'images',
                        include_image_language: 'it,en,null'
                    }
                });
                tmdbData = tmdbRes.data;
                if (tmdbData) {
                    await kitsuTmdbBasicCache.set(cacheKey, tmdbData);
                }
            } catch (e) {
                // Ignore silent failure
            }
        }

        if (tmdbData) {
            const title = tmdbData.title || tmdbData.name;
            if (title) {
                if (mapping.type === 'tv' && mapping.inferredSeason > 1) {
                    item.name = `${title} - Stagione ${mapping.inferredSeason}`;
                } else {
                    item.name = title;
                }
            }

            let bestPoster = tmdbData.poster_path;
            if (tmdbData.images && Array.isArray(tmdbData.images.posters)) {
                const localizedPosters = prioritizeLocalizedImages(tmdbData.images.posters);
                if (localizedPosters.length > 0) bestPoster = localizedPosters[0].file_path;
            }
            if (bestPoster) item.poster = `https://image.tmdb.org/t/p/w500${bestPoster}`;

            let bestBg = tmdbData.backdrop_path;
            if (tmdbData.images && Array.isArray(tmdbData.images.backdrops)) {
                const localizedBgs = prioritizeLocalizedImages(tmdbData.images.backdrops);
                if (localizedBgs.length > 0) bestBg = localizedBgs[0].file_path;
            }
            if (bestBg) item.background = `https://image.tmdb.org/t/p/w1280${bestBg}`;

            if (tmdbData.overview && tmdbData.overview.trim().length > 0) {
                item.description = tmdbData.overview;
            }
        }
    } catch (e) {
        // Fallback silently to Kitsu data
    }
}

/**
 * Trasforma il risultato raw di Kitsu nel formato Stremio Meta Preview.
 */
function toStremioMetaItem(kitsuItem) {
    if (!kitsuItem || !kitsuItem.attributes) return null;

    const attrs = kitsuItem.attributes;
    const id = `kitsu:${kitsuItem.id}`;

    // Kitsu fornisce vari titoli (en, en_jp, ja_jp, it). Scegliamo user-friendly con priorità italiano.
    const title = attrs.titles?.it || attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || 'Titolo sconosciuto';
    const year = attrs.startDate ? attrs.startDate.split('-')[0] : '';

    return {
        id,
        type: attrs.subtype === 'movie' ? 'movie' : 'series',
        name: title,
        poster: attrs.posterImage ? attrs.posterImage.original : null,
        background: attrs.coverImage ? attrs.coverImage.original : null,
        posterShape: 'poster',
        description: attrs.synopsis,
        releaseInfo: year,
        imdbRating: attrs.averageRating ? (parseFloat(attrs.averageRating) / 10).toFixed(1) : null,
        _kitsu_subtype: attrs.subtype
    };
}

/**
 * Fetch cataloghi Anime da Kitsu con Offset basato su skip.
 * Kitsu supporta direttamente l'offset, a differenza delle pagine di TMDB.
 */
async function fetchKitsuCatalog(endpoint, skip = 0, customParams = {}) {
    try {
        const params = {
            'page[limit]': ITEMS_PER_PAGE, // Kitsu Max is 20
            'page[offset]': skip,
            ...customParams
        };

        const res = await kitsuClient.get(endpoint, { params });

        let items = [];
        if (res.data && res.data.data) {
            items = res.data.data.map(toStremioMetaItem).filter(i => i !== null);
            
            // Arricchimento asincrono per tutti i risultati del catalogo
            await Promise.allSettled(items.map(item => {
                const kitsuId = item.id.replace('kitsu:', '');
                return enrichWithTmdb(item, kitsuId);
            }));
        }

        return items;
    } catch (err) {
        console.error(`Errore Kitsu Catalog (${endpoint}):`, err.message);
        return [];
    }
}

/**
 * Recupera l'elenco degli episodi per un Anime e li formatta per Stremio
 */
async function fetchKitsuEpisodes(kitsuId) {
    const cacheKey = `eps:${kitsuId}`;
    const { value: cached, status: cacheStatus } = await kitsuEpisodesCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        const firstRes = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
            params: { 'page[limit]': 20, 'page[offset]': 0 }
        });

        if (!firstRes.data || !firstRes.data.data) return [];

        let allData = [...firstRes.data.data];
        const totalCount = firstRes.data.meta?.count || 0;

        if (totalCount > 20) {
            const promises = [];
            // Cap to reasonable max to avoid abusing API (e.g. 1000 episodes)
            const maxOffsets = Math.min(totalCount, 1000);
            for (let offset = 20; offset < maxOffsets; offset += 20) {
                promises.push(
                    kitsuClient.get(`/anime/${kitsuId}/episodes`, {
                        params: { 'page[limit]': 20, 'page[offset]': offset }
                    }).then(r => r.data?.data || []).catch(e => {
                        console.error(`Errore offset ${offset} episodi Kitsu ${kitsuId}:`, e.message);
                        return [];
                    })
                );
            }
            const results = await Promise.all(promises);
            for (const resData of results) {
                allData = allData.concat(resData);
            }
        }

        const episodes = allData.map(ep => {
            const attrs = ep.attributes;
            // Kitsu often lists episodes with a seasonNumber or we can infer it if strictly mapped
            // However, for Stremio, we need to decide if we keep absolute or split.
            // By default, Kitsu returns absolute numbers. We keep them but allow future season mapping.
            const season = attrs.seasonNumber || 1; 
            
            return {
                id: `kitsu:${kitsuId}:${season}:${attrs.number}`,
                title: attrs.titles?.it || attrs.titles?.en || attrs.titles?.en_jp || `Episodio ${attrs.number}`,
                released: attrs.airdate ? new Date(attrs.airdate).toISOString() : null,
                season: season,
                episode: attrs.number,
                overview: attrs.synopsis || '',
                thumbnail: attrs.thumbnail ? attrs.thumbnail.original : null
            };
        });

        // Enrich Kitsu episodes with TMDB Italian titles and overviews if available
        try {
            const mapping = await getTmdbIdFromKitsuId(kitsuId);
            if (mapping && mapping.tmdbId) {
                const tmdbKey = process.env.TMDB_API_KEY;
                if (tmdbKey) {
                    const { createTmdbClient, fetchTmdbEpisodes } = require('./tmdb');
                    const tmdbClient = createTmdbClient(tmdbKey);
                    
                    // Fetch TMDB series info to get number of seasons
                    const endpoint = mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`;
                    const tmdbRes = await tmdbClient.get(endpoint);
                    const totalSeasons = tmdbRes.data?.number_of_seasons || 1;
                    
                    const tmdbEpisodes = await fetchTmdbEpisodes(tmdbClient, mapping.tmdbId, totalSeasons, null);
                    if (Array.isArray(tmdbEpisodes) && tmdbEpisodes.length > 0) {
                        const sortedTmdb = [...tmdbEpisodes].sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
                        const inferredSeason = mapping.inferredSeason || 1;
                        
                        // Check if TMDB has the inferredSeason
                        const tmdbHasInferredSeason = sortedTmdb.some(t => t.season === inferredSeason);
                        
                        let targetSeason = inferredSeason;
                        let episodeOffset = 0;
                        
                        if (!tmdbHasInferredSeason && inferredSeason > 1) {
                            // If TMDB does not have the inferred season, it means seasons are likely combined under Season 1
                            targetSeason = 1;
                            // Assume standard 12 episodes per season for anime
                            episodeOffset = (inferredSeason - 1) * 12;
                        }
                        
                        episodes.forEach(kitsuEp => {
                            // 1. Try matching by target season and episode number (with offset)
                            let match = sortedTmdb.find(t => t.season === targetSeason && t.episode === (kitsuEp.episode + episodeOffset));
                            
                            // 2. Try matching by absolute index
                            if (!match) {
                                const absIdx = kitsuEp.episode - 1; // 0-indexed absolute number
                                if (absIdx >= 0 && absIdx < sortedTmdb.length) {
                                    match = sortedTmdb[absIdx];
                                }
                            }
                            
                            // 3. Try matching by episode number in season 1
                            if (!match && kitsuEp.season === 1) {
                                match = sortedTmdb.find(t => t.season === 1 && t.episode === kitsuEp.episode);
                            }

                            if (match) {
                                if (match.title && !match.title.startsWith('Episodio ')) {
                                    kitsuEp.title = match.title;
                                }
                                if (match.overview) {
                                    kitsuEp.overview = match.overview;
                                }
                                if (match.thumbnail) {
                                    kitsuEp.thumbnail = match.thumbnail;
                                }
                                kitsuEp.tmdbSeason = match.season;
                                kitsuEp.tmdbEpisode = match.episode;
                            }
                        });
                    }
                }
            }
        } catch (tmdbErr) {
            console.error(`[Kitsu TMDB Enrichment] Failed for Kitsu ${kitsuId}:`, tmdbErr.message);
        }

        if (episodes.length > 0) {
            await kitsuEpisodesCache.set(cacheKey, episodes);
        }
        return episodes;
    } catch (e) {
        console.error("Errore fetchKitsuEpisodes:", e.message);
        return [];
    }
}

/**
 * Fetch Meta completo (utile per MetaHandler di Stremio)
 */
async function getKitsuMetaDetails(id) {
    const kitsuId = id.replace('kitsu:', '').trim();

    if (!/^\d+$/.test(kitsuId)) {
        console.error(`ID Kitsu non valido: ${kitsuId}`);
        return null;
    }

    const { value: cached, status: cacheStatus } = await kitsuMetaCache.getWithStatus(kitsuId);
    if (cacheStatus !== 'miss') return cached;

    try {
        const res = await kitsuClient.get(`/anime/${kitsuId}`);
        const item = res.data.data;
        const meta = toStremioMetaItem(item);

        if (meta && item.attributes) {
            // Arricchimento TMDB
            await enrichWithTmdb(meta, kitsuId);

            meta.genres = [];
            if (item.attributes.youtubeVideoId) {
                meta.trailers = [{ source: item.attributes.youtubeVideoId, type: 'Trailer' }];
            }
            if (item.attributes.subtype !== 'movie') {
                meta.videos = await resolveAllSeasonsEpisodes(kitsuId);
                meta.type = 'series';

                // Se sono state risolte più stagioni, usa il titolo base di TMDB per rappresentare la serie unificata
                const seasons = new Set(meta.videos.map(v => v.season));
                if (seasons.size > 1) {
                    const mapping = await getTmdbIdFromKitsuId(kitsuId);
                    if (mapping && mapping.tmdbId) {
                        const cacheKey = `${mapping.type}:${mapping.tmdbId}`;
                        const cachedTmdb = await kitsuTmdbBasicCache.get(cacheKey);
                        if (cachedTmdb) {
                            const baseTitle = cachedTmdb.title || cachedTmdb.name;
                            if (baseTitle) {
                                meta.name = baseTitle;
                            }
                        }
                    }
                }
            }
            await kitsuMetaCache.set(kitsuId, meta);
        }
        return meta;
    } catch (err) {
        console.error("Errore Kitsu Meta:", err.message);
        return null;
    }
}

/**
 * Risolve un ID Kitsu partendo da un ID TMDB usando l'endpoint mappings.
 */
async function getKitsuIdFromTmdbId(tmdbId, type = 'series') {
    const cacheKey = `tmdb_mapping:${tmdbId}`;
    const { value: cached, status: cacheStatus } = await kitsuMappingCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        const site = type === 'movie' ? 'themoviedb/movie' : 'themoviedb/tv';
        const res = await kitsuClient.get('/mappings', {
            params: {
                'filter[externalSite]': site,
                'filter[externalId]': tmdbId
            }
        });

        const kitsuId = res.data?.data?.[0]?.relationships?.item?.data?.id;
        if (kitsuId) {
            await kitsuMappingCache.set(cacheKey, kitsuId);
            return kitsuId;
        }
    } catch (e) {
        console.error(`Errore mapping Kitsu per TMDB ${tmdbId}:`, e.message);
    }
    return null;
}

function detectSeasonFromTitle(title) {
    if (!title) return 1;
    const t = title.toLowerCase();
    
    // Check specific season/part patterns
    if (t.includes('season 2') || t.includes('2nd season') || t.includes(' s2') || t.includes('second season') || t.includes('part 2') || t.includes('part ii') || t.endsWith(' ii') || t.includes(' ii ') || t.includes(' 2nd')) {
        return 2;
    }
    if (t.includes('season 3') || t.includes('3rd season') || t.includes(' s3') || t.includes('third season') || t.includes('part 3') || t.includes('part iii') || t.endsWith(' iii') || t.includes(' iii ') || t.includes(' 3rd')) {
        return 3;
    }
    if (t.includes('season 4') || t.includes('4th season') || t.includes(' s4') || t.includes('fourth season') || t.includes('part 4') || t.includes('part iv') || t.endsWith(' iv') || t.includes(' iv ') || t.includes(' 4th')) {
        return 4;
    }
    if (t.includes('season 5') || t.includes('5th season') || t.includes(' s5') || t.includes('fifth season') || t.includes('part 5') || t.includes('part v') || t.endsWith(' v') || t.includes(' v ') || t.includes(' 5th')) {
        return 5;
    }
    
    const match = title.match(/(?:season|part| s| s\.)\s*(\d+)/i);
    if (match) {
        const num = parseInt(match[1], 10);
        if (num > 0 && num <= 20) return num;
    }
    
    return 1;
}

function cleanTitleForSearch(title) {
    if (!title) return '';
    let cleaned = title
        .replace(/(?:season|part| s| s\.)\s*\d+/i, '')
        .replace(/\b(?:2nd|3rd|4th|5th|second|third|fourth|fifth)\s+season\b/i, '')
        .replace(/\b(?:i{2,3}|iv|v)\b/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned;
}

/**
 * Risolve un ID TMDB partendo da un ID Kitsu usando l'endpoint mappings.
 */
async function getTmdbIdFromKitsuId(kitsuId) {
    const cacheKey = `kitsu_mapping:${kitsuId}`;
    const { value: cached, status: cacheStatus } = await kitsuMappingCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        // Fetch Kitsu anime details first to detect inferredSeason and get fallback search titles
        let canonicalTitle = '';
        let titlesToTry = [];
        let isMovie = false;
        let inferredSeason = 1;

        try {
            const animeRes = await kitsuClient.get(`/anime/${kitsuId}`);
            const attrs = animeRes.data?.data?.attributes;
            if (attrs) {
                if (attrs.titles?.en) titlesToTry.push(attrs.titles.en);
                if (attrs.titles?.en_jp) titlesToTry.push(attrs.titles.en_jp);
                if (attrs.canonicalTitle) titlesToTry.push(attrs.canonicalTitle);
                
                canonicalTitle = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || '';
                inferredSeason = detectSeasonFromTitle(canonicalTitle);
                isMovie = attrs.subtype === 'movie';
            }
        } catch (animeErr) {
            console.error(`Errore dettagli anime per Kitsu ${kitsuId}:`, animeErr.message);
        }

        // Fetch mappings specific to this anime
        const res = await kitsuClient.get(`/anime/${kitsuId}/mappings`);
        const mappings = res.data?.data || [];

        // Search for themoviedb mappings
        const tmdbMapping = mappings.find(m => 
            m.attributes?.externalSite === 'themoviedb/tv' || 
            m.attributes?.externalSite === 'themoviedb/movie'
        );

        if (tmdbMapping) {
            const tmdbId = tmdbMapping.attributes.externalId;
            const type = tmdbMapping.attributes.externalSite.includes('tv') ? 'tv' : 'movie';
            const result = { tmdbId, type, inferredSeason };
            await kitsuMappingCache.set(cacheKey, result);
            return result;
        }

        // Fallback to thetvdb mappings and translate via TMDB /find
        const tvdbMapping = mappings.find(m => 
            m.attributes?.externalSite === 'thetvdb/series' || 
            m.attributes?.externalSite === 'thetvdb'
        );

        if (tvdbMapping) {
            let tvdbId = tvdbMapping.attributes.externalId;
            if (tvdbId && typeof tvdbId === 'string' && tvdbId.includes('/')) {
                tvdbId = tvdbId.split('/')[0];
            }

            const tmdbKey = process.env.TMDB_API_KEY;
            if (tmdbKey && tvdbId) {
                const { createTmdbClient } = require('./tmdb');
                const tmdbClient = createTmdbClient(tmdbKey);
                const findRes = await tmdbClient.get(`/find/${tvdbId}`, {
                    params: { external_source: 'tvdb_id' }
                });
                
                const data = findRes.data;
                let tmdbId = null;
                let type = 'tv';
                
                if (data.tv_results?.length > 0) {
                    tmdbId = data.tv_results[0].id.toString();
                    type = 'tv';
                } else if (data.movie_results?.length > 0) {
                    tmdbId = data.movie_results[0].id.toString();
                    type = 'movie';
                }

                if (tmdbId) {
                    const result = { tmdbId, type, inferredSeason };
                    await kitsuMappingCache.set(cacheKey, result);
                    return result;
                }
            }
        }

        // Fallback to searching TMDB by title (using canonicalTitle or english title cleaned)
        const cleanedTitles = Array.from(new Set(titlesToTry.map(cleanTitleForSearch))).filter(t => t.length > 0);
        const tmdbKey = process.env.TMDB_API_KEY;
        if (tmdbKey && cleanedTitles.length > 0) {
            const { createTmdbClient } = require('./tmdb');
            const tmdbClient = createTmdbClient(tmdbKey);
            const searchType = isMovie ? 'movie' : 'tv';
            
            let tmdbId = null;
            for (const title of cleanedTitles) {
                try {
                    const searchRes = await tmdbClient.get(`/search/${searchType}`, {
                        params: { query: title }
                    });
                    const results = searchRes.data?.results || [];
                    if (results.length > 0) {
                        // Sort by popularity descending to prioritize active/main entries over duplicate stubs or spin-offs
                        results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
                        tmdbId = results[0].id.toString();
                        break;
                    }
                } catch (searchErr) {
                    console.error(`Errore ricerca TMDB per titolo "${title}":`, searchErr.message);
                }
            }
            
            if (tmdbId) {
                const result = { tmdbId, type: searchType, inferredSeason };
                await kitsuMappingCache.set(cacheKey, result);
                return result;
            }
        }
    } catch (e) {
        console.error(`Errore mapping TMDB per Kitsu ${kitsuId}:`, e.message);
    }
    return null;
}

/**
 * Risolve tutti gli ID Kitsu collegati (stagioni/sequel/prequel) per un dato kitsuId.
 * Usa sia la cache di MongoDB (corrispondenza TMDB ID) sia l'API `/media-relationships` di Kitsu ricorsivamente.
 */
async function resolveAllSeasonsForKitsu(kitsuId) {
    const visited = new Set();
    const queue = [kitsuId];
    
    // 1. Cerca il mapping TMDB per il kitsuId di partenza per interrogare il DB
    let tmdbId = null;
    try {
        const mapping = await getTmdbIdFromKitsuId(kitsuId);
        if (mapping && mapping.tmdbId) {
            tmdbId = mapping.tmdbId;
        }
    } catch (e) {
        console.error(`[resolveAllSeasons] Errore nel recuperare TMDB ID per ${kitsuId}:`, e.message);
    }

    // 2. Se abbiamo un TMDB ID, interroga MongoDB per trovare altri mapping associati
    if (tmdbId) {
        try {
            const CacheEntry = require('../models/CacheEntry');
            const cachedMappings = await CacheEntry.find({
                namespace: 'kitsu_mapping',
                'value.tmdbId': tmdbId
            });
            for (const entry of cachedMappings) {
                // key è formato da 'kitsu_mapping:12345'
                const match = entry.key.match(/^kitsu_mapping:(\d+)$/);
                if (match) {
                    const foundId = match[1];
                    if (!visited.has(foundId)) {
                        queue.push(foundId);
                    }
                }
            }
        } catch (dbErr) {
            console.error(`[resolveAllSeasons] Errore lookup MongoDB:`, dbErr.message);
        }
    }

    // 3. Attraversa le relazioni ricorsivamente (BFS)
    const allIds = new Set();
    let steps = 0;
    const maxSteps = 15; // limite di sicurezza per prevenire troppe richieste API

    while (queue.length > 0 && steps < maxSteps) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        allIds.add(currentId);
        steps++;

        try {
            const relUrl = `/anime/${currentId}/media-relationships`;
            const relRes = await kitsuClient.get(relUrl, {
                params: { include: 'destination' }
            });
            
            const data = relRes.data?.data || [];

            for (const rel of data) {
                const role = rel.attributes?.role;
                // Ci interessano solo i sequel e i prequel per le stagioni
                if (role === 'sequel' || role === 'prequel') {
                    const destData = rel.relationships?.destination?.data;
                    if (destData && destData.type === 'anime' && destData.id) {
                        if (!visited.has(destData.id)) {
                            queue.push(destData.id);
                        }
                    }
                }
            }
        } catch (apiErr) {
            console.error(`[resolveAllSeasons] Errore Kitsu relationships API per ${currentId}:`, apiErr.message);
        }
    }

    return Array.from(allIds);
}

/**
 * Recupera e raggruppa gli episodi di tutti gli ID Kitsu collegati nelle rispettive stagioni.
 */
async function resolveAllSeasonsEpisodes(kitsuId) {
    const relatedIds = await resolveAllSeasonsForKitsu(kitsuId);
    console.log(`[resolveAllSeasonsEpisodes] ID Kitsu correlati per ${kitsuId}:`, relatedIds);
    
    let allEpisodes = [];
    
    for (const relId of relatedIds) {
        // Recupera gli episodi per questo ID Kitsu
        const eps = await fetchKitsuEpisodes(relId);
        if (!eps || eps.length === 0) continue;
        
        // Determina il numero di stagione per Stremio
        let seasonNum = 1;
        try {
            const mapping = await getTmdbIdFromKitsuId(relId);
            if (mapping && mapping.inferredSeason) {
                seasonNum = mapping.inferredSeason;
            } else {
                // Tenta di rilevarlo dai dettagli anime di Kitsu
                const animeRes = await kitsuClient.get(`/anime/${relId}`);
                const attrs = animeRes.data?.data?.attributes;
                if (attrs) {
                    const title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || '';
                    seasonNum = detectSeasonFromTitle(title);
                }
            }
        } catch (err) {
            console.error(`[resolveAllSeasonsEpisodes] Errore risoluzione stagione per ID Kitsu ${relId}:`, err.message);
        }
        
        // Mappa gli oggetti episodio
        const mappedEps = eps.map(e => ({
            ...e,
            season: seasonNum
        }));
        
        allEpisodes = allEpisodes.concat(mappedEps);
    }
    
    // De-duplica per ID per sicurezza
    const seenEpIds = new Set();
    allEpisodes = allEpisodes.filter(e => {
        if (seenEpIds.has(e.id)) return false;
        seenEpIds.add(e.id);
        return true;
    });

    // Ordina gli episodi per stagione e numero di episodio
    allEpisodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    
    return allEpisodes;
}

module.exports = {
    fetchKitsuCatalog,
    getKitsuMetaDetails,
    getKitsuIdFromTmdbId,
    getTmdbIdFromKitsuId,
    fetchKitsuEpisodes,
    resolveAllSeasonsForKitsu,
    resolveAllSeasonsEpisodes
};
