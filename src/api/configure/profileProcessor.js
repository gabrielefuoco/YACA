const { nanoid } = require('nanoid');
const { getPresets } = require('../../data/presets');
const TasteProfile = require('../../models/TasteProfile');
const { extractStaticDNAFromQueries } = require('../../utils/dnaExtractor');
const {
    resolveDnaNames,
    getReadableFallback,
    GENRE_ID_TO_NAME
} = require('../../utils/tmdbNameResolver');
const { isRetiredTmdbKeywordId } = require('../../data/keywordIds');
const { sanitizeCustomCatalogs } = require('./validators');

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
        company: new Map()
    };

    const bump = (type, rawId) => {
        const id = String(rawId).trim();
        if (!id || !counts[type]) return;
        counts[type].set(id, (counts[type].get(id) || 0) + 1);
    };

    const collectFromQuery = (query) => {
        if (!query || typeof query !== 'object') return;
        const pick = (field, type) => {
            const value = query[field];
            if (value === undefined || value === null || value === '') return;
            String(value).split(/[,|]/).forEach(id => bump(type, id));
        };
        pick('with_genres', 'genre');
        pick('with_keywords', 'keyword');
        pick('with_networks', 'network');
        pick('with_companies', 'company');
        // Forme usate dai filtri AI / TMDB
        if (Array.isArray(query.genre_ids)) query.genre_ids.forEach(id => bump('genre', id));
        if (typeof query.keyword === 'string' && query.keyword.trim()) {
            query.keyword.split(/[,|]/).forEach(k => bump('keyword', k.trim().toLowerCase()));
        }
        // with_cast / with_crew sono ignorati: le persone non entrano nel DNA.
    };

    for (const catalog of catalogs) {
        // Cataloghi dei preset: filtro serializzato in `where`.
        if (Array.isArray(catalog.where)) {
            for (const w of catalog.where) {
                const strW = String(w);
                const matches = strW.match(/"id":\s*"?([0-9]+)"?/g);
                if (!matches) continue;
                for (const m of matches) {
                    const id = m.replace(/[^0-9]/g, '');
                    if (strW.includes('genres')) bump('genre', id);
                    if (strW.includes('keywords')) bump('keyword', id);
                    if (strW.includes('networks')) bump('network', id);
                    if (strW.includes('production_companies')) bump('company', id);
                }
            }
        }

        // Cataloghi creati dall'utente (Creator / liste): filtri in `queries`.
        if (Array.isArray(catalog.queries)) {
            catalog.queries.forEach(collectFromQuery);
        }
        if (catalog.filters && typeof catalog.filters === 'object') {
            collectFromQuery(catalog.filters);
            if (Array.isArray(catalog.filters.queries)) {
                catalog.filters.queries.forEach(collectFromQuery);
            }
        }
    }

    const results = [];
    const limits = { genre: 8, keyword: 8, network: 3, company: 3 };

    for (const [type, map] of Object.entries(counts)) {
        const top = Array.from(map.entries())
            .filter(([id]) => !(type === 'keyword' && isRetiredTmdbKeywordId(id)))
            .sort((a, b) => b[1] - a[1])
            .slice(0, limits[type])
            .map(([id]) => {
                const name = getReadableFallback(type, id);
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
            catalogs: Array.isArray(input.existingCatalogs) ? sanitizeCustomCatalogs(input.existingCatalogs) : [],
            raw_ui_state: {
                selectedPresets: Array.isArray(input.selectedPresets) ? [...new Set(input.selectedPresets)] : [],
                catalogOrder: Array.isArray(input.catalogOrder) ? [...new Set(input.catalogOrder)] : [],
                newPrompts: Array.isArray(input.newPrompts) ? input.newPrompts : [],
                heroPresetsInitialized: input.heroPresetsInitialized ?? false
            },
            settings: {
                ...(input.settings || {})
            }
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

        // 3. Build suggestedDNA from installed catalogs
        const rawManualDNA = isGlobal ? [] : (Array.isArray(profile.settings.manualDNA) ? profile.settings.manualDNA : []);
        const catalogDNA = buildSuggestedDNAFromCatalogs(profile.catalogs);

        // Resolve DNA names across all types using tmdbNameResolver (with budget and cache)
        const effectiveTmdbKey = tmdbKey || process.env.TMDB_API_KEY;
        const [resolvedManualDNA, resolvedCatalogDNA] = await Promise.all([
            resolveDnaNames(rawManualDNA, { apiKey: effectiveTmdbKey, budgetMs: 1500 }),
            resolveDnaNames(catalogDNA, { apiKey: effectiveTmdbKey, budgetMs: 1500 })
        ]);

        const manualDNA = resolvedManualDNA;
        const manualIds = new Set(manualDNA.map(d => `${d.type}:${d.id}`));

        // Deduplicate: exclude items already in manualDNA
        profile.settings.suggestedDNA = resolvedCatalogDNA.filter(d => !manualIds.has(`${d.type}:${d.id}`));
        
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