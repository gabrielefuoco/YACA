const graph = require('../src/engines/graph/HierarchicalGraph');
console.log("Graph loaded:", graph.isLoaded);
console.log("Anime (210024) L1:", graph.data.kw_to_L1['210024']);
console.log("Shounen (195668) L1:", graph.data.kw_to_L1['195668']);
console.log("Romance (9840) L1:", graph.data.kw_to_L1['9840']);

console.log("First 5 keys in kw_to_L1:");
console.log(Object.keys(graph.data.kw_to_L1).slice(0, 5));
