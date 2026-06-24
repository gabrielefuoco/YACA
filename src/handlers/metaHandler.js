const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient } = require('../clients/tmdb');
const { getKitsuMetaDetails, getKitsuIdFromTmdbId, fetchKitsuEpisodes } = require('../clients/kitsu');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const CacheManager = require('../cache/CacheManager');

// Cache per l'oggetto meta finale combinato
const finalMetaCache = new CacheManager('final_meta_cache', { ramMax: 2000, ramTtlMs: 3600000, swrMs: 600000 });

function normalizeAnimeEpisodes(seriesId, episodes) {
    if (!seriesId || !Array.isArray(episodes)) return [];

    let absoluteIndex = 1;
    return episodes
        .map((episode) => {
            const season = Number(episode?.season) > 0 ? Number(episode.season) : 1;
            const episodeNumber = Number(episode?.episode) > 0 ? Number(episode.episode) : absoluteIndex++;

            // If we have an IMDB seriesId (tt...), we want to force its use for better stream compatibility
            // otherwise we preserve full IDs (like kitsu: absolute ones).
            const isImdbSeries = seriesId && seriesId.startsWith('tt');
            const hasFullId = episode.id && (episode.id.match(/:/g) || []).length >= 2;
            const useSeriesIdMapping = isImdbSeries || !hasFullId;

            return {
                ...episode,
                id: useSeriesIdMapping ? `${seriesId}:${season}:${episodeNumber}` : episode.id,
                season,
                episode: episodeNumber
            };
        })
        .sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
}

async function resolveAnimeEpisodes(metaObj, tmdbId, tmdbApiKey) {
    let kitsuEpisodesResolved = false;
    
    // Se la serie TV anime ha più di una stagione su TMDB, bypassiamo la mappatura Kitsu
    // per preservare il menu a tendina multi-stagione di TMDB.
    const isMultiSeason = metaObj._numberOfSeasons > 1;
    
    if (!isMultiSeason) {
        const kitsuId = await getKitsuIdFromTmdbId(tmdbId, 'series');
        if (kitsuId) {
            console.log(`[HybridAnime] Mapping Kitsu ${kitsuId} per TMDB ${tmdbId}. Carico episodi...`);
            const kitsuEpisodes = await fetchKitsuEpisodes(kitsuId);
            if (kitsuEpisodes && kitsuEpisodes.length > 0) {
                metaObj.videos = normalizeAnimeEpisodes(metaObj.id, kitsuEpisodes);
                kitsuEpisodesResolved = true;
            }
        }
    } else {
        console.log(`[HybridAnime] Serie TV multi-stagione (${metaObj._numberOfSeasons} stagioni) rilevata. Usiamo direttamente TMDB per preservare il layout.`);
    }

    // Fallback/Default to TMDB episodes if Kitsu mapping failed, no episodes found, or multi-season
    if (!kitsuEpisodesResolved && metaObj._numberOfSeasons) {
        console.log(`[HybridAnime] Fallback/Default: Carico episodi TMDB per Anime ${tmdbId}`);
        const tmdbClient = createTmdbClient(tmdbApiKey);
        metaObj.videos = await fetchTmdbEpisodes(
            tmdbClient,
            tmdbId,
            metaObj._numberOfSeasons,
            metaObj.id.startsWith('tt') ? metaObj.id : null,
            metaObj._originalLanguage || null
        );
    }
}

/**
 * Gestisce la richiesta di metadati dettagliati quando l'utente clicca su un titolo
 */
async function metaHandler(args, userConfig) {
    try {
        const { type, id: originalId } = args;
        const id = typeof originalId === 'string' ? originalId.replace('_ita_offset', '') : originalId;

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

        // Caso 2: È un ID di Anilist (Anime) - Prova a mappare su Kitsu per episodi giocabili
        else if (id.startsWith('anilist:')) {
            const anilistId = id.replace('anilist:', '');
            const { getAnilistMeta, mapAnilistToMeta } = require('../clients/anilist');
            const { getKitsuIdByMalId } = require('../clients/kitsu');
            
            const anilistMeta = await getAnilistMeta(anilistId);
            
            if (anilistMeta && anilistMeta.idMal) {
                const kitsuId = await getKitsuIdByMalId(anilistMeta.idMal);
                if (kitsuId) {
                    meta = await getKitsuMetaDetails(`kitsu:${kitsuId}`);
                }
            }
            
            // Fallback se Kitsu fallisce
            if (!meta && anilistMeta) {
                meta = mapAnilistToMeta(anilistMeta);
            }
        }

        // Fetch metadata via TMDB
        if (id.startsWith('tmdb:') || id.startsWith('tt')) {
            const tmdbIdResult = id.startsWith('tmdb:') ? { id: id.replace('tmdb:', '') } : await translateImdbToTmdb(id, tmdbApiKey);
            const tmdbId = tmdbIdResult?.id;

            if (tmdbId) {
                const cacheKey = `meta_${tmdbId}_${type}`;

                // Use getWithStatus for SWR support
                let { value: cachedMeta, status: cacheStatus } = await finalMetaCache.getWithStatus(cacheKey);



                if (cacheStatus === 'fresh') {
                    meta = cachedMeta;
                } else {
                    // If stale, return cached data and trigger background revalidation
                    if (cacheStatus === 'stale' && cachedMeta) {
                        meta = cachedMeta;
                        // Fire-and-forget background revalidation
                        (async () => {
                            try {
                                const bgMeta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});
                                if (bgMeta) {
                                    // Anime series: fetch Kitsu episodes (TMDB episodes were skipped)
                                    if (bgMeta._isAnime && type === 'series') {
                                        await resolveAnimeEpisodes(bgMeta, tmdbId, tmdbApiKey);
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
                        meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});
                        if (meta) {
                            // Anime series: fetch Kitsu episodes (TMDB episodes were skipped)
                            if (meta._isAnime && type === 'series') {
                                await resolveAnimeEpisodes(meta, tmdbId, tmdbApiKey);
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

            // Ripristina l'ID richiesto originale per Stremio (incluso eventuale _ita_offset)
            meta.id = originalId;

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
        const TmdbScoringData = require('../models/TmdbScoringData');
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
