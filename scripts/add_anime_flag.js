const fs = require('fs');
const path = require('path');

const presetsPath = path.join(__dirname, '../src/data/presets.js');
let content = fs.readFileSync(presetsPath, 'utf8');

// Use regex to find all presets and insert isAnime: true if they belong to Anime
const lines = content.split('\n');
let modified = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('{ id: \'preset_') && line.includes('category:') && !line.includes('isAnime:')) {
        // Check if it's an anime preset
        if (line.includes('Solo Anime') || line.includes('_anime_') || line.includes('preset_ghibli') || line.includes('Anime')) {
            // insert isAnime: true after id: '...', 
            lines[i] = line.replace(/id: '([^']+)',/, "id: '$1', isAnime: true,");
            modified = true;
        }
    }
}

if (modified) {
    fs.writeFileSync(presetsPath, lines.join('\n'), 'utf8');
    console.log("Updated presets.js with isAnime: true");
} else {
    console.log("No changes made or already updated.");
}
