const express = require('express');
const router = express.Router();
const CacheManager = require('../cache/CacheManager');
const { clearAllTmdbCaches } = require('../clients/tmdb');
const { clearIdCache } = require('../id_mapping/id_cache');
const TmdbRequestCache = require('../models/TmdbRequestCache');
const { aiPromptCache, aiDiscoveryCache, hybridRecommendationsCache } = require('../cache/cacheInstances');
const { getPresets } = require('../data/presets');
const { resolveHostUrl } = require('../utils/helpers');
const { triggerWarmupIfStale, getWarmupStatus } = require('../cache/warmupScheduler');

// Endpoint per estrarre le statistiche di tutte le cache
router.get('/cache/stats', async (req, res) => {
    try {
        const stats = await CacheManager.getAllStats();
        const { isRedisAvailable } = require('../cache/redisClient');

        res.json({
            success: true,
            redisAvailable: isRedisAvailable(),
            stats
        });
    } catch (err) {
        console.error('Errore stats cache:', err);
        res.status(500).json({ error: 'Errore durante il recupero delle statistiche.' });
    }
});

// Endpoint per svuotare una specifica categoria o tutte
router.post('/cache/clear', async (req, res) => {
    const { namespace } = req.body;
    try {
        if (!namespace || namespace === 'all') {
            await clearAllTmdbCaches();
            await clearIdCache();
            await TmdbRequestCache.clear();
            await hybridRecommendationsCache.clear();
            await aiPromptCache.clear();
            await aiDiscoveryCache.clear();
            return res.json({ success: true, message: 'Tutte le cache svuotate.' });
        }

        const instance = CacheManager.instances.find(i => i.namespace === namespace);
        if (instance) {
            await instance.clear();
            return res.json({ success: true, message: `Cache ${namespace} svuotata.` });
        }

        return res.status(404).json({ error: 'Categoria cache non trovata.' });
    } catch (err) {
        console.error(`Errore svuotamento cache ${namespace}:`, err);
        res.status(500).json({ error: 'Errore durante lo svuotamento.' });
    }
});

// Endpoint per pre-caricare la cache dei cataloghi
router.get('/cron/warmup', async (req, res) => {
    const tmdbConfigured = Boolean(process.env.TMDB_API_KEY);
    const result = tmdbConfigured
        ? await triggerWarmupIfStale()
        : { triggered: false, reason: 'missing_tmdb_key', status: getWarmupStatus() };
    const status = result.status || getWarmupStatus();
    res.status(200).json({
        status: 'OK',
        keepAlive: true,
        warmupTriggered: result.triggered,
        reason: result.reason,
        lastWarmupAt: status.lastWarmupAt || null,
        nextWarmupAt: status.nextWarmupAt || null,
        cooldownMs: status.cooldownMs,
        remainingMs: status.remainingMs,
        warmupInFlight: status.warmupInFlight
    });

    if (!tmdbConfigured) {
        console.warn('⚠️  Warmup saltato: TMDB_API_KEY non configurata.');
        return;
    }
});

module.exports = router;
