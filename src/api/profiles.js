const express = require('express');
const router = express.Router();
const TasteProfile = require('../models/TasteProfile');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const WatchHistory = require('../models/WatchHistory');
const { syncAllStremioData } = require('../utils/stremioAddon');
const { aiDiscoveryCache } = require('../cache/cacheInstances');
const { buildDnaDescription, generateDiscoveryQueries } = require('../ai/querySynthesizer');
const LibraryConverterService = require('../services/LibraryConverterService');
const UserLibraryItem = require('../db/models/UserLibraryItem');

/**
 * POST /api/profiles/:id/convert-library
 * Triggers the conversion of the user's Stremio library metadata.
 */
router.post('/:id/convert-library', async (req, res) => {
    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    let hostUrl = process.env.BASE_URL;
    if (!hostUrl) {
        const fwdHost = req.headers['x-forwarded-host'];
        hostUrl = fwdHost ? `https://${fwdHost}` : `${req.protocol}://${req.get('host')}`;
    }
    
    try {
        const user = await UserAccount.findOne({ userId });
        let count = 0;
        if (user && user.addonUuid) {
            count = await UserLibraryItem.countDocuments({
                addonUuid: user.addonUuid,
                mapped: false,
                removed: false
            });
        }
        
        // Fire and forget
        LibraryConverterService.convertAll(userId, hostUrl).catch(e => console.error('[ConvertLibrary] Error:', e));
        
        res.status(202).json({ message: 'Lavorazione in corso', processingCount: count });
    } catch (e) {
        console.error('[ConvertLibrary] Error initiating conversion:', e);
        res.status(500).json({ error: 'Internal server error' });
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
                suggestedDNA: profileSettings.suggestedDNA || [],
                compiledVectors: {}
            });
        }

        res.json({
            isSyncing: profile.syncStatus?.isSyncing || false,
            total: profile.syncStatus?.total || 0,
            current: profile.syncStatus?.current || 0,
            lastSync: profile.syncStatus?.lastSync,
            onboardingCompleted: profile.onboardingCompleted || false,
            manualDNA: profileSettings.manualDNA || [],
            suggestedDNA: profileSettings.suggestedDNA || [],
            compiledVectors: profile.compiledVectors || {},
            idNames: profile.idNames || {}
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
 * GET /api/profiles/:id/analytics
 * Returns the AI query logs and algorithmic baseline parameters used by the engine.
 */
router.get('/:id/analytics', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.query.userId;

    if (!userId) return res.status(400).json({ error: 'userId query parameter is required' });

    try {
        const [profile, account] = await Promise.all([
            TasteProfile.findOne({ owner: userId, context: profileId }).lean(),
            UserAccount.findOne({ userId }).lean()
        ]);
        
        const baseDnaParams = { labels: {} };
        if (profile?.compiledVectors?.V_final) {
            const vFinal = profile.compiledVectors.V_final;
            const genreIds = Object.keys(vFinal).filter(k => k.startsWith('g:')).map(k => k.split(':')[1]);
            const keywordIds = Object.keys(vFinal).filter(k => k.startsWith('k:')).map(k => k.split(':')[1]);
            
            if (genreIds.length > 0) baseDnaParams.with_genres = genreIds.join('|');
            if (keywordIds.length > 0) baseDnaParams.with_keywords = keywordIds.join('|');
            
            if (profile.idNames) {
                baseDnaParams.labels = profile.idNames;
            }
        }

        const CATALOG_MODES = {
            yaca_true_blend_movies: 'trueBlend',
            yaca_true_blend_series: 'trueBlend',
            yaca_seed_network_movies: null,
            yaca_seed_network_series: null,
            yaca_hidden_gems_movies: 'hiddenGems',
            yaca_hidden_gems_series: 'hiddenGems',
        };

        const aiLogs = {};
        if (profile || account) {
            const dnaDescription = buildDnaDescription(profile, account, profileId);
            if (dnaDescription) {
                const modes = new Set(Object.values(CATALOG_MODES).filter(Boolean));
                const modeResults = {};
                const mistralKey = account?.apiKeys?.mistral;
                for (const mode of modes) {
                    try {
                        const generated = await generateDiscoveryQueries(profile, mistralKey, mode, account, profileId);
                        if (Array.isArray(generated) && generated.length > 0) {
                            modeResults[mode] = generated;
                        }
                    } catch (err) {
                        console.warn(`[Analytics] AI log resolution failed for mode ${mode}:`, err.message);
                    }
                }

                for (const [catalogId, mode] of Object.entries(CATALOG_MODES)) {
                    aiLogs[catalogId] = (mode && modeResults[mode]) ? modeResults[mode] : [];
                }
            }
        }

        return res.json({ aiLogs, baseDnaParams });
    } catch (err) {
        console.error(`[Analytics] Error fetching profile analytics for ${profileId}:`, err.message);
        return res.status(500).json({ error: 'Internal server error' });
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
            activeCatalogs,
            compiledVectors: profile?.compiledVectors || {}
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
    const { userId, compiledVectors, idNames } = req.body;

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
        const updateFields = {
            compiledVectors: {
                ...sanitized,
                lastComputed: new Date()
            },
            lastUpdated: new Date()
        };

        if (idNames && typeof idNames === 'object') {
            updateFields.idNames = idNames;
        }



        console.log('[DEBUG] Syncing idNames keys count:', idNames ? Object.keys(idNames).length : 0);
        console.log('[DEBUG] Syncing idNames sample:', idNames ? Object.keys(idNames).slice(0, 5) : []);

        await TasteProfile.updateOne(
            { owner: userId, context: profileId },
            { $set: updateFields },
            { upsert: true }
        );

        res.json({ success: true });
    } catch (err) {
        console.error(`[ProfileAPI] Error syncing vectors:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/profiles/:id/library
 * Fetch the user's library items
 */
router.get('/:id/library', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const items = await require('../db/models/UserLibraryItem').find({
            addonUuid: account.addonUuid,
            removed: false
        }).sort({ _ctime: -1 }).lean();

        res.json(items);
    } catch (err) {
        console.error(`[ProfileAPI] Error fetching library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/profiles/:id/library
 * Add a new item to the library
 */
router.post('/:id/library', async (req, res) => {
    const userId = req.body.userId;
    const { item } = req.body;
    if (!userId || !item || !item.id || !item.type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const now = new Date();
        const doc = {
            addonUuid: account.addonUuid,
            _id: item.id,
            type: item.type,
            name: item.name || '',
            poster: item.poster || '',
            posterShape: item.posterShape || 'poster',
            background: item.background || '',
            year: item.year ? item.year.toString() : '',
            removed: false,
            temp: false,
            _ctime: now,
            _mtime: now,
            mapped: false // Force converter to pick it up later
        };

        const UserLibraryItem = require('../db/models/UserLibraryItem');
        await UserLibraryItem.findOneAndUpdate(
            { addonUuid: account.addonUuid, _id: item.id },
            { $set: doc },
            { upsert: true, new: true }
        );

        let hostUrl = process.env.BASE_URL;
        if (!hostUrl) {
            const fwdHost = req.headers['x-forwarded-host'];
            hostUrl = fwdHost ? `https://${fwdHost}` : `${req.protocol}://${req.get('host')}`;
        }

        // Fire background converter instead of pushing raw doc
        // This ensures the item gets its badge and proper format on Stremio immediately
        LibraryConverterService.convertAll(userId, hostUrl).catch(e => console.error('[POST /library] Convert error:', e));

        res.json({ success: true, item: doc });
    } catch (err) {
        console.error(`[ProfileAPI] Error adding to library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/profiles/:id/library/:itemId
 * Remove an item from the library
 */
router.delete('/:id/library/:itemId', async (req, res) => {
    const userId = req.query.userId;
    const itemId = req.params.itemId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const UserLibraryItem = require('../db/models/UserLibraryItem');
        const item = await UserLibraryItem.findOne({ addonUuid: account.addonUuid, _id: itemId });
        
        if (item) {
            item.removed = true;
            item._mtime = new Date();
            await item.save();

            if (account.apiKeys?.stremio) {
                const { stremioClient } = require('../clients/stremio');
                await stremioClient.post('/api/datastorePut', {
                    authKey: account.apiKeys.stremio,
                    collection: 'libraryItem',
                    changes: [{
                        _id: item._id,
                        removed: true,
                        _mtime: item._mtime
                    }]
                });
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error(`[ProfileAPI] Error removing from library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/profiles/:id/library/reorder
 * Reorder library items by manipulating _ctime
 */
router.put('/:id/library/reorder', async (req, res) => {
    const userId = req.body.userId;
    const { itemIds } = req.body; // Array of _ids in the desired new order (first is newest)
    if (!userId || !Array.isArray(itemIds)) return res.status(400).json({ error: 'Invalid payload' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const UserLibraryItem = require('../db/models/UserLibraryItem');
        
        // Find current max _ctime to start from
        const newestItem = await UserLibraryItem.findOne({ addonUuid: account.addonUuid }).sort({ _ctime: -1 });
        let baseTime = newestItem && newestItem._ctime ? new Date(newestItem._ctime).getTime() : Date.now();
        
        // Add 1 hour to ensure the reordered block stays at the top
        baseTime += 3600000; 

        const changes = [];
        // itemIds are passed in visual order (index 0 is top left, so it should have the highest _ctime)
        for (let i = 0; i < itemIds.length; i++) {
            const itemId = itemIds[i];
            // each subsequent item gets a slightly older _ctime
            const newCtime = new Date(baseTime - (i * 1000));
            const newMtime = new Date();
            
            const updated = await UserLibraryItem.findOneAndUpdate(
                { addonUuid: account.addonUuid, _id: itemId },
                { $set: { _ctime: newCtime, _mtime: newMtime } },
                { new: true }
            );

            if (updated) {
                changes.push({
                    _id: updated._id,
                    type: updated.type,
                    name: updated.name || '',
                    poster: updated.poster || null,
                    posterShape: updated.posterShape || 'poster',
                    background: updated.background || null,
                    logo: updated.logo || null,
                    year: updated.year || null,
                    removed: updated.removed || false,
                    temp: updated.temp || false,
                    _ctime: newCtime,
                    _mtime: newMtime,
                    state: updated.state
                });
            }
        }

        if (changes.length > 0 && account.apiKeys?.stremio) {
            const { stremioClient } = require('../clients/stremio');
            // Batch push to Stremio
            const chunkSize = 100;
            for (let i = 0; i < changes.length; i += chunkSize) {
                const chunk = changes.slice(i, i + chunkSize);
                await stremioClient.post('/api/datastorePut', {
                    authKey: account.apiKeys.stremio,
                    collection: 'libraryItem',
                    changes: chunk
                });
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error(`[ProfileAPI] Error reordering library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
