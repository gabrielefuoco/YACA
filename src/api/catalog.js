const express = require('express');
const router = express.Router();
const { catalogHandler } = require('../handlers/catalogHandler');
const { buildDiscoveryParams } = require('../catalog/providers/TmdbProvider');
const { generateTmdbFiltersFromPrompt } = require('../ai/router');
const { getPresets } = require('../data/presets');
const { sanitizeString } = require('../utils/helpers');

const PREVIEW_TIMEOUT_MS = 8000;
const MAX_PROMPT_LENGTH = 500;
const MAX_PREVIEW_CATALOG_NAME_LENGTH = 30;

const { createTmdbClient } = require('../clients/tmdb');
const tmdbClient = createTmdbClient();

router.post('/preview-catalog', async (req, res) => {
    try {
        const { id, type: customType, filters: customFilters, prompt, tmdbKey } = req.body;
        
        let reqMistralKey = req.body.mistralKey || process.env.MISTRAL_API_KEY;
        let reqTmdbKey = tmdbKey || process.env.TMDB_API_KEY;
        let fullUserConfig = { apiKeys: { tmdb: reqTmdbKey, mistral: reqMistralKey } };

        // 1. Resolve User Config first to get API keys if not passed directly
        const token = req.cookies?.yaca_session;
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const { getJwtSecret } = require('../auth/index');
                const decoded = jwt.verify(token, getJwtSecret());
                if (decoded?.userId) {
                    const UserConfig = require('../models/UserConfig');
                    const u = await UserConfig.resolveUserConfig(decoded.userId);
                    if (u) {
                        fullUserConfig = { ...u, apiKeys: { ...u.apiKeys, ...fullUserConfig.apiKeys } };
                        reqMistralKey = fullUserConfig.apiKeys?.mistral || reqMistralKey;
                        reqTmdbKey = fullUserConfig.apiKeys?.tmdb || reqTmdbKey;
                    }
                }
            } catch (jwtErr) {
                // silently ignore auth errors in preview
            }
        }

        const sanitizedTmdbKey = String(reqTmdbKey || '').trim();
        let discoverFilters = null;
        let discoverType = null;
        let strategy = null;
        let sanitizedPrompt = null;
        let aiFilters = null;
        let kidsMode = false;

        const activeProfileId = fullUserConfig.activeProfileId || 'global';
        const activeProfile = fullUserConfig.profiles?.find(p => p.id === activeProfileId) || (fullUserConfig.profiles?.[0] || {});
        kidsMode = activeProfile.settings?.kidsMode || false;

        if (!sanitizedTmdbKey) {
            return res.status(400).json({ error: 'TMDB API key non configurata sul server' });
        }

        if (id && id.startsWith('yaca_preset_')) {
            const presetId = id.replace('yaca_preset_', '');
            const preset = getPresets().find(p => p.id === presetId);
            if (!preset) return res.status(404).json({ error: 'Preset non trovato' });
            
            discoverType = preset.type === 'series' ? 'tv' : 'movie';
            const firstQuery = Array.isArray(preset.queries) && preset.queries.length > 0
                ? preset.queries[0]
                : (preset.filters || {});
            const { strategy: queryStrategy, ...queryFilters } = firstQuery;
            discoverFilters = queryFilters;
            strategy = queryStrategy || 'discovery';
        } else if (prompt) {
            if (!reqMistralKey) {
                return res.status(403).json({ error: 'Per generare cataloghi AI è necessaria una chiave Mistral personale.' });
            }
            sanitizedPrompt = sanitizeString(String(prompt)).substring(0, MAX_PROMPT_LENGTH);
            if (!sanitizedPrompt) {
                return res.status(400).json({ error: 'Prompt non valido' });
            }
            aiFilters = await generateTmdbFiltersFromPrompt(sanitizedPrompt, reqMistralKey, 'multi_query', kidsMode);
            
            if (aiFilters?.strategy === 'static_list') {
                const { getTmdbIdByName, getTmdbMovieDetails } = require('../clients/tmdb');
                const { rateLimitedMap } = require('../utils/rateLimiter');
                const titles = aiFilters.static_items || [];
                const tmdbType = customType === 'series' ? 'tv' : 'movie';

                const resolvedItems = await rateLimitedMap(titles, async (title) => {
                    const tmdbId = await getTmdbIdByName(sanitizedTmdbKey, tmdbType, title);
                    if (!tmdbId) return null;
                    const details = await getTmdbMovieDetails(sanitizedTmdbKey, tmdbId, tmdbType);
                    if (!details) return null;
                    return {
                        id: `tmdb:${tmdbId}`,
                        title: details.title || details.name || title,
                        poster: details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : null,
                        vote: details.vote_average || 0,
                        year: details.release_date || details.first_air_date ? (details.release_date || details.first_air_date).substring(0, 4) : ''
                    };
                }, { batchSize: 5, delayMs: 0 });

                const filteredResults = resolvedItems.filter(Boolean);

                return res.json({
                    name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null,
                    type: customType || (aiType === 'series' ? 'series' : 'movie'),
                    strategy: 'static_list',
                    static_items: aiFilters.static_items,
                    results: filteredResults,
                    items: filteredResults
                });
            }

            const aiType = customType === 'series' || aiFilters.target === 'kitsu' ? 'series' : 'movie';
            discoverType = aiType === 'series' ? 'tv' : 'movie';
            strategy = aiFilters.strategy || 'discovery';
            let originalAiKeywords = null;
            
            if (aiFilters.queries && Array.isArray(aiFilters.queries)) {
                // Process each query to resolve TMDB IDs and keyword names
                aiFilters.queries = await Promise.all(aiFilters.queries.map(async (q) => {
                    if (q.strategy === 'discovery') {
                        const qKeywords = q.keyword || null;
                        const tmdbParams = await buildDiscoveryParams(q, sanitizedTmdbKey, aiType, { kidsMode });
                        if (qKeywords) tmdbParams._keywordNames = qKeywords;
                        return tmdbParams;
                    }
                    return q;
                }));
                discoverFilters = aiFilters;
            } else {
                // Single query processing
                originalAiKeywords = aiFilters.keyword || null;
                discoverFilters = strategy === 'discovery'
                    ? await buildDiscoveryParams(aiFilters, sanitizedTmdbKey, aiType, { kidsMode })
                    : aiFilters;
                if (originalAiKeywords) discoverFilters._keywordNames = originalAiKeywords;
            }
        } else if (customFilters) {
            discoverType = customType === 'series' ? 'tv' : 'movie';
            discoverFilters = {};
            strategy = sanitizeString(String(customFilters?.presentation_strategy || customFilters?.strategy || 'discovery'));
            
            const allowedFilterKeys = [
                'provider', '_keywordNames',
                'strategy', 'presentation_strategy', 'similar_to', 'text_search',
                'sort_by', 'with_genres', 'with_keywords', 'with_cast', 'with_crew',
                'with_companies', 'with_original_language', 'vote_average.gte', 'vote_average.lte', 'vote_count.gte',
                'primary_release_date.gte', 'primary_release_date.lte',
                'first_air_date.gte', 'first_air_date.lte',
                'air_date.gte', 'air_date.lte',
                'without_genres', 'without_keywords',
                'with_runtime.gte', 'with_runtime.lte',
                'certification.lte', 'queries', 'items'
            ];
            
            for (const [key, value] of Object.entries(customFilters)) {
                if (allowedFilterKeys.includes(key) && value !== undefined && value !== '') {
                    if (key === 'queries' || key === 'items') {
                        discoverFilters[key] = value;
                    } else if (typeof value === 'string') {
                        discoverFilters[key] = sanitizeString(value);
                    } else if (typeof value === 'number') {
                        if (key === 'vote_average.gte' || key === 'vote_average.lte') {
                            discoverFilters[key] = Math.max(0, Math.min(10, Number(value) || 0));
                        } else if (key === 'vote_count.gte') {
                            discoverFilters[key] = Math.max(0, Math.floor(Number(value) || 0));
                        } else {
                            discoverFilters[key] = Number(value) || 0;
                        }
                    }
                }
            }
        } else {
            return res.status(400).json({ error: 'id, filters o prompt obbligatori' });
        }

        if (customFilters?.merge || discoverFilters?.queries) {
            try {
                const previewData = await catalogHandler(
                    {
                        type: discoverType === 'tv' ? 'series' : 'movie',
                        id: null,
                        filters: (discoverFilters && Object.keys(discoverFilters).length > 0) ? discoverFilters : customFilters,
                        extra: { skip: 0 }
                    },
                    fullUserConfig,
                    req.context?.hostUrl || `${req.protocol}://${req.get('host')}`
                );

                const items = (previewData.metas || []).slice(0, 20).map(item => ({
                    id: item.id,
                    title: item.name || '',
                    poster: item.poster || null,
                    vote: item.vote_average || item.imdbRating || 0,
                    year: item.releaseInfo || ''
                }));

                return res.json({
                    name: sanitizedPrompt ? sanitizedPrompt.substring(0, 50) : null,
                    type: discoverType,
                    filters: discoverFilters,
                    queries: aiFilters?.queries || discoverFilters?.queries || undefined,
                    presentation_strategy: strategy,
                    results: items
                });
            } catch (err) {
                console.error("Errore preview multi-query/merge:", err);
                return res.status(500).json({ error: 'Errore nel generare anteprima' });
            }
        }

        // --- SINGLE PREVIEW: Route through catalogHandler for consistency ---
        try {
            const singleQueryFilters = {
                queries: [
                    {
                        strategy: strategy,
                        ...discoverFilters
                    }
                ],
                presentation_strategy: 'popularity'
            };

            const previewData = await catalogHandler(
                {
                    type: discoverType === 'tv' ? 'series' : discoverType,
                    id: null,
                    filters: singleQueryFilters,
                    extra: { skip: 0 }
                },
                fullUserConfig,
                req.context?.hostUrl || `${req.protocol}://${req.get('host')}`
            );

            const items = (previewData.metas || []).slice(0, 20).map(item => ({
                id: item.id,
                title: item.name || '',
                poster: item.poster || null,
                vote: item.vote_average || item.imdbRating || 0,
                year: item.releaseInfo || ''
            }));
            // console.log(`[DEBUG-PREVIEW] Endpoint /preview-catalog hit with id=${id}. Resolved preset=${!!(id && id.startsWith('yaca_preset_'))}. Items mapped: ${items.length}`);
            if (items.length > 0) {
                // console.log(`[DEBUG-PREVIEW] First item: id=${items[0].id}, title="${items[0].title}", poster="${items[0].poster}"`);
            } else {
                // console.log(`[DEBUG-PREVIEW] singleQueryFilters was:`, JSON.stringify(singleQueryFilters));
                // console.log(`[DEBUG-PREVIEW] previewData.metas length:`, previewData.metas ? previewData.metas.length : 'undefined');
            }

            return res.json({
                items,
                results: items,
                filters: discoverFilters,
                type: discoverType,
                name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null
            });
        } catch (err) {
            console.error("Errore preview singola:", err);
            return res.status(500).json({ error: 'Errore nel recupero dati da TMDB' });
        }
    } catch (globalErr) {
        console.error("Errore critico in /preview-catalog:", globalErr);
        return res.status(500).json({ error: 'Errore interno del server' });
    }
});

module.exports = router;
