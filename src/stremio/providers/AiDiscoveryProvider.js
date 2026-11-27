const { getTmdbIdByName, createTmdbClient } = require('../../clients/tmdb');
const { applyConsensusScoring } = require('../../infra');
const { getDuckDbCatalogFromFilters } = require('../../indice');
const { hydrateResultsFromLocalDetailsCache } = require('../processors/MetadataHydrator');
const { G } = require('../../indice/filters');
const { normalizza } = require('../../infra/testo');

function getTmdbVoteScore(item) {
    const rawVote = item?.rawTMDB?.vote_average ?? item?.vote_average ?? item?.imdbRating;
    const vote = Number.parseFloat(rawVote);
    return Number.isFinite(vote) ? vote : 0;
}


function applyAiQualityFilters(query) {
    if (query.strategy === 'discovery') {
        if (query.include_adult === undefined) query.include_adult = false;
        if (query['vote_count.gte'] === undefined) query['vote_count.gte'] = 75; // taglia via i b-movie fake amatoriali e porno low budget
        if (query.original_language === undefined) query.original_language = 'en|it|es|fr|de|ja|ko'; // whitelist lingue principali + anime/kdrama
    }
    return query;
}

const LOOKAHEAD_PAGES = 3;
const PAGE_SIZE = 20;

function getKeywordFallbackSequence(originalKeyword, fallbackArray = []) {
    const sequence = [];
    
    if (originalKeyword && typeof originalKeyword === 'string') {
        const isOr = originalKeyword.includes('|');
        const separator = isOr ? '|' : ',';
        const keys = originalKeyword.split(/[|,]/).map(k => k.trim()).filter(Boolean);
        
        if (keys.length > 1) {
            for (let i = keys.length - 1; i >= 1; i--) {
                sequence.push(keys.slice(0, i).join(separator));
            }
        }
    }

    if (Array.isArray(fallbackArray)) {
        for (const kw of fallbackArray) {
            if (kw && typeof kw === 'string') {
                sequence.push(kw.trim());
            }
        }
    }

    sequence.push(null);

    return sequence;
}

/** Il primo risultato locale è davvero il titolo chiesto? (non «Batman Begins» per «batman») */
function titoloCorrisponde(nome, item) {
    const atteso = normalizza(nome);
    if (!atteso) return false;
    const raw = item?.rawTMDB || {};
    return [item?.name, raw.title, raw.original_title, raw.name, raw.original_name]
        .filter(Boolean)
        .some(candidato => normalizza(candidato) === atteso);
}

/**
 * L'id TMDB di un titolo, cercato PRIMA nel nostro indice e solo dopo su TMDB.
 *
 * `similar_to` arriva dal catalogo salvato come nome e finiva sempre su una chiamata di rete
 * (`/search/movie`). Il titolo, se è nostro, è già in DuckDB: dieci millisecondi invece di un
 * giro su internet. TMDB resta il ripiego per i titoli che conosciamo solo di nome.
 */
async function risolviIdTitolo(nome, type, tmdbApiKey, settings) {
    const pulito = String(nome || '').trim();
    if (!pulito) return null;

    try {
        const locali = await getDuckDbCatalogFromFilters({ text_search: pulito }, type, 0, 1, settings);
        const primo = Array.isArray(locali) ? locali[0] : null;
        const id = Number(String(primo?.id || '').replace(/^tmdb:/i, ''));
        if (Number.isFinite(id) && id > 0 && titoloCorrisponde(pulito, primo)) return id;
    } catch (_err) {
        // Indice non pronto: si prova TMDB, come prima.
    }

    return await getTmdbIdByName(tmdbApiKey, type === 'series' ? 'tv' : 'movie', pulito);
}

async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}, cacheOptions = {}, limit = PAGE_SIZE) {
    if (filters.strategy === "similar" && filters.similar_to) {
        const targetId = await risolviIdTitolo(filters.similar_to, type, tmdbApiKey, settings);
        if (targetId) {
            return await getDuckDbCatalogFromFilters({ similar_to: targetId }, type, skip, limit, settings);
        }
        return [];
    }
    if (filters.strategy === "multi_search" || filters.strategy === "lexical_search") {
        return await getDuckDbCatalogFromFilters({ text_search: filters.text_search || filters.keyword }, type, skip, limit, settings);
    }
    if (filters.strategy === "manual_list") {
        let tmdbIds = [];
        if (Array.isArray(filters.items)) {
            tmdbIds = filters.items.map(item => typeof item === 'object' && item !== null ? (item.tmdbId || item.id) : item).filter(Boolean);
        } else if (Array.isArray(filters.tmdbIds)) {
            tmdbIds = filters.tmdbIds;
        } else if (filters.with_id || filters.params?.with_id) {
            tmdbIds = [filters.with_id || filters.params.with_id];
        }
        if (tmdbIds.length === 0) return [];
        return await getDuckDbCatalogFromFilters({ tmdbIds, uniqueById: filters.uniqueById }, type, skip, limit, settings);
    }
    // Usa DuckDB per tutti i cataloghi discovery nativi (inclusi preset e hybrid fallback)
    return await getDuckDbCatalogFromFilters(filters, type, skip, limit, settings);
}

function collectManualListItems(queries) {
    const items = [];
    for (const query of queries) {
        if (Array.isArray(query.items)) items.push(...query.items);
        else if (Array.isArray(query.tmdbIds)) items.push(...query.tmdbIds);
        else {
            const id = query.with_id || query.params?.with_id;
            if (id) items.push(id);
        }
    }
    return items;
}

