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
    compilaIntenti,
    eseguiPiani
} = require('./compilatore');

const {
    creaRisolutori,
    risolviConcetto,
    risolviPersona,
    risolviTitolo,
    risolviProvider,
    chiudiPersone
} = require('./risolutori');

const {
    OPERATORI,
    analizza: analizzaSintassi,
    risolvi: risolviSintassi,
    pianifica,
    interpretaAnno
} = require('./pianificatore');

const {
    cercaUnificata,
    ricercaLocale,
    candidatiLocali
} = require('./ricercaUnificata');

/**
 * Da un testo in sintassi alla pagina d'anteprima: intenti, `queries` compilate, titoli e motivi.
 *
 * Un posto solo per la pipeline che le due rotte di anteprima condividono (`/api/catalog/preview-catalog`
 * e `/api/configurazione/anteprima`) — e un posto solo che conosce l'ordine parser → compilatore →
 * indice. Le rotte non importano più i file interni del modulo.
 *
 * @param {Object} params
 * @param {string} params.testo
 * @param {'movie'|'series'} [params.type='movie']
 * @param {Object} [params.contesto] contesto di profilo risolto
 * @param {number} [params.cap=20]
 * @returns {Promise<{intenti: Object[], motivi: string[], queries: Object[], items: Object[]}>}
 */
async function compilaTesto({ testo, type = 'movie', contesto = null, cap = 20 } = {}) {
    const analisi = await pianifica(testo, { risolutori: creaRisolutori({ type, contesto }) });
    const compilato = compilaIntenti(analisi.intenti, { type });
    const esecuzione = await eseguiPiani(compilato.piani, { type, cap, contesto });

    const queries = compilato.piani.map(piano => ({
        strategy: piano.modo === 'semi' ? 'similar' : 'discovery',
        ...piano.filtri,
        ...(piano.modo === 'semi' && piano.semi.length > 0 ? { similar_to: piano.semi[0] } : {})
    }));

    return {
        intenti: analisi.intenti,
        motivi: [...new Set([...analisi.motivi, ...compilato.motivi, ...(esecuzione.motivi || [])])],
        queries,
        items: esecuzione.items || []
    };
}

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

    // La ricerca unificata di Stremio (locale + AI quando serve)
    cercaUnificata,
    ricercaLocale,
    candidatiLocali,

    // La pipeline dell'anteprima (parser → compilatore → indice), per le rotte di creator
    compilaTesto,

    // Il parser della sintassi esplicita (fetta 2)
    OPERATORI,
    analizzaSintassi,
    risolviSintassi,
    pianifica,
    interpretaAnno,

    // I risolutori veri (fetta 3): lessico, grafo, people.db, FTS, provider
    creaRisolutori,
    risolviConcetto,
    risolviPersona,
    risolviTitolo,
    risolviProvider,
    chiudiPersone,

    // Learned names (archivio titoli appresi - getter pigri per non anticipare better-sqlite3)
    get LearnedNamesStore() { return require('./learnedNames').LearnedNamesStore; },
    get DB_FILE() { return require('./learnedNames').DB_FILE; },
    get MAX_ROWS() { return require('./learnedNames').MAX_ROWS; },
    get PRUNE_TARGET() { return require('./learnedNames').PRUNE_TARGET; },
    get normalizeText() { return require('./learnedNames').normalizeText; },
    get titleTokens() { return require('./learnedNames').titleTokens; },
    get toLearnableRow() { return require('./learnedNames').toLearnableRow; },
    get learnNames() { return require('./learnedNames').learnNames; },
    get searchLearnedNames() { return require('./learnedNames').searchLearnedNames; },
    get defaultDataDir() { return require('./learnedNames').defaultDataDir; },
    get defaultDbPath() { return require('./learnedNames').defaultDbPath; },
    get closeLearnedNames() { return require('./learnedNames').closeLearnedNames; },
    get learnedNamesPath() { return require('./learnedNames').learnedNamesPath; }
};

