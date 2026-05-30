const express = require('express');
const router = express.Router();
const TasteProfile = require('../models/TasteProfile');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const WatchHistory = require('../models/WatchHistory');
const { syncAllStremioData } = require('../utils/stremioAddon');
const { aiDiscoveryCache } = require('../cache/cacheInstances');
const { buildDnaDescription, generateDiscoveryQueries } = require('../ai/querySynthesizer');


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

/**
 * GET /api/profiles/:id/raw-data
 * Returns the raw watch history for the profile.
 * Used by client-side Vector Space Model (VSM).
 */
router.get('/:id/raw-data', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.query.userId;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const history = await WatchHistory.find({ owner: userId, context: profileId })
            .sort({ lastWatchedAt: -1 })
            .lean();

        // Resolve manualDNA and activeCatalogs from AddonConfig via Two-Table Split
        const account = await UserAccount.findOne({ userId }).lean();
        const addonConfig = account?.addonUuid
            ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
            : null;

        const profile = (addonConfig?.profiles || []).find(p => p.id === profileId);
        const settings = profile?.settings || {};
        const activeCatalogs = profile?.catalogs || [];
            
        res.json({ 
            history,
            manualDNA: settings.manualDNA || [],
            activeCatalogs
        });
    } catch (err) {
        console.error(`[ProfileAPI] Error fetching raw data:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/profiles/:id/sync-vectors
 * Receives the client-computed compiledVectors and updates the TasteProfile.
 */
router.post('/:id/sync-vectors', async (req, res) => {
    const { id: profileId } = req.params;
    const { userId, compiledVectors } = req.body;

    if (!userId || !compiledVectors) return res.status(400).json({ error: 'userId and compiledVectors are required' });

    // Structural validation: V_final must exist and be a plain object
    const { V_final, V_active, V_static } = compiledVectors;
    if (!V_final || typeof V_final !== 'object' || Array.isArray(V_final)) {
        return res.status(400).json({ error: 'compiledVectors.V_final must be a non-null object' });
    }

    // Key format validation: all keys must match prefix:id pattern (g:28, k:9715, d:525, a:1100)
    const VALID_KEY_PATTERN = /^[gkda]:\d+$/;
    const invalidKeys = Object.keys(V_final).filter(k => !VALID_KEY_PATTERN.test(k));
    if (invalidKeys.length > 0) {
        return res.status(400).json({ error: `Invalid V_final keys: ${invalidKeys.slice(0, 5).join(', ')}` });
    }

    // Size guard: reject unreasonably large payloads
    const keyCount = Object.keys(V_final).length;
    if (keyCount > 500) {
        return res.status(400).json({ error: `V_final too large (${keyCount} keys, max 500)` });
    }

    // Sanitize: only allow known sub-vectors through
    const sanitized = { V_final };
    if (V_active && typeof V_active === 'object' && !Array.isArray(V_active)) sanitized.V_active = V_active;
    if (V_static && typeof V_static === 'object' && !Array.isArray(V_static)) sanitized.V_static = V_static;

    try {
        await TasteProfile.updateOne(
            { owner: userId, context: profileId },
            { 
                $set: { 
                    compiledVectors: {
                        ...sanitized,
                        lastComputed: new Date()
                    },
                    lastUpdated: new Date()
                } 
            },
            { upsert: true }
        );

        res.json({ success: true });
    } catch (err) {
        console.error(`[ProfileAPI] Error syncing vectors:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
