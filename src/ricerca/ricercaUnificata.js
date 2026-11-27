/**
 * src/ricerca/ricercaUnificata.js
 *
 * LA RICERCA DI STREMIO, IN UN PERCORSO SOLO.
 *
 * La query entra e diventa intenti con il parser della sintassi; il compilatore la traduce in
 * filtri dell'indice. Tre modi, tutti locali:
 *   - `testo`  → Tier 1 (DuckDB FTS) + Tier 2 (FTS5) + nomi appresi + arricchimento;
 *   - `filtri` → una discovery/discovery-like su DuckDB;
 *   - `semi`   → i vicini di uno o più titoli (`POST /vicini`, matrice precalcolata);
 * più righe = più intenti, eseguiti e fusi dal consensus.
 *
 * **Nessun modello nel percorso**: la vecchia ricerca «AI» (pagata a ogni query, e senza chiave
 * peggiore della locale) è stata rimossa con la fetta 7. Restano le sue lezioni: il locale viene
 * prima, il degrado è dichiarato (`motivi`), e nessuna funzione qui solleva mai.
 */

const { mergeLocalWithTier2 } = require('./fusione');
const { compilaIntenti, eseguiPiani } = require('./compilatore');

const PRESET_PAGE_SIZE = 20;

/**
 * Candidati locali: Tier 1 (DuckDB) + Tier 2 (FTS5) + nomi appresi, fusi e deduplicati.
 * È l'estrazione di ciò che stava dentro `duckDbSourceEntry.serveCatalog`: stessa logica, un
 * posto solo, così la porta (`door.cerca`) e il servire (Stremio) non possono divergere.
 */
async function candidatiLocali({
    q,
    type = 'movie',
    skip = 0,
    limit = PRESET_PAGE_SIZE,
    contesto = {},
    learnedLimit = null
} = {}) {
    try {
        const { getDuckDbCatalogFromFilters } = require('../indice');
        // `tier2Search` tiene aperto l'handle SQLite: si carica solo se c'è una ricerca da fare,
        // non al boot di chi importa questo modulo (stessa regola del registro delle fonti).
        const { searchTier2, searchLearnedTitles, LEARNED_PAGE_SIZE } = require('./tier2Search');
        const limiteImparati = learnedLimit || LEARNED_PAGE_SIZE;

        const localItems = await getDuckDbCatalogFromFilters(
            { _search: q },
            type,
            skip,
            limit,
            contesto
        ).catch(() => []);

        const tier2Items = searchTier2(q, { type, limit });
        const learnedItems = await searchLearnedTitles(q, { type, limit: limiteImparati }).catch(() => []);

        return mergeLocalWithTier2(mergeLocalWithTier2(localItems, tier2Items), learnedItems);
    } catch (_err) {
        return [];
    }
}

/**
 * La ricerca locale completa: candidati + arricchimento dei titoli del Tier 2 (poster, titolo
 * italiano, trama) con il budget già fissato in `tier2Enrich`.
 */
async function ricercaLocale({
    q,
    type = 'movie',
    skip = 0,
    limit = PRESET_PAGE_SIZE,
    activeProfileSettings = {},
    tmdbApiKey = null,
    contesto = null
} = {}) {
    const items = await candidatiLocali({
        q,
        type,
        skip,
        limit,
        contesto: contesto || activeProfileSettings || {}
    });

    try {
        const { enrichTier2Items } = require('./tier2Enrich');
        return await enrichTier2Items(items, { apiKey: tmdbApiKey });
    } catch (_err) {
        return items;
    }
}

/**
 * La query diventa intenti. Non solleva: un parser rotto è una lista vuota con un motivo.
 */
async function pianificaQuery(query, type, contesto) {
    try {
        const { pianifica } = require('./pianificatore');
        const { creaRisolutori } = require('./risolutori');
        return await pianifica(query, { risolutori: creaRisolutori({ type, contesto }) });
    } catch (err) {
        return { intenti: [], motivi: [`errore_parser: ${err.message || 'sconosciuto'}`] };
    }
}

/**
 * LA RICERCA DI STREMIO: un solo percorso per `yaca_search_standard` e `yaca_search_ai`.
 *
 * @param {Object} params
 * @param {string} params.q
 * @param {'movie'|'series'} params.type
 * @param {number} [params.skip=0]
 * @param {Object} [params.userConfig]
 * @param {Object} [params.activeProfileSettings]
 * @param {string} [params.tmdbApiKey]
 * @param {Object} [params.tmdbFetchOptions]
 * @returns {Promise<Array<Object>>} item grezzi (mai un'eccezione)
 */
async function cercaUnificata({
    q,
    type = 'movie',
    skip = 0,
    activeProfileSettings = {},
    tmdbApiKey = null
} = {}) {
    const inizio = Date.now();
    const query = String(q || '').trim();
    if (!query) return [];

    // 1. La sintassi: la query diventa un intento (o un motivo per cui non lo è).
    const { intenti, motivi } = await pianificaQuery(query, type, activeProfileSettings);
    const compilato = compilaIntenti(intenti, { type });
    // Un motivo può arrivare da entrambi gli strati («nessuna_condizione»): in risposta non si
    // ripete.
    const tuttiIMotivi = [...new Set([...motivi, ...compilato.motivi])];
    const piani = compilato.piani;

    if (piani.length === 0) {
        console.log(
            `[RicercaUnificata] nessuna condizione q="${query}" type=${type} ` +
            `motivi=${JSON.stringify(tuttiIMotivi)} ms=${Date.now() - inizio}`
        );
        return [];
    }

    // 2. Una lettura sola: discovery, semi, o più piani con consensus. Stremio manda una riga, ma
    // lo stesso percorso serve i cataloghi multi-blocco.
    const soloTesto = piani.length === 1 && piani[0].modo === 'testo';
    if (!soloTesto) {
        const esito = await eseguiPiani(piani, {
            type,
            skip,
            cap: PRESET_PAGE_SIZE,
            contesto: activeProfileSettings
        });
        const items = esito.items || [];
        const motiviEsecuzione = esito.motivi || [];
        console.log(
            `[RicercaUnificata] ${piani.map(p => p.modo).join('+')} q="${query}" type=${type} skip=${skip} ` +
            `risultati=${items.length} ms=${Date.now() - inizio}` +
            (tuttiIMotivi.length + motiviEsecuzione.length > 0
                ? ` motivi=${JSON.stringify([...new Set([...tuttiIMotivi, ...motiviEsecuzione])])}`
                : '')
        );
        return items.slice(0, PRESET_PAGE_SIZE);
    }

    // 3. Testo: il percorso locale completo (Tier 1 + Tier 2 + nomi appresi + arricchimento).
    // Nessuna escalation a un modello: la ricerca è tutta qui.
    const items = await ricercaLocale({
        q: piani[0].filtri.text_search,
        type,
        skip,
        activeProfileSettings,
        tmdbApiKey
    });

    console.log(
        `[RicercaUnificata] testo q="${query}" type=${type} skip=${skip} ` +
        `risultati=${items.length} ms=${Date.now() - inizio}`
    );
    return items.slice(0, PRESET_PAGE_SIZE);
}


module.exports = {
    PRESET_PAGE_SIZE,
    candidatiLocali,
    ricercaLocale,
    cercaUnificata
};
