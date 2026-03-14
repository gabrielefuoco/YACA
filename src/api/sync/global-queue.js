const TmdbScoringData = require('../../models/TmdbScoringData');

module.exports = async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const maxLimit = Math.min(parseInt(limit, 10) || 20, 50);
        
        const now = new Date();
        const query = {
            needsEnrichment: true,
            $or: [
                { lockedUntil: null },
                { lockedUntil: { $lt: now } }
            ]
        };

        const items = await TmdbScoringData.find(query)
            .limit(maxLimit)
            .lean();

        if (items.length === 0) {
            return res.json({ queue: [] });
        }

        const idsToLock = items.map(item => item._id);
        const lockExpiration = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes lock

        // Lock these items so other clients don't process them concurrently
        await TmdbScoringData.updateMany(
            { _id: { $in: idsToLock } },
            { $set: { lockedUntil: lockExpiration } }
        );

        const queue = items.map(item => ({
            id: `tmdb:${item.tmdbId}`,
            type: item.type
        }));

        res.json({ queue });
    } catch (err) {
        console.error('Errore /api/sync/global-queue:', err.message);
        res.status(500).json({ error: 'Errore interno del server' });
    }
};
