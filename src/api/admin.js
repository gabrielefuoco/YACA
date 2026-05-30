const express = require('express');
const router = express.Router();
const CacheManager = require('../cache/CacheManager');
const { clearAllTmdbCaches } = require('../clients/tmdb');
const { clearIdCache } = require('../id_mapping/id_cache');
const TmdbRequestCache = require('../models/TmdbRequestCache');
const { aiPromptCache, aiDiscoveryCache, hybridRecommendationsCache } = require('../cache/cacheInstances');


// Endpoint per estrarre le statistiche di tutte le cache
router.get('/cache/stats', async (req, res) => {
    try {
        const stats = await CacheManager.getAllStats();

        res.json({
            success: true,
            redisAvailable: false,
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


module.exports = router;
