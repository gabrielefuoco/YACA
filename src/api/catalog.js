const express = require('express');
const router = express.Router();
const { catalogHandler } = require('../handlers/catalogHandler');
const { buildDiscoveryParams } = require('../catalog/providers/TmdbProvider');
const { generateTmdbFiltersFromPrompt } = require('../ai/router');
const { getPresets } = require('../data/presets');
const { sanitizeString, resolveHostUrl } = require('../utils/helpers');

const PREVIEW_TIMEOUT_MS = 8000;
const MAX_PROMPT_LENGTH = 500;
const MAX_PREVIEW_CATALOG_NAME_LENGTH = 30;

const { createAxiosInstance } = require('../utils/httpClient');
const tmdbClient = createAxiosInstance('https://api.themoviedb.org/3');

router.post('/preview-catalog', async (req, res) => {
    const { presetId, filters: customFilters, type: customType, prompt } = req.body;
    const tmdbKey = req.body.tmdbKey || process.env.TMDB_API_KEY;
    const mistralKey = req.body.mistralKey || null;

    if (!tmdbKey) {
        return res.status(400).json({ error: 'TMDB API key non configurata sul server' });
    }
    if (!presetId && !customFilters && !prompt) {
        return res.status(400).json({ error: 'presetId, filters o prompt obbligatori' });
    }
    const sanitizedTmdbKey = sanitizeString(tmdbKey);

    let discoverType, discoverFilters, strategy;
    let sanitizedPrompt = null;

    if (presetId) {
        const sanitizedPresetId = sanitizeString(presetId);
        const preset = getPresets().find(p => p.id === sanitizedPresetId);
        if (!preset) {
            return res.status(404).json({ error: 'Preset non trovato' });
        }
        discoverType = preset.type === 'series' ? 'tv' : 'movie';
        const firstQuery = Array.isArray(preset.queries) && preset.queries.length > 0
            ? preset.queries[0]
            : (preset.filters || {});
        const { strategy: queryStrategy, ...queryFilters } = firstQuery;
        discoverFilters = queryFilters;
        strategy = queryStrategy || 'discovery';
    } else if (prompt) {
        if (!mistralKey) {
            return res.status(403).json({ error: 'Per generare cataloghi AI è necessaria una chiave Mistral personale.' });
        }
        sanitizedPrompt = sanitizeString(String(prompt)).substring(0, MAX_PROMPT_LENGTH);
        if (!sanitizedPrompt) {
            return res.status(400).json({ error: 'Prompt non valido' });
        }
        const aiFilters = await generateTmdbFiltersFromPrompt(sanitizedPrompt, mistralKey, false, 'multi_query');
        const aiType = customType === 'series' || aiFilters.target === 'kitsu' ? 'series' : 'movie';
        discoverType = aiType === 'series' ? 'tv' : 'movie';
        strategy = aiFilters.strategy || 'discovery';
        const originalAiKeywords = aiFilters.keyword || null;
        discoverFilters = strategy === 'discovery' && !aiFilters.queries
            ? await buildDiscoveryParams(aiFilters, sanitizedTmdbKey, aiType)
            : aiFilters;
        if (originalAiKeywords) discoverFilters._keywordNames = originalAiKeywords;
    } else {
        discoverType = customType === 'series' ? 'tv' : 'movie';
        discoverFilters = {};
        strategy = sanitizeString(String(customFilters?.strategy || 'discovery'));
        const allowedFilterKeys = [
            'strategy', 'similar_to', 'text_search',
            'sort_by', 'with_genres', 'with_keywords', 'with_cast', 'with_crew',
            'with_companies', 'with_original_language', 'vote_average.gte', 'vote_count.gte',
            'primary_release_date.gte', 'primary_release_date.lte',
            'first_air_date.gte', 'first_air_date.lte'
        ];
        for (const [key, value] of Object.entries(customFilters)) {
            if (allowedFilterKeys.includes(key) && value !== undefined && value !== '') {
                if (typeof value === 'string') {
                    discoverFilters[key] = sanitizeString(value);
                } else if (typeof value === 'number') {
                    if (key === 'vote_average.gte') {
                        discoverFilters[key] = Math.max(0, Math.min(10, Number(value) || 0));
                    } else if (key === 'vote_count.gte') {
                        discoverFilters[key] = Math.max(0, Math.floor(Number(value) || 0));
                    } else {
                        discoverFilters[key] = Number(value) || 0;
                    }
                }
            }
        }
    }

    if (customFilters?.merge || discoverFilters?.queries) {
        try {
            const previewData = await catalogHandler(
                {
                    type: discoverType === 'tv' ? 'series' : 'movie',
                    id: null,
                    filters: discoverFilters?.queries ? discoverFilters : customFilters,
                    extra: { skip: 0 }
                },
                { apiKeys: { tmdb: sanitizedTmdbKey, mistral: mistralKey } },
                resolveHostUrl(req)
            );

            const items = (previewData.metas || []).slice(0, 20).map(item => ({
                id: item.id,
                title: item.name || '',
                poster: item.poster || null,
                vote: item.vote_average || item.imdbRating || 0,
                year: item.releaseInfo || ''
            }));

            return res.json({
                items,
                filters: discoverFilters?.queries ? discoverFilters : customFilters,
                type: discoverType === 'tv' ? 'series' : 'movie',
                name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null
            });
        } catch (err) {
            console.error("Errore preview multi-query/merge:", err);
            return res.status(500).json({ error: 'Errore nel generare anteprima' });
        }
    }

    try {
        let tmdbRes;
        if (strategy === 'multi_search') {
            tmdbRes = await tmdbClient.get(`/search/${discoverType}`, {
                params: {
                    api_key: sanitizedTmdbKey,
                    language: 'it-IT',
                    region: 'IT',
                    page: 1,
                    query: sanitizeString(discoverFilters.text_search || discoverFilters.keyword || '')
                },
                timeout: PREVIEW_TIMEOUT_MS
            });
        } else if (strategy === 'similar' && discoverFilters.similar_to) {
            const searchRes = await tmdbClient.get(`/search/${discoverType}`, {
                params: {
                    api_key: sanitizedTmdbKey,
                    language: 'it-IT',
                    region: 'IT',
                    page: 1,
                    query: sanitizeString(discoverFilters.similar_to)
                },
                timeout: PREVIEW_TIMEOUT_MS
            });
            const targetId = searchRes.data?.results?.[0]?.id;
            if (targetId) {
                tmdbRes = await tmdbClient.get(`/${discoverType}/${targetId}/recommendations`, {
                    params: {
                        api_key: sanitizedTmdbKey,
                        language: 'it-IT',
                        page: 1
                    },
                    timeout: PREVIEW_TIMEOUT_MS
                });
            } else {
                tmdbRes = { data: { results: [] } };
            }
        } else {
            tmdbRes = await tmdbClient.get(`/discover/${discoverType}`, {
                params: {
                    api_key: sanitizedTmdbKey,
                    language: 'it-IT',
                    region: 'IT',
                    page: 1,
                    ...discoverFilters
                },
                timeout: PREVIEW_TIMEOUT_MS
            });
        }
        const items = (tmdbRes.data?.results || []).slice(0, 20).map(item => ({
            id: item.id,
            title: item.title || item.name || '',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
            vote: item.vote_average || 0,
            year: (item.release_date || item.first_air_date || '').substring(0, 4)
        }));
        res.json({
            items,
            filters: discoverFilters,
            type: discoverType === 'tv' ? 'series' : 'movie',
            name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null
        });
    } catch (err) {
        const status = err.response?.status;
        if (status === 401) {
            return res.status(401).json({ error: 'Chiave TMDB non valida' });
        }
        return res.status(500).json({ error: 'Errore nel recupero dati da TMDB' });
    }
});

module.exports = router;
