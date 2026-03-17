const TmdbScoringData = require('../../models/TmdbScoringData');
const ProfileBuilder = require('../../profile/ProfileBuilder');
const UserConfig = require('../../models/UserConfig');
const { getTmdbMovieDetails, prioritizeLocalizedImages } = require('../../clients/tmdb');

module.exports = async (req, res) => {
    try {
        const { tmdbId, type, rawTMDB, userId } = req.body;

        if (!tmdbId || !type || !rawTMDB) {
            return res.status(400).json({ error: 'tmdbId, type, and rawTMDB are required' });
        }

        const numericId = parseInt(String(tmdbId).replace(/^tmdb:/, ''), 10);

        // Miglioramento estrazione logo: se rawTMDB non ha loghi, prova a recuperarli dai dettagli completi
        let logoPath = rawTMDB.logo || (rawTMDB.images?.logos?.length > 0 ? prioritizeLocalizedImages(rawTMDB.images.logos)[0]?.file_path : null);

        if (!logoPath) {
            try {
                // Prova prima con la chiave dell'utente, poi con quella globale
                let apiKey = process.env.TMDB_API_KEY;
                if (userId) {
                    const userConfig = await UserConfig.resolveUserConfig(userId);
                    if (userConfig?.apiKeys?.tmdb) {
                        apiKey = userConfig.apiKeys.tmdb;
                    }
                }

                if (apiKey) {
                    const fullDetails = await getTmdbMovieDetails(apiKey, numericId, type);
                    if (fullDetails?.images?.logos?.length > 0) {
                        const bestLogo = prioritizeLocalizedImages(fullDetails.images.logos)[0];
                        logoPath = bestLogo?.file_path;
                    }
                }
            } catch (fallbackErr) {
                console.warn(`[Enrich] Fallback logo fetch failed for ${tmdbId}:`, fallbackErr.message);
            }
        }

        // Estrazione imdbId
        const imdbId = rawTMDB.imdb_id || rawTMDB.external_ids?.imdb_id || null;

        // Update TmdbScoringData globally
        const updateData = {
            imdbId: imdbId,
            vote_average: rawTMDB.vote_average || 0,
            vote_count: rawTMDB.vote_count || 0,
            genre_ids: (rawTMDB.genres || []).map(g => g.id),
            keyword_ids: (rawTMDB.keywords?.keywords || rawTMDB.keywords?.results || []).map(k => k.id),
            cast_ids: (rawTMDB.credits?.cast || []).slice(0, 5).map(c => c.id),
            director_ids: (rawTMDB.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.id),
            logo_path: logoPath,
            needsEnrichment: false,
            lockedUntil: null
        };

        await TmdbScoringData.findOneAndUpdate(
            { tmdbId: numericId, type },
            { $set: updateData },
            { upsert: true }
        );

        // Update User's TasteProfile (compensate for fetching, instantaneous DNA update)
        if (userId) {
            const increments = ProfileBuilder.processItem(rawTMDB, 1.0);
            await ProfileBuilder.saveAtomic(userId, 'global', increments);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Errore /api/sync/enrich:', err.message);
        res.status(500).json({ error: 'Errore interno del server' });
    }
};
