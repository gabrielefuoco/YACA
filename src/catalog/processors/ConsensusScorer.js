const { normalizeContentId } = require('../../utils/contentId');

/**
 * Unisce i risultati di multiple query, e assegna un bonus di popolarità
 * e rilevanza se un item compare in più di una query (Consensus).
 */
function mergeAndScoreConsensus(queryResultsList) {
    const mergedMap = new Map();
    queryResultsList.forEach((items, queryIndex) => {
        for (const item of items || []) {
            if (!item || !item.id) continue;
            
            const normalizedItemId = normalizeContentId(item.id);
            if (mergedMap.has(normalizedItemId)) {
                const existing = mergedMap.get(normalizedItemId);
                existing.consensusCount += 1;
                existing.queryIndexes.add(queryIndex);
            } else {
                mergedMap.set(normalizedItemId, {
                    ...item,
                    consensusCount: 1,
                    queryIndexes: new Set([queryIndex])
                });
            }
        }
    });

    let finalItems = Array.from(mergedMap.values());
    
    for (const item of finalItems) {
        const consensusBonus = item.consensusCount > 1 ? (item.consensusCount ** 2) - 1 : 0;
        item.consensusBonus = consensusBonus;
        delete item.queryIndexes;
    }

    return finalItems;
}

module.exports = { mergeAndScoreConsensus };
