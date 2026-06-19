const { nanoid } = require('nanoid');
const { getPresets } = require('../../data/presets');
const TasteProfile = require('../../models/TasteProfile');
const { extractStaticDNAFromQueries } = require('../../utils/dnaExtractor');
const { createTmdbClient } = require('../../clients/tmdb');

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
 * Extracts suggested DNA entries from installed catalogs.
 * Handles genres, keywords, networks, companies, cast, and crew.
 * Resolves known genre IDs to Italian names.
 *
 * @param {Array} catalogs - Array of installed catalogs
 * @returns {Array<{id: string, type: string, name: string}>}
 */
function buildSuggestedDNAFromCatalogs(catalogs = []) {
    const counts = {
        genre: new Map(),
        keyword: new Map(),
        network: new Map(),
        company: new Map(),
        actor: new Map(),
        director: new Map()
    };

    for (const catalog of catalogs) {
        if (!catalog.queries || !Array.isArray(catalog.queries)) continue;

        for (const query of catalog.queries) {
            for (const id of splitOrIds(query.with_genres || query.genre_ids)) {
                counts.genre.set(id, (counts.genre.get(id) || 0) + 1);
            }
            for (const id of splitOrIds(query.with_keywords || query.keyword)) {
                counts.keyword.set(id, (counts.keyword.get(id) || 0) + 1);
            }
            for (const id of splitOrIds(query.with_networks)) {
                counts.network.set(id, (counts.network.get(id) || 0) + 1);
            }
            for (const id of splitOrIds(query.with_companies)) {
                counts.company.set(id, (counts.company.get(id) || 0) + 1);
            }
            for (const id of splitOrIds(query.with_cast)) {
                counts.actor.set(id, (counts.actor.get(id) || 0) + 1);
            }
            for (const id of splitOrIds(query.with_crew)) {
                counts.director.set(id, (counts.director.get(id) || 0) + 1);
            }
            
            if (query.provider === 'kitsu') {
                counts.genre.set('16', (counts.genre.get('16') || 0) + 1);
                counts.keyword.set('210024', (counts.keyword.get('210024') || 0) + 1);
            }
        }
    }

    const results = [];
    const limits = { genre: 8, keyword: 8, network: 3, company: 3, actor: 3, director: 3 };

    for (const [type, map] of Object.entries(counts)) {
        const top = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limits[type])
            .map(([id]) => {
                let name = `${type} ${id}`;
                if (type === 'genre' && GENRE_ID_TO_NAME[id]) name = GENRE_ID_TO_NAME[id];
                return { id: String(id), type, name };
            });
        results.push(...top);
    }

    return results;
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
async function processProfiles(inputProfiles, userId, mistralKey, warnings, tmdbKey) {
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
                newPrompts: Array.isArray(input.newPrompts) ? input.newPrompts : [],
                heroPresetsInitialized: input.heroPresetsInitialized ?? false
            },
            settings: {
                ...(input.settings || {})
            }
        };

        // 2. Resolve Presets to Catalogs
        if (profile.raw_ui_state.selectedPresets.length > 0) {
            for (const presetId of profile.raw_ui_state.selectedPresets) {
                const preset = presetMap.get(presetId);
                if (preset) {
                    const exists = profile.catalogs.some(c => c.id === `yaca_preset_${presetId}`);
                    if (!exists) {
                        profile.catalogs.push({
                            id: `yaca_preset_${presetId}`,
                            name: preset.name,
                            type: preset.type,
                            queries: preset.queries || []
                        });
                    }
                } else {
                    warnings.push(`Preset non riconosciuto: ${presetId}`);
                }
            }
        }

        // 3. Build suggestedDNA from installed catalogs
        const manualDNA = isGlobal ? [] : (Array.isArray(profile.settings.manualDNA) ? profile.settings.manualDNA : []);
        const manualIds = new Set(manualDNA.map(d => `${d.type}:${d.id}`));
        
        const catalogDNA = buildSuggestedDNAFromCatalogs(profile.catalogs);
        
        // --- Fetch Keyword Names from TMDB ---
        if (tmdbKey) {
            const tmdbClient = createTmdbClient(tmdbKey);
            const keywordUpdates = catalogDNA.filter(d => d.type === 'keyword' && d.name.startsWith('keyword '));
            if (keywordUpdates.length > 0) {
                await Promise.allSettled(keywordUpdates.map(async (k) => {
                    try {
                        const res = await tmdbClient.get(`/keyword/${k.id}`);
                        if (res.data && res.data.name) {
                            k.name = res.data.name; // Translate keyword!
                        }
                    } catch (e) {
                        // ignore failures, will fallback to generic name
                    }
                }));
            }
        }

        // Deduplicate: exclude items already in manualDNA
        profile.settings.suggestedDNA = catalogDNA.filter(d => !manualIds.has(`${d.type}:${d.id}`));
        
        if (isGlobal) {
            profile.settings.manualDNA = [];
        } else {
            profile.settings.manualDNA = manualDNA;
        }
        
        // --- DNA Extraction & Save (V_static + V_final) ---
        const allQueries = profile.catalogs.flatMap(cat => cat.queries || []);
        
        if (allQueries.length > 0 || manualDNA.length > 0) {
            const inferredStaticDNA = extractStaticDNAFromQueries(allQueries);
            
            // Inject manually added DNA items
            manualDNA.forEach(item => {
                const prefix = item.type === 'genre' ? 'g' : item.type === 'keyword' ? 'k' : 'o';
                const key = `${prefix}:${item.id}`;
                const score = typeof item.score === 'number' ? item.score : 200;
                inferredStaticDNA[key] = (inferredStaticDNA[key] || 0) + score;
            });
            
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
                    
                    const idNamesUpdates = {};
                    manualDNA.forEach(item => {
                        if (item.id && item.name) {
                            idNamesUpdates[`idNames.${item.id}`] = item.name;
                        }
                    });
                    
                    await TasteProfile.updateOne(
                        { owner: userId, context: profile.id },
                        { 
                            $set: { 
                                "compiledVectors.V_static": inferredStaticDNA,
                                "compiledVectors.V_final": vFinal,
                                ...idNamesUpdates
                            }
                        },
                        { upsert: true }
                    );
                } catch (err) {
                    console.error(`[DNA Extractor] Error saving vectors for ${profile.id}:`, err);
                }
            })();
        }

        processed.push(profile);
    }

    return processed;
}

module.exports = {
    processProfiles,
    createGlobalProfileInput
};