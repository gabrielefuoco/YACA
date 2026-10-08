const express = require('express');
const router = express.Router();
const CacheManager = require('../cache/CacheManager');
const redisClient = require('../cache/redisClient');
const { clearAllTmdbCaches } = require('../clients/tmdb');
const { clearIdCache } = require('../id_mapping/id_cache');
const { aiPromptCache, aiDiscoveryCache, hybridRecommendationsCache } = require('../cache/cacheInstances');
const UserAccount = require('../db/models/UserAccount');
const SystemLog = require('../models/SystemLog');
const adminAuth = require('../middleware/adminAuth');
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

        /**
         * Ricostruisce V_active e V_final dei profili dai segnali reali
         * (`ProfileBuilder.recomputeVectorsForUser`), uno dopo l'altro.
         *
         * PERCHÉ IN-PROCESS: un processo separato (`docker exec node scripts/...`)
         * aprirebbe una SECONDA copia in RAM del dump DuckDB dentro lo stesso
         * container, che ha un tetto di memoria; qui si riusa lo store già
         * inizializzato.
         *
         * PERCHÉ IN BACKGROUND: un giro su tutti i profili non sta nel timeout di
         * una richiesta HTTP. L'avanzamento si legge dai log del container
         * (`docker compose logs app | grep rebuild_dna_vectors`).
         *
         * V_static NON viene ricostruito: esce dal documento com'è, e si rinfresca
         * quando l'utente risalva la configurazione.
         */
        if (action === 'rebuild_dna_vectors') {
            const TasteProfile = require('../models/TasteProfile');
            const ProfileBuilder = require('../profile/ProfileBuilder');
            const filter = req.body.owner ? { owner: req.body.owner } : {};
            const targets = await TasteProfile.find(filter).select('owner context').lean();
            if (targets.length === 0) {
                return res.status(404).json({ error: 'Nessun profilo da ricostruire.' });
            }

            res.json({
                success: true,
                message: `Ricostruzione avviata per ${targets.length} profili. L'esito sta nei log: [rebuild_dna_vectors] FINITO`,
                profiles: targets.map(t => `${t.owner}/${t.context}`)
            });

            setImmediate(async () => {
                const started = Date.now();
                let ok = 0;
                const failures = [];
                for (const target of targets) {
                    try {
                        await ProfileBuilder.recomputeVectorsForUser(target.owner, target.context);
                        ok += 1;
                        console.log(`[rebuild_dna_vectors] ok ${target.owner}/${target.context}`);
                    } catch (err) {
                        failures.push(`${target.owner}/${target.context}: ${err.message}`);
                        console.error(`[rebuild_dna_vectors] fallito ${target.owner}/${target.context}:`, err.message);
                    }
                }
                const seconds = ((Date.now() - started) / 1000).toFixed(1);
                console.log(`[rebuild_dna_vectors] FINITO: ${ok}/${targets.length} profili in ${seconds}s`
                    + (failures.length > 0 ? ` · falliti: ${failures.join(' | ')}` : ''));
            });
            return;
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

// Endpoint per innescare un backup
router.post('/tmdb-dump/backup', async (req, res) => {
    // Il backup dei dati è gestito in ops/yaca-backup.sh (dump MongoDB Atlas -> storage remoto).
    res.json({ 
        success: true, 
        message: 'Il backup dei dati è gestito in ops/yaca-backup.sh'
    });
});

module.exports = router;
