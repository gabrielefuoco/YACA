const crypto = require('crypto');

const FINGERPRINT_SCHEMA_VERSION = 1;

function normalizeForJson(value) {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;

    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalizeForJson);

    return Object.keys(value)
        .sort()
        .reduce((result, key) => {
            result[key] = normalizeForJson(value[key]);
            return result;
        }, {});
}

/**
 * Projects only fields that are persisted in AddonConfig and affect the
 * public manifest. Secrets, DNA, scoring weights and catalog query filters are
 * intentionally excluded.
 */
function projectManifestCatalog(catalog) {
    if (!catalog || typeof catalog !== 'object') {
        return {
            id: null,
            name: null,
            type: null,
            isAnime: null,
            mergedFrom: []
        };
    }

    return {
        id: catalog.id ?? null,
        name: catalog.name ?? null,
        type: catalog.type ?? null,
        isAnime: typeof catalog.isAnime === 'boolean' ? catalog.isAnime : null,
        mergedFrom: Array.isArray(catalog.mergedFrom)
            ? catalog.mergedFrom.map(sourceId => String(sourceId))
            : []
    };
}

function projectManifestProfile(profile) {
    const rawUiState = profile?.raw_ui_state || {};
    const typeSelectors = profile?.settings?.typeSelectors || {};

    return {
        id: profile?.id ?? null,
        name: profile?.name ?? null,
        selectedPresets: Array.isArray(rawUiState.selectedPresets)
            ? rawUiState.selectedPresets.map(presetId => String(presetId))
            : null,
        catalogOrder: Array.isArray(rawUiState.catalogOrder)
            ? rawUiState.catalogOrder.map(catalogId => String(catalogId))
            : [],
        catalogs: Array.isArray(profile?.catalogs)
            ? profile.catalogs.map(projectManifestCatalog)
            : [],
        typeSelectors: {
            film: Boolean(typeSelectors.film),
            serie: Boolean(typeSelectors.serie),
            anime: typeSelectors.anime || null
        },
        kidsMode: Boolean(profile?.settings?.kidsMode)
    };
}

function getEffectiveActiveProfileId(userConfig) {
    const profiles = Array.isArray(userConfig?.profiles) ? userConfig.profiles : [];
    const configuredId = userConfig?.activeProfileId || userConfig?.config?.activeProfileId || 'global';
    const configuredProfileExists = profiles.some(profile => profile?.id === configuredId);

    if (configuredProfileExists) return String(configuredId);
    const firstProfileId = profiles[0]?.id;
    return firstProfileId !== null && firstProfileId !== undefined
        ? String(firstProfileId)
        : 'global';
}

const DEFAULT_HERO_CATALOGS = [
    { id: 'yaca_true_blend_movies', type: 'movie', name: '⭐ Scelti per Te' },
    { id: 'yaca_true_blend_series', type: 'series', name: '⭐ Scelti per Te' },
    { id: 'yaca_seed_network_movies', type: 'movie', name: '🕸️ La Rete dei tuoi Preferiti' },
    { id: 'yaca_seed_network_series', type: 'series', name: '🕸️ La Rete dei tuoi Preferiti' },
    { id: 'yaca_hidden_gems_movies', type: 'movie', name: '💎 Gemme Nascoste' },
    { id: 'yaca_hidden_gems_series', type: 'series', name: '💎 Gemme Nascoste' },
    { id: 'yaca_trakt_filtered_movies', type: 'movie', name: '🌐 Suggeriti dalla Community' },
    { id: 'yaca_trakt_filtered_series', type: 'series', name: '🌐 Suggeriti dalla Community' }
];

let globalHeroCatalogsOverride = null;

function setHeroCatalogs(catalogs) {
    globalHeroCatalogsOverride = catalogs;
}

