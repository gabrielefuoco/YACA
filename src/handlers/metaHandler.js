/**
 * src/handlers/metaHandler.js
 *
 * Facciata di serving Stremio per i metadati (Ticket 41 - Fetta 2).
 * La logica di dominio risiede nel modulo pulito src/meta.
 */

const meta = require('../meta');

module.exports = {
    metaHandler: meta.metaHandler,
    isMetaDubbed: meta.isMetaDubbed,
    applyKitsuMappingToMeta: meta.applyKitsuMappingToMeta,
    alignVideoIdsToRequestedForm: meta.alignVideoIdsToRequestedForm,
    preparaListaEpisodi: meta.preparaListaEpisodi,
    buildResponseMeta: meta.buildResponseMeta,
    getKitsuMappingStats: meta.getKitsuMappingStats,
    resetKitsuMappingStats: meta.resetKitsuMappingStats,
    resolveImdbIdFromDump: meta.resolveImdbIdFromDump,
    resolveImdbIdPerEpisodi: meta.resolveImdbIdPerEpisodi
};
