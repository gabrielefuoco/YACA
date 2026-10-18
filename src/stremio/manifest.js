const {
    SORT_OPTIONS,
    SORT_MAP,
    getSortByValue
} = require('../catalog/catalogSorting');
const { getPresets } = require('../catalog/presets');
const { isCatalogConformant } = require('../catalog/catalogKind');
const { getManifestHeroCatalogs } = require('../catalog/registry');

const defaultExtra = [{ name: 'skip' }];
const presetExtra = [{ name: 'sortBy', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];
const searchExtra = [{ name: 'search', isRequired: true }];

let canonicalPresetsMap = null;
function getCanonicalPresetsMap() {
    if (!canonicalPresetsMap) {
        try {
            const presets = getPresets();
            canonicalPresetsMap = new Map(presets.map(p => [p.id, p]));
        } catch (e) {
            console.error('[stremio] Failed to load canonical presets for catalog extra:', e.message);
            canonicalPresetsMap = new Map();
        }
    }
    return canonicalPresetsMap;
}

function getCatalogExtra(cat) {
    if (!cat) return presetExtra;
    if (cat.extra) return cat.extra;

    // Regola data-driven: se il catalogo dichiara sortable === false o _provider === 'airing_state'
    if (cat.sortable === false || cat._provider === 'airing_state' || cat._provider === 'anilist_simulcast') {
        return defaultExtra;
    }

    // Risoluzione canonica da presets.js
    const presetMap = getCanonicalPresetsMap();
    const baseId = cat.id && cat.id.startsWith('yaca_preset_') ? cat.id.replace('yaca_preset_', '') : cat.id;
    const canonical = presetMap.get(baseId) || (cat.id ? presetMap.get(cat.id) : null);
    if (canonical && (canonical.sortable === false || canonical._provider === 'airing_state' || canonical._provider === 'anilist_simulcast')) {
        return defaultExtra;
    }

    return presetExtra;
}

function resolveCatalogType(cat) {
    if (!cat) return 'movie';
    const raw = (cat.kind || cat.type || '').toString().toLowerCase().trim();
    if (raw === 'series') return 'series';
    if (raw === 'anime') return 'anime';
    if (raw === 'other') return 'other';
    return 'movie';
}

function buildRootManifest(hostUrl = 'http://localhost:7000') {
    return {
        id: 'org.stremio.yaca.catalog',
        version: '1.0.4',
        name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
        description: 'Catalogo Intelligente Potenziato da AI - Configurazione Richiesta',
        logo: `${hostUrl}/fiamma_yaca.png`,
        contactEmail: 'yaca.addon@proton.me',
        resources: [],
        types: [],
        catalogs: [],
        behaviorHints: {
            configurable: true,
            configurationRequired: true
        },
        // Point to root for configuration if no user context
        configurationURL: `${hostUrl}/`
    };
}

function buildManifest(userConfig = {}, hostUrl = 'http://localhost:7000', userHandle = null) {
    const cv = userConfig?.configVersion?.toString().replace(/_/g, '-');
    const dynamicVersion = cv ? `1.0.4+${cv}` : '1.0.4';

    const { risolviProfiloAttivo } = require('../profile');
    const activeProfileId = risolviProfiloAttivo(userConfig);
    const profile = userConfig?.profiles?.find(p => p.id === activeProfileId) || (userConfig?.profiles?.[0]);

    const rawPresets = profile?.uiState?.selectedPresets || profile?.raw_ui_state?.selectedPresets;
    const selectedPresets = Array.isArray(rawPresets) ? rawPresets : null;
    const heroCatalogs = getManifestHeroCatalogs();

    const typeSelectors = profile?.settings?.typeSelectors;

    // Filter: only show hero catalogs if they are enabled in the active profile's selectedPresets
    // and conformant to typeSelectors.
    // Degrado di sistema (Ticket 47): se un profilo ha un array selectedPresets la cui intersezione
    // con i cataloghi hero correnti è VUOTA (es. un profilo legacy che contiene solo gli ID rimossi dal ticket 46),
    // mostriamo comunque tutte le righe hero di sistema e logghiamo l'avviso.
    // Motivo: un profilo non deve perdere il feed solo perché il sistema ha rinominato o rimosso le sue righe.
    let eligibleHeroCatalogs = heroCatalogs;
    if (Array.isArray(selectedPresets)) {
        const matchingHeroCatalogs = heroCatalogs.filter(c => selectedPresets.includes(c.id));
        if (matchingHeroCatalogs.length > 0) {
            eligibleHeroCatalogs = matchingHeroCatalogs;
        } else {
            const profileIdentifier = profile?.id || activeProfileId || 'default';
            console.log(`[Manifest] profilo ${profileIdentifier}: nessun hero selezionato fra gli id correnti — mostro le ${heroCatalogs.length} righe di sistema`);
            eligibleHeroCatalogs = heroCatalogs;
        }
    }

    const activeHeroCatalogs = eligibleHeroCatalogs.filter(c => isCatalogConformant(c, typeSelectors));

    const catalogs = [
        { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
        { id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
        { id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search', extra: searchExtra },
        { id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search', extra: searchExtra },
        { id: 'yaca_watchlist_movies', type: 'movie', name: '🎬 I Film della tua Watchlist', extra: [{ name: 'skip' }] },
        { id: 'yaca_watchlist_series', type: 'series', name: '📺 Le Serie della tua Watchlist', extra: [{ name: 'skip' }] },
        { id: 'yaca_watchlist_anime', type: 'anime', name: '🎌 Gli Anime della tua Watchlist', extra: [{ name: 'skip' }] },
        ...activeHeroCatalogs
    ];

    // Tracciamo gli ID già presenti per deduplicare cataloghi custom e di profilo
    // (escludendo yaca_search_standard e yaca_search_ai che compaiono 2 volte per movie e series)
    const seenCatalogIds = new Set(
        catalogs
            .map(c => c.id)
            .filter(id => id !== 'yaca_search_standard' && id !== 'yaca_search_ai')
    );

    // Add User Presets
    if (profile && profile.catalogs && Array.isArray(profile.catalogs)) {
        profile.catalogs.forEach(p => {
            if (p.isActive !== false && p.id && !seenCatalogIds.has(p.id)) {
                if (isCatalogConformant(p, typeSelectors)) {
                    seenCatalogIds.add(p.id);
                    catalogs.push({
                        id: p.id,
                        type: resolveCatalogType(p),
                        name: p.name,
                        extra: getCatalogExtra(p)
                    });
                }
            }
        });
    }

    // Add Custom Catalogs (e.g. Matchmaker, custom lists)
    if (userConfig?.customCatalogs && Array.isArray(userConfig.customCatalogs)) {
        userConfig.customCatalogs.forEach(c => {
            if (c.isActive !== false && c.id && !seenCatalogIds.has(c.id)) {
                if (isCatalogConformant(c, typeSelectors)) {
                    seenCatalogIds.add(c.id);
                    catalogs.push({
                        id: c.id,
                        type: resolveCatalogType(c),
                        name: c.name,
                        extra: getCatalogExtra(c)
                    });
                }
            }
        });
    }

    const configHandle = userHandle || userConfig?.userHandle || userConfig?.addonUuid || 'unknown';
    return {
        id: 'org.stremio.yaca.catalog',
        version: dynamicVersion,
        name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
        description: 'Catalogo Intelligente Potenziato da AI',
        logo: `${hostUrl}/fiamma_yaca.png`,
        resources: [
            'catalog',
            'meta'
        ],
        types: ['movie', 'series', 'anime', 'other'],
        catalogs: catalogs,
        idPrefixes: ['tt', 'tmdb:', 'kitsu:'],
        behaviorHints: {
            configurable: true,
            configurationRequired: false
        },
        contactEmail: 'yaca.addon@proton.me',
        configurationURL: `${hostUrl}/${configHandle}/configure`
    };
}

module.exports = {
    buildManifest,
    buildRootManifest,
    resolveCatalogType,
    getCatalogExtra,
    defaultExtra,
    presetExtra,
    searchExtra,
    getSortByValue,
    SORT_OPTIONS,
    SORT_MAP
};
