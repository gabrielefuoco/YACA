const UserConfig = require('../models/UserConfig');
const UserList = require('../db/models/UserList');
const { nanoid } = require('nanoid');
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
        const { activeProfileId, profiles, userId: existingUserId } = req.body;
        // Server-side env vars take priority; request body keys kept for backward compatibility
        const tmdbKey = process.env.TMDB_API_KEY || req.body.tmdbKey;
        const mistralKey = process.env.MISTRAL_API_KEY || req.body.mistralKey;
        const traktToken = req.body.traktToken || req.body.traktUsername;
        const traktRefreshToken = req.body.traktRefreshToken || null;
        const mdblistKey = req.body.mdblistKey || null;
        const stremioAuthKey = req.body.stremioAuthKey || null;
        const stremioEmail = req.body.stremioEmail || null;

        if (!tmdbKey) {
            return res.status(400).json({ error: "TMDB API key non configurata sul server." });
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
            return res.status(400).json({ error: "Chiave Mistral non configurata sul server. Contattare l'amministratore." });
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

        const finalUserId = existingUserId || nanoid(10);

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
                        type: cat.type === 'series' ? 'series' : 'movie'
                    };
                }).filter(Boolean);
                parsedCatalogs.push(...safeCatalogs);
            }

            // 2. Aggiungi i Preset Hardcoded
            const presetOverrides = (typeof profile.presetOverrides === 'object' && profile.presetOverrides !== null) ? profile.presetOverrides : {};
            if (profile.selectedPresets && Array.isArray(profile.selectedPresets)) {
                for (const presetId of profile.selectedPresets.slice(0, LIMITS.MAX_PRESETS)) {
                    if (typeof presetId !== 'string') continue;
                    const presetObj = presetsList.find(p => p.id === presetId);
                    if (presetObj) {
                        const userOverride = presetOverrides[presetId] || {};
                        const displayName = (userOverride._name && userOverride._name !== presetObj.name) ? userOverride._name : presetObj.name;
                        parsedCatalogs.push({
                            id: `yaca_preset_${presetId}`,
                            name: displayName,
                            type: presetObj.type
                        });
                    }
                }
            }

            // 3. Processa i nuovi prompt usando Mistral
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
                    if (result.status !== 'fulfilled') continue;

                    const filters = result.value;
                    if (!filters || typeof filters !== 'object') continue;

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

                    const listId = `ai_custom_${Date.now()}_${catIndex}`;
                    const listName = sanitizeString(prompt.substring(0, 30)) || 'Lista AI';

                    try {
                        await UserList.findOneAndUpdate(
                            { listId },
                            {
                                owner: finalUserId,
                                listId: listId,
                                name: listName,
                                type: catalogType,
                                sourceType: 'ai_prompt',
                                filters: filters,
                                rawPrompt: prompt
                            },
                            { upsert: true, returnDocument: 'after' }
                        );
                    } catch (err) {
                        console.error("Errore salvataggio UserList per prompt AI:", err.message);
                    }

                    parsedCatalogs.push({
                        id: listId,
                        name: listName,
                        type: catalogType
                    });
                    catIndex++;
                }
            }

            const requestedOrder = Array.isArray(profile.catalogOrder) ? profile.catalogOrder.map(String) : [];
            if (requestedOrder.length > 0 && parsedCatalogs.length > 1) {
                const orderMap = new Map(requestedOrder.map((catalogId, index) => [catalogId, index]));
                const normalizeCatalogId = (catalogId) => {
                    const strId = String(catalogId || '');
                    return strId.startsWith('yaca_preset_') ? strId.replace('yaca_preset_', '') : strId;
                };
                parsedCatalogs.sort((a, b) => {
                    const aOrder = orderMap.get(normalizeCatalogId(a.id)) ?? Number.MAX_SAFE_INTEGER;
                    const bOrder = orderMap.get(normalizeCatalogId(b.id)) ?? Number.MAX_SAFE_INTEGER;
                    return aOrder - bOrder;
                });
            }

            const profileName = sanitizeString((typeof profile.name === 'string' ? profile.name.trim() : '') || 'Nuovo Profilo');
            const minVoteAverage = parseFloat(profile.settings?.minVoteAverage);
            const minVoteCount = parseInt(profile.settings?.minVoteCount, 10);
            const fastPresetRefresh = Boolean(profile.settings?.fastPresetRefresh);
            const manualDNA = Array.isArray(profile.settings?.manualDNA) ? profile.settings.manualDNA : [];
            const suggestedDNA = Array.isArray(profile.settings?.suggestedDNA) ? profile.settings.suggestedDNA : [];

            // Se suggestedDNA è vuoto e manualDNA è vuoto, proviamo a recuperare quelli vecchi per compatibilità di migrazione (opzionale)
            // userProfile.settings = { ... }
            if (manualDNA.length === 0 && Array.isArray(profile.settings?.manualPillars)) {
                // manualDNA.push(...profile.settings.manualPillars);
            }

            parsedProfiles.push({
                id: profile.id || `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                name: profileName.substring(0, LIMITS.MAX_PROFILE_NAME_LENGTH),
                catalogs: parsedCatalogs,
                raw_ui_state: {
                    selectedPresets: profile.selectedPresets || [],
                    presetOverrides: profile.presetOverrides || {},
                    catalogOrder: profile.catalogOrder || [],
                    newPrompts: profile.newPrompts || []
                },
                settings: {
                    minVoteAverage: Number.isFinite(minVoteAverage) ? minVoteAverage : 0,
                    minVoteCount: Number.isFinite(minVoteCount) ? minVoteCount : 0,
                    fastPresetRefresh,
                    manualDNA,
                    suggestedDNA
                }
            });
        }

        const finalActiveProfileId = (activeProfileId && parsedProfiles.some(p => p.id === activeProfileId))
            ? activeProfileId
            : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null);

        const configVersion = Date.now().toString(36);

        // 4. PERSISTENZA MONGODB (New Stateful Flow)
        const userDoc = await UserConfig.saveUser({
            userId: finalUserId,
            apiKeys: {
                tmdb: tmdbKey,
                mistral: mistralKey,
                trakt: traktToken || null,
                traktRefreshToken: traktRefreshToken || null,
                mdblist: mdblistKey || null,
                stremio: stremioAuthKey || null
            },
            config: {
                activeProfileId: finalActiveProfileId,
                configVersion: configVersion
            },
            profiles: parsedProfiles,
            email: stremioEmail
        });

        // 5. Costruisci URL Manifest Stateful
        const hostUrl = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
        const manifestUrl = `${hostUrl}/${userDoc.userId}/${configVersion}/manifest.json`;

        res.json({
            success: true,
            userId: userDoc.userId,
            manifestUrl,
            configVersion
        });

    } catch (err) {
        console.error("Errore salvataggio config:", err);
        res.status(500).json({ error: "Errore interno durante il salvataggio. Riprova." });
    }
};
