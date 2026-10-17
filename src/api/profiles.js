const express = require('express');
const router = express.Router();
const { richiedeSessione } = require('../middleware/sessione');

// L'UTENTE NON ARRIVA PIU' DAL CHIAMANTE (17/10/2026). Prima di questo middleware ogni rotta prendeva
// `userId` da `req.query`/`req.body`: chiunque poteva leggere e scrivere la libreria di chiunque.
// Da qui in poi `req.utenteId` e' l'utente della sessione, e basta.
router.use(richiedeSessione);
const TasteProfile = require('../models/TasteProfile');
const UserAccount = require('../models/UserAccount');
const AddonConfig = require('../models/AddonConfig');
const { syncAllStremioData } = require('../utils/stremioAddon');
const { aiDiscoveryCache } = require('../cache/cacheInstances');
const { LibraryConverterService } = require('../library');
const {
    storiaDi,
    leggiLibreria,
    contaDaConvertire,
    trovaItemLibreria,
    salvaItemLibreria,
    normalizeLegacyPosterHost,
    applyDuplicateMarks
} = require('../library');
const { sanitizeDnaVector, isRetiredTmdbKeywordId } = require('../data/keywordIds');
const { calculateFlatnessMetrics } = require('../utils/dnaRarity');

/**
 * POST /api/profiles/:id/convert-library
 * Triggers the conversion of the user's Stremio library metadata.
 */
