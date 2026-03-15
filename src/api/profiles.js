const express = require('express');
const router = express.Router();
const TasteProfile = require('../models/TasteProfile');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { syncAllStremioData } = require('../utils/stremioSync');
const { aiDiscoveryCache } = require('../cache/cacheInstances');
const { buildDnaDescription, generateDiscoveryQueries } = require('../ai/querySynthesizer');

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
        // Read TasteProfile and resolve AddonConfig via Two-Table Split
        const account = await UserAccount.findOne({ userId }).lean();
        const addonConfig = account?.addonUuid
            ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
            : null;

        const profile = await TasteProfile.findOne({ owner: userId, context: profileId });
        
        const genreScores = profile?.genreScores ? Object.fromEntries(profile.genreScores) : {};
        const keywordScores = profile?.keywordScores ? Object.fromEntries(profile.keywordScores) : {};
        const aiLogs = {};
        const profileSettings = (addonConfig?.profiles || []).find((p) => p.id === profileId)?.settings || {};
        const combinedDna = [
            ...(Array.isArray(profileSettings.manualDNA) ? profileSettings.manualDNA : []),
            ...(Array.isArray(profileSettings.suggestedDNA) ? profileSettings.suggestedDNA : [])
        ];
        const genreIds = combinedDna
            .filter((item) => item?.type === 'genre' && item?.id !== undefined && item?.id !== null)
            .map((item) => String(item.id));
        const keywordIds = combinedDna
            .filter((item) => item?.type === 'keyword' && item?.id !== undefined && item?.id !== null)
            .map((item) => String(item.id));
        const countryIds = combinedDna
            .filter((item) => item?.type === 'country' && item?.id !== undefined && item?.id !== null)
            .map((item) => String(item.id));
        const baseDnaParams = {};

        if (genreIds.length > 0) baseDnaParams.with_genres = genreIds.join('|');
        if (keywordIds.length > 0) baseDnaParams.with_keywords = keywordIds.join('|');
        if (countryIds.length > 0) baseDnaParams.with_origin_country = countryIds.join('|');

        const CATALOG_MODES = {
            yaca_true_blend_movies: 'trueBlend',
            yaca_true_blend_series: 'trueBlend',
            yaca_hidden_gems_movies: 'hiddenGems',
            yaca_hidden_gems_series: 'hiddenGems',
        };

        if (profile || addonConfig) {
            const dnaDescription = buildDnaDescription(profile, addonConfig, profileId);
            if (dnaDescription) {
                const modes = new Set(Object.values(CATALOG_MODES).filter(Boolean));
                const modeResults = {};
                const mistralKey = account?.apiKeys?.mistral;

                for (const mode of modes) {
                    const cacheKey = `qs_${mode}_${dnaDescription}`.toLowerCase().trim();
                    try {
                        const cached = await aiDiscoveryCache.get(cacheKey);
                        if (cached) {
                            modeResults[mode] = cached.queries || cached;
                            continue;
                        }
                        if (mistralKey) {
                            const generated = await generateDiscoveryQueries(profile, mistralKey, mode, addonConfig, profileId);
                            if (Array.isArray(generated) && generated.length > 0) {
                                modeResults[mode] = generated;
                            }
                        }
                    } catch (err) {
                        // Non-blocking: inspector logs must never fail the analytics endpoint
                        console.warn(`[Analytics] AI log resolution failed for mode ${mode}:`, err.message);
                    }
                }

                for (const [catalogId, mode] of Object.entries(CATALOG_MODES)) {
                    aiLogs[catalogId] = (mode && modeResults[mode]) ? modeResults[mode] : [];
                }
            }
        }

        return res.json({ genreScores, keywordScores, aiLogs, baseDnaParams });
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
        const account = await UserAccount.findOne({ userId }).lean();
        const addonConfig = account?.addonUuid
            ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
            : null;
        const profileSettings = (addonConfig?.profiles || []).find((p) => p.id === profileId)?.settings || {};
        const profile = await TasteProfile.findOne({ owner: userId, context: profileId });
        if (!profile) {
            return res.json({
                isSyncing: false,
                total: 0,
                current: 0,
                onboardingCompleted: false,
                manualDNA: profileSettings.manualDNA || [],
                suggestedDNA: profileSettings.suggestedDNA || []
            });
        }

        res.json({
            isSyncing: profile.syncStatus?.isSyncing || false,
            total: profile.syncStatus?.total || 0,
            current: profile.syncStatus?.current || 0,
            lastSync: profile.syncStatus?.lastSync,
            onboardingCompleted: profile.onboardingCompleted || false,
            manualDNA: profileSettings.manualDNA || [],
            suggestedDNA: profileSettings.suggestedDNA || []
        });
    } catch (err) {
        console.error(`[ProfileAPI] Error fetching sync status:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/profiles/:id/dna/confirm
 * Reads/writes profiles from AddonConfig (Two-Table Split).
 */
router.post('/:id/dna/confirm', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.body.userId;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        // Resolve addonUuid and read profiles from AddonConfig
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const addonConfig = await AddonConfig.findOne({ uuid: account.addonUuid });
        if (!addonConfig) return res.status(404).json({ error: 'User not found' });

        const profile = (addonConfig.profiles || []).find(p => p.id === profileId);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        
        const targetSettings = profile.settings || {};
        const updateQuery = { uuid: account.addonUuid, 'profiles.id': profileId };

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

        await AddonConfig.updateOne(updateQuery, { $set: setObj });

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
 * Reads API keys from UserAccount (Two-Table Split).
 */
router.post('/:id/sync/refresh', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.body.userId;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account || !account.apiKeys?.stremio) return res.status(400).json({ error: 'Stremio API Key missing' });

        await TasteProfile.updateOne(
            { owner: userId, context: profileId },
            {
                $set: {
                    'syncStatus.isSyncing': true,
                    'syncStatus.total': 1,
                    'syncStatus.current': 0
                }
            },
            { upsert: true }
        );

        syncAllStremioData(userId, account.apiKeys.stremio, profileId)
            .catch(err => console.error(`[BackgroundSync] Failure for ${userId} (Profile: ${profileId}):`, err));

        res.json({ success: true, message: `Sync started for profile ${profileId}` });
    } catch (err) {
        console.error(`[ProfileAPI] Error starting refresh:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
