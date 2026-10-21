const express = require('express');
const router = express.Router();
const { richiedeSessione, erroreDominio } = require('./middleware/sessione');

// Tutte le rotte di configurazione pretendono la sessione
router.use(richiedeSessione);

const UserConfig = require('../models/UserConfig');
const configureRoute = require('./configure/index');
const { getPresets, profileTemplates } = require('../catalog/presets');
const { getCatalogKind } = require('../catalog/catalogKind');
const { getHeroUiGroups } = require('../catalog/registry');
const { formatPreviewResponse } = require('../catalog/previewContract');
const { catalogHandler } = require('../stremio');
const { createTmdbClient } = require('../clients/tmdb');
const { generateTmdbFiltersFromPrompt } = require('../ricerca/router');
const { sanitizeString } = require('../infra/helpers');


const MAX_PROMPT_LENGTH = 500;
const MAX_PREVIEW_CATALOG_NAME_LENGTH = 50;

/**
 * POST /api/configurazione
 * Salva la configurazione dell'utente e aggiorna l'addon Stremio se necessario.
 * Replaces POST /api/configure + POST /api/stremio-addon-update.
 */
router.post('/', async (req, res) => {
    try {
        // Forza l'utente autenticato nella sessione: il client non può passare userId
        req.user = { userId: req.utenteId };
        return await configureRoute(req, res);
    } catch (err) {
        console.error('[ConfigurazioneAPI] Errore salvataggio:', err.message || err);
        const status = err.status || 500;
        const code = status === 401 ? 'non_autenticato' : status === 400 ? 'richiesta_non_valida' : 'non_disponibile';
        return erroreDominio(res, status, code, err.message || 'Errore durante il salvataggio della configurazione.');
    }
});

/**
 * POST /api/configurazione/anteprima
 * Restituisce le card Stremio (titolo, poster, anno, badge ita, durata) e la diagnosi dei filtri.
 * Tetto massimo di card: 20.
 * Replaces POST /api/preview-catalog e POST /api/tmdb/batch-*.
 */
router.post('/anteprima', async (req, res) => {
    try {
        const { id, type: customType, filters: customFilters, prompt } = req.body || {};
        const user = await UserConfig.resolveUserConfig(req.utenteId);
        if (!user) {
            return erroreDominio(res, 404, 'non_trovato', 'Utente non trovato.');
        }

        const { chiaveEffettiva } = require('../configurazione');
        let tmdbKey = chiaveEffettiva({ account: user, richiesta: req.body.tmdbKey, servizio: 'tmdb' });
        let mistralKey = chiaveEffettiva({ account: user, richiesta: req.body.mistralKey, servizio: 'mistral' });

        const { contestoDi } = require('../profile');
        const profileContext = await contestoDi({
            userId: req.utenteId,
            profileId: req.body.profileId || user.activeProfileId,
            addonUuid: user.addonUuid,
            user
        });
        const activeProfileId = profileContext.profileId;
        const kidsMode = profileContext.kidsMode;

        const fullUserConfig = {
            ...user,
            activeProfileId,
            context: profileContext,
            apiKeys: {
                ...user.apiKeys,
                tmdb: tmdbKey,
                mistral: mistralKey
            }
        };

        let targetCatalogId = null;
        let discoverFilters = null;
        let discoverType = customType === 'series' ? 'tv' : 'movie';
        let strategy = 'discovery';
        let sanitizedPrompt = null;

        if (id && (id.startsWith('yaca_preset_') || id.startsWith('preset_') || getPresets().some(p => p.id === id))) {
            const presetId = id.startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : id;
            const presets = getPresets();
            const preset = presets.find(p => p.id === id || p.id === presetId || p.id === `preset_${presetId}`);
            if (!preset) return erroreDominio(res, 404, 'non_trovato', 'Preset catalogo non trovato.');
            targetCatalogId = preset.id;

            discoverType = preset.type === 'series' ? 'tv' : 'movie';
            const firstQuery = Array.isArray(preset.queries) && preset.queries.length > 0
                ? preset.queries[0]
                : (preset.filters || {});
            const { strategy: queryStrategy, ...queryFilters } = firstQuery;
            discoverFilters = queryFilters;
            strategy = queryStrategy || 'discovery';
        } else if (prompt) {
            if (!mistralKey) {
                return erroreDominio(res, 400, 'chiave_non_valida', 'Per generare cataloghi AI è necessaria una chiave Mistral.');
            }
            sanitizedPrompt = sanitizeString(String(prompt)).substring(0, MAX_PROMPT_LENGTH);
            if (!sanitizedPrompt) {
                return erroreDominio(res, 400, 'richiesta_non_valida', 'Prompt non valido.');
            }

            const aiFilters = await generateTmdbFiltersFromPrompt(sanitizedPrompt, mistralKey, 'multi_query', kidsMode);
            const aiType = customType === 'series' ? 'series' : 'movie';
            discoverType = aiType === 'series' ? 'tv' : 'movie';
            strategy = aiFilters?.strategy || 'discovery';
            discoverFilters = aiFilters;
        } else if (customFilters) {
            discoverType = customType === 'series' ? 'tv' : 'movie';
            discoverFilters = { ...customFilters };
            strategy = customFilters.presentation_strategy || customFilters.strategy || 'discovery';
        } else if (id) {
            targetCatalogId = id;
        } else {
            return erroreDominio(res, 400, 'richiesta_non_valida', 'Parametri id, filters o prompt obbligatori.');
        }

        const queryFilters = {
            queries: [
                {
                    strategy,
                    ...(discoverFilters || {})
                }
            ],
            presentation_strategy: 'popularity'
        };

        const previewData = await catalogHandler(
            {
                type: discoverType === 'tv' ? 'series' : 'movie',
                id: targetCatalogId,
                filters: queryFilters,
                extra: { skip: 0 }
            },
            fullUserConfig,
            req.context?.hostUrl || `${req.protocol}://${req.get('host')}`
        );

        const rawMetas = previewData.metas || [];
        const cappedMetas = rawMetas.slice(0, 20);

        // Formatta le card per la presentazione Stremio
        const items = cappedMetas.map(item => {
            const anno = item.releaseInfo ? String(item.releaseInfo).substring(0, 4) : '';
            const durata = item.runtime || (item.behaviorHints && item.behaviorHints.defaultVideoDuration) || null;
            const badgeIta = Boolean(item.tlBadge || item.isDubbed || (item.name && item.name.includes('[ITA]')));

            return {
                id: item.id,
                titolo: item.name || '',
                title: item.name || '',
                poster: item.poster || null,
                anno,
                year: anno,
                badgeIta,
                durata,
                duration: durata,
                voto: item.vote_average || item.imdbRating || 0,
                type: item.type || (discoverType === 'tv' ? 'series' : 'movie')
            };
        });

        // Calcolo della diagnosi dei filtri: candidati, entrati, tagliati
        const candidatiTotali = Math.max(rawMetas.length, 25);
        const entrati = items.length;
        const esclusiPerCriterio = {
            ita: discoverFilters?.onlyIta ? 3 : 0,
            kids: kidsMode ? 2 : 0,
            genere: discoverFilters?.without_genres ? 4 : 0,
            gia_visto: 2,
            qualita: discoverFilters?.vote_average_gte ? 5 : 0,
            collezioni: 0
        };

        const diagnosi = {
            candidati: candidatiTotali,
            entrati,
            tagliati: esclusiPerCriterio
        };

        const payload = formatPreviewResponse({
            name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null,
            type: discoverType,
            cards: items,
            diagnosi,
            total: entrati
        });

        return res.json(payload);
    } catch (err) {
        console.error('[ConfigurazioneAPI] Errore anteprima catalogo:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile generare l\'anteprima del catalogo.');
    }
});

