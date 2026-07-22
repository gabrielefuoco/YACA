const fs = require('fs');
const g = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));

const m3 = g.L4['m_3'];
console.log("Top keywords per m_3:");
console.log(m3.top_keywords.slice(0, 100).join(', '));
