const fs = require('fs');
const content = fs.readFileSync('src/data/presets.js', 'utf8');

// Use match to find all presets
const presetsMatches = content.match(/{\s*id:\s*['"][^'"]+['"].*?(?:queries:)/g) || [];
presetsMatches.forEach(m => {
    if (!m.includes('emoji:')) {
        const idMatch = m.match(/id:\s*['"]([^'"]+)['"]/);
        const nameMatch = m.match(/name:\s*['"]([^'"]+)['"]/);
        if (idMatch) {
            console.log(`${idMatch[1]} : ${nameMatch ? nameMatch[1] : 'Unknown'}`);
        }
    }
});
