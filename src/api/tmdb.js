const express = require('express');
const router = express.Router();
const { createAxiosInstance } = require('../utils/httpClient');
const { sanitizeString } = require('../utils/helpers');

const tmdbClient = createAxiosInstance('https://api.themoviedb.org/3');

// TMDB Proxy Search endpoints per Autocomplete
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

module.exports = router;
