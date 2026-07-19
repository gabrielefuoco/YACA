const fs = require('fs');

console.log("Caricamento graph_data.json...");
const graphData = JSON.parse(fs.readFileSync('../src/data/graph_data.json', 'utf8'));

const keywords = Object.keys(graphData.keyword_to_cluster);
console.log("Totale keywords:", keywords.length);

const searchTerms = ['orc', 'middle', 'hobbit', 'dwarf', 'washington', 'mental', 'table', 'tennis'];

for (const term of searchTerms) {
    const matches = keywords.filter(k => k.includes(term));
    console.log(`Matches for '${term}':`, matches);
}
