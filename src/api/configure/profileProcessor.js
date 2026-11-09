const { nanoid } = require('nanoid');
const { getPresets } = require('../../catalog/presets');
const { sanitizeCustomCatalogs } = require('./validators');

/**
 * Creates default input object for the global profile.
 * Ensures the global profile has default catalogs and correct presets initialized.
 * 
 * @returns {Object} Raw profile input object
 */
function createGlobalProfileInput() {
    return {
        id: 'global',
        name: 'Generale',
        selectedPresets: ['pop_movies', 'pop_series'],
        existingCatalogs: [],
        settings: {}
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
async function processProfiles(inputProfiles, userId, mistralKey, warnings, tmdbKey) {
    const allPresets = getPresets();
    const presetMap = new Map(allPresets.map(p => [p.id, p]));
    
    const processed = [];

    for (const input of inputProfiles) {
        const isGlobal = input.id === 'global';
        
        // 1. Basic Structure
        const profile = {
            id: input.id || nanoid(8),
            // Il nome non è più forzato per il globale: si può rinominare come gli altri.
            // 'Generale' resta solo il default di chi non ne manda uno.
            name: (typeof input.name === 'string' && input.name.trim()) ? input.name.trim() : (isGlobal ? 'Generale' : 'Nuovo Profilo'),
            ...(typeof input.emoji === 'string' && input.emoji.trim() ? { emoji: input.emoji.trim().slice(0, 8) } : {}),
            catalogs: Array.isArray(input.existingCatalogs) ? sanitizeCustomCatalogs(input.existingCatalogs) : [],
            raw_ui_state: {
                selectedPresets: Array.isArray(input.selectedPresets) ? [...new Set(input.selectedPresets)] : [],
                catalogOrder: Array.isArray(input.catalogOrder) ? [...new Set(input.catalogOrder)] : [],
                libraryOrder: Array.isArray(input.libraryOrder)
                    ? [...new Set(input.libraryOrder)]
                    : (Array.isArray(input.raw_ui_state?.libraryOrder) ? [...new Set(input.raw_ui_state.libraryOrder)] : []),
                newPrompts: Array.isArray(input.newPrompts) ? input.newPrompts : [],
                heroPresetsInitialized: input.heroPresetsInitialized ?? false
            },
            settings: {
                ...(input.settings || {}),
                ...(input.sliders ? { sliders: input.sliders } : {})
            },
            ...(input.sliders || input.settings?.sliders ? { sliders: input.sliders || input.settings?.sliders } : {})
        };

        // 2. Resolve Presets to Catalogs (Upsert Logic)
        if (profile.raw_ui_state.selectedPresets.length > 0) {
            // Usa una Map per prevenire duplicati storici e permettere l'upsert
            const catalogsMap = new Map();
            profile.catalogs.forEach(c => catalogsMap.set(c.id, c));

            for (const presetId of profile.raw_ui_state.selectedPresets) {
                const preset = presetMap.get(presetId);
                if (preset) {
                    const expectedId = `yaca_preset_${presetId}`;
                    // Upsert: se esiste lo sovrascriviamo coi dati aggiornati dal preset
                    catalogsMap.set(expectedId, {
                        id: expectedId,
                        name: preset.name,
                        type: preset.type,
                        emoji: preset.emoji,
                        category: preset.category,
                        where: preset.where || [],
                        orderBy: preset.orderBy || null,
                        _provider: preset._provider || null,
                        sortable: preset.sortable !== false,
                        queries: preset.queries || [],
                        isAnime: preset.isAnime || false
                    });
                } else {
                    warnings.push(`Preset non riconosciuto: ${presetId}`);
                }
            }
            // Riconvertiamo la Map pulita in Array
            profile.catalogs = Array.from(catalogsMap.values());
        }

        processed.push(profile);
    }

    return processed;
}

module.exports = {
    processProfiles,
    createGlobalProfileInput
};
