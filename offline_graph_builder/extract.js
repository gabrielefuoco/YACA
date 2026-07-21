const fs = require('fs');
const html = fs.readFileSync('offline_graph_builder/visualizer.html', 'utf8');
const scriptMatch = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/);
if (scriptMatch) {
    fs.writeFileSync('offline_graph_builder/temp.js', scriptMatch[1]);
    console.log('Script extracted.');
} else {
    console.log('Script tag not found.');
}
