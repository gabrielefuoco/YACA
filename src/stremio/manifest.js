const {
    SORT_OPTIONS,
    SORT_MAP,
    getSortByValue
} = require('../catalog/catalogSorting');
const { isCatalogConformant } = require('../catalog/catalogKind');
const { catalogDefinitionsFromShelves } = require('../catalog/registry');

const defaultExtra = [{ name: 'skip' }];
const presetExtra = [{ name: 'sortBy', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];
const searchExtra = [{ name: 'search', isRequired: true }];

/**
 * Le tre righe della libreria personale. Estratte qui perché sono una sola verità
 * condivisa: il manifest le dichiara e `src/profile/cataloghiEsplora.js` le elenca
 * in Esplora con gli stessi id e nomi. Con il flag acceso il loro contenuto è
 * filtrato dalla modalità; la riga resta quella della persona.
 */
const WATCHLIST_CATALOGS = Object.freeze([
    Object.freeze({ id: 'yaca_watchlist_movies', type: 'movie', name: '🎬 I Film della tua Watchlist', extra: defaultExtra }),
    Object.freeze({ id: 'yaca_watchlist_series', type: 'series', name: '📺 Le Serie della tua Watchlist', extra: defaultExtra }),
    Object.freeze({ id: 'yaca_watchlist_anime', type: 'anime', name: '🎌 Gli Anime della tua Watchlist', extra: defaultExtra })
]);

let canonicalPresetsMap = null;
function getCanonicalPresetsMap() {
    if (!canonicalPresetsMap) {
        try {
            const { getPresets } = require('../catalog/presets');
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

function buildManifest(userConfig = {}, hostUrl = 'http://localhost:7000', userHandle = null, options = {}) {
    const cv = userConfig?.configVersion?.toString().replace(/_/g, '-');
    const dynamicVersion = cv ? `1.0.4+${cv}` : '1.0.4';

    const { risolviProfiloAttivo } = require('../profile');
    const {
        modiAbilitati,
        leggiModoAttivo,
        derivaLeve,
        selettoriDaLeve,
        conformeAlModo,
        cataloghiDelModo
    } = require('../profile/modo');
    const activeProfileId = risolviProfiloAttivo(userConfig);
    const profile = userConfig?.profiles?.find(p => p.id === activeProfileId) || (userConfig?.profiles?.[0]);

    // Con il flag acceso la modalità attiva decide cosa il manifest dichiara.
    // Con il flag spento `modo`/`leve` restano null e si usano i selettori del profilo.
    const modo = modiAbilitati() ? leggiModoAttivo(userConfig) : null;
    const leve = modo ? derivaLeve(modo) : null;

    const rawPresets = profile?.uiState?.selectedPresets || profile?.raw_ui_state?.selectedPresets;
    const selectedPresets = Array.isArray(rawPresets) ? rawPresets : null;

    // Recupero scaffali dinamici del profilo (V45):
    // Opzioni > userConfig > profile > cache RAM per profileId/userId
    const { catalogDefinitionsFromShelves } = require('../catalog/registry');
    const { getCachedProfileShelves } = require('../pool');
    const shelvesList = options?.shelves
        || options?.scaffali
        || userConfig?.shelves
        || userConfig?.scaffali
        || profile?.shelves
        || profile?.scaffali
        || (profile?.id ? getCachedProfileShelves(profile.id) : null)
        || (userConfig?.userId ? getCachedProfileShelves(userConfig.userId) : null)
        || [];

    const heroCatalogs = catalogDefinitionsFromShelves(shelvesList);

    const typeSelectors = leve ? selettoriDaLeve(leve) : profile?.settings?.typeSelectors;
    // Un solo predicato di conformità per tutto il manifest: con il flag acceso
    // è la modalità (anime + medium), altrimenti sono i selettori del profilo.
    const conforme = (catalogo) => (leve
        ? conformeAlModo(catalogo, leve)
        : isCatalogConformant(catalogo, typeSelectors));

    // Filter: only show hero catalogs if they are enabled in the active profile's selectedPresets
    // and conformant to typeSelectors.
    // Degrado di sistema (Ticket 47): se un profilo ha un array selectedPresets la cui intersezione
    // con i cataloghi hero correnti è VUOTA (es. un profilo legacy che contiene solo gli ID rimossi dal ticket 46),
    // mostriamo comunque tutte le righe hero di sistema e logghiamo l'avviso.
    // Motivo: un profilo non deve perdere il feed solo perché il sistema ha rinominato o rimosso le sue righe.
    let eligibleHeroCatalogs = heroCatalogs;
    // TICKET 13: le righe hero si filtrano sulla selezione, e basta. Una regola «se aveva tutte le
    // righe di ieri aggiungi quelle di oggi» renderebbe INERTI i toggle nuovi (la dashboard mostra
    // acceso cio' che sta in `selectedPresets`): le sei famiglie nuove arrivano accese solo quando
    // l'utente le accende, o quando il profilo le porta gia' dentro (migrazione lato profilo).
    if (Array.isArray(selectedPresets)) {
        const matchingHeroCatalogs = heroCatalogs.filter(c => selectedPresets.includes(c.id));
        if (matchingHeroCatalogs.length > 0) {
            eligibleHeroCatalogs = matchingHeroCatalogs;
        } else {
            const profileIdentifier = profile?.id || activeProfileId || 'default';
            console.log(`[Manifest] profilo ${profileIdentifier}: nessun hero selezionato fra gli id correnti — mostro le ${heroCatalogs.length} righe disponibili`);
            eligibleHeroCatalogs = heroCatalogs;
        }
    }

    const activeHeroCatalogs = eligibleHeroCatalogs.filter(conforme);

    const onlyShelves = Boolean(options?.shelvesOnly || userConfig?.shelvesOnly);
    const catalogs = onlyShelves
        ? [...activeHeroCatalogs]
        : [
            { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search', extra: searchExtra },
            ...WATCHLIST_CATALOGS.map(c => ({ ...c })),
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
    if (leve) {
        // Ticket 01/06: i cataloghi attivi sono quelli della modalità
        // (`config.cataloghi[modo]`), nell'ordine dichiarato. La definizione si
        // risolve da preset/custom/scaffali come oggi: qui non si ridisegna Esplora.
        const { resolveCatalogDefinition } = require('../catalog/catalogDefinition');
        for (const voce of cataloghiDelModo(userConfig, modo)) {
            if (seenCatalogIds.has(voce.id)) continue;
            const base = voce.id.startsWith('yaca_preset_') ? voce.id.replace('yaca_preset_', '') : voce.id;
            const definizione = resolveCatalogDefinition(voce.id, userConfig, base);
            if (!definizione) {
                console.warn(`[Manifest] modalità ${modo}: catalogo attivo non risolvibile (${voce.id}) — non dichiarato`);
                continue;
            }
            if (!conforme(definizione)) continue;
            seenCatalogIds.add(voce.id);
            catalogs.push({
                id: definizione.id,
                type: resolveCatalogType(definizione),
                name: definizione.name,
                extra: getCatalogExtra(definizione)
            });
        }
    } else if (profile && profile.catalogs && Array.isArray(profile.catalogs)) {
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
                if (conforme(c)) {
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
    WATCHLIST_CATALOGS,
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
