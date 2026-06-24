const { createAxiosInstance } = require('../utils/httpClient');
const CacheManager = require('../cache/CacheManager');
const { createTmdbClient, prioritizeLocalizedImages, getTmdbAiredEpisodesCount } = require('./tmdb');
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
    
    while (queue.length > 0 && visited.size < 15) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        try {
            const relRes = await kitsuClient.get(`/anime/${currentId}/media-relationships`, {
                params: { include: 'destination' }
            });
            const relationships = relRes.data?.data || [];
            const included = relRes.data?.included || [];
            
            for (const rel of relationships) {
                const role = rel.attributes?.role;
                if (role !== 'sequel' && role !== 'prequel') continue;
                const destId = rel.relationships?.destination?.data?.id;
                if (!destId || rel.relationships?.destination?.data?.type !== 'anime' || visited.has(destId)) continue;
                const subtype = included.find(i => i.id === destId)?.attributes?.subtype;
                if (!subtype || subtype === 'TV' || subtype === 'ONA') queue.push(destId);
            }
        } catch (err) {}
    }
    
    return Array.from(visited);
}

/**
 * Traduce un ID AniList (o MAL) nel corrispondente ID Kitsu.
 */
async function getKitsuIdFromAnilist(anilistId, malId) {
    const cacheKey = `anilist_to_kitsu_${anilistId}`;
    const cached = await kitsuMappingCache.get(cacheKey);
    if (cached) return cached;

    let kitsuId = null;

    try {
        // Tentativo 1: tramite mapping anilist/anime
        const aRes = await kitsuClient.get(`/mappings`, {
            params: {
                'filter[externalSite]': 'anilist/anime',
                'filter[externalId]': anilistId
            }
        });
        if (aRes.data?.data?.length > 0) {
            const relUrl = aRes.data.data[0].relationships?.item?.links?.related;
            if (relUrl) {
                const relRes = await kitsuClient.get(relUrl.replace('https://kitsu.io/api/edge', ''));
                kitsuId = relRes.data?.data?.id;
            }
        }

        // Tentativo 2: tramite mapping myanimelist/anime se fornito
        if (!kitsuId && malId) {
            const mRes = await kitsuClient.get(`/mappings`, {
                params: {
                    'filter[externalSite]': 'myanimelist/anime',
                    'filter[externalId]': malId
                }
            });
            if (mRes.data?.data?.length > 0) {
                const relUrl = mRes.data.data[0].relationships?.item?.links?.related;
                if (relUrl) {
                    const relRes = await kitsuClient.get(relUrl.replace('https://kitsu.io/api/edge', ''));
                    kitsuId = relRes.data?.data?.id;
                }
            }
        }
        
        if (kitsuId) {
            await kitsuMappingCache.set(cacheKey, kitsuId);
        }
    } catch (e) {
        console.error(`Errore nel mapping anilist->kitsu per ${anilistId}:`, e.message);
    }

    return kitsuId;
}

/**
 * Recupera gli episodi da Kitsu per un dato anime (paginando se necessario oltre i primi 20).
 * Ritorna array mappato per standard meta.
 */
