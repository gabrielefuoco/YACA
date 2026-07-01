const fs = require('fs');

function printUsage() {
    console.log(`
🔍 YACA Keyword Finder (TMDB)
----------------------------------
Trova rapidamente ID e nomi ufficiali per le keyword TMDB da inserire in presets.js.

Uso:
  node scripts/search_tmdb_keywords.js "tuo termine"
  node scripts/search_tmdb_keywords.js "parody" "spoof"

Esempio:
  node scripts/search_tmdb_keywords.js "slapstick"
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    printUsage();
}

const envContent = fs.readFileSync('.env', 'utf8');
const tmdbMatch = envContent.match(/TMDB_API_KEY=([^\n\r]+)/);
const apiKey = tmdbMatch ? tmdbMatch[1].trim() : null;

if (!apiKey) {
    console.error("❌ ERRORE: TMDB_API_KEY non trovata nel file .env");
    process.exit(1);
}

async function searchKeyword(query) {
    try {
        console.log(`\n🔎 Cerco keyword per: "${query}"...`);
        const url = `https://api.themoviedb.org/3/search/keyword?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            console.log(`✅ Trovate ${data.results.length} corrispondenze:`);
            console.log(`=========================================`);
            data.results.forEach(k => {
                console.log(`  ID: \x1b[33m${k.id.toString().padEnd(8)}\x1b[0m | Nome: \x1b[36m${k.name}\x1b[0m`);
            });
            console.log(`=========================================`);
        } else {
            console.log(`⚠️ Nessuna keyword trovata per "${query}".`);
        }
    } catch (e) {
        console.error(`❌ Errore durante la ricerca per "${query}":`, e.message);
    }
}

async function run() {
    for (const query of args) {
        await searchKeyword(query);
    }
    console.log(`\n🎉 Ricerca completata! Seleziona gli ID desiderati e inseriscili in presets.js`);
}

run();
