/**
 * src/catalog/catalogDefinition.js
 *
 * Definizione canonica, risoluzione e calcolo chiavi di cache per i cataloghi (Ticket 41 - Serving su moduli).
 */

const cache = require('../cache');
const { getPresets } = require('./presets');

const BADGE_CATALOG_VERSION = 24;

/**
 * Serializza la definizione di un catalogo in forma canonica: chiavi ordinate,
 * array nel loro ordine. Due definizioni equivalenti producono la stessa stringa,
 * arrivino da un preset, da Mongo o da un oggetto inline.
 */
function canonicalCatalogDefinition(definition) {
    const value = definition && typeof definition.toObject === 'function'
        ? definition.toObject()
        : definition;

    if (value === null || typeof value !== 'object') {
        const json = JSON.stringify(value);
        return json === undefined ? 'null' : json;
    }
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map(canonicalCatalogDefinition).join(',')}]`;

    const entries = Object.keys(value)
        .filter(key => key !== '_id' && key !== '__v')
        .sort()
        .map(key => `${JSON.stringify(key)}:${canonicalCatalogDefinition(value[key])}`);
    return `{${entries.join(',')}}`;
}

/**
 * Risolve la definizione del catalogo richiesto: prima i preset di codice, poi i
 * cataloghi del profilo attivo, infine i custom.
 */
function resolveCatalogDefinition(id, userConfig, baseId) {
    if (baseId === 'yaca_search_history') return null;

    const fromPresets = getPresets().find(p => p.id === baseId || p.id === id);
    if (fromPresets) return fromPresets;

    const activeProfile = userConfig?.profiles?.find(p => p.id === userConfig.activeProfileId);
    if (activeProfile && activeProfile.catalogs) {
        const fromProfile = activeProfile.catalogs.find(c => c.id === id);
        if (fromProfile) return fromProfile;
    }
    if (userConfig?.customCatalogs) {
        return userConfig.customCatalogs.find(c => c.id === id) || null;
    }

    return null;
}

let _presetIdsCache = null;
function getPresetIds() {
    if (!_presetIdsCache) {
        _presetIdsCache = new Set(getPresets().map(p => p.id));
    }
    return _presetIdsCache;
}

function catalogContentParams({ type, extra, directFilters, catalogMeta, activeProfileSettings } = {}) {
    return {
        type,
        extra,
        directFilters,
        kidsMode: activeProfileSettings?.kidsMode,
        typeSelectors: activeProfileSettings?.typeSelectors,
        catalogDef: canonicalCatalogDefinition(catalogMeta)
    };
}

function buildCatalogDesc({
    id,
    baseId,
    type,
    extra,
    directFilters,
    skip,
    catalogMeta,
    userConfig,
    activeProfileSettings,
    badgeVersion = BADGE_CATALOG_VERSION,
    graphVersions,
    ttl
} = {}) {
    const presetIds = getPresetIds();
    const condiviso = presetIds.has(baseId);
    const { isHeroCatalogId } = require('./registry');
    const isHero = isHeroCatalogId(id) || isHeroCatalogId(baseId);
    let resolvedGraphVersions = graphVersions;
    if (isHero && resolvedGraphVersions === undefined) {
        try {
            const { graphClient } = require('../clients');
            resolvedGraphVersions = graphClient.getGraphHealthVersionsCached();
        } catch (_err) {
            resolvedGraphVersions = null;
        }
    }

    return {
        nome: 'catalog_page',
        versione: badgeVersion,
        dipendenze: {
            varia: {
                id,
                baseId,
                type,
                extra,
                directFilters,
                skip,
                catalogMeta,
                utente: condiviso ? null : userConfig?.userId,
                profilo: condiviso ? null : userConfig?.activeProfileId,
                kids: activeProfileSettings?.kidsMode,
                selettori: activeProfileSettings?.typeSelectors,
                landscape: Boolean(activeProfileSettings?.isLandscapeEnabled),
                ...(activeProfileSettings?.sliders ? { slider: activeProfileSettings.sliders } : {}),
                condiviso
            },
            invalida: {
                badgeVersion,
                catalogDef: canonicalCatalogDefinition(catalogMeta),
                ...(isHero && resolvedGraphVersions?.artefatto ? { artefatto: resolvedGraphVersions.artefatto } : {}),
                ...(isHero && resolvedGraphVersions?.ricetta ? { ricetta: resolvedGraphVersions.ricetta } : {})
            }
        },
        ...(ttl !== undefined ? { ttl } : {})
    };
}

function buildCatalogCacheKey(params = {}) {
    const desc = buildCatalogDesc(params);
    const { chiave } = cache.deriva(desc);
    return chiave;
}

module.exports = {
    BADGE_CATALOG_VERSION,
    canonicalCatalogDefinition,
    resolveCatalogDefinition,
    catalogContentParams,
    buildCatalogDesc,
    buildCatalogCacheKey,
    getPresetIds
};