router.post('/:id/convert-library', async (req, res) => {
    const userId = req.utenteId;
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
            count = await contaDaConvertire({ addonUuid: user.addonUuid });
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
    const userId = req.utenteId;

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
            idNames: profile.idNames || {},
            flatnessMetrics: profile.flatnessMetrics || calculateFlatnessMetrics(profile.compiledVectors?.V_final)
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
    const userId = req.utenteId;

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
    const userId = req.utenteId;

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
    const userId = req.utenteId;

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

        const { getHeroCatalogModes, getHeroUiGroups } = require('../catalog/registry');
        const CATALOG_MODES = getHeroCatalogModes();

        // Studi di produzione della libreria (sezione "STUDI" del DNA).
        // Restano fuori dal vettore DNA: non influenzano punteggi e cataloghi.
        let studios = [];
        try {
            const { computeStudioProfile } = require('../profile/studioProfile');
            studios = await computeStudioProfile(account?.addonUuid, { limit: 8 });
        } catch (err) {
            console.warn('[Analytics] Profilo studi non disponibile:', err.message);
        }

        // Rimosse chiamate a Mistral per le query dinamiche, ritorniamo solo i parametri VSM di base.
        const aiLogs = {};
        const flatnessMetrics = profile?.flatnessMetrics || calculateFlatnessMetrics(profile?.compiledVectors?.V_final);

        return res.json({ aiLogs, baseDnaParams, studios, flatnessMetrics, heroCatalogs: getHeroUiGroups() });
    } catch (err) {
        console.error(`[Analytics] Error fetching profile analytics for ${profileId}:`, err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});



/**
 * GET /api/profiles/:id/library
 * Fetch the user's library items
 */
router.get('/:id/library', async (req, res) => {
    const userId = req.utenteId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const items = await leggiLibreria({ addonUuid: account.addonUuid });

        const currentHost = process.env.HOST_URL || `${req.protocol}://${req.get('host')}`;

        const seen = new Set();
        const mappedItems = [];

        for (const item of items) {
            const effectiveId = String(item.itemId || item._id).trim();
            if (!effectiveId || seen.has(effectiveId)) continue;
            seen.add(effectiveId);

            mappedItems.push({
                ...item,
                poster: normalizeLegacyPosterHost(item.poster, currentHost),
                _id: effectiveId,
                itemId: effectiveId
            });
        }

        res.json(mappedItems);
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
    const userId = req.utenteId;
    const { item } = req.body;
    if (!userId || !item || !item.id || !item.type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const { LibrarySyncService } = require('../library');
        const normalizedItemId = LibrarySyncService.normalizeSyncItemId(item.id);
        if (!normalizedItemId) {
            return res.status(400).json({ error: 'Invalid item id' });
        }

        const now = new Date();
        let poster = item.poster || '';
        if (!poster) {
            const { resolvePoster } = require('../utils/posterResolver');
            const resolved = await resolvePoster({ itemId: normalizedItemId, type: item.type, name: item.name });
            if (resolved) poster = resolved;
        }

        let existing = await trovaItemLibreria({
            addonUuid: account.addonUuid,
            itemId: normalizedItemId
        }) || (normalizedItemId !== item.id ? await trovaItemLibreria({
            addonUuid: account.addonUuid,
            itemId: item.id
        }) : null);

        // NON sovrascrivere _ctime se già esistente o se specificato nell'item
        const ctime = existing?._ctime || (item._ctime ? new Date(item._ctime) : now);

        const doc = {
            addonUuid: account.addonUuid,
            itemId: normalizedItemId,
            type: item.type,
            name: item.name || '',
            poster,
            posterShape: item.posterShape || 'poster',
            background: item.background || '',
            year: item.year ? item.year.toString() : '',
            removed: false,
            temp: false,
            _ctime: ctime,
            _mtime: now,
            mapped: false // Force converter to pick it up later
        };

        if (existing) {
            Object.assign(existing, doc);
            existing.itemId = normalizedItemId;
            await existing.save();
        } else {
            await salvaItemLibreria(doc);
        }

        // Applica i marcatori duplicateOf per evitare duplicati attivi
        await applyDuplicateMarks(account.addonUuid);

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
    const userId = req.utenteId;
    const itemId = req.params.itemId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const item = await trovaItemLibreria({
            addonUuid: account.addonUuid,
            itemId
        });
        
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
                        _id: item.itemId || item._id,
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
 * GET /api/profiles/:id/library/watched
 * Anteprima read-only dell'azione "Rimuovi titoli visti": dichiara quanti titoli
 * visibili spariranno dal pannello (e quanti record totali, duplicati inclusi).
 * Non scrive su MongoDB e non chiama Stremio.
 */
router.get('/:id/library/watched', async (req, res) => {
    const userId = req.utenteId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const { previewWatchedLibrary } = require('../library');
        const preview = await previewWatchedLibrary({ addonUuid: account.addonUuid });

        res.json({
            count: preview.count,
            totalRecords: preview.totalRecords,
            items: preview.items.map(item => ({
                itemId: String(item.itemId || item._id || '').trim(),
                name: item.name || '',
                type: item.type || ''
            }))
        });
    } catch (err) {
        console.error(`[ProfileAPI] Error previewing watched library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/profiles/:id/library/watched
 * Esegue l'azione "Rimuovi titoli visti": soft-delete locale (`removed: true`,
 * `_mtime` fresco) + push a Stremio a blocchi. Sincrona e idempotente: con zero
 * titoli visti non scrive e non chiama Stremio.
 */
router.post('/:id/library/watched', async (req, res) => {
    const userId = req.utenteId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        // Senza authKey il push a Stremio non parte e i titoli risusciterebbero al
        // sync successivo: meglio rifiutare l'azione che fingere una rimozione.
        if (!account.apiKeys?.stremio) return res.status(400).json({ error: 'Stremio API Key missing' });

        const { removeWatchedLibrary } = require('../library');
        const result = await removeWatchedLibrary({
            addonUuid: account.addonUuid,
            stremioAuthKey: account.apiKeys.stremio
        });

        res.json(result);
    } catch (err) {
        console.error(`[ProfileAPI] Error removing watched library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * PUT /api/profiles/:id/library/reorder
 * Reorder library items by updating raw_ui_state.libraryOrder in profile configuration
 */
router.put('/:id/library/reorder', async (req, res) => {
    const { id: profileId } = req.params;
    const userId = req.utenteId;
    const { itemIds } = req.body; // Array of _ids in the desired new order
    if (!userId || !Array.isArray(itemIds)) return res.status(400).json({ error: 'Invalid payload' });

    try {
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) return res.status(404).json({ error: 'User not found' });

        const addonConfig = await AddonConfig.findOne({ uuid: account.addonUuid });
        if (!addonConfig) return res.status(404).json({ error: 'User not found' });

        const profile = (addonConfig.profiles || []).find(p => p.id === profileId);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const cleanOrder = [...new Set(itemIds.map(String))];

        await AddonConfig.updateOne(
            { uuid: account.addonUuid, 'profiles.id': profileId },
            { $set: { 'profiles.$.raw_ui_state.libraryOrder': cleanOrder } }
        );

        res.json({ success: true, libraryOrder: cleanOrder });
    } catch (err) {
        console.error(`[ProfileAPI] Error reordering library:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
