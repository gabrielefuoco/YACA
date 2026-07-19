const fs = require('fs');
const graphData = JSON.parse(fs.readFileSync('../src/data/graph_data.json', 'utf8'));

// Guarda i pesi reali degli archi di un cluster
const clusterIds = Object.keys(graphData.cluster_adjacency);
const sample = clusterIds[100]; // prendi un cluster a caso

console.log(`Cluster: ${sample} (${graphData.cluster_members[sample][0]})`);
const adj = graphData.cluster_adjacency[sample] || {};
const sorted = Object.entries(adj).sort((a,b) => b[1] - a[1]);

console.log("\nPesi degli archi (top 10):");
sorted.slice(0, 10).forEach(([id, w]) => {
    const nw = w / (w + 2.0); // squash
    const opacity = 0.6 * (0.1 + nw * 0.9);
    console.log(`  -> ${graphData.cluster_members[id][0].padEnd(30)} weight=${w.toFixed(4)}  normalized=${nw.toFixed(3)}  opacity=${opacity.toFixed(3)}`);
});

console.log("\nPesi degli archi (bottom 10):");
sorted.slice(-10).forEach(([id, w]) => {
    const nw = w / (w + 2.0); // squash
    const opacity = 0.6 * (0.1 + nw * 0.9);
    console.log(`  -> ${graphData.cluster_members[id][0].padEnd(30)} weight=${w.toFixed(4)}  normalized=${nw.toFixed(3)}  opacity=${opacity.toFixed(3)}`);
});

// Statistiche globali
let allWeights = [];
for (const cId of clusterIds) {
    for (const [nId, w] of Object.entries(graphData.cluster_adjacency[cId] || {})) {
        allWeights.push(w);
    }
}
allWeights.sort((a,b) => a-b);
console.log(`\nStatistiche pesi archi globali (${allWeights.length} archi):`);
console.log(`  Min:    ${allWeights[0].toFixed(4)}`);
console.log(`  p10:    ${allWeights[Math.floor(allWeights.length*0.1)].toFixed(4)}`);
console.log(`  p25:    ${allWeights[Math.floor(allWeights.length*0.25)].toFixed(4)}`);
console.log(`  Median: ${allWeights[Math.floor(allWeights.length*0.5)].toFixed(4)}`);
console.log(`  p75:    ${allWeights[Math.floor(allWeights.length*0.75)].toFixed(4)}`);
console.log(`  p90:    ${allWeights[Math.floor(allWeights.length*0.9)].toFixed(4)}`);
console.log(`  Max:    ${allWeights[allWeights.length-1].toFixed(4)}`);
