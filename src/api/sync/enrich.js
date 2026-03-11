const TmdbScoringData = require('../../db/models/TmdbScoringData');
const ProfileBuilder = require('../../profile/ProfileBuilder');
const TasteProfile = require('../../db/models/TasteProfile');

module.exports = async (req, res) => {
    try {
        const { tmdbId, type, rawTMDB, userId } = req.body;

        if (!tmdbId || !type || !rawTMDB) {
            return res.status(400).json({ error: 'tmdbId, type, and rawTMDB are required' });
        }

        const numericId = parseInt(String(tmdbId).replace(/^tmdb:/, ''), 10);

        // Update TmdbScoringData globally
        const updateData = {
            vote_average: rawTMDB.vote_average || 0,
            vote_count: rawTMDB.vote_count || 0,
            genre_ids: (rawTMDB.genres || []).map(g => g.id),
            keyword_ids: (rawTMDB.keywords?.keywords || rawTMDB.keywords?.results || []).map(k => k.id),
            cast_ids: (rawTMDB.credits?.cast || []).slice(0, 5).map(c => c.id),
            director_ids: (rawTMDB.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.id),
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
            const profile = await TasteProfile.findOne({ owner: userId, context: 'global' });
            if (profile) {
                ProfileBuilder.processItem(profile, rawTMDB, 1.0); // apply regular weight
                await profile.save();
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Errore /api/sync/enrich:', err.message);
        res.status(500).json({ error: 'Errore interno del server' });
    }
};
