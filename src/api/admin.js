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

// TEMP DIAGNOSTIC: Test Trakt Community catalog
router.get('/debug/trakt-community', async (req, res) => {
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => { logs.push('[LOG] ' + args.join(' ')); origLog(...args); };
    console.error = (...args) => { logs.push('[ERR] ' + args.join(' ')); origErr(...args); };

    try {
        const UserAccount = require('../db/models/UserAccount');
        const { buildTraktFilteredCatalog } = require('../engines/hybrid/catalogStrategies');
        const { fetchTraktRecommendationsRaw } = require('../engines/hybrid/dataFetchers');
        const { traktClient } = require('../clients/trakt');

        const account = await UserAccount.findOne({}).lean();
        if (!account) return res.json({ error: 'No account found', logs });

        const userId = account.userId;
        const traktToken = account.apiKeys?.trakt;
        const tmdbApiKey = account.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        const context = account.activeProfileId || 'global';

        logs.push(`userId=${userId}, hasToken=${!!traktToken}, tokenFirst10=${traktToken?.substring(0,10)}, context=${context}`);

        // Test 1: Direct Trakt API call
        try {
            const directRes = await traktClient.get('/recommendations/movies', {
                headers: {
                    'trakt-api-version': '2',
                    'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                    'Authorization': `Bearer ${traktToken}`
                },
                params: { limit: 3, page: 1 },
                timeout: 10000
            });
            logs.push(`Direct Trakt call OK, count=${directRes.data?.length}`);
        } catch (e) {
            logs.push(`Direct Trakt call FAILED: status=${e.response?.status}, msg=${e.message}`);
        }

        // Test 2: fetchTraktRecommendationsRaw
        const raw = await fetchTraktRecommendationsRaw(traktToken, 'movies', 5);
        logs.push(`fetchTraktRecommendationsRaw result count=${raw.length}`);
        if (raw.length > 0) {
            logs.push(`raw[0] keys: ${Object.keys(raw[0]).join(', ')}`);
            logs.push(`raw[0] JSON: ${JSON.stringify(raw[0])}`);
        }

        // Test 3: Full buildTraktFilteredCatalog
        const ids = await buildTraktFilteredCatalog(userId, context, traktToken, tmdbApiKey, 'movie');
        logs.push(`buildTraktFilteredCatalog result count=${ids.length}`);

        res.json({ success: true, idsCount: ids.length, firstIds: ids.slice(0, 5), logs });
    } catch (err) {
        logs.push(`FATAL: ${err.message}\n${err.stack}`);
        res.json({ error: err.message, logs });
    } finally {
        console.log = origLog;
        console.error = origErr;
    }
});

module.exports = router;
