const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient } = require('../clients/tmdb');
const { getKitsuMetaDetails, getKitsuIdFromTmdbId, fetchKitsuEpisodes } = require('../clients/kitsu');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const { fetchMdblistRatings } = require('../utils/mdblist');
const CacheManager = require('../cache/CacheManager');

// Cache per l'oggetto meta finale combinato (TMDB + MDBList)
const finalMetaCache = new CacheManager('final_meta_cache', { ramMax: 2000, ramTtlMs: 3600000, swrMs: 600000 });

function normalizeAnimeEpisodes(seriesId, episodes) {
    if (!seriesId || !Array.isArray(episodes)) return [];

    return episodes
        .map((episode, index) => {
            const season = Number(episode?.season) > 0 ? Number(episode.season) : 1;
            const episodeNumber = Number(episode?.episode) > 0 ? Number(episode.episode) : index + 1;

            // Preserve existing ID if it looks like a full Stremio ID (contains at least 2 colons)
            const hasFullId = episode.id && (episode.id.match(/:/g) || []).length >= 2;

            return {
                ...episode,
                id: hasFullId ? episode.id : `${seriesId}:${season}:${episodeNumber}`,
                season,
                episode: episodeNumber
            };
        })
        .sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
}

/**
 * Gestisce la richiesta di metadati dettagliati quando l'utente clicca su un titolo
 */
