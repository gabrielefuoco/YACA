require('dotenv').config();
const { resolveImdbId } = require('../src/clients/tmdb');
const { getTmdbIdFromKitsuId } = require('../src/clients/kitsu');
const mongoose = require('mongoose');

function printUsage() {
    console.log(`
🎬 YACA IMDB Mapping Tester
----------------------------------
Verifica la risoluzione dell'ID IMDB a partire da un TMDB ID o Kitsu ID.
Essenziale per garantire la compatibilità con addon di streaming (es. Torrentio).

Uso:
  node scripts/check_imdb_mapping.js <tipo> <id>

Tipi supportati: movie, tv, kitsu

Esempi:
  node scripts/check_imdb_mapping.js movie 157336    # Interstellar
  node scripts/check_imdb_mapping.js kitsu 11        # Naruto
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) printUsage();

const type = args[0].toLowerCase();
const id = args[1];
const tmdbApiKey = process.env.TMDB_API_KEY;

if (!['movie', 'tv', 'kitsu'].includes(type)) {
    console.error("❌ Tipo non valido. Usa: movie, tv, o kitsu");
    process.exit(1);
}

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB... (Per eventuale Cache L2)`);
        await mongoose.connect(process.env.MONGODB_URI);

        let finalTmdbId = id;
        let finalType = type === 'movie' ? 'movie' : 'tv';

        console.log(`\n🔎 Verifica Mapping IMDB per [${type}: ${id}]...`);
        console.log(`=================================================`);

        if (type === 'kitsu') {
            console.log(`  🎌 Rilevato input Kitsu. Traduzione in TMDB...`);
            const mapping = await getTmdbIdFromKitsuId(id);
            if (!mapping || !mapping.tmdbId) {
                console.error(`  ❌ Traduzione fallita. L'anime Kitsu ${id} non è mappato in YACA.`);
                return;
            }
            finalTmdbId = mapping.tmdbId;
            finalType = mapping.type === 'movie' ? 'movie' : 'tv';
            console.log(`  ✅ Mappato su TMDB: \x1b[36m${finalTmdbId} (${finalType})\x1b[0m`);
        }

        console.log(`  📡 Interrogazione TMDB per recuperare External IDs...`);
        const imdbId = await resolveImdbId(finalTmdbId, finalType, tmdbApiKey);

        if (imdbId) {
            console.log(`  ✅ \x1b[32mSUCCESSO\x1b[0m: Risolto IMDB ID => \x1b[33m${imdbId}\x1b[0m`);
            console.log(`  Stremio sarà in grado di trovare gli stream per questo titolo!`);
        } else {
            console.log(`  ❌ \x1b[31mFALLITO\x1b[0m: TMDB non ha fornito alcun IMDB ID per questo titolo.`);
            console.log(`  Stremio (Torrentio/etc) probabilmente non troverà fonti.`);
        }
        console.log(`=================================================`);

    } catch (e) {
        console.error("❌ Errore:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`\n👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
