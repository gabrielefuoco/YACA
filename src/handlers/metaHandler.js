const { getTmdbMetaDetails } = require('../clients/tmdb');
const { getKitsuMetaDetails } = require('../clients/kitsu');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const { fetchMdblistRatings } = require('../utils/mdblist');

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

        // Caso 2: È un ID di TMDB (Film o Serie già mappati dai nostri cataloghi custom)
        else if (id.startsWith('tmdb:')) {
            meta = await getTmdbMetaDetails(tmdbApiKey, id, type);
        }

        // Caso 3: È un ID standard IMDB di Stremio (es. aprendo dalla home nativa)
        else if (id.startsWith('tt')) {
            // Dobbiamo tradurlo in TMDB
            const tmdbMap = await translateImdbToTmdb(id, tmdbApiKey);
            if (tmdbMap) {
                meta = await getTmdbMetaDetails(tmdbApiKey, tmdbMap.id, tmdbMap.type);
            }
        }

        if (meta) {
            // Per richieste con tmdb: ID, manteniamo l'IMDB ID risolto per compatibilità streaming
            // toStremioMetaItem preferisce già gli IMDB ID quando external_ids è disponibile
            if (id.startsWith('tmdb:') && meta.id && meta.id.startsWith('tt')) {
                // meta.id contiene l'IMDB ID risolto, teniamolo per Torrentio & co.
                // defaultVideoId va impostato solo per i film (per le serie si usa la lista episodi)
                if (meta.behaviorHints && type === 'movie') {
                    meta.behaviorHints.defaultVideoId = meta.id;
                }
            } else {
                // Per kitsu: e altri ID, forziamo l'ID originale
                meta.id = id;
            }

            // Arricchimento voti: Rotten Tomatoes e Metacritic da MDBList
            try {
                const imdbIdForRatings = meta.id && meta.id.startsWith('tt') ? meta.id : null;
                if (imdbIdForRatings) {
                    const mdblistApiKey = userConfig.apiKeys?.mdblist || process.env.MDBLIST_API_KEY || null;
                    const ratings = await fetchMdblistRatings(imdbIdForRatings, mdblistApiKey);
                    if (ratings) {
                        const parts = [];
                        if (meta.imdbRating) parts.push(`⭐ ${meta.imdbRating} TMDB`);
                        if (ratings.imdb !== null && ratings.imdb !== undefined) parts.push(`IMDb ${ratings.imdb}`);
                        if (ratings.rtCritic !== null && ratings.rtCritic !== undefined) parts.push(`🍅 ${ratings.rtCritic}%`);
                        if (ratings.rtAudience !== null && ratings.rtAudience !== undefined) parts.push(`🍿 ${ratings.rtAudience}%`);
                        if (ratings.metacritic !== null && ratings.metacritic !== undefined) parts.push(`Ⓜ️ ${ratings.metacritic}/100`);
                        if (parts.length > 0) {
                            meta.description = `${parts.join(' | ')}\n\n${meta.description || ''}`.trim();
                        }
                    }
                }
            } catch (_e) { /* fallback silenzioso */ }

            return { meta };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

module.exports = { metaHandler };
