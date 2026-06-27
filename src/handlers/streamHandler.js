const CacheManager = require('../cache/CacheManager');
const StreamBadge = require('../db/models/StreamBadge');
const { resolveImdbId } = require('../clients/tmdb');
const { hasItaLanguage } = require('../utils/languageParser');
const { createAxiosInstance } = require('../utils/httpClient');

// Proxy streams cache: 15 minutes TTL, 2 minutes SWR
const proxyStreamCache = new CacheManager('proxy_streams', {
    ramMax: 500,
    ramTtlMs: 15 * 60 * 1000, 
    mongoTtlMs: 15 * 60 * 1000, 
    swrMs: 2 * 60 * 1000 
});

const streamClient = createAxiosInstance('');


async function fetchStreams(targetUrl) {
    // Backend Stream Fetching (for badges): Always fetch directly.
    // The CF Worker is causing ECONNRESET from Hugging Face Spaces.
    // Since this is server-to-server and not returning streams to the user, direct fetch is safe.
    try {
        // console.log("[StreamProxy] Fetching directly (no CF proxy configured):", targetUrl);
        const response = await streamClient.get(targetUrl, { 
            timeout: 15000,
            headers: { 'Connection': 'close' }
        });
        return response.data?.streams || [];
    } catch (e) {
        console.error(`[StreamProxy] Direct fetch failed for ${targetUrl}:`, e.message);
        return null;
    }
}

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

