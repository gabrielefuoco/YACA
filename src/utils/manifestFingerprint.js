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

/**
 * Builds a deterministic hash of the persisted configuration that determines
 * the Stremio manifest. Object key order is ignored, while array order is
 * preserved because it determines catalog ordering in the manifest.
 *
 * @param {object} userConfig normalized user config or raw AddonConfig data
 * @returns {string} SHA-256 fingerprint
 */
function buildManifestFingerprint(userConfig = {}) {
    const profiles = Array.isArray(userConfig.profiles)
        ? userConfig.profiles
        : [];

    const fingerprintInput = {
        schemaVersion: FINGERPRINT_SCHEMA_VERSION,
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
    buildManifestFingerprint
};
