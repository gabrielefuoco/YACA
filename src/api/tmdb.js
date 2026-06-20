const express = require('express');
const router = express.Router();
const { createAxiosInstance } = require('../utils/httpClient');
const { sanitizeString } = require('../utils/helpers');

const tmdbClient = createAxiosInstance('https://api.themoviedb.org/3');

// TMDB Proxy Search endpoints per Autocomplete
router.get('/tmdb/search/multi', async (req, res) => {
    const query = req.query.query;
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY non configurata sul server' });
    if (!query) return res.json({ results: [] });

    try {
        const response = await tmdbClient.get('/search/multi', {
            params: {
                api_key: sanitizeString(tmdbKey),
                query: sanitizeString(query),
                language: 'it-IT',
                page: 1,
                include_adult: false
            },
            timeout: 5000
        });
        return res.json({ results: response.data.results || [] });
    } catch (err) {
        console.error('Errore search multi:', err.message);
        return res.status(500).json({ error: 'Errore durante la ricerca TMDB' });
    }
});
router.get('/tmdb/search/keyword', async (req, res) => {
    const query = req.query.query;
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY non configurata sul server' });
    if (!query) return res.json({ results: [] });

    try {
        const response = await tmdbClient.get('/search/keyword', {
            params: {
                api_key: sanitizeString(tmdbKey),
                query: sanitizeString(query),
                page: 1
            },
            timeout: 5000
        });
        return res.json({ results: response.data.results || [] });
    } catch (err) {
        console.error('Errore search keyword:', err.message);
        return res.status(500).json({ error: 'Errore durante la ricerca delle keyword' });
    }
});

router.get('/tmdb/search/person', async (req, res) => {
    const query = req.query.query;
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY non configurata sul server' });
    if (!query) return res.json({ results: [] });

    try {
        const response = await tmdbClient.get('/search/person', {
            params: {
                api_key: sanitizeString(tmdbKey),
                query: sanitizeString(query),
                language: 'it-IT',
                page: 1,
                include_adult: false
            },
            timeout: 5000
        });
        return res.json({ results: response.data.results || [] });
    } catch (err) {
        console.error('Errore search person:', err.message);
        return res.status(500).json({ error: 'Errore durante la ricerca delle persone' });
    }
});

router.get('/tmdb/search/genre', async (req, res) => {
    const query = String(req.query.query || '').trim().toLowerCase();
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY non configurata sul server' });
    if (!query) return res.json({ results: [] });

    try {
        const [movieGenresRes, tvGenresRes] = await Promise.all([
            tmdbClient.get('/genre/movie/list', {
                params: { api_key: sanitizeString(tmdbKey), language: 'it-IT' },
                timeout: 5000
            }),
            tmdbClient.get('/genre/tv/list', {
                params: { api_key: sanitizeString(tmdbKey), language: 'it-IT' },
                timeout: 5000
            })
        ]);

        const merged = [...(movieGenresRes.data?.genres || []), ...(tvGenresRes.data?.genres || [])];
        const dedupedById = Array.from(new Map(merged.map(genre => [String(genre.id), genre])).values());
        const filtered = dedupedById.filter((genre) => String(genre.name || '').toLowerCase().includes(query));
        return res.json({ results: filtered });
    } catch (err) {
        console.error('Errore search genre:', err.message);
        return res.status(500).json({ error: 'Errore durante la ricerca dei generi' });
    }
});

// Endpoint per validare una TMDB API Key
router.post('/validate-tmdb-key', async (req, res) => {
    const tmdbKey = req.body.tmdbKey || process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        return res.status(400).json({ valid: false, error: 'TMDB API key non configurata sul server' });
    }
    try {
        const testRes = await tmdbClient.get('/configuration', {
            params: { api_key: tmdbKey },
            timeout: 5000
        });
        if (testRes.data && testRes.data.images) {
            return res.json({ valid: true });
        }
        return res.json({ valid: false, error: 'Risposta non valida da TMDB' });
    } catch (err) {
        const status = err.response?.status;
        if (status === 401) {
            return res.json({ valid: false, error: 'Chiave TMDB non valida (401 Unauthorized)' });
        }
        return res.json({ valid: false, error: 'Impossibile verificare la chiave. Riprova.' });
    }
});

// Endpoint per validare una Mistral API Key (BYOK verification)
router.post('/validate-mistral-key', async (req, res) => {
    const { mistralKey } = req.body;
    if (!mistralKey) {
        return res.status(400).json({ valid: false, error: 'Chiave Mistral non fornita.' });
    }
    try {
        const { Mistral } = require('@mistralai/mistralai');
        const client = new Mistral({ apiKey: mistralKey, timeout: 10000 });
        const response = await client.models.list();
        if (response?.data && Array.isArray(response.data)) {
            return res.json({ valid: true });
        }
        return res.json({ valid: false, error: 'Risposta non valida da Mistral.' });
    } catch (err) {
        const status = err.status || err.statusCode;
        if (status === 401) {
            return res.json({ valid: false, error: 'Chiave Mistral non valida (401 Unauthorized).' });
        }
        return res.json({ valid: false, error: 'Impossibile verificare la chiave Mistral. Riprova.' });
    }
});

/**
 * POST /api/tmdb/batch-details
 * Fetches multiple TMDB items in a single request (sequentially with local rate limiting).
 * Essential for the client-side VSM engine to enrich history with genres/keywords.
 */
router.post('/tmdb/batch-details', async (req, res) => {
    const { items, tmdbKey } = req.body; // items: [{ id, type }]

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'items array is required' });
    }

    const apiKey = tmdbKey || process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key is required' });

    try {
        const tmdb = require('../clients/tmdb');
        const results = [];
        
        // Process in small batches to stay within reasonable response times 
        // while respecting the server's rateLimiter.
        const batchSize = 10;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (item) => {
                try {
                    // Normalize type (Stremio 'series' -> TMDB 'tv')
                    const type = item.type === 'series' ? 'tv' : item.type;
                    const details = await tmdb.getTmdbMovieDetails(apiKey, item.id, type);
                    return { id: item.id, type: item.type, details };
                } catch (err) {
                    console.error(`[BatchTMDB] Failed to fetch ${item.type}:${item.id}`, err.message);
                    return { id: item.id, type: item.type, error: err.message };
                }
            }));
            results.push(...batchResults);
        }

        res.json({ results });
    } catch (err) {
        console.error(`[BatchTMDB] Global Error:`, err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/tmdb/batch-keywords
 * Fetches names for an array of TMDB keyword IDs.
 */
router.post('/tmdb/batch-keywords', async (req, res) => {
    const { keywordIds, tmdbKey } = req.body;

    if (!keywordIds || !Array.isArray(keywordIds)) {
        return res.status(400).json({ error: 'keywordIds array is required' });
    }

    const apiKey = tmdbKey || process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'TMDB API key is required' });

    try {
        const results = [];
        const batchSize = 20; // TMDB can handle many small fast requests
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        for (let i = 0; i < keywordIds.length; i += batchSize) {
            const batch = keywordIds.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (id) => {
                try {
                    const response = await tmdbClient.get(`/keyword/${id}`, {
                        params: { api_key: sanitizeString(apiKey) },
                        timeout: 10000
                    });
                    return { id, name: response.data.name };
                } catch (err) {
                    console.error(`[TMDB] Error fetching keyword ${id}:`, err.message);
                    return { id, name: `Keyword ${id}` };
                }
            }));
            results.push(...batchResults);
            
            // Add a small delay between batches to respect TMDB's 50req/s limit
            if (i + batchSize < keywordIds.length) {
                await delay(300);
            }
        }
        res.json({ results });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