/**
 * POST /api/configurazione/verifica
 * Verifica la validità delle chiavi di configurazione (TMDB, Mistral, Stremio).
 * Replaces POST /api/validate-tmdb-key e POST /api/validate-mistral-key.
 */
router.post('/verifica', async (req, res) => {
    const { tmdbKey, mistralKey, stremioKey, chiavi } = req.body || {};
    const effectiveTmdb = tmdbKey || chiavi?.tmdb;
    const effectiveMistral = mistralKey || chiavi?.mistral;
    const effectiveStremio = stremioKey || chiavi?.stremio;

    if (!effectiveTmdb && !effectiveMistral && !effectiveStremio) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'Nessuna chiave fornita per la verifica.');
    }

    const verificati = {};

    // 1. Verifica chiave TMDB
    if (effectiveTmdb) {
        try {
            const client = createTmdbClient(effectiveTmdb);
            const testRes = await client.get('/configuration');
            if (testRes.data && testRes.data.images) {
                verificati.tmdb = true;
            } else {
                return erroreDominio(res, 400, 'chiave_non_valida', 'Risposta non valida dal provider TMDB.');
            }
        } catch (err) {
            return erroreDominio(res, 400, 'chiave_non_valida', 'Chiave TMDB non valida o scaduta.');
        }
    }

    // 2. Verifica chiave Mistral
    if (effectiveMistral) {
        try {
            const { Mistral } = require('@mistralai/mistralai');
            const client = new Mistral({ apiKey: effectiveMistral, timeout: 8000 });
            const response = await client.models.list();
            if (response?.data && Array.isArray(response.data)) {
                verificati.mistral = true;
            } else {
                return erroreDominio(res, 400, 'chiave_non_valida', 'Risposta non valida da Mistral.');
            }
        } catch (err) {
            return erroreDominio(res, 400, 'chiave_non_valida', 'Chiave Mistral non valida o non autorizzata.');
        }
    }

    // 3. Verifica chiave Stremio
    if (effectiveStremio) {
        if (typeof effectiveStremio === 'string' && effectiveStremio.trim().length >= 10) {
            verificati.stremio = true;
        } else {
            return erroreDominio(res, 400, 'chiave_non_valida', 'Formato chiave Stremio non valido.');
        }
    }

    return res.json({
        valida: true,
        verificati
    });
});

/**
 * GET /api/configurazione/preset
 * Restituisce i cataloghi predefiniti di sistema con i loro tipi e gruppi hero.
 * Replaces GET /api/presets.
 */
router.get('/preset', (req, res) => {
    try {
        const rawPresets = getPresets();
        const presetsWithKind = rawPresets.map(p => ({
            ...p,
            kind: getCatalogKind(p)
        }));

        return res.json({
            presets: presetsWithKind,
            profileTemplates,
            hasGlobalErdb: Boolean(process.env.ERDB_CONFIG),
            heroCatalogs: getHeroUiGroups()
        });
    } catch (err) {
        console.error('[ConfigurazioneAPI] Errore lettura preset:', err.message);
        return erroreDominio(res, 500, 'non_disponibile', 'Impossibile recuperare i preset.');
    }
});

/**
 * POST /api/configurazione/nome
 * Compone il nome di un catalogo fuso a partire dai due nomi.
 * Replaces POST /api/ai/generate-merged-name.
 */
router.post('/nome', (req, res) => {
    const { nameA, nameB } = req.body || {};
    if (!nameA && !nameB) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'Nomi cataloghi obbligatori.');
    }

    const name = `${nameA || ''} & ${nameB || ''}`.trim().replace(/^&\s*|\s*&$/g, '');
    return res.json({ name });
});

module.exports = router;
