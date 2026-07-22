const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

for (const [id, data] of Object.entries(graph.L3 || {})) {
    console.log(`[${id}] Top Keywords:`);
    console.log(data.top_keywords.slice(0, 15).join(', '));
    console.log('---');
}
