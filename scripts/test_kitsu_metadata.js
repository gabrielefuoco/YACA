require('dotenv').config();
const mongoose = require('mongoose');
const { getTmdbIdFromKitsuId } = require('../src/clients/kitsu');
const axios = require('axios');

function printUsage() {
    console.log(`
🎌 YACA Kitsu Metadata Tester
----------------------------------
Scarica i dati crudi da Kitsu per un anime e mostra il mapping con TMDB.

Uso:
  node scripts/test_kitsu_metadata.js <nomeAnime o kitsuId>

Esempi:
  node scripts/test_kitsu_metadata.js "11"        # Testa tramite ID Kitsu (es. Naruto)
  node scripts/test_kitsu_metadata.js "Spy x Family" # Ricerca per nome
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) printUsage();

const query = args.join(' ');
const kitsuClient = axios.create({ baseURL: 'https://kitsu.io/api/edge', headers: { 'Accept': 'application/vnd.api+json' } });

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        let kitsuId = query;
        let animeData = null;

        if (isNaN(query)) {
            console.log(`🔎 Ricerca anime per nome: "${query}" su Kitsu...`);
            const res = await kitsuClient.get('/anime', { params: { 'filter[text]': query, 'page[limit]': 1 } });
            if (!res.data || !res.data.data || res.data.data.length === 0) {
                console.error(`❌ Nessun anime trovato per "${query}".`);
                process.exit(1);
            }
            animeData = res.data.data[0];
            kitsuId = animeData.id;
        } else {
            console.log(`🔎 Ricerca anime per ID Kitsu: "${query}"...`);
            const res = await kitsuClient.get(`/anime/${query}`);
            animeData = res.data.data;
        }

        const attrs = animeData.attributes;
        console.log(`\n✅ ANIME TROVATO SU KITSU:`);
        console.log(`=========================================`);
        console.log(`  ID Kitsu : \x1b[33m${animeData.id}\x1b[0m`);
        console.log(`  Titolo   : \x1b[36m${attrs.titles.en || attrs.titles.en_jp || attrs.canonicalTitle}\x1b[0m`);
        console.log(`  Tipo     : ${attrs.subtype} (${attrs.status})`);
        console.log(`  Episodi  : ${attrs.episodeCount || 'Sconosciuto'}`);
        console.log(`  Stagione Kitsu Offset: ${attrs.titles.en_jp ? (attrs.titles.en_jp.match(/(?:Season\\s*(\\d+)|(\\d+)(?:st|nd|rd|th)\\s*Season)/i) || [])[1] || '1' : '1'} (Stimato dal titolo)`);
        console.log(`=========================================`);

        console.log(`\n🔄 Controllo Mapping YACA TMDB <-> Kitsu...`);
        const mapping = await getTmdbIdFromKitsuId(kitsuId);
        if (mapping && mapping.tmdbId) {
            console.log(`✅ MAPPING TROVATO IN TMDBToKitsuMapper:`);
            console.log(`  TMDB ID: \x1b[32m${mapping.tmdbId}\x1b[0m (${mapping.type})`);
            console.log(`  Stagione Inferred YACA: \x1b[35m${mapping.inferredSeason || 1}\x1b[0m`);
        } else {
            console.log(`⚠️ Nessun mapping diretto trovato. Verrà trattato come 1:1 o fallback.`);
        }

    } catch (e) {
        console.error("❌ Errore:", e.response?.data || e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`👋 Disconnesso da MongoDB.`);
    }
}

run();
