const { nanoid } = require('nanoid');
const { getPresets } = require('../../data/presets');

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
            name: input.name || (isGlobal ? '🏠 Generale' : 'Nuovo Profilo'),
            catalogs: Array.isArray(input.existingCatalogs) ? [...input.existingCatalogs] : [],
            raw_ui_state: {
                selectedPresets: Array.isArray(input.selectedPresets) ? input.selectedPresets : [],
                catalogOrder: Array.isArray(input.catalogOrder) ? input.catalogOrder : [],
                newPrompts: Array.isArray(input.newPrompts) ? input.newPrompts : []
            },
            // Settings and DNA preservation
            // Note: UserConfig.saveUser handles the heavy lifting of merging with DB state,
            // but we ensure we don't accidentally wipe them here if passed from frontend.
            settings: {
                ...(input.settings || {}),
                // CRITICAL FIX: Do NOT force reset DNA traits to [] anymore.
                // We keep whatever is in input.settings, or if missing, 
                // UserConfig will merge with the existing DB values.
            }
        };

        // 2. Resolve Presets to Catalogs
        if (profile.raw_ui_state.selectedPresets.length > 0) {
            for (const presetId of profile.raw_ui_state.selectedPresets) {
                const preset = presetMap.get(presetId);
                if (preset) {
                    // Check if already present to avoid duplicates
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

        // 3. Handle AI Prompts (Future/Current Synthesis)
        // If the frontend sends prompts, they should be processed here or in a separate flow.
        // Currently, we just ensure they are captured in raw_ui_state for UserConfig to handle.

        processed.push(profile);
    }

    return processed;
}

module.exports = {
    processProfiles,
    createGlobalProfileInput
};