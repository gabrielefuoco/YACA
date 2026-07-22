const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

let i = 0;
for (const [id, data] of Object.entries(graph.L2 || {})) {
    console.log(`[${id}] Top Keywords:`);
    console.log(data.top_keywords.slice(0, 5).join(', '));
    console.log('---');
    if (++i > 20) break;
}
