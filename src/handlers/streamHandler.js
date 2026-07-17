const axios = require('axios');
const CacheManager = require('../cache/CacheManager');
const StreamBadge = require('../db/models/StreamBadge');
const { resolveImdbId } = require('../clients/tmdb');

// Proxy streams cache: 15 minutes TTL, 2 minutes SWR
const proxyStreamCache = new CacheManager('proxy_streams', {
    ramMax: 500,
    ramTtlMs: 15 * 60 * 1000, 
    mongoTtlMs: 15 * 60 * 1000, 
    swrMs: 2 * 60 * 1000 
});

function getBaseId(stremioId) {
    const parts = stremioId.split(':');
    // If it's a typed ID like tmdb:12345 or kitsu:123
    if (parts[0] === 'tmdb' || parts[0] === 'kitsu' || parts[0] === 'anilist') {
        return `${parts[0]}:${parts[1]}`;
    }
    // For IMDb (tt12345) or others
    return parts[0];
}

function getAdditionalStremioId(originalId, additionalBaseId) {
    if (!additionalBaseId) return null;
    const parts = originalId.split(':');
    if (originalId.startsWith('tt')) {
        // IMDb style: [imdbId, season, episode]
        return [additionalBaseId, ...parts.slice(1)].join(':');
    } else if (originalId.startsWith('tmdb:')) {
        // TMDB style: [tmdb, tmdbId, season, episode]
        return [additionalBaseId, ...parts.slice(2)].join(':');
    } else if (originalId.startsWith('kitsu:')) {
        // Kitsu style: [kitsu, kitsuId, season, episode] OR [kitsu, kitsuId, absoluteEpisode]
        if (parts.length === 4) {
            return [additionalBaseId, parts[2], parts[3]].join(':');
        } else if (parts.length === 3) {
            return [additionalBaseId, '1', parts[2]].join(':');
        }
    }
    return null;
}

function hasItaKeywords(streams) {
    if (!Array.isArray(streams)) return false;
    
    // Rimuove sezioni esplicitamente dedicate ai sottotitoli per evitare falsi positivi
    const subFilters = [
        /\[[^\]]*?subs?[^\]]*?\]/gi,                       // [Subs: Eng, Ita] o [Multi-Subs]
        /\([^)]*?subs?[^)]*?\)/gi,                         // (Subs: Eng, Ita) o (Multi-Subs)
        /\b(?:SUB\s*ITA|ITA\s*SUB)\b/gi,                    // SUB ITA, ITA SUB
        /\b(?:SUBTITLES?|SUBS?)[\s\-_]*(?:ITA|ITALIANO?)\b/gi, // Subtitles Ita, Sub-Ita
        /\b(?:ITA|ITALIANO?)[\s\-_]*(?:SUBTITLES?|SUBS?)\b/gi  // Ita-Subs, Italian-Sub
    ];

    const itaRegex = /(?:\b(?:ITA|ITALIAN|ITALIANO)\b|🇮🇹)/i;

    for (const s of streams) {
        // Prendi solo la prima riga del titolo (il nome del file originale del torrent)
        // per evitare le bandierine proxy-iniettate nelle righe successive
        const titleFirstLine = (s.title || '').split('\n')[0];
        
        let text = `${titleFirstLine} ${s.name || ''} ${s.description || ''}`;
        
        // Applica i filtri per rimuovere i sottotitoli prima di cercare la traccia audio
        for (const regex of subFilters) {
            text = text.replace(regex, '');
        }
        
        if (itaRegex.test(text)) {
            return true;
        }
    }
    return false;
}

/**
 * Gestisce la logica di stream per Stremio.
 * Funziona sia da Proxy Aggregator che da Profile Switcher.
 */
