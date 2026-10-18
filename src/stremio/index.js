const client = require('./client');
const badges = require('./badges');
const manifest = require('./manifest');
const fingerprint = require('./fingerprint');
const collection = require('./collection');
const reconciler = require('./reconciler');

module.exports = {
    // Badge post-cache (servire: il feed li applica, il catalogo non li conosce)
    applyPostCacheBadges: (...a) => badges.applyPostCacheBadges(...a),
    annotationKeyFor: (...a) => badges.annotationKeyFor(...a),
    resolveImdbMap: (...a) => badges.resolveImdbMap(...a),
    // Client
    stremioClient: client.stremioClient,
    stremioLikesClient: client.stremioLikesClient,

    // Manifest
    buildManifest: manifest.buildManifest,
    buildRootManifest: manifest.buildRootManifest,
    resolveCatalogType: manifest.resolveCatalogType,
    getCatalogExtra: manifest.getCatalogExtra,
    defaultExtra: manifest.defaultExtra,
    presetExtra: manifest.presetExtra,
    searchExtra: manifest.searchExtra,
    getSortByValue: manifest.getSortByValue,
    SORT_OPTIONS: manifest.SORT_OPTIONS,
    SORT_MAP: manifest.SORT_MAP,

    // Fingerprint
    FINGERPRINT_SCHEMA_VERSION: fingerprint.FINGERPRINT_SCHEMA_VERSION,
    DEFAULT_HERO_CATALOGS: fingerprint.DEFAULT_HERO_CATALOGS,
    setHeroCatalogs: fingerprint.setHeroCatalogs,
    buildManifestDefinitionsSignature: fingerprint.buildManifestDefinitionsSignature,
    buildManifestFingerprint: fingerprint.buildManifestFingerprint,

    // Collection & Library Sync
    updateStremioAddonCollection: collection.updateStremioAddonCollection,
    syncAllStremioData: collection.syncAllStremioData,
    fetchStremioLibrary: collection.fetchStremioLibrary,
    pushToStremioLibrary: collection.pushToStremioLibrary,
    buildStremioLibraryPayload: collection.buildStremioLibraryPayload,
    validateManifestUrl: collection.validateManifestUrl,

    // Reconciler
    reconcileManifests: reconciler.reconcileManifests,

    // Serving
    get catalogHandler() { return require('./catalogHandler').catalogHandler; }
};