// Local hasItaKeywords removed, using languageParser.js
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
    let baseProxyUrl = proxyUrl || '';
    if (baseProxyUrl.endsWith('/manifest.json')) {
        baseProxyUrl = baseProxyUrl.replace('/manifest.json', '');
    }

    const cacheKey = `proxy_${type}_${id}`;
    
    const fetchAndProcessStreams = async () => {
        try {
            let kitsuProxyId = null;
            let imdbProxyId = null;

            if (id.startsWith('tmdb:')) {
                const parts = id.split(':');
                const tmdbId = parts[1];
                const imdbId = await resolveImdbId(tmdbId, type, userConfig?.apiKeys?.tmdb);
                // console.log("Resolved imdbId for tmdbId", tmdbId, "is", imdbId);
                if (imdbId) {
                    if (parts.length > 2) {
                        imdbProxyId = `${imdbId}:${parts.slice(2).join(':')}`;
                    } else {
                        imdbProxyId = imdbId;
                    }
                }
            } else if (id.startsWith('kitsu:')) {
                const parts = id.split(':');
                const kitsuId = parts[1];
                const isMovieType = type === 'movie';
                const apiKey = userConfig?.apiKeys?.tmdb || userConfig?.settings?.tmdbKey || process.env.TMDB_API_KEY;
                
                if (parts.length === 4) {
                    kitsuProxyId = `kitsu:${parts[1]}:${parts[3]}`;
                } else {
                    kitsuProxyId = id;
                }

                try {
                    const { getTmdbIdFromKitsuId, fetchKitsuEpisodes } = require('../clients/kitsu');
                    const mapping = await getTmdbIdFromKitsuId(kitsuId);
                    if (mapping && mapping.tmdbId) {
                        const imdbId = await resolveImdbId(mapping.tmdbId, isMovieType ? 'movie' : 'tv', apiKey);
                        if (imdbId) {
                            if (isMovieType) {
                                imdbProxyId = imdbId;
                            } else {
                                const kitsuEps = await fetchKitsuEpisodes(kitsuId);
                                if (Array.isArray(kitsuEps)) {
                                    const currentEp = kitsuEps.find(e => e.id === id);
                                    if (currentEp && currentEp.tmdbSeason !== undefined && currentEp.tmdbEpisode !== undefined) {
                                        imdbProxyId = `${imdbId}:${currentEp.tmdbSeason}:${currentEp.tmdbEpisode}`;
                                    } else {
                                        const currentSeason = parts.length === 4 ? parseInt(parts[2], 10) : 1;
                                        const currentEpisode = parts.length === 4 ? parseInt(parts[3], 10) : (parts.length === 3 ? parseInt(parts[2], 10) : 1);
                                        imdbProxyId = `${imdbId}:${currentSeason}:${currentEpisode}`;
                                    }
                                }
                            }
                            // console.log(`[StreamProxy] Resolved IMDb ID ${imdbProxyId} for kitsu ID ${id}`);
                        }
                    }
                } catch (err) {
                    console.error(`[StreamProxy] Failed to translate kitsu ID ${id} to IMDb:`, err.message);
                }
            }

            // ==========================================
            // LOGICA IBRIDA: TORRENTIO (Primary) -> ICV (Fallback)
            // ==========================================
            const mainQueryId = imdbProxyId || id;
            const torrentioBaseUrl = process.env.TORRENTIO_URL || 'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,nekobt,ilcorsaronero|language=italian';
            let isIta = false;
            let streamsForParsing = [];

            // 1. Fetch Torrentio
            const torrentioPromises = [];
            if (kitsuProxyId) {
                torrentioPromises.push(fetchStreams(`${torrentioBaseUrl}/stream/${type}/${encodeURIComponent(kitsuProxyId)}.json`));
            }
            if (mainQueryId) {
                torrentioPromises.push(fetchStreams(`${torrentioBaseUrl}/stream/${type}/${encodeURIComponent(mainQueryId)}.json`));
            }
            
            const torrentioResults = await Promise.all(torrentioPromises);
            const torrentioStreams = torrentioResults.filter(r => r !== null).flat();
            
            // console.log(`[StreamProxy] Torrentio found ${torrentioStreams.length} streams for ${id}. Checking language...`);
            isIta = hasItaLanguage(torrentioStreams);

            // 2. Fetch ICV Fallback (only if proxyUrl is configured and Torrentio didn't find ITA)
            if (!isIta && baseProxyUrl) {
                // console.log(`[StreamProxy] ⚠️ Torrentio NON ha trovato ITA per ${id}. Attivazione Fallback su ICV...`);
                const icvPromises = [];
                if (kitsuProxyId) {
                    icvPromises.push(fetchStreams(`${baseProxyUrl}/stream/${type}/${encodeURIComponent(kitsuProxyId)}.json`));
                }
                if (mainQueryId) {
                    icvPromises.push(fetchStreams(`${baseProxyUrl}/stream/${type}/${encodeURIComponent(mainQueryId)}.json`));
                }
                
                const icvResults = await Promise.all(icvPromises);
                const icvStreams = icvResults.filter(r => r !== null).flat();
                
                // console.log(`[StreamProxy] ICV Fallback found ${icvStreams.length} streams for ${id}.`);
                if (hasItaLanguage(icvStreams)) {
                    isIta = true;
                    // console.log(`[StreamProxy] ICV Fallback successfully found ITA for ${id}!`);
                }
            } else if (isIta) {
                // console.log(`[StreamProxy] Torrentio successfully found ITA for ${id}! Skipping ICV.`);
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
                    const { getKitsuIdFromTmdbId, fetchKitsuEpisodes } = require('../clients/kitsu');
                    const kitsuId = await getKitsuIdFromTmdbId(tmdbId, type === 'series' ? 'series' : 'movie');
                    if (kitsuId) {
                        const kitsuEps = await fetchKitsuEpisodes(kitsuId);
                        if (Array.isArray(kitsuEps)) {
                            const parts = id.split(':');
                            const currentSeason = parts.length === 4 ? parseInt(parts[2], 10) : 1;
                            const currentEpisode = parts.length === 4 ? parseInt(parts[3], 10) : 1;
                            const matchedEp = kitsuEps.find(e => e.tmdbSeason === currentSeason && e.tmdbEpisode === currentEpisode);
                            if (matchedEp) {
                                badgeEntries.push({ stremioId: matchedEp.id, baseId: `kitsu:${kitsuId}` });
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[StreamBadge] Could not translate ${baseId} to Kitsu:`, e.message);
                }
            } else if (baseId.startsWith('kitsu:')) {
                try {
                    const { getTmdbIdFromKitsuId, fetchKitsuEpisodes } = require('../clients/kitsu');
                    const kitsuId = baseId.replace('kitsu:', '');
                    const mapping = await getTmdbIdFromKitsuId(kitsuId);
                    if (mapping && mapping.tmdbId) {
                        const tmdbBaseId = `tmdb:${mapping.tmdbId}`;
                        
                        // Resolve the exact TMDB season and episode from the mapped kitsu episodes
                        const kitsuEps = await fetchKitsuEpisodes(kitsuId);
                        if (Array.isArray(kitsuEps)) {
                            const currentEp = kitsuEps.find(e => e.id === id);
                            if (currentEp && currentEp.tmdbSeason && currentEp.tmdbEpisode) {
                                const tmdbStremioId = `${tmdbBaseId}:${currentEp.tmdbSeason}:${currentEp.tmdbEpisode}`;
                                badgeEntries.push({ stremioId: tmdbStremioId, baseId: tmdbBaseId });

                                // Also try to resolve IMDb ID for this TMDB ID and push it
                                try {
                                    const imdbId = await resolveImdbId(mapping.tmdbId, type, apiKey);
                                    if (imdbId) {
                                        const imdbStremioId = `${imdbId}:${currentEp.tmdbSeason}:${currentEp.tmdbEpisode}`;
                                        badgeEntries.push({ stremioId: imdbStremioId, baseId: imdbId });
                                    }
                                } catch (imdbErr) {
                                    // ignore
                                }
                            }
                        }
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

            // Return an empty array. YACA is now a metadata-only addon!
            // We just need the badge parsing side-effects above.
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
