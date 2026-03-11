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

function splitOrIds(value) {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    if (value === null || value === undefined) return [];
    return String(value).split(/[|,]/).map(v => v.trim()).filter(Boolean);
}

const GENRE_NAMES = {
    '28': 'Azione', '12': 'Avventura', '16': 'Animazione', '35': 'Commedia',
    '80': 'Crimine', '99': 'Documentario', '18': 'Dramma', '10751': 'Famiglia',
    '14': 'Fantasy', '36': 'Storia', '27': 'Horror', '10402': 'Musica',
    '9648': 'Mistero', '10749': 'Romance', '878': 'Fantascienza',
    '10770': 'Film TV', '53': 'Thriller', '10752': 'Guerra', '37': 'Western',
    '10759': 'Action & Adventure', '10762': 'Kids', '10763': 'News',
    '10764': 'Reality', '10765': 'Sci-Fi & Fantasy', '10766': 'Soap',
    '10767': 'Talk', '10768': 'War & Politics'
};

const KEYWORD_NAMES = {
    '210024': 'Anime', '158436': 'Marvel', '9715': 'Supereroi',
    '4344': 'Spazio', '10683': 'Sopravvivenza', '256735': 'Graphic Novel'
};

function buildSuggestedDNAFromPresets(selectedPresets = [], presetsList = []) {
    const genreCounts = new Map();
    const keywordCounts = new Map();

    for (const presetId of selectedPresets) {
        const preset = presetsList.find(p => p.id === presetId);
        if (!preset?.filters || typeof preset.filters !== 'object') continue;

        for (const gid of splitOrIds(preset.filters.with_genres)) {
            genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
        }
        for (const gid of splitOrIds(preset.filters.genre_ids)) {
            genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
        }
        for (const kid of splitOrIds(preset.filters.with_keywords)) {
            keywordCounts.set(kid, (keywordCounts.get(kid) || 0) + 1);
        }
        for (const kid of splitOrIds(preset.filters.keyword)) {
            keywordCounts.set(kid, (keywordCounts.get(kid) || 0) + 1);
        }
    }

    const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => ({ id: String(id), type: 'genre', name: GENRE_NAMES[String(id)] || `Genre ${id}` }));

    const topKeywords = Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => ({ id: String(id), type: 'keyword', name: KEYWORD_NAMES[String(id)] || `Keyword ${id}` }));

    return [...topGenres, ...topKeywords];
}

function createGlobalProfileInput() {
    return {
        id: 'global',
        name: 'Generale',
        selectedPresets: [],
        existingCatalogs: [],
        newPrompts: [],
        presetOverrides: {},
        catalogOrder: [],
        settings: {
            minVoteAverage: 0,
            minVoteCount: 0,
            fastPresetRefresh: false,
            manualDNA: [],
            suggestedDNA: [],
            pendingDNASuggestions: []
        }
    };
}

