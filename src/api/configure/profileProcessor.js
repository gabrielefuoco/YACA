const { nanoid } = require('nanoid');
const { getPresets } = require('../../data/presets');
const TasteProfile = require('../../models/TasteProfile');
const { extractStaticDNAFromQueries } = require('../../utils/dnaExtractor');

/**
 * TMDB genre ID → Italian name lookup.
 * Used to resolve known genre IDs when building suggestedDNA from presets.
 */
const GENRE_ID_TO_NAME = {
    '28': 'Azione', '12': 'Avventura', '16': 'Animazione', '35': 'Commedia',
    '80': 'Crime', '99': 'Documentario', '18': 'Dramma', '10751': 'Famiglia',
    '14': 'Fantasy', '36': 'Storia', '27': 'Horror', '10402': 'Musica',
    '9648': 'Mistero', '10749': 'Romance', '878': 'Fantascienza',
    '53': 'Thriller', '10752': 'Guerra', '37': 'Western',
    '10759': 'Azione & Avventura', '10762': 'Kids', '10763': 'News',
    '10764': 'Reality', '10765': 'Sci-Fi & Fantasy', '10766': 'Soap',
    '10767': 'Talk', '10768': 'War & Politics', '10770': 'Film TV'
};

/**
 * Splits a pipe- or comma-separated ID string, or returns array values as strings.
 * @param {string|Array|null} value
 * @returns {string[]}
 */
function splitOrIds(value) {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    if (value === null || value === undefined) return [];
    return String(value).split(/[|,]/).map(v => v.trim()).filter(Boolean);
}

/**
 * Extracts suggested DNA entries (genres + keywords) from active presets.
 * Handles both traditional TMDB filters (with_genres, with_keywords) and
 * AI-style filters (genre_ids arrays, keyword comma-separated strings).
 * Resolves known genre IDs to Italian names.
 *
 * @param {string[]} selectedPresets - Active preset IDs
 * @param {Array} presetsList - All available presets
 * @returns {Array<{id: string, type: string, name: string}>}
 */
function buildSuggestedDNAFromPresets(selectedPresets = [], presetsList = []) {
    const genreCounts = new Map();
    const keywordCounts = new Map();

    for (const presetId of selectedPresets) {
        const preset = presetsList.find(p => p.id === presetId);
        if (!preset?.filters || typeof preset.filters !== 'object') continue;

        // Traditional TMDB filters: with_genres / with_keywords (pipe/comma-separated)
        for (const gid of splitOrIds(preset.filters.with_genres)) {
            genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
        }
        for (const kid of splitOrIds(preset.filters.with_keywords)) {
            keywordCounts.set(kid, (keywordCounts.get(kid) || 0) + 1);
        }

        // AI-style filters: genre_ids (array), keyword (comma-separated string)
        for (const gid of splitOrIds(preset.filters.genre_ids)) {
            genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
        }
        for (const kid of splitOrIds(preset.filters.keyword)) {
            keywordCounts.set(kid, (keywordCounts.get(kid) || 0) + 1);
        }
    }

    const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => ({ id: String(id), type: 'genre', name: GENRE_ID_TO_NAME[String(id)] || `Genre ${id}` }));

    const topKeywords = Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => ({ id: String(id), type: 'keyword', name: `Keyword ${id}` }));

    return [...topGenres, ...topKeywords];
}

/**
 * Creates a default input object for the global profile.
 * Used when no profiles are provided in the config request.
 */
function createGlobalProfileInput() {
    return {
        id: 'global',
        name: '🏠 Generale',
        selectedPresets: [
            'preset_pop_movies', 'preset_pop_series',
            'preset_new_movies', 'preset_new_series',
            'preset_top_rated_movies', 'preset_top_rated_series',
            'preset_pop_anime'
        ],
        existingCatalogs: [],
        newPrompts: []
    };
}

/**
 * Processes incoming profile data from the frontend.
 * Resolves presets into catalog objects and structures the profile for saving.
 * Enforces global profile invariants and builds suggestedDNA from active presets.
 * 
 * @param {Array} inputProfiles - Raw profile objects from request body
 * @param {string} userId - Current user ID
 * @param {string} mistralKey - Mistral API Key for AI synthesis
 * @param {Array} warnings - Array to collect processing warnings
 * @returns {Promise<Array>} Processed profile objects
 */
