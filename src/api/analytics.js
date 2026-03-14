const TasteProfile = require('../models/TasteProfile');
const { aiDiscoveryCache } = require('../cache/cacheInstances');
const { buildDnaDescription } = require('../ai/querySynthesizer');

/**
 * GET /api/profiles/:id/analytics
 * 
 * Returns a selective DTO with profile scores and AI discovery logs.
 * Does NOT expose the full TasteProfile — only genreScores, keywordScores, and AI logs.
 */
async function getProfileAnalytics(req, res) {
    const { id: profileId } = req.params;
    const userId = req.query.userId;

    if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
    }
    if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
    }

    try {
        const profile = await TasteProfile.findOne({ owner: userId, context: profileId });

        // Build scores DTO from profile (or empty if profile doesn't exist yet)
        const genreScores = profile?.genreScores ? Object.fromEntries(profile.genreScores) : {};
        const keywordScores = profile?.keywordScores ? Object.fromEntries(profile.keywordScores) : {};

        // Retrieve AI discovery logs from cache
        const aiLogs = {};
        const CATALOG_MODES = {
            yaca_true_blend_movies: 'trueBlend',
            yaca_true_blend_series: 'trueBlend',
            yaca_seed_network_movies: null,
            yaca_seed_network_series: null,
            yaca_hidden_gems_movies: 'hiddenGems',
            yaca_hidden_gems_series: 'hiddenGems',
            yaca_trakt_filtered_movies: null,
            yaca_trakt_filtered_series: null,
        };

        if (profile) {
            const dnaDescription = buildDnaDescription(profile);
            if (dnaDescription) {
                // Look up cached AI queries for each mode
                const modes = new Set(Object.values(CATALOG_MODES).filter(Boolean));
                const modeResults = {};

                for (const mode of modes) {
                    const cacheKey = `qs_${mode}_${dnaDescription}`.toLowerCase().trim();
                    try {
                        const cached = await aiDiscoveryCache.get(cacheKey);
                        if (cached) {
                            modeResults[mode] = cached.queries || cached;
                        }
                    } catch {
                        // Cache miss is non-blocking
                    }
                }

                // Map results to catalog IDs
                for (const [catalogId, mode] of Object.entries(CATALOG_MODES)) {
                    if (mode && modeResults[mode]) {
                        aiLogs[catalogId] = modeResults[mode];
                    } else {
                        aiLogs[catalogId] = [];
                    }
                }
            }
        }

        return res.json({ genreScores, keywordScores, aiLogs });
    } catch (err) {
        console.error(`[Analytics] Error fetching profile analytics for ${profileId}:`, err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = { getProfileAnalytics };
