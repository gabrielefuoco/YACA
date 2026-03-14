const express = require('express');
const router = express.Router();
const TasteProfile = require('../models/TasteProfile');
const User = require('../models/User');
const { syncAllStremioData } = require('../utils/stremioSync');
const { aiDiscoveryCache } = require('../cache/cacheInstances');
const { buildDnaDescription } = require('../ai/querySynthesizer');

/**
 * GET /api/profiles/:id/analytics
 * 
 * Returns a selective DTO with profile scores and AI discovery logs.
 */
router.get('/:id/analytics', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.query.userId;

    if (!userId) return res.status(400).json({ error: 'userId query parameter is required' });

    try {
        const profile = await TasteProfile.findOne({ owner: userId, context: profileId });
        
        const genreScores = profile?.genreScores ? Object.fromEntries(profile.genreScores) : {};
        const keywordScores = profile?.keywordScores ? Object.fromEntries(profile.keywordScores) : {};
        const aiLogs = {};

        const CATALOG_MODES = {
            yaca_true_blend_movies: 'trueBlend',
            yaca_true_blend_series: 'trueBlend',
            yaca_hidden_gems_movies: 'hiddenGems',
            yaca_hidden_gems_series: 'hiddenGems',
        };

        if (profile) {
            const dnaDescription = buildDnaDescription(profile);
            if (dnaDescription) {
                const modes = new Set(Object.values(CATALOG_MODES).filter(Boolean));
                const modeResults = {};

                for (const mode of modes) {
                    const cacheKey = `qs_${mode}_${dnaDescription}`.toLowerCase().trim();
                    try {
                        const cached = await aiDiscoveryCache.get(cacheKey);
                        if (cached) modeResults[mode] = cached.queries || cached;
                    } catch {}
                }

                for (const [catalogId, mode] of Object.entries(CATALOG_MODES)) {
                    aiLogs[catalogId] = (mode && modeResults[mode]) ? modeResults[mode] : [];
                }
            }
        }

        return res.json({ genreScores, keywordScores, aiLogs });
    } catch (err) {
        console.error(`[Analytics] Error fetching profile analytics for ${profileId}:`, err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/profiles/:id/sync-status
 */
router.get('/:id/sync-status', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.query.userId;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const profile = await TasteProfile.findOne({ owner: userId, context: profileId });
        if (!profile) {
            return res.json({ isSyncing: false, total: 0, current: 0, onboardingCompleted: false });
        }

        res.json({
            isSyncing: profile.syncStatus?.isSyncing || false,
            total: profile.syncStatus?.total || 0,
            current: profile.syncStatus?.current || 0,
            lastSync: profile.syncStatus?.lastSync,
            onboardingCompleted: profile.onboardingCompleted || false
        });
    } catch (err) {
        console.error(`[ProfileAPI] Error fetching sync status:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/profiles/:id/dna/confirm
 */
router.post('/:id/dna/confirm', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.body.userId;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const profile = (user.profiles || []).find(p => p.id === profileId);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        
        const targetSettings = profile.settings || {};
        const updateQuery = { userId, 'profiles.id': profileId };

        const suggested = targetSettings.suggestedDNA || [];
        const manual = targetSettings.manualDNA || [];

        const updatedManual = [...manual];
        const existingIds = new Set(manual.map(m => `${m.type}:${m.id}`));

        suggested.forEach(s => {
            if (!existingIds.has(`${s.type}:${s.id}`)) updatedManual.push(s);
        });

        const setObj = {
            'profiles.$.settings.manualDNA': updatedManual,
            'profiles.$.settings.suggestedDNA': []
        };

        await User.updateOne(updateQuery, { $set: setObj });

        await TasteProfile.updateOne(
            { owner: userId, context: profileId },
            { $set: { onboardingCompleted: true } },
            { upsert: true }
        );

        res.json({ success: true, onboardingCompleted: true });
    } catch (err) {
        console.error(`[ProfileAPI] Error confirming DNA for ${profileId}:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/profiles/:id/sync/refresh
 */
router.post('/:id/sync/refresh', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.body.userId;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const user = await User.findOne({ userId });
        if (!user || !user.apiKeys?.stremio) return res.status(400).json({ error: 'Stremio API Key missing' });

        syncAllStremioData(userId, user.apiKeys.stremio, profileId)
            .catch(err => console.error(`[BackgroundSync] Failure for ${userId} (Profile: ${profileId}):`, err));

        res.json({ success: true, message: `Sync started for profile ${profileId}` });
    } catch (err) {
        console.error(`[ProfileAPI] Error starting refresh:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
