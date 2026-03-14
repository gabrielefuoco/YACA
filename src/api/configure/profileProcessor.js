const { getPresets } = require('../../data/presets');
const { sanitizeString } = require('../../utils/helpers');
const { generateTmdbFiltersFromPrompt } = require('../../ai/router');
const UserList = require('../../db/models/UserList');
const { LIMITS } = require('./validators');

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

function splitOrIds(value) {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    if (value === null || value === undefined) return [];
    return String(value).split(/[|,]/).map(v => v.trim()).filter(Boolean);
}

function buildSuggestedDNAFromPresets(selectedPresets = [], presetsList = []) {
    const genreCounts = new Map();
    const keywordCounts = new Map();

    const collectPresetFilters = (preset) => {
        if (preset?.filters && typeof preset.filters === 'object') return [preset.filters];
        if (Array.isArray(preset?.queries)) return preset.queries.filter((query) => query && typeof query === 'object');
        return [];
    };

    for (const presetId of selectedPresets) {
        const preset = presetsList.find(p => p.id === presetId);
        const filterBlocks = collectPresetFilters(preset);
        if (filterBlocks.length === 0) continue;

        for (const filters of filterBlocks) {
            for (const gid of splitOrIds(filters.with_genres || filters.genre_ids)) {
                genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
            }
            for (const kid of splitOrIds(filters.with_keywords || filters.keyword)) {
                keywordCounts.set(kid, (keywordCounts.get(kid) || 0) + 1);
            }
        }
    }

    const mapToDNA = (counts, names, type) => Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => ({ id: String(id), type, name: names[String(id)] || `${type} ${id}` }));

    return [...mapToDNA(genreCounts, GENRE_NAMES, 'genre'), ...mapToDNA(keywordCounts, KEYWORD_NAMES, 'keyword')];
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
            suggestedDNA: []
        }
    };
}

async function processProfiles(inputProfiles, finalUserId, mistralKey, warnings) {
    const presetsList = getPresets();
    const parsedProfiles = [];
    let catIndex = 1;

    for (const profile of inputProfiles) {
        const isGlobalProfile = profile.id === 'global';
        const parsedCatalogs = [];

        // 1. Existing Catalogs
        if (Array.isArray(profile.existingCatalogs)) {
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

                parsedCatalogs.push({
                    id: catId,
                    name: String(cat.name || '').substring(0, LIMITS.MAX_CATALOG_NAME_LENGTH),
                    type: cat.type === 'series' ? 'series' : 'movie',
                    filters: cat.filters
                });
            }
        }

        // 2. Presets
        const presetOverrides = profile.presetOverrides || {};
        if (Array.isArray(profile.selectedPresets)) {
            for (const presetId of profile.selectedPresets.slice(0, LIMITS.MAX_PRESETS)) {
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

        // 3. AI Prompts
        if (Array.isArray(profile.newPrompts)) {
            const validPrompts = profile.newPrompts
                .filter(p => typeof p === 'string' && p.trim() !== '')
                .map(p => p.trim().substring(0, LIMITS.MAX_PROMPT_LENGTH))
                .slice(0, LIMITS.MAX_AI_PROMPTS);

            if (validPrompts.length > 0 && !mistralKey) {
                throw { status: 403, message: "Per generare cataloghi AI è necessaria una chiave Mistral personale." };
            }

            const settledResults = await Promise.allSettled(
                validPrompts.map(prompt => generateTmdbFiltersFromPrompt(prompt, mistralKey, false, 'multi_query'))
            );

            for (let i = 0; i < validPrompts.length; i++) {
                const prompt = validPrompts[i];
                const result = settledResults[i];
                if (result.status !== 'fulfilled') {
                    warnings.push({ type: 'ai_generation_failed', profileId: profile.id, prompt, message: result.reason?.message });
                    continue;
                }

                const filters = result.value;
                if (!filters) continue;

                const listId = `ai_custom_${Date.now()}_${catIndex++}`;
                const listName = sanitizeString(prompt.substring(0, 30)) || 'Lista AI';
                
                let catalogType = 'movie';
                const lowerPrompt = prompt.toLowerCase();
                const seriesPatterns = ['serie tv', 'serie ', 'series', 'tv show', 'sitcom', 'anime', 'k-drama', 'miniserie'];
                if (seriesPatterns.some(kw => lowerPrompt.includes(kw)) || filters.queries?.[0]?.target === 'kitsu') {
                    catalogType = 'series';
                }

                await UserList.findOneAndUpdate(
                    { listId },
                    {
                        owner: finalUserId,
                        listId,
                        name: listName,
                        type: catalogType,
                        sourceType: 'ai_prompt',
                        filters: filters.queries ? undefined : filters,
                        queries: filters.queries || undefined,
                        presentation_strategy: filters.queries ? 'interleave' : 'popularity',
                        rawPrompt: prompt
                    },
                    { upsert: true }
                );

                parsedCatalogs.push({ id: listId, name: listName, type: catalogType });
            }
        }

        // 4. Sorting
        const requestedOrder = Array.isArray(profile.catalogOrder) ? profile.catalogOrder.map(String) : [];
        if (requestedOrder.length > 1 && parsedCatalogs.length > 1) {
            const orderMap = new Map(requestedOrder.map((id, idx) => [id, idx]));
            parsedCatalogs.sort((a, b) => {
                const aId = a.id.startsWith('yaca_preset_') ? a.id.replace('yaca_preset_', '') : a.id;
                const bId = b.id.startsWith('yaca_preset_') ? b.id.replace('yaca_preset_', '') : b.id;
                return (orderMap.get(aId) ?? 999) - (orderMap.get(bId) ?? 999);
            });
        }

        const manualDNA = isGlobalProfile ? [] : (profile.settings?.manualDNA || []);
        const suggestedDNA = isGlobalProfile ? [] : buildSuggestedDNAFromPresets(profile.selectedPresets || [], presetsList)
            .filter(item => !manualDNA.some(m => String(m.id) === String(item.id) && m.type === item.type));

        parsedProfiles.push({
            id: isGlobalProfile ? 'global' : (profile.id || `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`),
            name: sanitizeString(profile.name || 'Nuovo Profilo').substring(0, LIMITS.MAX_PROFILE_NAME_LENGTH),
            catalogs: parsedCatalogs,
            raw_ui_state: {
                selectedPresets: profile.selectedPresets || [],
                presetOverrides: profile.presetOverrides || {},
                catalogOrder: profile.catalogOrder || [],
                newPrompts: profile.newPrompts || []
            },
            settings: {
                minVoteAverage: parseFloat(profile.settings?.minVoteAverage) || 0,
                minVoteCount: parseInt(profile.settings?.minVoteCount) || 0,
                fastPresetRefresh: !!profile.settings?.fastPresetRefresh,
                manualDNA,
                suggestedDNA
            }
        });
    }

    return parsedProfiles;
}

module.exports = {
    processProfiles,
    createGlobalProfileInput
};