module.exports = async (req, res) => {
    try {
        const { activeProfileId, profiles, userId: existingUserId } = req.body;
        // Server-side env vars fallback; request body keys take priority for crowdsourced sync
        const personalTmdbKey = req.body.tmdbKey || null;
        const personalMistralKey = req.body.mistralKey || null;
        
        const effectiveTmdbKey = personalTmdbKey || process.env.TMDB_API_KEY;
        const effectiveMistralKey = personalMistralKey || process.env.MISTRAL_API_KEY;
        const traktToken = req.body.traktToken || req.body.traktUsername;
        const traktRefreshToken = req.body.traktRefreshToken || null;
        const mdblistKey = req.body.mdblistKey || null;
        const stremioAuthKey = req.body.stremioAuthKey || null;
        const stremioEmail = req.body.stremioEmail || req.body.email || null;
        const stremioPassword = req.body.stremioPassword || null;

        if (!effectiveTmdbKey) {
            return res.status(400).json({ error: "TMDB API key non configurata sul server o mancante." });
        }

        if (personalTmdbKey && (typeof personalTmdbKey !== 'string' || personalTmdbKey.length > LIMITS.MAX_KEY_LENGTH)) {
            return res.status(400).json({ error: "TMDB Key non valida." });
        }
        if (personalMistralKey && (typeof personalMistralKey !== 'string' || personalMistralKey.length > LIMITS.MAX_KEY_LENGTH)) {
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

        if (needsMistral && !effectiveMistralKey) {
            return res.status(400).json({ error: "Chiave Mistral non configurata sul server. Contattare l'amministratore o inserirne una personale." });
        }

        // --- BACKWARD COMPATIBILITY / DEFAULT PROFILE MAPPING ---
        let inputProfiles = profiles || [];
        if (!profiles || profiles.length === 0) {
            // Retrocompatibilità con i vecchi payload 
            inputProfiles = [{
                id: 'global',
                name: 'Generale',
                selectedPresets: req.body.selectedPresets || [],
                existingCatalogs: [],
                newPrompts: req.body.prompts || []
            }];
        }

        const hasGlobalProfile = inputProfiles.some((p) => p && p.id === 'global');
        if (!hasGlobalProfile) {
            inputProfiles = [createGlobalProfileInput(), ...inputProfiles];
        }

        // Ricalcola i preset con date dinamiche
        const presetsList = getPresets();

        const finalUserId = existingUserId || nanoid(10);

        // --- PROCESSING PROFILES ---
        for (const profile of inputProfiles) {
            const isGlobalProfile = profile.id === 'global';
            const parsedCatalogs = [];

            // 1. Aggiungi Cataloghi AI Esistenti (se stiamo modificando) - con validazione
            if (profile.existingCatalogs && Array.isArray(profile.existingCatalogs)) {
                const safeCatalogs = [];
                for (const cat of profile.existingCatalogs.slice(0, LIMITS.MAX_EXISTING_CATALOGS)) {
                    if (!cat || typeof cat !== 'object') continue;
                    const catId = String(cat.id || '');
                    const isMerge = catId.startsWith('merged_') || cat.filters?.merge;

                    if (isMerge && cat.filters) {
                        try {
                            const mergeConfig = cat.filters.merge || {};
                            await UserList.findOneAndUpdate(
                                { listId: catId },
                                {
                                    owner: finalUserId,
                                    listId: catId,
                                    name: String(cat.name || '').substring(0, LIMITS.MAX_CATALOG_NAME_LENGTH),
                                    type: cat.type === 'series' ? 'series' : 'movie',
                                    sourceType: 'merged',
                                    filters: cat.filters,
                                    mergedFrom: mergeConfig.catalogs || [],
                                    presentation_strategy: mergeConfig.strategy === 'interleave' ? 'interleave' : 'popularity'
                                },
                                { upsert: true }
                            );
                        } catch (err) {
                            console.error("Errore salvataggio UserList per merged catalog:", err.message);
                        }
                    }

                    safeCatalogs.push({
                        id: catId,
                        name: String(cat.name || '').substring(0, LIMITS.MAX_CATALOG_NAME_LENGTH),
                        type: cat.type === 'series' ? 'series' : 'movie',
                        filters: cat.filters
                    });
                }
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
                    validPrompts.map(prompt => generateTmdbFiltersFromPrompt(prompt, mistralKey, false, 'multi_query'))
                );

                for (let i = 0; i < validPrompts.length; i++) {
                    const prompt = validPrompts[i];
                    const result = settledResults[i];
                    if (result.status !== 'fulfilled') continue;

                    const filters = result.value;
                    if (!filters || typeof filters !== 'object') continue;

                    let catalogType = 'movie';
                    const lowerPrompt = prompt.toLowerCase();
                    const firstQuery = filters.queries?.[0] || filters;
                    if (firstQuery.target === 'kitsu') {
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
                                filters: filters.queries ? undefined : filters,
                                queries: filters.queries || undefined,
                                presentation_strategy: filters.queries ? 'interleave' : 'popularity',
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

            const profileName = isGlobalProfile
                ? 'Generale'
                : sanitizeString((typeof profile.name === 'string' ? profile.name.trim() : '') || 'Nuovo Profilo');
            const minVoteAverage = parseFloat(profile.settings?.minVoteAverage);
            const minVoteCount = parseInt(profile.settings?.minVoteCount, 10);
            const fastPresetRefresh = Boolean(profile.settings?.fastPresetRefresh);
            const manualDNA = isGlobalProfile ? [] : (Array.isArray(profile.settings?.manualDNA) ? profile.settings.manualDNA : []);
            const suggestedDNA = isGlobalProfile ? [] : buildSuggestedDNAFromPresets(profile.selectedPresets || [], presetsList)
                .filter((item) => {
                    if (!item || !item.id || !item.type || !item.name) return false;
                    return !manualDNA.some((m) => String(m.id) === String(item.id) && m.type === item.type);
                })
                .reduce((acc, item) => {
                    if (acc.some((existing) => String(existing.id) === String(item.id) && existing.type === item.type)) return acc;
                    acc.push({ id: String(item.id), type: item.type, name: String(item.name) });
                    return acc;
                }, []);

            // Se suggestedDNA è vuoto e manualDNA è vuoto, proviamo a recuperare quelli vecchi per compatibilità di migrazione (opzionale)
            // userProfile.settings = { ... }
            if (manualDNA.length === 0 && Array.isArray(profile.settings?.manualPillars)) {
                // manualDNA.push(...profile.settings.manualPillars);
            }

            parsedProfiles.push({
                id: isGlobalProfile ? 'global' : (profile.id || `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`),
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
                    suggestedDNA,
                    pendingDNASuggestions: Array.isArray(profile.settings?.pendingDNASuggestions)
                        ? profile.settings.pendingDNASuggestions
                        : []
                }
            });
        }

        const finalActiveProfileId = (activeProfileId && parsedProfiles.some(p => p.id === activeProfileId))
            ? activeProfileId
            : (parsedProfiles.some((p) => p.id === 'global') ? 'global' : (parsedProfiles.length > 0 ? parsedProfiles[0].id : null));

        const configVersion = Date.now().toString(36);

        // 4. PERSISTENZA MONGODB (New Stateful Flow)
        const userDoc = await UserConfig.saveUser({
            userId: finalUserId,
            apiKeys: {
                tmdb: personalTmdbKey,
                mistral: personalMistralKey,
                trakt: traktToken || null,
                traktRefreshToken: traktRefreshToken || null,
                mdblist: mdblistKey || null,
                stremio: stremioAuthKey || null,
                stremioPass: stremioPassword || null
            },
            config: {
                activeProfileId: finalActiveProfileId,
                configVersion: configVersion
            },
            profiles: parsedProfiles,
            email: stremioEmail
        });

        // 4.1. CLEANUP: Delete UserLists (AI/Manual) no longer referenced by any profile
        try {
            const allReferencedIds = new Set();
            for (const profile of parsedProfiles) {
                if (profile.catalogs) {
                    for (const cat of profile.catalogs) {
                        if (cat.id) allReferencedIds.add(String(cat.id));
                    }
                }
            }

            // Only cleanup lists that are purely dynamic/transient (AI prompt or manual filter)
            // AND belong to this user AND are not in use by any profile
            await UserList.deleteMany({
                owner: finalUserId,
                sourceType: { $in: ['ai_prompt', 'manual_filter'] },
                listId: { $nin: Array.from(allReferencedIds) }
            });
        } catch (cleanupErr) {
            console.warn("[Cleanup] Error deleting unreferenced UserLists:", cleanupErr.message);
        }

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

module.exports.buildSuggestedDNAFromPresets = buildSuggestedDNAFromPresets;
