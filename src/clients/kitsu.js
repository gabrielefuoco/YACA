const { createAxiosInstance } = require('../utils/httpClient');
const CacheManager = require('../cache/CacheManager');
const { createTmdbClient, prioritizeLocalizedImages } = require('./tmdb');
const { rateLimitedMap } = require('../utils/rateLimiter');

// Cache persistenti su DB
const kitsuMappingCache = new CacheManager('kitsu_mapping', { ramMax: 500, ramTtlMs: 3600000 * 24 * 7 });
const kitsuEpisodesCache = new CacheManager('kitsu_episodes', { ramMax: 50, ramTtlMs: 3600000 * 12 });

// Istanze di client HTTP configurate in utils/httpClient.js per caching trasparente e retry
const kitsuClient = createAxiosInstance('https://kitsu.io/api/edge', {
    headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
    }
});

/**
 * Normalizza il titolo per Kitsu (es. "Naruto Shippūden" -> "Naruto Shippuden")
 */
function normalizeTitleForKitsu(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/ō/g, 'o').replace(/ū/g, 'u').replace(/ā/g, 'a').replace(/ī/g, 'i').replace(/ē/g, 'e')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Controlla se una stringa è contenuta in un'altra ignorando la punteggiatura
 */
function isTitleMatch(searchTitle, targetTitle) {
    if (!searchTitle || !targetTitle) return false;
    const s = normalizeTitleForKitsu(searchTitle);
    const t = normalizeTitleForKitsu(targetTitle);
    return s === t || t.includes(s) || s.includes(t);
}

/**
 * Cerca un ID Kitsu dal titolo.
 */
async function getKitsuIdByTitle(title, year = null, expectedType = 'tv') {
    if (!title) return null;
    try {
        const cleanTitle = title.replace(/\s*\(.*\)\s*$/, '').trim();
        const res = await kitsuClient.get('/anime', {
            params: {
                'filter[text]': cleanTitle,
                'page[limit]': 5
            }
        });

        const animes = res.data?.data || [];
        if (animes.length === 0) return null;

        const bestMatch = animes.find(a => {
            const attrs = a.attributes;
            if (expectedType === 'movie' && attrs.subtype !== 'movie') return false;
            if (expectedType === 'tv' && attrs.subtype === 'movie') return false;
            
            if (year) {
                const animeYear = attrs.startDate ? attrs.startDate.substring(0, 4) : null;
                if (animeYear && Math.abs(parseInt(animeYear) - parseInt(year)) > 1) {
                    return false;
                }
            }
            
            const matchEn = isTitleMatch(cleanTitle, attrs.titles?.en);
            const matchRj = isTitleMatch(cleanTitle, attrs.titles?.en_jp);
            const matchJp = isTitleMatch(cleanTitle, attrs.titles?.ja_jp);
            const matchCanonical = isTitleMatch(cleanTitle, attrs.canonicalTitle);
            
            return matchEn || matchRj || matchJp || matchCanonical;
        });

        if (bestMatch) {
            return bestMatch.id;
        }
        
        return animes[0].id; // Fallback al primo risultato se l'anno/tipo non corrispondono perfettamente
    } catch (error) {
        console.error(`Errore ricerca Kitsu per titolo "${title}":`, error.message);
        return null;
    }
}

/**
 * Ricava tutti i Kitsu ID legati da prequels/sequels partendo da un ID di base.
 * @param {string} startKitsuId L'ID Kitsu di partenza
 * @returns {Promise<string[]>} Array di ID Kitsu correlati
 */
async function resolveAllSeasonsForKitsu(startKitsuId) {
    const visited = new Set();
    const queue = [startKitsuId];
    
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        try {
            // A direct query is better to avoid 404 on massive includes:
            const relRes = await kitsuClient.get(`/anime/${currentId}/media-relationships`, {
                params: { include: 'destination' }
            });
            
            const relationships = relRes.data?.data || [];
            
            for (const rel of relationships) {
                const role = rel.attributes?.role;
                if (role === 'sequel' || role === 'prequel') {
                    const destId = rel.relationships?.destination?.data?.id;
                    const destType = rel.relationships?.destination?.data?.type;
                    if (destId && destType === 'anime' && !visited.has(destId)) {
                        queue.push(destId);
                    }
                }
            }
        } catch (err) {
            console.error(`[Kitsu] Fallita estrazione relazioni per ${currentId}: ${err.message}`);
        }
    }
    
    return Array.from(visited);
}

