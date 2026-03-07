const { getTmdbMetaDetails } = require('../clients/tmdb');
const { getKitsuMetaDetails, getKitsuIdFromTmdbId, fetchKitsuEpisodes } = require('../clients/kitsu');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const { fetchMdblistRatings } = require('../utils/mdblist');
const CacheManager = require('../cache/CacheManager');

// Cache per l'oggetto meta finale combinato (TMDB + MDBList)
const finalMetaCache = new CacheManager('final_meta_cache', { ramMax: 50, ramTtlMs: 3600000 });

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

                const cachedMeta = await finalMetaCache.get(cacheKey);
                if (cachedMeta) {
                    meta = cachedMeta;
                } else {
                    // Eseguiamo in parallelo
                    const [tmdbMeta, ratings] = await Promise.all([
                        getTmdbMetaDetails(tmdbApiKey, tmdbId, type),
                        imdbIdForRatings ? fetchMdblistRatings(imdbIdForRatings, mdblistApiKey).catch(() => ({})) : Promise.resolve({})
                    ]);

                    meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, ratings || {});
                    if (meta) {
                        // Logica Ibrida Anime: Se è un anime (Genere Animation + keyword Anime), arricchisci con Kitsu
                        const isAnimation = meta.genre_ids?.includes(16);
                        const isAnime = isAnimation && (meta.name?.toLowerCase().includes('anime') || (meta.genres && meta.genres.some(g => g.toLowerCase().includes('animation'))));

                        if (isAnime && type === 'series') {
                            const kitsuId = await getKitsuIdFromTmdbId(tmdbId, 'series');
                            if (kitsuId) {
                                console.log(`[HybridAnime] Trovato mapping Kitsu ${kitsuId} per TMDB ${tmdbId}. Carico episodi...`);
                                const kitsuEpisodes = await fetchKitsuEpisodes(kitsuId);
                                if (kitsuEpisodes && kitsuEpisodes.length > 0) {
                                    meta.videos = kitsuEpisodes;
                                    // Mantieni l'id originale TMDB per compatibilità Stremio ma usa i video Kitsu
                                }
                            }
                        }
                        await finalMetaCache.set(cacheKey, meta);
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

module.exports = { metaHandler };
