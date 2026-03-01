const UserConfig = require('../models/UserConfig');
const { generateTmdbFiltersFromPrompt } = require('../ai/router');
const { getPresets } = require('../data/presets');
const { sanitizeString } = require('../utils/helpers');

const LIMITS = {
    MAX_PROFILES: 20,
    MAX_EXISTING_CATALOGS: 50,
    MAX_PRESETS: 50,
    MAX_AI_PROMPTS: 20,
    MAX_PROMPT_LENGTH: 500,
    MAX_KEY_LENGTH: 200,
    MAX_TOKEN_LENGTH: 500,
    MAX_PROFILE_NAME_LENGTH: 50,
    MAX_CATALOG_NAME_LENGTH: 50
};

module.exports = async (req, res) => {
    try {
        const { tmdbKey, mistralKey, activeProfileId, profiles } = req.body;
        const traktToken = req.body.traktToken || req.body.traktUsername;
        const traktRefreshToken = req.body.traktRefreshToken || null;
        const stremioAuthKey = req.body.stremioAuthKey || null;
        const stremioEmail = req.body.stremioEmail || null;

        if (!tmdbKey) {
            return res.status(400).json({ error: "La API Key di TMDB è obbligatoria." });
        }

        // Input validation - limiti ragionevoli
        if (typeof tmdbKey !== 'string' || tmdbKey.length > LIMITS.MAX_KEY_LENGTH) {
            return res.status(400).json({ error: "TMDB Key non valida." });
        }
        if (mistralKey && (typeof mistralKey !== 'string' || mistralKey.length > LIMITS.MAX_KEY_LENGTH)) {
            return res.status(400).json({ error: "Mistral Key non valida." });
        }
        if (traktToken && (typeof traktToken !== 'string' || traktToken.length > LIMITS.MAX_TOKEN_LENGTH)) {
            return res.status(400).json({ error: "Token Trakt non valido." });
        }
        if (traktRefreshToken && (typeof traktRefreshToken !== 'string' || traktRefreshToken.length > LIMITS.MAX_TOKEN_LENGTH)) {
            return res.status(400).json({ error: "Refresh Token Trakt non valido." });
        }
        if (stremioAuthKey && (typeof stremioAuthKey !== 'string' || stremioAuthKey.length > LIMITS.MAX_TOKEN_LENGTH)) {
            return res.status(400).json({ error: "Auth key Stremio non valida." });
        }
        if (stremioEmail && (typeof stremioEmail !== 'string' || stremioEmail.length > LIMITS.MAX_KEY_LENGTH)) {
            return res.status(400).json({ error: "Email Stremio non valida." });
        }
        if (profiles && (!Array.isArray(profiles) || profiles.length > LIMITS.MAX_PROFILES)) {
            return res.status(400).json({ error: "Massimo 20 profili consentiti." });
        }

        const parsedProfiles = [];
        let catIndex = 1;
        let needsMistral = false;

        // Validation for Mistral
        if (profiles && Array.isArray(profiles)) {
            for (const p of profiles) {
                if (p.newPrompts && p.newPrompts.some(pr => pr && pr.trim().length > 0)) needsMistral = true;
            }
        } else if (req.body.prompts && Array.isArray(req.body.prompts)) {
            if (req.body.prompts.some(pr => pr && pr.trim().length > 0)) needsMistral = true;
        }

        if (needsMistral && !mistralKey) {
            return res.status(400).json({ error: "Per i cataloghi IA dinamici serve la chiave API Mistral." });
        }

        // --- BACKWARD COMPATIBILITY / DEFAULT PROFILE MAPPING ---
        let inputProfiles = profiles || [];
        if (!profiles || profiles.length === 0) {
            // Retrocompatibilità con i vecchi payload 
            inputProfiles = [{
                id: 'default',
                name: 'Generale',
                selectedPresets: req.body.selectedPresets || [],
                existingCatalogs: [],
                newPrompts: req.body.prompts || []
            }];
        }

        // Ricalcola i preset con date dinamiche
        const presetsList = getPresets();

        // --- PROCESSING PROFILES ---
        for (const profile of inputProfiles) {
            const parsedCatalogs = [];

            // 1. Aggiungi Cataloghi AI Esistenti (se stiamo modificando) - con validazione
            if (profile.existingCatalogs && Array.isArray(profile.existingCatalogs)) {
                const safeCatalogs = profile.existingCatalogs.slice(0, LIMITS.MAX_EXISTING_CATALOGS).map(cat => {
                    if (!cat || typeof cat !== 'object') return null;
                    return {
                        id: String(cat.id || ''),
                        name: String(cat.name || '').substring(0, LIMITS.MAX_CATALOG_NAME_LENGTH),
                        type: cat.type === 'series' ? 'series' : 'movie',
                        filters: (typeof cat.filters === 'object' && cat.filters !== null) ? cat.filters : {},
                        ...(cat.raw_prompt ? { raw_prompt: String(cat.raw_prompt).substring(0, LIMITS.MAX_PROMPT_LENGTH) } : {})
                    };
                }).filter(Boolean);
                parsedCatalogs.push(...safeCatalogs);
            }

            // 2. Aggiungi i Preset Hardcoded (deduplicati) con possibili override utente
            const presetOverrides = (typeof profile.presetOverrides === 'object' && profile.presetOverrides !== null) ? profile.presetOverrides : {};
            if (profile.selectedPresets && Array.isArray(profile.selectedPresets)) {
                const seenPresets = new Set();
                for (const presetId of profile.selectedPresets.slice(0, LIMITS.MAX_PRESETS)) {
                    if (typeof presetId !== 'string') continue;
                    if (seenPresets.has(presetId)) continue;
                    seenPresets.add(presetId);
                    const presetObj = presetsList.find(p => p.id === presetId);
                    if (presetObj) {
                        // Merge base filters with user overrides
                        const userOverride = presetOverrides[presetId] || {};
                        const mergedFilters = { ...presetObj.filters };
                        // Apply filter overrides (skip internal keys starting with _)
                        for (const [key, value] of Object.entries(userOverride)) {
                            if (key.startsWith('_')) continue; // skip _name, _date_from, _date_to
                            mergedFilters[key] = value;
                        }
                        // Handle date overrides
                        if (userOverride['_date_from']) {
                            const dateKey = presetObj.type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
                            mergedFilters[dateKey] = userOverride['_date_from'];
                        }
                        if (userOverride['_date_to']) {
                            const dateKey = presetObj.type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
                            mergedFilters[dateKey] = userOverride['_date_to'];
                        }
                        const displayName = (userOverride._name && userOverride._name !== presetObj.name) ? userOverride._name : presetObj.name;
                        parsedCatalogs.push({
                            id: `yaca_preset_${presetId}`,
                            name: displayName,
                            type: presetObj.type,
                            filters: mergedFilters
                        });
                    }
                }
            }

            // 3. Processa i nuovi prompt usando Mistral (in parallelo, con resilienza)
            if (profile.newPrompts && Array.isArray(profile.newPrompts)) {
                const validPrompts = profile.newPrompts
                    .filter(p => typeof p === 'string' && p.trim() !== '')
                    .map(p => p.trim().substring(0, LIMITS.MAX_PROMPT_LENGTH))
                    .slice(0, LIMITS.MAX_AI_PROMPTS);
                const settledResults = await Promise.allSettled(
                    validPrompts.map(prompt => generateTmdbFiltersFromPrompt(prompt, mistralKey))
                );

                for (let i = 0; i < validPrompts.length; i++) {
                    const prompt = validPrompts[i];
                    const result = settledResults[i];

                    // Salta i prompt falliti o con risultati non validi
                    if (result.status !== 'fulfilled') {
                        console.warn(`Generazione AI fallita per il prompt: "${prompt}"`, result.reason);
                        continue;
                    }
                    const filters = result.value;
                    if (!filters || typeof filters !== 'object') {
                        console.warn(`Risposta AI non valida per il prompt: "${prompt}"`);
                        continue;
                    }

                    // Detect type from prompt and AI response
                    let catalogType = 'movie';
                    const lowerPrompt = prompt.toLowerCase();
                    if (filters.target === 'kitsu') {
                        catalogType = 'series';
                    } else {
                        const seriesPatterns = ['serie tv', 'serie ', 'series', 'tv show', 'show tv', 'sitcom', 'anime', 'k-drama', 'kdrama', 'docuserie', 'miniserie', 'telefilm'];
                        if (seriesPatterns.some(kw => lowerPrompt.includes(kw))) {
                            catalogType = 'series';
                        }
                    }
                    parsedCatalogs.push({
                        id: `ai_custom_${Date.now()}_${catIndex}`,
                        name: sanitizeString(prompt.substring(0, 30)),
                        raw_prompt: prompt,
                        type: catalogType,
                        filters: filters
                    });
                    catIndex++;
                }
            }

            const profileName = sanitizeString((typeof profile.name === 'string' ? profile.name.trim() : '') || 'Nuovo Profilo');
            const minVoteAverage = parseFloat(profile.settings?.minVoteAverage);
            const minVoteCount = parseInt(profile.settings?.minVoteCount, 10);
            const fastPresetRefresh = Boolean(profile.settings?.fastPresetRefresh);

            // Apply catalogOrder if provided: reorder parsedCatalogs according to the user-defined order
            const catalogOrder = Array.isArray(profile.catalogOrder) ? profile.catalogOrder : [];
            if (catalogOrder.length > 0) {
                const orderMap = new Map(catalogOrder.map((id, i) => [id, i]));
                parsedCatalogs.sort((a, b) => {
                    const aOrd = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
                    const bOrd = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
                    return aOrd - bOrd;
                });
            }

            parsedProfiles.push({
                id: profile.id || `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: profileName.substring(0, LIMITS.MAX_PROFILE_NAME_LENGTH),
                catalogs: parsedCatalogs,
                settings: {
                    minVoteAverage: Number.isFinite(minVoteAverage) ? minVoteAverage : 0,
                    minVoteCount: Number.isFinite(minVoteCount) ? minVoteCount : 0,
                    fastPresetRefresh
                },
                raw_ui_state: { // Salva lo stato UI grezzo per ripopolare i form facilmente
                    selectedPresets: profile.selectedPresets || [],
                    presetOverrides: presetOverrides,
                    prompts: parsedCatalogs.filter(c => c.raw_prompt).map(c => c.raw_prompt),
                    catalogOrder: catalogOrder
                }
            });
        }

        // Verifica che activeProfileId punti a un profilo esistente
        const profileIds = new Set(parsedProfiles.map(p => p.id));
        const finalActiveProfileId = (activeProfileId && profileIds.has(activeProfileId))
            ? activeProfileId
            : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);

        // 4. Costruisci la configurazione e codificala in Base64
        const { configBase64, configVersion } = UserConfig.buildConfig({
            apiKeys: {
                tmdb: tmdbKey,
                mistral: mistralKey,
                trakt: traktToken || null,
                traktRefreshToken: traktRefreshToken || null,
                stremioAuthKey: stremioAuthKey || null,
                stremioEmail: stremioEmail || null
            },
            catalogs: parsedProfiles[0]?.catalogs || [],
            profiles: parsedProfiles,
            activeProfileId: finalActiveProfileId
        });

        res.json({ success: true, configBase64, configVersion });

    } catch (err) {
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio. Riprova." });
    }
};