async function streamHandler(args, userConfig, hostUrl, configVersion = '') {
    const { id, type } = args;

    if (id.startsWith('yaca-profile-')) {
        const profileId = id.replace('yaca-profile-', '');
        const streamUrl = `${hostUrl}/api/users/${userConfig.userId}/switch-profile/${profileId}`;
        return {
            streams: [
                {
                    title: `\nAttiva questo profilo\nSync in background`,
                    url: streamUrl,
                    behaviorHints: { notWebReady: false }
                }
            ]
        };
    }

    // Proxy Stream Logic
    const proxyUrl = process.env.PROXY_ADDON_URL;
    if (!proxyUrl) {
        return { streams: [] };
    }
    
    let baseProxyUrl = proxyUrl;
    if (baseProxyUrl.endsWith('/manifest.json')) {
        baseProxyUrl = baseProxyUrl.replace('/manifest.json', '');
    }

    const cacheKey = `proxy_${type}_${id}`;
    
    const fetchAndProcessStreams = async () => {
        try {
            let kitsuProxyId = null;
            let imdbProxyId = null;

            const animeMappingStore = require('../data/animeMappingStore');

            if (id.startsWith('tmdb:')) {
                const parts = id.split(':');
                const tmdbId = parts[1];
                const imdbId = await resolveImdbId(tmdbId, type, userConfig?.apiKeys?.tmdb);
                if (imdbId) {
                    if (parts.length > 2) {
                        imdbProxyId = `${imdbId}:${parts.slice(2).join(':')}`;
                    } else {
                        imdbProxyId = imdbId;
                    }
                } else {
                    console.warn(`[StreamProxy] Fallimento: Impossibile risolvere IMDb ID per TMDB ID ${tmdbId}`);
                }
            } else if (id.startsWith('kitsu:')) {
                const parts = id.split(':');
                const kitsuId = parts[1];
                const apiKey = userConfig?.apiKeys?.tmdb || userConfig?.settings?.tmdbKey || process.env.TMDB_API_KEY;
                
                // Torrentio expects kitsu:1234:5 for anime episodes
                if (parts.length === 4) {
                    kitsuProxyId = `kitsu:${parts[1]}:${parts[3]}`; // [kitsu, id, absEpisode]
                } else {
                    kitsuProxyId = id;
                }

                try {
                    const tmdbId = animeMappingStore.resolveTmdbFromKitsu(kitsuId);
                    if (tmdbId) {
                        const imdbId = await resolveImdbId(tmdbId, type === 'movie' ? 'movie' : 'tv', apiKey);
                        if (imdbId) {
                            if (type === 'movie') {
                                imdbProxyId = imdbId;
                            } else {
                                // Backward compatibility: dual query on IMDb if we can derive the season/episode
                                const currentSeason = parts.length === 4 ? parseInt(parts[2], 10) : 1;
                                const currentEpisode = parts.length === 4 ? parseInt(parts[3], 10) : (parts.length === 3 ? parseInt(parts[2], 10) : 1);
                                imdbProxyId = `${imdbId}:${currentSeason}:${currentEpisode}`;
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[StreamProxy] Failed to translate kitsu ID ${id} to IMDb using animeMappingStore:`, err.message);
                }
            }

            const http = require('http');
            const https = require('https');
            
            const torrentioBaseUrl = process.env.TORRENTIO_URL || 'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex|language=italian';
            const fetchStreams = async (url) => {
                const fetchUrl = process.env.CF_WORKER_URL ? `${process.env.CF_WORKER_URL}?url=${encodeURIComponent(url)}` : url;
                try {
                    const r = await axios.get(fetchUrl, { 
                        timeout: 15000,
                        httpAgent: new http.Agent({ family: 4 }),
                        httpsAgent: new https.Agent({ family: 4 })
                    });
                    return r.data?.streams || [];
                } catch (e) {
                    return [];
                }
            };

            const mainQueryId = imdbProxyId || (!kitsuProxyId ? id : null);
            const torrentioPromises = [];
            
            if (kitsuProxyId) {
                torrentioPromises.push(fetchStreams(`${torrentioBaseUrl}/stream/${type}/${encodeURIComponent(kitsuProxyId)}.json`));
            }
            if (mainQueryId) {
                torrentioPromises.push(fetchStreams(`${torrentioBaseUrl}/stream/${type}/${encodeURIComponent(mainQueryId)}.json`));
            }
            
            const torrentioResults = await Promise.all(torrentioPromises);
            const torrentioStreams = torrentioResults.flat();
            
            let isIta = hasItaKeywords(torrentioStreams);

            // 2. Fetch ICV Fallback
            if (!isIta && baseProxyUrl) {
                const icvPromises = [];
                if (kitsuProxyId) {
                    icvPromises.push(fetchStreams(`${baseProxyUrl}/stream/${type}/${encodeURIComponent(kitsuProxyId)}.json`));
                }
                if (mainQueryId) {
                    icvPromises.push(fetchStreams(`${baseProxyUrl}/stream/${type}/${encodeURIComponent(mainQueryId)}.json`));
                }
                
                const icvResults = await Promise.all(icvPromises);
                const icvStreams = icvResults.flat();
                
                if (hasItaKeywords(icvStreams)) {
                    isIta = true;
                }
            }
            const baseId = getBaseId(id);

            const apiKey = userConfig?.apiKeys?.tmdb || userConfig?.settings?.tmdbKey || process.env.TMDB_API_KEY;
            const badgeEntries = [
                { stremioId: id, baseId: baseId }
            ];

            if (baseId.startsWith('tt')) {
                try {
                    const { translateImdbToTmdb } = require('../id_mapping/id_cache');
                    if (apiKey) {
                        const tmdbRes = await translateImdbToTmdb(baseId, apiKey);
                        if (tmdbRes && tmdbRes.id) {
                            const additionalBaseId = tmdbRes.id.startsWith('tmdb:') ? tmdbRes.id : `tmdb:${tmdbRes.id}`;
                            const additionalStremioId = getAdditionalStremioId(id, additionalBaseId);
                            if (additionalStremioId) {
                                badgeEntries.push({ stremioId: additionalStremioId, baseId: additionalBaseId });
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[StreamBadge] Could not translate ${baseId} to TMDB:`, e.message);
                }
            } else if (baseId.startsWith('tmdb:')) {
                const tmdbId = baseId.replace('tmdb:', '');
                // 1. Translate to IMDb
                try {
                    const { resolveImdbId } = require('../clients/tmdb');
                    if (apiKey) {
                        const imdbId = await resolveImdbId(tmdbId, type, apiKey);
                        if (imdbId) {
                            const additionalStremioId = getAdditionalStremioId(id, imdbId);
                            if (additionalStremioId) {
                                badgeEntries.push({ stremioId: additionalStremioId, baseId: imdbId });
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[StreamBadge] Could not translate ${baseId} to IMDB:`, e.message);
                }
                // 2. Translate to Kitsu (if it's an anime series)
                try {
                    const parts = id.split(':');
                    const animeMappingStore = require('../data/animeMappingStore');
                    
                    if (type === 'series' && parts.length > 2) {
                        const currentSeason = parts[2];
                        const currentEpisode = parts[3];
                        const kitsuRes = animeMappingStore.resolveKitsu(tmdbId, currentSeason, currentEpisode);
                        if (kitsuRes.success) {
                            badgeEntries.push({ stremioId: `kitsu:${kitsuRes.kitsuId}:${kitsuRes.kitsuEpisode}`, baseId: `kitsu:${kitsuRes.kitsuId}` });
                        } else {
                            const { tvdbBridgeFallback } = require('../utils/tvdbBridgeFallback');
                            const fallbackRes = await tvdbBridgeFallback(tmdbId, currentSeason, currentEpisode, apiKey);
                            if (fallbackRes && fallbackRes.success) {
                                badgeEntries.push({ stremioId: `kitsu:${fallbackRes.kitsuId}:${fallbackRes.kitsuEpisode}`, baseId: `kitsu:${fallbackRes.kitsuId}` });
                            }
                        }
                    } else if (type === 'movie') {
                        const kitsuMovieId = animeMappingStore.resolveKitsuMovie(tmdbId);
                        if (kitsuMovieId) {
                            badgeEntries.push({ stremioId: `kitsu:${kitsuMovieId}`, baseId: `kitsu:${kitsuMovieId}` });
                        }
                    }
                } catch (e) {
                    console.error(`[StreamBadge] Could not translate ${baseId} to Kitsu:`, e.message);
                }
            } else if (baseId.startsWith('kitsu:')) {
                try {
                    const animeMappingStore = require('../data/animeMappingStore');
                    const kitsuId = baseId.replace('kitsu:', '');
                    const tmdbId = animeMappingStore.resolveTmdbFromKitsu(kitsuId);
                    
                    if (tmdbId) {
                        const tmdbBaseId = `tmdb:${tmdbId}`;
                        badgeEntries.push({ stremioId: id, baseId: tmdbBaseId });
                        
                        try {
                            const imdbId = await resolveImdbId(tmdbId, type === 'movie' ? 'movie' : 'tv', apiKey);
                            if (imdbId) {
                                badgeEntries.push({ stremioId: id, baseId: imdbId });
                            }
                        } catch (imdbErr) {}
                    }
                } catch (e) {
                    console.error(`[StreamBadge] Could not translate ${baseId} to TMDB/IMDB:`, e.message);
                }
            }

            for (const entry of badgeEntries) {
                // Upsert StreamBadge based on unique stremioId
                await StreamBadge.findOneAndUpdate(
                    { stremioId: entry.stremioId },
                    { stremioId: entry.stremioId, baseId: entry.baseId, hasIta: isIta },
                    { upsert: true, returnDocument: 'after' }
                );
            }

            return { streams: [] };
        } catch (e) {
            console.error(`[StreamProxy] Error fetching streams for ${id}:`, e.message);
            throw e;
        }
    };

    const result = await proxyStreamCache.getOrFetch(cacheKey, fetchAndProcessStreams, 15 * 60 * 1000);
    return result || { streams: [] };
}

module.exports = { streamHandler };
