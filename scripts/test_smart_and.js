require('dotenv').config();
const mongoose = require('mongoose');
const { buildTopGenresMixCatalog } = require('../src/engines/hybrid/catalogStrategies');
const tmdb = require('../src/clients/tmdb');


async function testSmartAnd() {
    console.log("Connettendo al database...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Config: utente e profilo (Otaku Hardcore)
    const userId = 'gabrielefuoco';
    const context = 'otaku_hardcore';
    const tmdbApiKey = process.env.TMDB_API_KEY;
    
    console.log(`Esecuzione Smart AND (True Blend) per ${userId} -> Profilo ${context}...`);
    
    try {
        const results = await buildTopGenresMixCatalog(userId, context, tmdbApiKey, 'movie');
        console.log(`\n======================================================`);
        console.log(`RISULTATI FINALI (SMART AND + QUOTA ANIME): ${results.length} item trovati`);
        console.log(`======================================================`);
        
        results.slice(0, 15).forEach((item, idx) => {
            const raw = item.rawTMDB || {};
            const title = raw.name || raw.title || "Sconosciuto";
            const genres = (raw.genre_ids || []).join(',');
            console.log(`${String(idx + 1).padStart(2, ' ')}. [ID: ${item.id.padEnd(8)}] Score: ${item.matchScore} | Generi TMDB: [${genres}] | ${title}`);
        });
        
    } catch (e) {
        console.error("Errore durante il test:", e);
    }
    
    mongoose.disconnect();
}

testSmartAnd();
