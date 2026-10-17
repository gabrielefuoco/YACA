/**
 * src/ricerca/index.js
 *
 * IL MODULO RICERCA DI YACA (Ticket 22).
 *
 * Confine architetturale (Decisione 16/22):
 * "Possiede «da una richiesta a una lista ordinata di candidati»:
 * il dispatch verso le fonti, la fusione locale/Tier 2, l'ordinamento.
 * L'AI è fuori dal modulo (fornisce il meccanismo, la ricerca possiede i prompt).
 * Una porta sola: cerca({ q, tipo, contesto, cap }) -> { items, motivi[] } (mai un errore)."
 *
 * Ha due consumatori del registro:
 * - la Ricerca (cerca)
 * - il Servire (CatalogRouter)
 */

const {
    cerca,
    TIPI_TITOLO,
    TIPI_GENERE,
    TIPI_KEYWORD,
    TIPI_PERSONA
} = require('./door');

const {
    defineSourceEntry,
    registerSource,
    getSource,
    getAllSources,
    findSourceForCatalog,
    findSourcesForSearch,
    duckDbSourceEntry,
    hybridSourceEntry,
    traktSourceEntry,
    watchlistSourceEntry,
    airingStateSourceEntry,
    aiDiscoverySourceEntry
} = require('./registry');

const {
    TIER2_FLAG,
    toTmdbId,
    mergeLocalWithTier2,
    fondiEOrdina
} = require('./fusione');

const {
    richiediComprensioneAI
} = require('./aiAdapter');

const {
    SEARCH_UNDERSTANDING_SYSTEM_PROMPT,
    buildSearchUnderstandingPrompt
} = require('./prompts');

module.exports = {
    // La porta unica
    cerca,
    TIPI_TITOLO,
    TIPI_GENERE,
    TIPI_KEYWORD,
    TIPI_PERSONA,

    // Il registro delle sei fonti
    defineSourceEntry,
    registerSource,
    getSource,
    getAllSources,
    findSourceForCatalog,
    findSourcesForSearch,
    sources: {
        duckdb: duckDbSourceEntry,
        hybrid: hybridSourceEntry,
        trakt: traktSourceEntry,
        watchlist: watchlistSourceEntry,
        airing_state: airingStateSourceEntry,
        ai_discovery: aiDiscoverySourceEntry
    },

    // Fusione e ordinamento
    TIER2_FLAG,
    toTmdbId,
    mergeLocalWithTier2,
    fondiEOrdina,

    // AI
    richiediComprensioneAI,
    SEARCH_UNDERSTANDING_SYSTEM_PROMPT,
    buildSearchUnderstandingPrompt
};
