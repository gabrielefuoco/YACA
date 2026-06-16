const fs = require('fs');
const path = './src/data/presets.js';
let content = fs.readFileSync(path, 'utf8');

let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Only process preset lines
    if (!line.trim().startsWith('{ id:')) continue;

    // Skip if it belongs to the Asian or Anime categories
    if (line.includes('🌏 K-Drama, Dizi & Asia') || line.includes('🏮 Solo Anime')) {
        continue;
    }

    // Skip if it already has without_original_language
    if (line.includes('without_original_language:')) {
        continue;
    }

    // Inject the filter right before the end of the query object
    // Match the end of the query object: `}] }` or `}] },`
    line = line.replace(/\s*\}\]\s*\}\s*,?$/, ", without_original_language: 'ko|zh|th|hi|te|ta' }] },");

    // Special fix: If the line ended up missing a comma because of previous scripts, it's already fixed, 
    // but the regex replaces the comma at the end and re-adds it. `}] },` is standard.
    
    lines[i] = line;
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Asian languages excluded from western/generic catalogs.');
