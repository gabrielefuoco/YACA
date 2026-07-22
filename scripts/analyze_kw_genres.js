const fs = require('fs');
const kws = JSON.parse(fs.readFileSync('./offline_graph_builder/cache/kw_genres.json', 'utf8'));

let totalDrama = 0;
let totalDocumentary = 0;
let totalFantasy = 0;
let totalKeywords = Object.keys(kws).length;

for (const [kw, dist] of Object.entries(kws)) {
    if (dist['Dramma']) totalDrama++;
    if (dist['Documentario']) totalDocumentary++;
    if (dist['Fantasy']) totalFantasy++;
}

console.log(`Su ${totalKeywords} keyword:`);
console.log(`- Contengono Dramma: ${totalDrama} (${((totalDrama/totalKeywords)*100).toFixed(2)}%)`);
console.log(`- Contengono Documentario: ${totalDocumentary} (${((totalDocumentary/totalKeywords)*100).toFixed(2)}%)`);
console.log(`- Contengono Fantasy: ${totalFantasy} (${((totalFantasy/totalKeywords)*100).toFixed(2)}%)`);

// Let's check some examples
console.log("\nEsempio distribuzioni:");
console.log("magic:", kws['magic']);
console.log("nature:", kws['nature']);
console.log("space:", kws['space']);
