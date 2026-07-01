const mongoose = require('mongoose');
require('dotenv').config();
const TasteProfile = require('../src/models/TasteProfile');
const { createTmdbClient } = require('../src/clients/tmdb');

function printUsage() {
    console.log(`
👤 YACA Taste Profile Analyzer
----------------------------------
Traduce il DNA VSM (V_final) di un utente in linguaggio umano consultando TMDB.

Uso:
  node scripts/analyze_taste_profile.js <userId>

Esempio:
  node scripts/analyze_taste_profile.js "gabriele29"
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) printUsage();

const userId = args[0];
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!process.env.MONGODB_URI || !tmdbApiKey) {
    console.error("❌ ERRORE: MONGODB_URI o TMDB_API_KEY non trovati nel file .env");
    process.exit(1);
}

const tmdbClient = createTmdbClient(tmdbApiKey);

// Caching in memory for genres
let cachedMovieGenres = null;
let cachedTvGenres = null;

async function getGenres() {
    if (cachedMovieGenres && cachedTvGenres) return { movie: cachedMovieGenres, tv: cachedTvGenres };
    const [movieRes, tvRes] = await Promise.all([
        tmdbClient.get('/genre/movie/list', { params: { language: 'it-IT' } }),
        tmdbClient.get('/genre/tv/list', { params: { language: 'it-IT' } })
    ]);
    cachedMovieGenres = movieRes.data.genres;
    cachedTvGenres = tvRes.data.genres;
    return { movie: cachedMovieGenres, tv: cachedTvGenres };
}

async function resolveDnaKey(key) {
    const [prefix, id] = key.split(':');
    
    try {
        if (prefix === 'g') {
            const genres = await getGenres();
            const genreId = parseInt(id);
            const mGenre = genres.movie.find(g => g.id === genreId);
            const tGenre = genres.tv.find(g => g.id === genreId);
            if (mGenre && tGenre && mGenre.name === tGenre.name) return `Genere: ${mGenre.name}`;
            if (mGenre || tGenre) return `Genere: ${(mGenre || tGenre).name}`;
            return `Genere: Sconosciuto (${id})`;
        } 
        else if (prefix === 'k') {
            const res = await tmdbClient.get(`/keyword/${id}`);
            return `Keyword: ${res.data.name}`;
        }
        else if (prefix === 'd' || prefix === 'a') {
            const res = await tmdbClient.get(`/person/${id}`, { params: { language: 'it-IT' } });
            const role = prefix === 'd' ? 'Regista' : 'Attore';
            return `${role}: ${res.data.name}`;
        }
    } catch (err) {
        return `[Unresolved ${prefix}:${id}]`;
    }
    return key;
}

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        console.log(`\n🔎 Fetching TasteProfile per l'utente "${userId}"...`);
        const profile = await TasteProfile.findOne({ owner: userId, context: 'global' }).lean();
        
        if (!profile || !profile.compiledVectors || !profile.compiledVectors.V_final) {
            console.error(`❌ ERRORE: Nessun V_final trovato per l'utente ${userId}`);
            process.exit(1);
        }

        const vFinal = profile.compiledVectors.V_final;
        
        // Ordina le chiavi per valore decrescente
        const sortedEntries = Object.entries(vFinal)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20); // Prendi i top 20 tratti

        console.log(`\n🧬 DNA VSM (Top 20 Tratti) per ${userId}:`);
        console.log(`=================================================`);
        
        let rank = 1;
        for (const [key, score] of sortedEntries) {
            if (score <= 0) continue;
            process.stdout.write(`  ${rank.toString().padStart(2)}. Risoluzione ${key.padEnd(10)}... `);
            const humanName = await resolveDnaKey(key);
            process.stdout.write(`\r  ${rank.toString().padStart(2)}. \x1b[36m${humanName.padEnd(40)}\x1b[0m | Forza: \x1b[32m${score.toFixed(3)}\x1b[0m\n`);
            rank++;
        }
        console.log(`=================================================`);
        console.log(`Totale elementi analizzati: ${sortedEntries.length}`);

    } catch (e) {
        console.error("❌ Errore:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`\n👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
