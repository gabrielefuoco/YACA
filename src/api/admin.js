const express = require('express');
const router = express.Router();
const CacheManager = require('../cache/CacheManager');
const redisClient = require('../cache/redisClient');
const { clearAllTmdbCaches } = require('../clients/tmdb');
const { clearIdCache } = require('../id_mapping/id_cache');
const { aiPromptCache, aiDiscoveryCache, hybridRecommendationsCache, TmdbRequestCache } = require('../cache/cacheInstances');
const UserAccount = require('../db/models/UserAccount');
const SystemLog = require('../models/SystemLog');
const adminAuth = require('../middleware/adminAuth');
const { runCacheWarmer } = require('../utils/cacheWarmer');
const { getDumpStatus } = require('../utils/tmdbDumpDaemon');
const { exec } = require('child_process');
const path = require('path');

// Applica il middleware di autenticazione a tutte le rotte admin
router.use(adminAuth);

// Endpoint per estrarre le statistiche (cache e metriche di base)
router.get('/metrics', async (req, res) => {
    try {
        const stats = await CacheManager.getAllStats();
        const activeUsersCount = await UserAccount.countDocuments();
        
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

// Trigger per eseguire utility in background
router.post('/scripts/trigger', async (req, res) => {
    const { action } = req.body;
    
    try {
        if (action === 'warmup') {
            const hostUrl = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`;
            // Non attendiamo la fine per non bloccare
            runCacheWarmer(hostUrl).catch(e => console.error(e));
            return res.json({ success: true, message: 'Cache Warmer innescato con successo.' });
        }
        
        if (action === 'analyze_presets') {
            const scriptPath = path.join(__dirname, '../../scripts/analyze_presets.js');
            exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`analyze_presets exec error: ${error}`);
                }
                // Idealmente potremmo leggere il json di report, ma per ora confermiamo il via.
            });
            return res.json({ success: true, message: 'Analisi preset avviata in background.' });
        }

        return res.status(400).json({ error: 'Azione non riconosciuta.' });
    } catch (err) {
        console.error('Errore trigger script:', err);
        res.status(500).json({ error: 'Errore durante innesco script.' });
    }
});

// Endpoint per controllare lo stato del daemon TMDB Dump
router.get('/tmdb-dump/status', async (req, res) => {
    try {
        const status = getDumpStatus();
        res.json({ success: true, status });
    } catch (err) {
        console.error('Errore status tmdb dump:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

// Endpoint per innescare un backup su HF Dataset
router.post('/tmdb-dump/backup', async (req, res) => {
    // Il backup effettivo userebbe huggingface_hub in uno script python 
    // lanciato in child_process. Per ora ritorniamo istruzioni per CLI.
    res.json({ 
        success: true, 
        message: 'Backup function requires hf CLI.',
        cli_command: 'hf sync hf://buckets/Gabriele-fuoco/YACA-storage/tmdb/ ./backup_tmdb/'
    });
});

module.exports = router;
