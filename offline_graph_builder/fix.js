const fs = require('fs');
let c = fs.readFileSync('offline_graph_builder/visualizer.html', 'utf8');
c = c.replace(/\\\`/g, '\`');
c = c.replace(/\\\\\$/g, '$');
fs.writeFileSync('offline_graph_builder/visualizer.html', c);
console.log('Fixed escaped backticks');
