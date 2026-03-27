const { normalizeContentId } = require('./contentId');



/**
 * Interseca N liste di risultati alternandoli (interleaving generalizzato).
 * Deduplica per ID.
 */
function interleaveMultipleResults(queryResultsArrays, limit, skip = 0) {
    const seen = new Set();
    const combined = [];
    if (!Array.isArray(queryResultsArrays) || queryResultsArrays.length === 0) return [];
    
    const maxLen = Math.max(...queryResultsArrays.map(arr => (arr || []).length), 0);

    for (let i = 0; i < maxLen; i++) {
        for (const arr of queryResultsArrays) {
            const item = (arr || [])[i];
            if (!item) continue;
            const itemId = item.id !== undefined && item.id !== null ? normalizeContentId(item.id) : null;
            if (itemId) {
                if (seen.has(itemId)) continue;
                seen.add(itemId);
            }
            combined.push(item);
        }
    }
    return combined.slice(skip, skip + limit);
}

/**
 * Normalizza qualsiasi catalogMeta (vecchio formato `filters` o nuovo `queries[]`)
 * nello Universal Catalog Schema. Garantisce backward compatibility.
 */
function normalizeToUniversalSchema(catalogMeta, directFilters) {
    // Caso 1: Filtri diretti passati dall'esterno (es. preview)
    if (directFilters) {
        // Multi-query AI filters already present
        if (Array.isArray(directFilters.queries) && directFilters.queries.length > 0) {
            return {
                queries: directFilters.queries,
                presentation_strategy: directFilters.presentation_strategy || 'popularity',
                weights: directFilters.weights
            };
        }

        // Merged catalog via directFilters
        if (directFilters.merge) {
            return {
                queries: null, // Handled by legacy merge path
                presentation_strategy: directFilters.merge.strategy === 'mixed' ? 'interleave' : 'popularity',
                _isMerge: true,
                _rawFilters: directFilters
            };
        }
        return {
            queries: [{ strategy: 'discovery', ...directFilters }],
            presentation_strategy: 'popularity'
        };
    }

    if (!catalogMeta) return { queries: [{}], presentation_strategy: 'popularity' };

    // Caso 2: Nuovo formato con queries[] già presente
    if (Array.isArray(catalogMeta.queries) && catalogMeta.queries.length > 0) {
        return {
            queries: catalogMeta.queries,
            presentation_strategy: catalogMeta.presentation_strategy || 'popularity',
            weights: catalogMeta.weights
        };
    }

    // Caso 3: Vecchio formato con filters (backward compat per DB documents esistenti)
    if (catalogMeta.filters && Object.keys(catalogMeta.filters).length > 0) {
        // Merged catalog vecchio formato
        if (catalogMeta.source === 'merged' || catalogMeta.sourceType === 'merged' || catalogMeta.filters.merge) {
            return {
                queries: null,
                presentation_strategy: 'popularity',
                _isMerge: true,
                _rawFilters: catalogMeta.filters
            };
        }
        return {
            queries: [{ strategy: 'discovery', ...catalogMeta.filters }],
            presentation_strategy: catalogMeta.presentation_strategy || 'popularity',
            weights: catalogMeta.weights
        };
    }

    // Caso 4: Catalogo senza filtri (placeholder per trakt/signature che vengono intercettati prima)
    return {
        queries: [{}],
        presentation_strategy: catalogMeta.presentation_strategy || 'popularity'
    };
}

/**
 * Applica lo score di consenso per item che appaiono in più risultati di query.
 * Restituisce una lista di item con 'consensusBonus' e 'consensusCount'.
 */
function applyConsensusScoring(queryResults) {
    if (!Array.isArray(queryResults)) return [];
    
    const mergedMap = new Map();
    queryResults.forEach((items, queryIndex) => {
        for (const item of items || []) {
            if (!item?.id) continue;
            const normalizedId = normalizeContentId(item.id);
            if (mergedMap.has(normalizedId)) {
                const existing = mergedMap.get(normalizedId);
                existing.consensusCount += 1;
                existing.queryIndexes.add(queryIndex);
            } else {
                mergedMap.set(normalizedId, {
                    ...item,
                    consensusCount: 1,
                    queryIndexes: new Set([queryIndex])
                });
            }
        }
    });

    const finalItems = Array.from(mergedMap.values());
    for (const item of finalItems) {
        item.consensusBonus = item.consensusCount > 1 ? (item.consensusCount ** 2) - 1 : 0;
        delete item.queryIndexes;
    }
    
    return finalItems;
}

module.exports = {
    interleaveMultipleResults,
    normalizeToUniversalSchema,
    applyConsensusScoring
};
