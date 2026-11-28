const express = require('express');
const router = express.Router();
const CacheManager = require('../cache/CacheManager');
const redisClient = require('../cache/redisClient');
const { clearAllTmdbCaches } = require('../clients/tmdb');
const { clearIdCache } = require('../clients');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { contaAccount } = require('../configurazione');
const SystemLog = require('../models/SystemLog');
const adminAuth = require('./middleware/adminAuth');
const TmdbDumpStore = require('../../services/tmdb-daemon/tmdbDumpStore');
const tmdbDumpStore = new TmdbDumpStore();
const { getIngestionStatus } = require('../infra/ingestionStatus');

// Applica il middleware di autenticazione a tutte le rotte admin
router.use(adminAuth);

// Endpoint per estrarre le statistiche (cache e metriche di base)
router.get('/metrics', async (req, res) => {
    try {
        const stats = await CacheManager.getAllStats();
        const activeUsersCount = await contaAccount();
        
        // Ultime 50 righe del SystemLog
        const recentLogs = await SystemLog.find().sort({ createdAt: -1 }).limit(50).lean();

        res.json({
            success: true,
            redisAvailable: redisClient.isAvailable,
            activeUsersCount,
            cacheStats: stats,
            recentLogs
        });
    } catch (err) {
        console.error('Errore stats admin:', err);
        res.status(500).json({ error: 'Errore durante il recupero delle metriche.' });
    }
});

// Endpoint unificato per svuotare cache
router.post('/system/flush', async (req, res) => {
    const { namespace } = req.body;
    try {
        if (!namespace || namespace === 'all') {
            await clearAllTmdbCaches();
            await clearIdCache();
            await hybridRecommendationsCache.clear();
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

// Trigger per eseguire utility in background
// Endpoint per controllare lo stato del daemon TMDB Dump (letto dall'artefatto su volume yaca_tmdb)
router.get('/tmdb-dump/status', async (req, res) => {
    try {
        const status = tmdbDumpStore.loadStatus();
        res.json({ success: true, status });
    } catch (err) {
        console.error('Errore status tmdb dump:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

// Endpoint per il semaforo dei quattro degradi silenziosi (Ticket 10)
router.get('/ingestion-status', async (_req, res) => {
    try {
        const status = await getIngestionStatus();
        res.json({ success: true, ...status });
    } catch (err) {
        console.error('Errore ingestion status:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

module.exports = router;
