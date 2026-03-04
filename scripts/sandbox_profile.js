require('dotenv').config();
const mongoose = require('mongoose');
const ProfileBuilder = require('../src/profile/ProfileBuilder');
const { getHybridCatalog } = require('../src/engines/hybridRecommendations');
const TasteProfile = require('../src/db/models/TasteProfile');

async function runSandbox() {
    const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yaca';
    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    const TRAKT_TOKEN = process.env.TRAKT_ACCESS_TOKEN; // Assicurati di averlo nel .env o passalo a mano
    const USER_ID = 'sandbox_user_test';
    const CONTEXT = 'global';

    if (!TMDB_API_KEY) {
        console.error("ERRORE: TMDB_API_KEY mancante nel .env");
        process.exit(1);
    }

    try {
        console.log("--- Connessione a MongoDB ---");
        await mongoose.connect(MONGO_URI);
        console.log("Connesso.");

        // 1. Simulazione History (Se non hai un token Trakt valido, usiamo dati dummy per la sincronizzazione se possibile)
        // In questo script testiamo se le funzioni caricano correttamente.
        console.log("\n--- Fase 1: Sincronizzazione Profilo (History fittizia) ---");
        const dummyHistory = [
            { movie: { ids: { tmdb: 157336 }, title: "Interstellar" } },
            { movie: { ids: { tmdb: 27205 }, title: "Inception" } },
            { movie: { ids: { tmdb: 121 }, title: "The Lord of the Rings: The Fellowship of the Ring" } },
            { movie: { ids: { tmdb: 550 }, title: "Fight Club" } },
            { movie: { ids: { tmdb: 680 }, title: "Pulp Fiction" } }
        ];

        const profile = await ProfileBuilder.syncUserHistory(USER_ID, CONTEXT, dummyHistory, TMDB_API_KEY);
        console.log(`Profilo sincronizzato per ${USER_ID} [${CONTEXT}]`);

        console.log("\nAssi principali rilevati:");
        console.log("- Generi:", Object.fromEntries(profile.genreScores));
        console.log("- Registi:", Object.fromEntries(profile.directorScores));
        console.log("- Studios:", Object.fromEntries(profile.studioScores));

        // 2. Generazione Cataloghi
        console.log("\n--- Fase 2: Generazione Cataloghi (Simulazione) ---");

        console.log("\n>> Generazione Catalogo 1: Ibrido 'Per Te'...");
        const hybrid = await getHybridCatalog('yaca_hybrid_movies', 0, TRAKT_TOKEN, TMDB_API_KEY, USER_ID, CONTEXT);
        console.log("Hybrid Metas (top 5):", hybrid.slice(0, 5).map(m => m.name));

        console.log("\n>> Generazione Catalogo 2: Discovery 'Esplora'...");
        const discovery = await getHybridCatalog('yaca_discovery_movies', 0, TRAKT_TOKEN, TMDB_API_KEY, USER_ID, CONTEXT);
        console.log("Discovery Metas (top 5):", discovery.slice(0, 5).map(m => m.name));

        console.log("\n>> Generazione Catalogo 3: Top 20...");
        const top20 = await getHybridCatalog('yaca_top20_movies', 0, TRAKT_TOKEN, TMDB_API_KEY, USER_ID, CONTEXT);
        console.log("Top 20 Metas (top 5):", top20.slice(0, 5).map(m => m.name));

        console.log("\n--- TEST COMPLETATO CON SUCCESSO ---");
        process.exit(0);
    } catch (err) {
        console.error("ERRORE DURANTE IL SANDBOX:", err);
        process.exit(1);
    }
}

runSandbox();
