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

function hasItaKeywords(streams) {
    if (!Array.isArray(streams)) return false;
    const itaRegex = /\b(?:ITA|ITALIAN|IT|🇮🇹)\b/i;
    for (const s of streams) {
        const textToSearch = `${s.title || ''} ${s.name || ''} ${s.description || ''}`;
        if (itaRegex.test(textToSearch)) {
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
            let proxyId = id;
            if (id.startsWith('tmdb:')) {
                const parts = id.split(':');
                const tmdbId = parts[1];
                const imdbId = await resolveImdbId(tmdbId, type, userConfig?.apiKeys?.tmdb);
                console.log("Resolved imdbId for tmdbId", tmdbId, "is", imdbId);
                if (imdbId) {
                    if (parts.length > 2) {
                        proxyId = `${imdbId}:${parts.slice(2).join(':')}`;
                    } else {
                        proxyId = imdbId;
                    }
                }
            }

            const targetUrl = `${baseProxyUrl}/stream/${type}/${encodeURIComponent(proxyId)}.json`;
            console.log("Fetching targetUrl:", targetUrl);
            let fetchUrl = targetUrl;
            
            if (process.env.CF_WORKER_URL) {
                fetchUrl = `${process.env.CF_WORKER_URL}?url=${encodeURIComponent(targetUrl)}`;
            }

            console.log("Fetching actual URL:", fetchUrl);
            const response = await axios.get(fetchUrl, { timeout: 15000 });
            console.log("Response data keys:", Object.keys(response.data));
            const streams = response.data?.streams || [];
            
            const isIta = hasItaKeywords(streams);
            const baseId = getBaseId(id);

            // Upsert StreamBadge for long-term storage
            await StreamBadge.findOneAndUpdate(
                { stremioId: id },
                { baseId, stremioId: id, hasIta: isIta },
                { upsert: true, new: true }
            );

            return { streams };
        } catch (e) {
            console.error(`[StreamProxy] Error fetching streams for ${id}:`, e.message);
            return { streams: [] };
        }
    };

    try {
        const result = await proxyStreamCache.getOrFetch(cacheKey, fetchAndProcessStreams, 15 * 60 * 1000);
        return result || { streams: [] };
    } catch (e) {
        console.error(`[StreamProxy] Cache error for ${id}:`, e.message);
        return { streams: [] };
    }
}

module.exports = { streamHandler };