async function processProfiles(inputProfiles, userId, mistralKey, warnings) {
    const allPresets = getPresets();
    const presetMap = new Map(allPresets.map(p => [p.id, p]));
    
    const processed = [];

    for (const input of inputProfiles) {
        const isGlobal = input.id === 'global';
        
        // 1. Basic Structure
        const profile = {
            id: input.id || nanoid(8),
            name: isGlobal ? 'Generale' : (input.name || 'Nuovo Profilo'),
            catalogs: Array.isArray(input.existingCatalogs) ? [...input.existingCatalogs] : [],
            raw_ui_state: {
                selectedPresets: Array.isArray(input.selectedPresets) ? input.selectedPresets : [],
                catalogOrder: Array.isArray(input.catalogOrder) ? input.catalogOrder : [],
                newPrompts: Array.isArray(input.newPrompts) ? input.newPrompts : []
            },
            settings: {
                ...(input.settings || {})
            }
        };

        // 2. Enforce global profile invariants: the global profile is system-managed
        //    and must not carry user DNA. DNA is only allowed on user-created profiles.
        if (isGlobal) {
            profile.settings.manualDNA = [];
            profile.settings.suggestedDNA = [];
        }

        // 3. Resolve Presets to Catalogs
        if (profile.raw_ui_state.selectedPresets.length > 0) {
            for (const presetId of profile.raw_ui_state.selectedPresets) {
                const preset = presetMap.get(presetId);
                if (preset) {
                    const exists = profile.catalogs.some(c => c.id === `yaca_preset_${presetId}`);
                    if (!exists) {
                        profile.catalogs.push({
                            id: `yaca_preset_${presetId}`,
                            name: preset.name,
                            type: preset.type
                        });
                    }
                } else {
                    warnings.push(`Preset non riconosciuto: ${presetId}`);
                }
            }
        }

        // 4. Build suggestedDNA from active presets (non-global profiles only)
        if (!isGlobal) {
            const manualDNA = Array.isArray(profile.settings.manualDNA) ? profile.settings.manualDNA : [];
            const manualIds = new Set(manualDNA.map(d => `${d.type}:${d.id}`));
            const presetDNA = buildSuggestedDNAFromPresets(
                profile.raw_ui_state.selectedPresets,
                allPresets
            );
            // Deduplicate: exclude items already in manualDNA
            profile.settings.suggestedDNA = presetDNA.filter(d => !manualIds.has(`${d.type}:${d.id}`));

            // --- DNA Extraction & Save (V_static + V_final) ---
            const allQueries = profile.raw_ui_state.selectedPresets.flatMap(presetId => {
                const preset = presetMap.get(presetId);
                return preset?.queries || [];
            });
            
            if (allQueries.length > 0) {
                const inferredStaticDNA = extractStaticDNAFromQueries(allQueries);
                
                // Aggiorniamo V_static e ricalcoliamo V_final in background
                (async () => {
                    try {
                        const existing = await TasteProfile.findOne(
                            { owner: userId, context: profile.id }
                        ).lean();
                        
                        const vActive = existing?.compiledVectors?.V_active || {};
                        const hasActiveHistory = Object.keys(vActive).length > 0;
                        
                        let vFinal;
                        if (hasActiveHistory) {
                            // Ricalcola V_final combinando il nuovo V_static con il V_active esistente
                            const { computeFinalDNA } = require('../../utils/dnaExtractor');
                            const WatchHistory = require('../../models/WatchHistory');
                            const totalInteractions = await WatchHistory.countDocuments({ owner: userId, context: profile.id });
                            vFinal = computeFinalDNA(inferredStaticDNA, vActive, totalInteractions);
                        } else {
                            // Nessuno storico: V_final = V_static
                            vFinal = { ...inferredStaticDNA };
                        }
                        
                        await TasteProfile.updateOne(
                            { owner: userId, context: profile.id },
                            { 
                                $set: { 
                                    "compiledVectors.V_static": inferredStaticDNA,
                                    "compiledVectors.V_final": vFinal
                                }
                            },
                            { upsert: true }
                        );
                    } catch (err) {
                        console.error(`[DNA Extractor] Error saving vectors for ${profile.id}:`, err);
                    }
                })();
            }
        }

        processed.push(profile);
    }

    return processed;
}

module.exports = {
    processProfiles,
    createGlobalProfileInput,
    buildSuggestedDNAFromPresets,
    splitOrIds
};