/**
 * Recupera gli episodi da Kitsu per un dato anime (paginando se necessario oltre i primi 20).
 * Ritorna array mappato per standard meta.
 */
async function fetchKitsuEpisodes(kitsuId) {
    const cacheKey = `eps:${kitsuId}`;
    const { value: cached, status: cacheStatus } = await kitsuEpisodesCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    try {
        let allData = [];
        let limit = 20;
        
        let totalEpisodes = 0;
        try {
            const animeRes = await kitsuClient.get(`/anime/${kitsuId}`);
            totalEpisodes = animeRes.data?.data?.attributes?.episodeCount || 0;
        } catch (e) {}

        if (totalEpisodes > 0) {
            const totalPages = Math.ceil(totalEpisodes / limit);
            const offsets = Array.from({ length: totalPages }, (_, i) => i * limit);
            
            const fetchPage = async (offset) => {
                try {
                    const res = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
                        params: { 'page[limit]': limit, 'page[offset]': offset }
                    });
                    return res.data?.data || [];
                } catch (error) {
                    return [];
                }
            };

            const pagesData = await rateLimitedMap(offsets, fetchPage, { batchSize: 5, delayMs: 50 });
            pagesData.forEach(page => {
                allData.push(...page);
            });
        } else {
            let offset = 0;
            let hasMore = true;
            while (hasMore && allData.length < 3000) {
                try {
                    const res = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
                        params: { 'page[limit]': limit, 'page[offset]': offset }
                    });
                    const eps = res.data?.data || [];
                    if (eps.length === 0) {
                        hasMore = false;
                    } else {
                        allData.push(...eps);
                        offset += limit;
                    }
                } catch (error) {
                    hasMore = false;
                }
            }
        }

        const episodes = allData.map(ep => {
            const attrs = ep.attributes;
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

        // Enrich
        try {
            const mapping = await getTmdbIdFromKitsuId(kitsuId);
            if (mapping && mapping.tmdbId) {
                const tmdbKey = process.env.TMDB_API_KEY;
                if (tmdbKey) {
                    const { createTmdbClient, fetchTmdbEpisodes } = require('./tmdb');
                    const tmdbClient = createTmdbClient(tmdbKey);
                    
                    const endpoint = mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`;
                    const tmdbRes = await tmdbClient.get(endpoint);
                    const totalSeasons = tmdbRes.data?.number_of_seasons || 1;
                    
                    const tmdbEpisodes = await fetchTmdbEpisodes(tmdbClient, mapping.tmdbId, totalSeasons, null);
                    if (Array.isArray(tmdbEpisodes) && tmdbEpisodes.length > 0) {
                        const sortedTmdb = [...tmdbEpisodes].sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
                        const inferredSeason = mapping.inferredSeason || 1;
                        
                        const tmdbHasInferredSeason = sortedTmdb.some(t => t.season === inferredSeason);
                        let targetSeason = inferredSeason;
                        let episodeOffset = 0;
                        
                        if (!tmdbHasInferredSeason) {
                            if (inferredSeason === 999) {
                                const allSeasons = Array.from(new Set(sortedTmdb.map(t => t.season)));
                                targetSeason = Math.max(...allSeasons);
                            } else if (inferredSeason > 1) {
                                targetSeason = 1;
                                episodeOffset = (inferredSeason - 1) * 12;
                            }
                        }
                        
                        episodes.forEach(kitsuEp => {
                            let match = sortedTmdb.find(t => t.season === targetSeason && t.episode === (kitsuEp.episode + episodeOffset));
                            if (!match) {
                                const absIdx = kitsuEp.episode - 1;
                                if (absIdx >= 0 && absIdx < sortedTmdb.length) {
                                    match = sortedTmdb[absIdx];
                                }
                            }
                            if (!match && kitsuEp.season === 1) {
                                match = sortedTmdb.find(t => t.season === 1 && t.episode === kitsuEp.episode);
                            }

                            if (match) {
                                if (match.title && !match.title.startsWith('Episodio ')) kitsuEp.title = match.title;
                                if (match.overview) kitsuEp.overview = match.overview;
                                if (match.thumbnail) kitsuEp.thumbnail = match.thumbnail;
                                kitsuEp.tmdbSeason = match.season;
                                kitsuEp.tmdbEpisode = match.episode;
                            }
                        });
                    }
                }
            }
        } catch (tmdbErr) {
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

function detectSeasonFromTitle(title) {
    if (!title) return 1;
    const t = title.toLowerCase();
    
    // 1. Check for final season patterns first
    if (t.includes('final season') || t.includes('final chapter') || t.includes("l'ultima stagione") || t.includes('stagione finale') || t.includes('season finale')) {
        return 999;
    }

    // 2. Check explicit "season X"
    if (t.includes('season 5') || t.includes('5th season') || t.includes(' s5') || t.includes('fifth season') || t.includes(' 5th')) return 5;
    if (t.includes('season 4') || t.includes('4th season') || t.includes(' s4') || t.includes('fourth season') || t.includes(' 4th')) return 4;
    if (t.includes('season 3') || t.includes('3rd season') || t.includes(' s3') || t.includes('third season') || t.includes(' 3rd')) return 3;
    if (t.includes('season 2') || t.includes('2nd season') || t.includes(' s2') || t.includes('second season') || t.includes(' 2nd')) return 2;

    // 3. Fallback to parts
    if (t.includes('part 5') || t.includes('part v') || t.endsWith(' v') || t.includes(' v ')) return 5;
    if (t.includes('part 4') || t.includes('part iv') || t.endsWith(' iv') || t.includes(' iv ')) return 4;
    if (t.includes('part 3') || t.includes('part iii') || t.endsWith(' iii') || t.includes(' iii ')) return 3;
    if (t.includes('part 2') || t.includes('part ii') || t.endsWith(' ii') || t.includes(' ii ')) return 2;

    const match = title.match(/(?:season| s| s\.)\s*(\d+)/i);
    if (match) {
        const num = parseInt(match[1], 10);
        if (num > 0 && num <= 20) return num;
    }
    
    const partMatch = title.match(/(?:part)\s*(\d+)/i);
    if (partMatch) {
        const num = parseInt(partMatch[1], 10);
        if (num > 0 && num <= 20) return num;
    }
    
    return 1;
}

function cleanTitleForSearch(title) {
    if (!title) return '';
    let cleaned = title
        .replace(/(?:season|part| s| s\.)\s*\d+/gi, '')
        .replace(/\b(?:2nd|3rd|4th|5th|second|third|fourth|fifth)\s+season\b/gi, '')
        .replace(/\b(?:final\s+season|final\s+chapter|ultima\s+stagione|stagione\s+finale)\b/gi, '')
        .replace(/\b(?:i{2,3}|iv|v)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned;
}

async function getTmdbIdFromKitsuId(kitsuId, type = 'series') {
    const cacheKey = `kitsu_mapping:${kitsuId}`;
    const { value: cached, status: cacheStatus } = await kitsuMappingCache.getWithStatus(cacheKey);
    if (cacheStatus !== 'miss') return cached;

    let inferredSeason = 1;

    try {
        const animeRes = await kitsuClient.get(`/anime/${kitsuId}`);
        const attrs = animeRes.data?.data?.attributes;
        if (attrs) {
            const titlesToTry = [];
            let canonicalTitle = '';

            if (attrs.titles?.en) titlesToTry.push(attrs.titles.en);
            if (attrs.titles?.en_jp) titlesToTry.push(attrs.titles.en_jp);
            if (attrs.canonicalTitle) titlesToTry.push(attrs.canonicalTitle);
            
            canonicalTitle = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || '';
            inferredSeason = detectSeasonFromTitle(canonicalTitle);

            const mapRes = await kitsuClient.get(`/anime/${kitsuId}/mappings`);
            const mappings = mapRes.data?.data || [];

            const tmdbMapping = mappings.find(m => 
                m.attributes?.externalSite === 'themoviedb/tv' || 
                m.attributes?.externalSite === 'themoviedb/movie'
            );

            if (tmdbMapping) {
                const tmdbId = tmdbMapping.attributes.externalId;
                const mType = tmdbMapping.attributes.externalSite.includes('tv') ? 'tv' : 'movie';
                const result = { tmdbId, type: mType, inferredSeason };
                await kitsuMappingCache.set(cacheKey, result);
                return result;
            }

            if (type === 'series') {
                const tmdbKey = process.env.TMDB_API_KEY;
                if (tmdbKey) {
                    const tvdbMapping = mappings.find(m => 
                        m.attributes?.externalSite === 'thetvdb/series' || 
                        m.attributes?.externalSite === 'thetvdb'
                    );

                    if (tvdbMapping) {
                        const tvdbId = tvdbMapping.attributes.externalId;
                        const tmdbClient = createTmdbClient(tmdbKey);
                        const findRes = await tmdbClient.get(`/find/${tvdbId}`, {
                            params: { external_source: 'tvdb_id' }
                        });
                        
                        if (findRes.data?.tv_results?.length > 0) {
                            const tmdbId = findRes.data.tv_results[0].id.toString();
                            const result = { tmdbId, type: 'tv', inferredSeason };
                            await kitsuMappingCache.set(cacheKey, result);
                            return result;
                        }
                    }
                }
            }

            if (titlesToTry.length > 0) {
                const tmdbKey = process.env.TMDB_API_KEY;
                if (tmdbKey) {
                    const tmdbClient = createTmdbClient(tmdbKey);
                    const year = attrs.startDate ? attrs.startDate.substring(0, 4) : null;

                    for (let title of titlesToTry) {
                        const cleanTitle = cleanTitleForSearch(title);
                        if (!cleanTitle) continue;
                        const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
                        const params = { query: cleanTitle };
                        if (year) {
                            if (type === 'movie') params.primary_release_year = year;
                            else params.first_air_date_year = year;
                        }

                        let searchRes = await tmdbClient.get(endpoint, { params });
                        let results = searchRes.data?.results || [];

                        if (results.length === 0 && year) {
                            // Retry without year, because sequels on Kitsu have a different year than the main TV show on TMDB
                            delete params.primary_release_year;
                            delete params.first_air_date_year;
                            searchRes = await tmdbClient.get(endpoint, { params });
                            results = searchRes.data?.results || [];
                        }

                        if (results.length > 0) {
                            const tmdbId = results[0].id.toString();
                            const result = { tmdbId, type: type === 'movie' ? 'movie' : 'tv', inferredSeason };
                            await kitsuMappingCache.set(cacheKey, result);
                            return result;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(`Errore TMDB ID da Kitsu ${kitsuId}:`, e.message);
    }

    const fallbackResult = { tmdbId: null, type, inferredSeason };
    await kitsuMappingCache.set(cacheKey, fallbackResult);
    return fallbackResult;
}

async function resolveAllSeasonsEpisodes(kitsuId) {
    const relatedIds = await resolveAllSeasonsForKitsu(kitsuId);
    
    const fetchPromises = relatedIds.map(async (relId) => {
        const eps = await fetchKitsuEpisodes(relId);
        if (!eps || eps.length === 0) return [];
        
        let seasonNum = 1;
        try {
            const mapping = await getTmdbIdFromKitsuId(relId);
            if (mapping && mapping.inferredSeason) {
                seasonNum = mapping.inferredSeason;
            } else {
                const animeRes = await kitsuClient.get(`/anime/${relId}`);
                const attrs = animeRes.data?.data?.attributes;
                if (attrs) {
                    const title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || '';
                    seasonNum = detectSeasonFromTitle(title);
                }
            }
            if (seasonNum === 999 && mapping && mapping.tmdbId) {
                const tmdbKey = process.env.TMDB_API_KEY;
                if (tmdbKey) {
                    const { createTmdbClient } = require('./tmdb');
                    const tmdbClient = createTmdbClient(tmdbKey);
                    const endpoint = mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`;
                    const tmdbRes = await tmdbClient.get(endpoint);
                    seasonNum = tmdbRes.data?.number_of_seasons || 1;
                }
            }
        } catch (err) {}
        
        return eps.map(e => ({ ...e, season: seasonNum }));
    });
    
    const results = await Promise.all(fetchPromises);
    let allEpisodes = results.flat();
    
    const seenEpIds = new Set();
    allEpisodes = allEpisodes.filter(e => {
        if (seenEpIds.has(e.id)) return false;
        seenEpIds.add(e.id);
        return true;
    });

    allEpisodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    return allEpisodes;
}

