const fs = require('fs');
const graph = JSON.parse(fs.readFileSync('./src/data/hierarchical_graph.json', 'utf8'));
const keys = Object.keys(graph.kw_to_L1 || {}).slice(0, 10);
console.log(keys);

const l1 = graph.L1['c_369'];
console.log(l1.keywords);
