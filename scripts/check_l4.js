const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

for (let i = 0; i <= 7; i++) {
    const id = `m_${i}`;
    const data = graph.L4[id];
    console.log(`[${id}] Top Keywords:`);
    console.log(data.top_keywords.slice(0, 10).join(', '));
    console.log('---');
}
