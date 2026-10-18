const client = require('./client');
const manifest = require('./manifest');
const fingerprint = require('./fingerprint');
const collection = require('./collection');
const reconciler = require('./reconciler');

module.exports = {
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
