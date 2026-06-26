const CacheManager = require('../cache/CacheManager');
const StreamBadge = require('../db/models/StreamBadge');
const { resolveImdbId } = require('../clients/tmdb');
const { createAxiosInstance } = require('../utils/httpClient');

// Proxy streams cache: 15 minutes TTL, 2 minutes SWR
const proxyStreamCache = new CacheManager('proxy_streams', {
    ramMax: 500,
    ramTtlMs: 15 * 60 * 1000, 
    mongoTtlMs: 15 * 60 * 1000, 
    swrMs: 2 * 60 * 1000 
});

// Circuit breaker per il CF Worker: evita di perdere tempo se *.workers.dev è irraggiungibile
const workerCircuit = {
    failures: 0,
    lastFailure: 0,
    THRESHOLD: 3,       // Dopo 3 fallimenti consecutivi, apri il circuito
    COOLDOWN_MS: 5 * 60 * 1000,  // Riprova dopo 5 minuti
    isOpen() {
        if (this.failures < this.THRESHOLD) return false;
        // Se il cooldown è passato, permetti un tentativo di test
        if (Date.now() - this.lastFailure > this.COOLDOWN_MS) {
            this.failures = 0; // Reset per tentare di nuovo
            return false;
        }
        return true;
    },
    recordSuccess() { this.failures = 0; },
    recordFailure() { this.failures++; this.lastFailure = Date.now(); }
};

const WORKER_HEADERS = {
    'Connection': 'close',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const streamClient = createAxiosInstance('');

async function fetchViaWorker(workerUrl, targetUrl, timeoutMs = 20000) {
    const response = await streamClient.get(workerUrl, {
        timeout: timeoutMs,
        headers: { ...WORKER_HEADERS, 'X-Target-Url': targetUrl }
    });
    return response.data?.streams || [];
}

async function fetchStreams(targetUrl) {
    if (process.env.CF_WORKER_URL) {
        const workerUrl = process.env.CF_WORKER_URL.replace(/\/$/, '');

        // Circuit breaker: se il worker è irraggiungibile, salta subito al fallback
        if (workerCircuit.isOpen()) {
            console.log(`[StreamProxy] ⚡ Circuit breaker OPEN — skipping CF Worker, fallback su fetch diretto per ${targetUrl}`);
        } else {
            // Retry: fino a 2 tentativi (utile su connessioni HF instabili verso *.workers.dev)
            const MAX_RETRIES = 2;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[StreamProxy] Fetching via CF Worker (attempt ${attempt}/${MAX_RETRIES}): ${workerUrl} for ${targetUrl}`);
                    const streams = await fetchViaWorker(workerUrl, targetUrl);
                    workerCircuit.recordSuccess();
                    return streams;
                } catch (e) {
                    const isLastAttempt = attempt === MAX_RETRIES;
                    const causeMsg = e.cause ? ` | Cause: ${e.cause.code || e.cause.message || e.cause}` : '';
                    console.error(`[StreamProxy] CF Worker attempt ${attempt}/${MAX_RETRIES} failed: ${e.message}${causeMsg}`);
                    if (!isLastAttempt) {
                        await new Promise(r => setTimeout(r, 1000)); // Aspetta 1s prima del retry
                    }
                }
            }

            // Tutti i retry falliti: registra nel circuit breaker
            workerCircuit.recordFailure();
            console.warn(`[StreamProxy] ⚠️ CF Worker irraggiungibile dopo ${MAX_RETRIES} tentativi. Circuit failures: ${workerCircuit.failures}/${workerCircuit.THRESHOLD}. Fallback su fetch diretto.`);
        }
    }

    // Direct fetch (fallback automatico se il worker non è configurato o è bloccato dal firewall)
    try {
        console.log("[StreamProxy] Fetching directly:", targetUrl);
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

            if (id.startsWith('tmdb:')) {
                const parts = id.split(':');
                const tmdbId = parts[1];
                const imdbId = await resolveImdbId(tmdbId, type, userConfig?.apiKeys?.tmdb);
                console.log("Resolved imdbId for tmdbId", tmdbId, "is", imdbId);
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
                            console.log(`[StreamProxy] Resolved IMDb ID ${imdbProxyId} for kitsu ID ${id}`);
                        }
                    }
                } catch (err) {
                    console.error(`[StreamProxy] Failed to translate kitsu ID ${id} to IMDb:`, err.message);
                }
            }

            const fetchPromises = [];
            
            if (kitsuProxyId) {
                const kitsuUrl = `${baseProxyUrl}/stream/${type}/${encodeURIComponent(kitsuProxyId)}.json`;
                fetchPromises.push(fetchStreams(kitsuUrl));
            }

            const mainQueryId = imdbProxyId || (!kitsuProxyId ? id : null);
            if (mainQueryId) {
                const mainUrl = `${baseProxyUrl}/stream/${type}/${encodeURIComponent(mainQueryId)}.json`;
                fetchPromises.push(fetchStreams(mainUrl));
            }

            const results = await Promise.all(fetchPromises);
            
            // Se tutte le fetch sono fallite per errori di rete, lancia eccezione per non farle cacciare
            if (fetchPromises.length > 0 && results.every(r => r === null)) {
                throw new Error("All stream fetches failed due to network or upstream errors.");
            }

            const mergedStreams = results.filter(r => r !== null).flat();

            // De-duplicate streams
            const streams = [];
            const seen = new Set();
            for (const s of mergedStreams) {
                if (!s) continue;
                const key = s.infoHash || s.url || s.externalUrl || JSON.stringify(s);
                if (!seen.has(key)) {
                    seen.add(key);
                    streams.push(s);
                }
            }
            console.log(`[StreamProxy] Combined and de-duplicated to ${streams.length} total streams.`);
            
            const isIta = hasItaKeywords(streams);
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

            return { streams };
        } catch (e) {
            console.error(`[StreamProxy] Error fetching streams for ${id}:`, e.message);
            throw e;
        }
    };

    const result = await proxyStreamCache.getOrFetch(cacheKey, fetchAndProcessStreams, 15 * 60 * 1000);
    return result || { streams: [] };
}

module.exports = { streamHandler };
