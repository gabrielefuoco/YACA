const fs = require('fs');
const oldData = JSON.parse(fs.readFileSync('../src/data/graph_data.json', 'utf8'));
const newData = JSON.parse(fs.readFileSync('../src/data/hierarchical_graph.json', 'utf8'));

const oldToNew = {};

// Build a reverse index for new clusters: keyword -> new_cid
const kwToNewCid = {};
for (const [cid, data] of Object.entries(newData.L1)) {
    for (const kw of data.keywords) {
        kwToNewCid[kw] = cid;
    }
}

// For each old cluster, find the best matching new cluster
for (const [oldId, members] of Object.entries(oldData.cluster_members)) {
    const votes = {};
    for (const kw of members) {
        const newCid = kwToNewCid[kw];
        if (newCid) {
            votes[newCid] = (votes[newCid] || 0) + 1;
        }
    }
    
    // Find the newCid with the most votes
    let bestCid = null;
    let maxVotes = 0;
    for (const [cid, v] of Object.entries(votes)) {
        if (v > maxVotes) {
            maxVotes = v;
            bestCid = cid;
        }
    }
    
    if (bestCid) {
        oldToNew[oldId] = bestCid;
    }
}

// Translate adjacency
const newAdj = {};
for (const [oldId, edges] of Object.entries(oldData.cluster_adjacency)) {
    const mappedSource = oldToNew[oldId];
    if (!mappedSource) continue;
    
    if (!newAdj[mappedSource]) newAdj[mappedSource] = {};
    
    for (const [oldTarget, weight] of Object.entries(edges)) {
        const mappedTarget = oldToNew[oldTarget];
        if (mappedTarget && mappedTarget !== mappedSource) { // avoid self-loops from merges
            // take max weight if there are multiple edges mapped to the same target
            newAdj[mappedSource][mappedTarget] = Math.max(newAdj[mappedSource][mappedTarget] || 0, weight);
        }
    }
}

newData.L1_adjacency = newAdj;
fs.writeFileSync('../src/data/hierarchical_graph.json', JSON.stringify(newData));
console.log('Successfully mapped old adjacency to new clusters!');
