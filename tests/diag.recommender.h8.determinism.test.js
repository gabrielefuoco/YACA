/**
 * H8 — Non-determinismo: getKeywordsForNodes campiona 30 keyword a caso.
 *
 * Evidenza: HierarchicalGraph.js:205 — se un nodo ha >30 keyword espanse,
 * `kwArray.sort(() => 0.5 - Math.random()).slice(0, 30)`: set diversi a ogni chiamata.
 * Probe: 24/469 nodi L2 hanno espansione >30 (t_0: 57 keyword); due chiamate su t_0
 * restituiscono set diversi (verificato in plain node). Impatta fetchSmartAndPool
 * (catalogStrategies.js:25-32,159) e TUTTE le carte del matchmaker: stesso profilo →
 * pool diversi a ogni cache miss, cache poco efficace, ordinamenti non riproducibili.
 *
 * Test (ROSSO-capace): due chiamate consecutive sullo stesso nodo L2 (>30 keyword)
 * devono restituire lo STESSO set di keyword. Oggi fallisce.
 */

const graph = require('../src/engines/graph/HierarchicalGraph');

// Espansione deterministica del nodo (stessa logica di getKeywordsForNodes, senza il cap).
function fullKeywordUnion(nodeId, level = 'L2') {
    const kwSet = new Set();
    const l1s = graph.data.L2?.[nodeId]?.children_L1 || [];
    for (const l1 of l1s) {
        (graph.data.L1?.[l1]?.keywords || []).forEach(k => kwSet.add(k));
    }
    return Array.from(kwSet);
}

function firstL2WithMoreThan30Keywords() {
    for (const [nid, node] of Object.entries(graph.data.L2 || {})) {
        const full = fullKeywordUnion(nid, 'L2');
        if (full.length > 30) return { nid, full };
    }
    return null;
}

describe('H8 — getKeywordsForNodes è non deterministico (>30 keyword)', () => {
    beforeAll(() => {
        if (!graph.isLoaded) graph.loadData();
    });

    it('ROSSO: due chiamate consecutive sullo stesso nodo L2 devono restituire lo stesso set', () => {
        const found = firstL2WithMoreThan30Keywords();
        expect(found).not.toBeNull(); // il grafo ha 24 nodi L2 con >30 keyword (probe)

        const { nid } = found;
        const call1 = graph.getKeywordsForNodes([nid], 'L2').get(nid) || [];
        const call2 = graph.getKeywordsForNodes([nid], 'L2').get(nid) || [];

        expect(call1.length).toBe(30); // cap attuale: campione di 30
        const set1 = new Set(call1);
        const set2 = new Set(call2);
        expect(set1).toEqual(set2);
    });

    it('verde (documentazione): il campione è un sottoinsieme delle keyword reali del nodo', () => {
        const found = firstL2WithMoreThan30Keywords();
        expect(found).not.toBeNull();

        const { nid, full } = found;
        const sampled = graph.getKeywordsForNodes([nid], 'L2').get(nid) || [];
        const fullSet = new Set(full);
        expect(sampled.every(k => fullSet.has(k))).toBe(true);
    });
});
