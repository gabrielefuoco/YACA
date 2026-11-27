const express = require('express');
const router = express.Router();
const { catalogHandler } = require('../stremio');
const { getPresets } = require('../catalog/presets');

const { sanitizeString } = require('../infra/helpers');

const PREVIEW_TIMEOUT_MS = 8000;
const MAX_PROMPT_LENGTH = 500;
const MAX_PREVIEW_CATALOG_NAME_LENGTH = 30;

const { createTmdbClient } = require('../clients/tmdb');
const tmdbClient = createTmdbClient();

router.post('/preview-catalog', async (req, res) => {
    try {
        const { id, type: customType, filters: customFilters, prompt, testo, tmdbKey, profileId: reqProfileId, userId: reqUserId } = req.body;
        
        const { chiaveEffettiva } = require('../configurazione');
        let reqTmdbKey = chiaveEffettiva({ richiesta: tmdbKey, servizio: 'tmdb' });
        let fullUserConfig = { apiKeys: { tmdb: reqTmdbKey } };

        // 1. Resolve User Config first to get API keys if not passed directly
        const token = req.cookies?.yaca_session;
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const { getJwtSecret } = require('./auth/index');
                const decoded = jwt.verify(token, getJwtSecret());
                if (decoded?.userId) {
                    const UserConfig = require('../models/UserConfig');
                    const u = await UserConfig.resolveUserConfig(decoded.userId);
                    if (u) {
                        reqTmdbKey = chiaveEffettiva({ account: u, richiesta: tmdbKey, servizio: 'tmdb' });
                        fullUserConfig = { ...u, apiKeys: { ...u.apiKeys, tmdb: reqTmdbKey } };
                    }
                }
            } catch (jwtErr) {
                // silently ignore auth errors in preview
            }
        }
        
        // If JWT didn't provide a userId, use the one from the request body
        if (!fullUserConfig.userId && reqUserId) {
            fullUserConfig.userId = reqUserId;
        }

        const sanitizedTmdbKey = String(reqTmdbKey || '').trim();
        let targetCatalogId = null;
        let discoverFilters = null;
        let discoverType = null;
        let strategy = null;
        let sanitizedPrompt = null;
        const { contestoDi } = require('../profile');
        const profileContext = await contestoDi({
            userId: fullUserConfig.userId,
            profileId: reqProfileId || fullUserConfig.activeProfileId,
            addonUuid: fullUserConfig.addonUuid
        });
        const activeProfileId = profileContext.profileId;
        
        // Imposta activeProfileId e context in fullUserConfig per catalogHandler
        fullUserConfig.activeProfileId = activeProfileId;
        fullUserConfig.context = profileContext;

        if (!sanitizedTmdbKey) {
            return res.status(400).json({ error: 'TMDB API key non configurata sul server' });
        }

        if (id && id.startsWith('yaca_preset_')) {
            const presetId = id.replace('yaca_preset_', '');
            targetCatalogId = presetId;
            const preset = getPresets().find(p => p.id === presetId);
            if (!preset) return res.status(404).json({ error: 'Preset non trovato' });
            
            discoverType = preset.type === 'series' ? 'tv' : 'movie';
            const firstQuery = Array.isArray(preset.queries) && preset.queries.length > 0
                ? preset.queries[0]
                : (preset.filters || {});
            const { strategy: queryStrategy, ...queryFilters } = firstQuery;
            discoverFilters = queryFilters;
            strategy = queryStrategy || 'discovery';
        } else if (prompt || testo) {
            // La frase scritta dall'utente **non passa da un modello**: è la sintassi della ricerca
            // (fetta 6). Stesso parser, stesso compilatore, stesso indice di Stremio — qui cambia
            // solo il consumatore, che mostra anche i motivi (in Stremio non c'è dove metterli).
            sanitizedPrompt = sanitizeString(String(testo || prompt)).substring(0, MAX_PROMPT_LENGTH);
            if (!sanitizedPrompt) {
                return res.status(400).json({ error: 'Testo non valido' });
            }

            const { compilaTesto } = require('../ricerca');

            const tipoRichiesta = customType === 'series' ? 'series' : 'movie';
            const esito = await compilaTesto({
                testo: sanitizedPrompt,
                type: tipoRichiesta,
                contesto: profileContext,
                // La stessa misura del catalogo servito a Stremio: l'anteprima deve mostrare
                // quello che l'utente vedrà davvero, non una versione ridotta a venti.
                cap: require('../config').CATALOG_PAGE_SIZE
            });

            const card = (item) => ({
                id: item.id,
                title: item.name || '',
                poster: item.poster || null,
                vote: item.vote_average || item.imdbRating || 0,
                year: item.releaseInfo ? String(item.releaseInfo).slice(0, 4) : '',
                _yacaMatch: item._yacaMatch
            });
            const results = esito.items.map(card);

            return res.json({
                name: sanitizedPrompt.slice(0, MAX_PREVIEW_CATALOG_NAME_LENGTH),
                type: tipoRichiesta,
                testo: sanitizedPrompt,
                intenti: esito.intenti,
                queries: esito.queries,
                motivi: esito.motivi,
                results,
                items: results
            });
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
                'certification.lte', 'queries', 'items', 'isAnime'
            ];
            
            for (const [key, value] of Object.entries(customFilters)) {
                if (allowedFilterKeys.includes(key) && value !== undefined && value !== '') {
                    if (key === 'queries' || key === 'items') {
                        discoverFilters[key] = value;
                    } else if (key === 'isAnime') {
                        discoverFilters[key] = value === true || value === 'true';
                    } else if (key === 'provider' && value === 'kitsu') {
                        discoverFilters[key] = 'tmdb';
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
            if (req.body.isAnime === true || req.body.isAnime === 'true') {
                discoverFilters.isAnime = true;
            }
        } else if (id) {
            targetCatalogId = id;
        } else {
            return res.status(400).json({ error: 'id, filters o prompt obbligatori' });
        }

        const isAnimeRequested = Boolean(discoverFilters?.isAnime || customFilters?.isAnime || req.body.isAnime);

        if (discoverFilters?.queries) {
            try {
                const previewFilters = (discoverFilters && Object.keys(discoverFilters).length > 0) ? discoverFilters : customFilters;
                if (isAnimeRequested && previewFilters && typeof previewFilters === 'object') {
                    previewFilters.isAnime = true;
                }
                const previewData = await catalogHandler(
                    {
                        type: discoverType === 'tv' ? 'series' : 'movie',
                        id: targetCatalogId,
                        filters: previewFilters,
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
                    year: item.releaseInfo || '',
                    _yacaMatch: item._yacaMatch
                }));

                return res.json({
                    name: sanitizedPrompt ? sanitizedPrompt.substring(0, 50) : null,
                    type: discoverType,
                    filters: discoverFilters,
                    queries: discoverFilters?.queries || undefined,
                    presentation_strategy: strategy,
                    isAnime: isAnimeRequested || undefined,
                    results: items
                });
            } catch (err) {
                console.error("Errore preview multi-query:", err);
                return res.status(500).json({ error: 'Errore nel generare anteprima' });
            }
        }

        // --- SINGLE PREVIEW: Route through catalogHandler for consistency ---
        try {
            const singleQueryFilters = {
                queries: [
                    {
                        strategy: strategy,
                        ...discoverFilters,
                        ...(isAnimeRequested ? { isAnime: true } : {})
                    }
                ],
                presentation_strategy: 'popularity',
                ...(isAnimeRequested ? { isAnime: true } : {})
            };

            const previewData = await catalogHandler(
                {
                    type: discoverType === 'tv' ? 'series' : 'movie',
                    id: targetCatalogId,
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
                year: item.releaseInfo || '',
                _yacaMatch: item._yacaMatch
            }));

            return res.json({
                items,
                filters: discoverFilters,
                type: discoverType,
                name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null,
                isAnime: isAnimeRequested || undefined
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