// Fase 2: Processa qualsiasi catalogo tramite array "queries" (LookAhead, Consensus)
async function executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions) {
    const queries = universalCatalog.queries || [];

    if (queries.length === 0) return [];

    // I Matchmaker legacy salvano una query manual_list per fonte. Un solo ID
    // genera un piano DuckDB leggero: per le liste compatibili un batch IN evita
    // decine di query full-table e rende skip un vero offset SQL.
    const canBatchManualList = queries.length > 1 &&
        queries.every(query => query.strategy === 'manual_list');
    if (canBatchManualList) {
        const items = collectManualListItems(queries);
        if (items.length > 0) {
            return await executeComplexStrategy(
                { strategy: 'manual_list', items, uniqueById: true },
                tmdbClient,
                tmdbApiKey,
                type,
                skip,
                settings,
                cacheOptions
            );
        }
    }

    let finalResults;

    if (queries.length === 1) {
        let query = { ...queries[0] };
        if (!query.strategy) query.strategy = 'discovery';
        query = applyAiQualityFilters(query);

        let primaryResults = await executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);

        const withGenres = Array.isArray(query.with_genres)
            ? query.with_genres.map(String)
            : String(query.with_genres ?? '').split(/[|,]/);
        // Universally relax keywords if primaryResults are empty to prevent 0 items bugs
        if (!settings?.noFallback && (!primaryResults || primaryResults.length === 0) && (query.with_keywords || query.keyword)) {
            const fallbackKeywords = getKeywordFallbackSequence(query.keyword || query.with_keywords, query.fallback_keywords);
            let relaxedResults = [];
            for (const fallbackKw of fallbackKeywords) {
                const relaxedQuery = { ...query };
                if (fallbackKw === null) {
                    delete relaxedQuery.with_keywords;
                    delete relaxedQuery.keyword;
                } else {
                    relaxedQuery.keyword = fallbackKw;
                    delete relaxedQuery.with_keywords;
                }
                relaxedResults = await executeComplexStrategy(relaxedQuery, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);
                if (relaxedResults && relaxedResults.length > 0) {
                    break;
                }
            }
            primaryResults = relaxedResults.map(item => ({ ...item, _sourceKeyword: query.keyword || queries[0]?.keyword, _sourceGenres: query.with_genres || queries[0]?.with_genres }));
        } else if (primaryResults) {
            primaryResults = primaryResults.map(item => ({ ...item, _sourceKeyword: query.keyword || queries[0]?.keyword, _sourceGenres: query.with_genres || queries[0]?.with_genres }));
        }

        finalResults = primaryResults || [];
    } else {
        // Una lettura sola per query. DuckDB è locale e `LIMIT skip + PAGE_SIZE` in una query
        // restituisce esattamente la concatenazione delle pagine: tre query da 20 diventano una
        // da 60. La finestra resta `LOOKAHEAD_PAGES * PAGE_SIZE` perché **identica fra pagina 1 e
        // pagina 2** è ciò che rende le pagine disgiunte (contratto H5): cambiando la finestra
        // cambia il consensus, e gli item già mostrati tornano in pagina 2.
        const fetchLimit = Math.max(LOOKAHEAD_PAGES * PAGE_SIZE, skip + PAGE_SIZE);

        const queryResults = await Promise.all(
            queries.map(async (queryDef) => {
                let query = { ...queryDef };
                if (!query.strategy) query.strategy = 'discovery';
                query = applyAiQualityFilters(query);

                const primari = await executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, 0, settings, cacheOptions, fetchLimit);
                let flatResults = (primari || []).map(item => ({ ...item, _sourceKeyword: query.keyword || queryDef.keyword, _sourceGenres: query.with_genres || queryDef.with_genres }));

                // Fallback morbido se le keyword salvate non esistono nel dump
                if (!settings?.noFallback && flatResults.length === 0 && (query.with_keywords || query.keyword)) {
                    const fallbackKeywords = getKeywordFallbackSequence(query.keyword || query.with_keywords, query.fallback_keywords);
                    let relaxedResults = [];
                    for (const fallbackKw of fallbackKeywords) {
                        const relaxedQuery = { ...query };
                        if (fallbackKw === null) {
                            delete relaxedQuery.with_keywords;
                            delete relaxedQuery.keyword;
                        } else {
                            relaxedQuery.keyword = fallbackKw;
                            delete relaxedQuery.with_keywords;
                        }

                        relaxedResults = await executeComplexStrategy(relaxedQuery, tmdbClient, tmdbApiKey, type, 0, settings, cacheOptions, fetchLimit) || [];
                        if (relaxedResults.length > 0) {
                            relaxedResults = relaxedResults.map(item => ({ ...item, _sourceKeyword: fallbackKw || queryDef.keyword, _sourceGenres: query.with_genres || queryDef.with_genres }));
                            break;
                        }
                    }
                    flatResults = relaxedResults;
                }

                return flatResults;
            })
        );

        const finalItems = applyConsensusScoring(queryResults);
        
        finalItems.sort((a, b) => {
            const bonusDiff = (b.consensusBonus || 0) - (a.consensusBonus || 0);
            if (bonusDiff !== 0) return bonusDiff;
            return (b.popularity || 0) - (a.popularity || 0);
        });

        finalResults = finalItems.slice(skip, skip + PAGE_SIZE);
    }

    return finalResults;
}

// Esegue Deep AI Search, consensus ranking e profilazione
module.exports = {
    executeUniversalPipeline
};