async function getKitsuMetaDetails(kitsuId, type = 'series') {
    const mapping = await getTmdbIdFromKitsuId(kitsuId, type);
    
    let allEpisodes = [];
    if (type === 'series') {
        allEpisodes = await resolveAllSeasonsEpisodes(kitsuId);
    } else {
        allEpisodes = await fetchKitsuEpisodes(kitsuId);
    }
    
    try {
        const animeRes = await kitsuClient.get(`/anime/${kitsuId}`);
        const attrs = animeRes.data?.data?.attributes;
        if (!attrs) throw new Error("Anime not found on Kitsu");

        let background = attrs.coverImage ? attrs.coverImage.original : (attrs.posterImage ? attrs.posterImage.original : null);
        let poster = attrs.posterImage ? attrs.posterImage.original : null;
        let description = attrs.synopsis || '';
        let title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || `Kitsu ${kitsuId}`;

        if (mapping && mapping.tmdbId) {
            const tmdbKey = process.env.TMDB_API_KEY;
            if (tmdbKey) {
                const tmdbClient = createTmdbClient(tmdbKey);
                const endpoint = mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`;
                try {
                    const tmdbRes = await tmdbClient.get(endpoint, {
                        params: { language: 'it-IT', append_to_response: 'images' }
                    });
                    const tmdbData = tmdbRes.data;

                    if (tmdbData.overview) description = tmdbData.overview;
                    const tmdbTitle = mapping.type === 'movie' ? tmdbData.title : tmdbData.name;
                    if (tmdbTitle) title = tmdbTitle;

                    const images = prioritizeLocalizedImages(tmdbData.images);
                    if (images.backdrop) background = `https://image.tmdb.org/t/p/original${images.backdrop}`;
                    if (images.poster) poster = `https://image.tmdb.org/t/p/w500${images.poster}`;
                } catch (e) {
                    // Ignore TMDB error
                }
            }
        }

        const meta = {
            id: `kitsu:${kitsuId}`,
            type: type,
            name: title,
            genres: [],
            poster: poster,
            background: background,
            description: description,
            releaseInfo: attrs.startDate ? attrs.startDate.substring(0, 4) : '',
            status: attrs.status === 'finished' ? 'ended' : 'returning series',
            runtime: attrs.episodeLength ? `${attrs.episodeLength} min` : null
        };

        if (allEpisodes.length > 0) {
            meta.videos = allEpisodes;
        }

        return meta;
    } catch (e) {
        console.error(`Errore getKitsuMetaDetails(${kitsuId}):`, e.message);
        return null;
    }
}

/**
 * Fetch cataloghi Anime da Kitsu con Offset basato su skip.
 */
async function fetchKitsuCatalog(endpoint, skip = 0, customParams = {}) {
    try {
        const params = {
            'page[limit]': 20, // Kitsu Max is 20
            'page[offset]': skip,
            ...customParams
        };

        const res = await kitsuClient.get(endpoint, { params });

        let items = [];
        if (res.data && res.data.data) {
            items = res.data.data.map(kitsuItem => {
                const attrs = kitsuItem.attributes;
                if (!attrs) return null;
                const title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || '';
                const year = attrs.startDate ? attrs.startDate.split('-')[0] : '';
                return {
                    id: `kitsu:${kitsuItem.id}`,
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
            }).filter(i => i !== null);
        }

        return items;
    } catch (err) {
        console.error(`Errore Kitsu Catalog (${endpoint}):`, err.message);
        return [];
    }
}

module.exports = {
    fetchKitsuCatalog,
    fetchKitsuEpisodes,
    getTmdbIdFromKitsuId,
    getKitsuIdByTitle,
    getKitsuMetaDetails,
    resolveAllSeasonsForKitsu,
    resolveAllSeasonsEpisodes,
    detectSeasonFromTitle
};
