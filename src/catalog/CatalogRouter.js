/**
 * src/catalog/CatalogRouter.js
 *
 * IL DISPATCHER DEI CATALOGHI (Consumatore del Registro delle Fonti).
 *
 * Confine architetturale (Ticket 22):
 * Il servire non possiede più i singoli provider né importa le sei fonti una a una.
 * Consulta il REGISTRO DELLE FONTI (src/ricerca/registry.js) che dichiara il contratto
 * di ciascun provider e invoca source.serveCatalog(context).
 */

const { findSourceForCatalog } = require('../ricerca/registry');
const { getPresets } = require('./presets');

const PRESET_PAGE_SIZE = 20;

/**
 * Instrada una richiesta di catalogo alla fonte deputata tramite il registro.
 */
async function routeCatalogRequest(args, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta) {
    const { id, type, extra = {}, filters: directFilters } = args || {};
    const skip = extra.skip || 0;
    const search = extra.search || null;
    const sortBy = extra.sortBy || null;

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    let effectiveMeta = catalogMeta;
    if (!effectiveMeta && baseId.startsWith('preset_')) {
        const presets = getPresets();
        effectiveMeta = presets.find(p => p.id === baseId || p.id === id);
    }

    const requestContext = {
        args,
        id,
        baseId,
        type,
        skip,
        search,
        sortBy,
        userConfig,
        tmdbClient,
        tmdbApiKey,
        activeProfileSettings,
        tmdbFetchOptions,
        catalogMeta,
        effectiveMeta,
        directFilters,
        extra
    };

    const source = findSourceForCatalog(requestContext);
    if (source) {
        try {
            return await source.serveCatalog(requestContext);
        } catch (err) {
            console.error(`[CatalogRouter] Errore serveCatalog per fonte ${source.id}:`, err.message);
            return [];
        }
    }

    return [];
}

module.exports = { routeCatalogRequest, PRESET_PAGE_SIZE };