function getHeroCatalogs() {
    if (globalHeroCatalogsOverride) {
        return globalHeroCatalogsOverride;
    }
    try {
        const stremio = require('../api/stremio');
        if (typeof stremio.buildManifest === 'function') {
            const manifest = stremio.buildManifest({});
            if (manifest && Array.isArray(manifest.catalogs)) {
                // TUTTI i cataloghi definiti dal codice (standard + hero): una firma che
                // coprisse solo gli hero non rileverebbe cambi ai cataloghi standard
                // (ricerca/watchlist), lasciando Stremio disallineato dopo il deploy.
                const definedCatalogs = manifest.catalogs;
                if (definedCatalogs.length > 0) {
                    return definedCatalogs.map(c => ({
                        id: c.id,
                        type: c.type,
                        name: c.name
                    }));
                }
            }
        }
    } catch (_) {}
    return DEFAULT_HERO_CATALOGS;
}

function getPresetDefinitions() {
    try {
        const { getPresets } = require('../data/presets');
        if (typeof getPresets === 'function') {
            const presets = getPresets();
            if (Array.isArray(presets)) {
                return presets.map(p => ({
                    id: String(p.id),
                    name: String(p.name || ''),
                    type: String(p.type || '')
                }));
            }
        }
    } catch (_) {}
    return [];
}

/**
 * Builds a deterministic hash of the code-level manifest definitions:
 * the hero catalogs declared in buildManifest and relevant fields of presets in presets.js.
 */
function buildManifestDefinitionsSignature(heroCatalogsOverride, presetsOverride) {
    const rawHeroes = heroCatalogsOverride !== undefined
        ? (heroCatalogsOverride || [])
        : getHeroCatalogs();
    const heroes = rawHeroes.map(c => ({
        id: String(c?.id ?? ''),
        name: String(c?.name ?? ''),
        type: String(c?.type ?? '')
    }));

    const rawPresets = presetsOverride !== undefined
        ? (presetsOverride || [])
        : getPresetDefinitions();
    const presets = rawPresets.map(p => ({
        id: String(p?.id ?? ''),
        name: String(p?.name ?? ''),
        type: String(p?.type ?? '')
    }));

    const canonicalJson = JSON.stringify(normalizeForJson({ heroes, presets }));
    return crypto.createHash('sha256').update(canonicalJson).digest('hex').slice(0, 16);
}

/**
 * Builds a deterministic hash of the persisted configuration that determines
 * the Stremio manifest. Object key order is ignored, while array order is
 * preserved because it determines catalog ordering in the manifest.
 *
 * @param {object} userConfig normalized user config or raw AddonConfig data
 * @param {object} [options] optional overrides for testing definitions signature
 * @returns {string} SHA-256 fingerprint
 */
function buildManifestFingerprint(userConfig = {}, options = {}) {
    const profiles = Array.isArray(userConfig.profiles)
        ? userConfig.profiles
        : [];

    const definitionsSignature = options.definitionsSignature
        || buildManifestDefinitionsSignature(options.heroCatalogs, options.presets);

    const fingerprintInput = {
        schemaVersion: `${FINGERPRINT_SCHEMA_VERSION}:${definitionsSignature}`,
        definitionsSignature,
        activeProfileId: getEffectiveActiveProfileId(userConfig),
        // Profile order is not part of the manifest. Catalog order below is.
        profiles: profiles
            .map(projectManifestProfile)
            .sort((a, b) => {
                const aId = String(a.id);
                const bId = String(b.id);
                return aId < bId ? -1 : (aId > bId ? 1 : 0);
            }),
        customCatalogs: Array.isArray(userConfig.customCatalogs)
            ? userConfig.customCatalogs.map(projectManifestCatalog)
            : []
    };

    const canonicalJson = JSON.stringify(normalizeForJson(fingerprintInput));
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

module.exports = {
    FINGERPRINT_SCHEMA_VERSION,
    DEFAULT_HERO_CATALOGS,
    setHeroCatalogs,
    buildManifestDefinitionsSignature,
    buildManifestFingerprint
};