async function metaHandler(args, userConfig) {
    try {
        const { type, id } = args;

        if (!userConfig) throw new Error("Configurazione utente mancante");

        const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");
        let meta = null;

        // Caso 0: Profilo interno YACA
        if (id.startsWith('yaca-profile-')) {
            const profileId = id.replace('yaca-profile-', '');
            let profileName = 'Profilo Sconosciuto';
            let isActive = false;

            if (userConfig.profiles) {
                const profileObj = userConfig.profiles.find(p => p.id === profileId);
                if (profileObj) {
                    profileName = profileObj.name;
                    isActive = profileObj.id === userConfig.activeProfileId;
                }
            }

            meta = {
                id: id,
                type: type || 'other',
                name: isActive ? `✅ ${profileName} (Attivo)` : profileName,
                poster: `https://ui-avatars.com/api/?name=${encodeURIComponent(profileName)}&background=random&color=fff&size=512`,
                background: `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop`,
                description: isActive
                    ? `Questo è il profilo attualmente attivo.\n\nNon è necessario fare nulla.`
                    : `⚠️ PREMI RIPRODUCI PER ATTIVARE QUESTO PROFILO ⚠️\n\n1. Premi il tasto Riproduci/Play.\n2. Attendi la fine del breve video (2 secondi).\n3. Ritorna alla schermata precedente.\nI cataloghi si aggiorneranno automaticamente in background con le preferenze del profilo "${profileName}".`,
                releaseInfo: 'YACA System',
                runtime: '0 min'
            };
            return { meta };
        }

        // Caso 1: È un ID di Kitsu (Anime)
        else if (id.startsWith('kitsu:')) {
            meta = await getKitsuMetaDetails(id);
        }

        // Parallel Fetch: TMDB + MDBList
        if (id.startsWith('tmdb:') || id.startsWith('tt')) {
            const tmdbIdResult = id.startsWith('tmdb:') ? { id: id.replace('tmdb:', '') } : await translateImdbToTmdb(id, tmdbApiKey);
            const tmdbId = tmdbIdResult?.id;
            const imdbIdForRatings = id.startsWith('tt') ? id : (tmdbIdResult?.imdb_id || null);

            if (tmdbId) {
                const mdblistApiKey = userConfig.apiKeys?.mdblist || process.env.MDBLIST_API_KEY || null;
                const cacheKey = `meta_${tmdbId}_${type}_${imdbIdForRatings}_${Boolean(mdblistApiKey)}`;

                // Use getWithStatus for SWR support
                let { value: cachedMeta, status: cacheStatus } = await finalMetaCache.getWithStatus(cacheKey);

                // Se a causa del vecchio bug abbiamo cachato una serie con 0 episodi, invalidiamo la cache forzatamente
                if (cacheStatus !== 'miss' && type === 'series' && (!cachedMeta.videos || cachedMeta.videos.length === 0)) {
                    console.log(`[Cache Invalidation] Trovata serie ${id} in cache con 0 episodi, forzo ricaricamento...`);
                    cacheStatus = 'miss';
                    cachedMeta = null;
                }

                if (cacheStatus === 'fresh') {
                    meta = cachedMeta;
                } else {
                    // If stale, return cached data and trigger background revalidation
                    if (cacheStatus === 'stale' && cachedMeta) {
                        meta = cachedMeta;
                        // Fire-and-forget background revalidation
                        (async () => {
                            try {
                                const bgRatings = imdbIdForRatings ? await fetchMdblistRatings(imdbIdForRatings, mdblistApiKey).catch(() => ({})) : {};
                                const bgMeta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, bgRatings || {});
                                if (bgMeta) {
                                    // Anime series: fetch Kitsu episodes (TMDB episodes were skipped)
                                    if (bgMeta._isAnime && type === 'series') {
                                        let kitsuEpisodesResolved = false;
                                        const kitsuId = await getKitsuIdFromTmdbId(tmdbId, 'series');
                                        if (kitsuId) {
                                            const kitsuEpisodes = await fetchKitsuEpisodes(kitsuId);
                                            if (kitsuEpisodes && kitsuEpisodes.length > 0) {
                                                bgMeta.videos = normalizeAnimeEpisodes(bgMeta.id, kitsuEpisodes);
                                                kitsuEpisodesResolved = true;
                                            }
                                        }

                                        // Fallback to TMDB episodes if Kitsu mapping failed or no episodes found
                                        if (!kitsuEpisodesResolved && bgMeta._numberOfSeasons) {
                                            console.log(`[HybridAnime] Fallback: Carico episodi TMDB in background per Anime ${tmdbId} (Kitsu fallito)`);
                                            const tmdbClient = createTmdbClient(tmdbApiKey);
                                            bgMeta.videos = await fetchTmdbEpisodes(
                                                tmdbClient,
                                                tmdbId,
                                                bgMeta._numberOfSeasons,
                                                bgMeta.id.startsWith('tt') ? bgMeta.id : null,
                                                bgMeta._originalLanguage || null
                                            );
                                        }
                                    }
                                    // Aggiornamento silente scoring cache (voti freschi)
                                    updateScoringCache(Number(tmdbId), type === 'series' ? 'tv' : type, bgMeta).catch(() => { });
                                    delete bgMeta._keywordNames;
                                    delete bgMeta._isAnime;
                                    delete bgMeta._numberOfSeasons;
                                    delete bgMeta._originalLanguage;
                                    await finalMetaCache.set(cacheKey, bgMeta);
                                }
                            } catch (_e) { /* silent background revalidation */ }
                        })();
                    } else {
                        // Cache miss: fetch ratings first, then TMDB meta with ratings in one call
                        const ratings = imdbIdForRatings
                            ? await fetchMdblistRatings(imdbIdForRatings, mdblistApiKey).catch(() => ({}))
                            : {};

                        meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, ratings || {});
                        if (meta) {
                            // Anime series: fetch Kitsu episodes (TMDB episodes were skipped)
                            if (meta._isAnime && type === 'series') {
                                let kitsuEpisodesResolved = false;
                                const kitsuId = await getKitsuIdFromTmdbId(tmdbId, 'series');
                                if (kitsuId) {
                                    console.log(`[HybridAnime] Trovato mapping Kitsu ${kitsuId} per TMDB ${tmdbId}. Carico episodi...`);
                                    const kitsuEpisodes = await fetchKitsuEpisodes(kitsuId);
                                    if (kitsuEpisodes && kitsuEpisodes.length > 0) {
                                        meta.videos = normalizeAnimeEpisodes(meta.id, kitsuEpisodes);
                                        kitsuEpisodesResolved = true;
                                    }
                                }

                                // Fallback to TMDB episodes if Kitsu mapping failed or no episodes found
                                if (!kitsuEpisodesResolved && meta._numberOfSeasons) {
                                    console.log(`[HybridAnime] Fallback: Carico episodi TMDB per Anime ${tmdbId} (Kitsu mapping fallito)`);
                                    const tmdbClient = createTmdbClient(tmdbApiKey);
                                    meta.videos = await fetchTmdbEpisodes(
                                        tmdbClient,
                                        tmdbId,
                                        meta._numberOfSeasons,
                                        meta.id.startsWith('tt') ? meta.id : null,
                                        meta._originalLanguage || null
                                    );
                                }
                            }

                            // Aggiornamento silente scoring cache (voti freschi)
                            updateScoringCache(Number(tmdbId), type === 'series' ? 'tv' : type, meta).catch(() => { });

                            // Clean internal properties before caching/sending to Stremio
                            delete meta._keywordNames;
                            delete meta._isAnime;
                            delete meta._numberOfSeasons;
                            delete meta._originalLanguage;

                            await finalMetaCache.set(cacheKey, meta);
                        }
                    }
                }
            }
        }


        if (meta) {
            // Per richieste con tmdb: ID, manteniamo l'IMDB ID risolto per compatibilità streaming
            if (id.startsWith('tmdb:') && meta.id && meta.id.startsWith('tt')) {
                if (meta.behaviorHints && type === 'movie') {
                    meta.behaviorHints.defaultVideoId = meta.id;
                }
            } else if (!id.startsWith('tmdb:')) {
                // Per kitsu: e altri ID (non tradotti), forziamo l'ID originale
                meta.id = id;
            }

            return { meta };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

/**
 * Aggiornamento silente della scoring cache quando l'utente naviga i dettagli.
 * Salva solo vote_average e vote_count (i dati volatili utili allo scorer).
 * Usa lazy require per non bloccare il caricamento del modulo se mongoose non è disponibile.
 * @param {number} tmdbId ID TMDB
 * @param {string} type 'movie' o 'tv'
 * @param {Object} metaData Dati meta freschi dal TMDB
 */
async function updateScoringCache(tmdbId, type, metaData) {
    if (!tmdbId || !metaData) return;
    try {
        const TmdbScoringData = require('../db/models/TmdbScoringData');
        await TmdbScoringData.updateOne(
            { tmdbId, type },
            {
                $set: {
                    vote_average: metaData.vote_average || (metaData.imdbRating ? parseFloat(metaData.imdbRating) : 0),
                    vote_count: metaData.vote_count || 0
                }
            },
            { upsert: false } // Solo aggiorna se già esiste; non creare nuovi documenti parziali
        );
    } catch (_e) { /* scoring cache update failure is non-blocking */ }
}

module.exports = { metaHandler };