async function fetchKitsuEpisodes(kitsuId) {
    try {
        const cacheKey = `kitsu_eps_${kitsuId}`;
        const cached = await kitsuEpisodesCache.get(cacheKey);
        if (cached) return cached;

        let allData = [];
        const limit = 20;
        let totalEpisodes = 0;
        try {
            const animeRes = await kitsuClient.get(`/anime/${kitsuId}`);
            totalEpisodes = animeRes.data?.data?.attributes?.episodeCount || 0;
        } catch (e) {}

        if (totalEpisodes > 0) {
            const offsets = Array.from({ length: Math.ceil(totalEpisodes / limit) }, (_, i) => i * limit);
            const pages = await rateLimitedMap(offsets, async (offset) => {
                try {
                    const res = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
                        params: { 'page[limit]': limit, 'page[offset]': offset }
                    });
                    return res.data?.data || [];
                } catch (e) { return []; }
            }, { batchSize: 5, delayMs: 50 });
            pages.forEach(p => allData.push(...p));
        } else {
            let offset = 0;
            while (allData.length < 3000) {
                try {
                    const res = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
                        params: { 'page[limit]': limit, 'page[offset]': offset }
                    });
                    const eps = res.data?.data || [];
                    if (eps.length === 0) break;
                    allData.push(...eps);
                    offset += limit;
                } catch (e) { break; }
            }
        }

        const episodes = allData.map(ep => {
            const a = ep.attributes;
            return {
                id: `kitsu:${kitsuId}:${a.seasonNumber || 1}:${a.number}`,
                title: a.titles?.it || a.titles?.en || a.titles?.en_jp || `Episodio ${a.number}`,
                released: a.airdate ? new Date(a.airdate).toISOString() : null,
                season: a.seasonNumber || 1,
                episode: a.number,
                overview: a.synopsis || '',
                thumbnail: a.thumbnail ? a.thumbnail.original : null,
                _rawTitles: a.titles,
                _canonicalTitle: a.canonicalTitle
            };
        });

        if (episodes.length > 0) await kitsuEpisodesCache.set(cacheKey, episodes);
        return episodes;
    } catch (e) {
        console.error('Errore fetchKitsuEpisodes:', e.message);
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

                        if (results.length === 0) {
                            // Try original uncleaned title first (e.g. "Attack on Titan: The Final Season" instead of "Attack on Titan: The")
                            params.query = title;
                            if (year) {
                                delete params.primary_release_year;
                                delete params.first_air_date_year;
                            }
                            searchRes = await tmdbClient.get(endpoint, { params });
                            results = searchRes.data?.results || [];
                        }
                        
                        if (results.length === 0 && year) {
                            // Last resort: cleaned title without year
                            params.query = cleanTitle;
                            searchRes = await tmdbClient.get(endpoint, { params });
                            results = searchRes.data?.results || [];
                        }

                        if (results.length > 0) {
                            results.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
                            const tmdbId = results[0].id.toString();
                            const result = { tmdbId, type: type === 'movie' ? 'movie' : 'tv', inferredSeason: detectSeasonFromTitle(title) };
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
    const relations = await resolveAllSeasonsForKitsu(kitsuId);
    if (relations.length <= 1) return fetchKitsuEpisodes(kitsuId);

    const getBaseTvdb = async (id) => {
        try {
            const res = await kitsuClient.get(`/anime/${id}/mappings`);
            const tvdb = res.data?.data?.find(m => m.attributes.externalSite === 'thetvdb');
            if (tvdb) return tvdb.attributes.externalId.split('/')[0];
        } catch (e) {}
        return null;
    };

    const baseTvdb = await getBaseTvdb(kitsuId);
    const baseMapping = await getTmdbIdFromKitsuId(kitsuId);
    const baseTmdbId = baseMapping?.tmdbId;

    const branches = [];
    await Promise.all(relations.map(async (relId, idx) => {
        let isValid = false;
        
        if (baseTvdb) {
            const relTvdb = await getBaseTvdb(relId);
            if (relTvdb === baseTvdb) isValid = true;
        }
        
        const mapping = await getTmdbIdFromKitsuId(relId);
        if (!isValid && baseTmdbId && mapping?.tmdbId === baseTmdbId) {
            isValid = true;
        }

        if (!isValid) {
            try {
                const relRes = await kitsuClient.get(`/anime/${relId}`);
                const rTitle = (relRes.data?.data?.attributes?.canonicalTitle || '').toLowerCase();
                const baseRes = await kitsuClient.get(`/anime/${kitsuId}`);
                const bTitle = (baseRes.data?.data?.attributes?.canonicalTitle || '').toLowerCase();
                
                if (bTitle && rTitle.startsWith(bTitle)) {
                    const suffix = rTitle.substring(bTitle.length).replace(/^[^a-z0-9]+/, '').trim();
                    if (!suffix || /^(season|part|s\d|\d+|iii|ii|iv|v|final)/i.test(suffix)) {
                        isValid = true;
                    }
                }
            } catch (e) {}
        }

        if (!isValid && (baseTvdb || baseTmdbId)) {
            // Se abbiamo una base ma né tvdb né tmdb né il titolo combaciano, lo saltiamo
            return;
        }

        let seasonNum = mapping?.inferredSeason || 1;
        if (seasonNum === 999 && mapping?.tmdbId) {
            try {
                const tmdbKey = process.env.TMDB_API_KEY;
                if (tmdbKey) {
                    const tmdbRes = await createTmdbClient(tmdbKey).get(`/tv/${mapping.tmdbId}`);
                    seasonNum = tmdbRes.data?.number_of_seasons || 1;
                }
            } catch (e) {}
        }
        branches.push({ relId, seasonNum, order: idx });
    }));

    const groups = {};
    branches.forEach(b => (groups[b.seasonNum] ??= []).push(b));

    let allEpisodes = [];
    for (const [s, group] of Object.entries(groups)) {
        const seasonNum = parseInt(s, 10);
        group.sort((a, b) => a.order - b.order);
        let offset = 0;
        for (const branch of group) {
            const eps = (await fetchKitsuEpisodes(branch.relId)).sort((a, b) => a.episode - b.episode);
            for (const e of eps) {
                const ep = e.episode + offset;
                allEpisodes.push({
                    ...e, id: `kitsu:${kitsuId}:${seasonNum}:${ep}`,
                    season: seasonNum, episode: ep,
                    title: /^(Episode|Episodio)\s*\d+$/i.test(e.title) ? `Episodio ${ep}` : e.title
                });
            }
            offset += eps.length;
        }
    }

    allEpisodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    const seen = new Set();
    return allEpisodes.filter(e => seen.has(e.id) ? false : (seen.add(e.id), true));
}

async function getKitsuMetaDetails(rawId, type = 'series') {
    const kitsuId = String(rawId).replace('kitsu:', '').trim();
    if (!/^\d+$/.test(kitsuId)) return null;

    let attrs = null;
    try {
        const animeRes = await kitsuClient.get(`/anime/${kitsuId}`);
        attrs = animeRes.data?.data?.attributes;
    } catch (e) {}
    if (!attrs) return null;

    const mapping = await getTmdbIdFromKitsuId(kitsuId, type);

    let episodes = [];
    if (type !== 'movie') {
        try { episodes = await resolveAllSeasonsEpisodes(kitsuId); } catch (e) {}
        if (episodes.length === 0) try { episodes = await fetchKitsuEpisodes(kitsuId); } catch (e) {}
        
        if (episodes.length > 0) {
            let airedCount = 0;
            if (mapping?.tmdbId) {
                airedCount = await getTmdbAiredEpisodesCount(mapping.tmdbId);
            }

            episodes = episodes.filter(ep => {
                if (airedCount > 0) {
                    return ep.episode <= airedCount;
                } else {
                    // Fallback to dummy heuristic if we couldn't get TMDB aired count
                    const hasRealRawTitle = ep._rawTitles && Object.keys(ep._rawTitles).some(k => ep._rawTitles[k] && !/^(Episode|Episodio)\s*\d+$/i.test(ep._rawTitles[k]));
                    const isCanonicalDummy = !ep._canonicalTitle || /^(Episode|Episodio)\s*\d+$/i.test(ep._canonicalTitle);
                    const hasValidTitle = hasRealRawTitle || (!isCanonicalDummy);
                    return hasValidTitle || ep.released || ep.overview;
                }
            }).map(ep => {
                // Puliamo le props usate per l'euristica
                const cleanEp = { ...ep };
                delete cleanEp._rawTitles;
                delete cleanEp._canonicalTitle;
                return cleanEp;
            });
        }
    }

    let title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || `Kitsu ${kitsuId}`;
    let description = attrs.synopsis || '';
    let poster = attrs.posterImage?.original || null;
    let background = attrs.coverImage?.original || poster;

    if (mapping?.tmdbId) {
        try {
            const tmdbKey = process.env.TMDB_API_KEY;
            if (tmdbKey) {
                const tmdbRes = await createTmdbClient(tmdbKey).get(
                    mapping.type === 'movie' ? `/movie/${mapping.tmdbId}` : `/tv/${mapping.tmdbId}`,
                    { params: { language: 'it-IT', append_to_response: 'images' } }
                );
                const d = tmdbRes.data;
                if (d.overview) description = d.overview;
                const tmdbTitle = mapping.type === 'movie' ? d.title : d.name;
                if (tmdbTitle) title = tmdbTitle;
                const posters = prioritizeLocalizedImages(d.images?.posters || []);
                const backdrops = prioritizeLocalizedImages(d.images?.backdrops || []);
                if (backdrops.length > 0) background = `https://image.tmdb.org/t/p/original${backdrops[0].file_path}`;
                if (posters.length > 0) poster = `https://image.tmdb.org/t/p/w500${posters[0].file_path}`;
            }
        } catch (e) {}
    }

    const meta = {
        id: `kitsu:${kitsuId}`, type, name: title, genres: [],
        poster, background, description,
        releaseInfo: attrs.startDate ? attrs.startDate.substring(0, 4) : '',
        status: attrs.status === 'finished' ? 'ended' : 'returning series',
        runtime: attrs.episodeLength ? `${attrs.episodeLength} min` : null
    };
    if (episodes.length > 0) meta.videos = episodes;
    return meta;
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
    getKitsuIdFromAnilist,
    getKitsuMetaDetails,
    resolveAllSeasonsForKitsu,
    resolveAllSeasonsEpisodes,
    detectSeasonFromTitle
};
