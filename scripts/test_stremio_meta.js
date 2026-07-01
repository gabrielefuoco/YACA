const mongoose = require('mongoose');
require('dotenv').config();
const UserConfig = require('../src/models/UserConfig');
const { metaHandler } = require('../src/handlers/metaHandler');
const { sanitizeCatalogMeta } = require('../src/catalog/formatters/StremioFormatter');

function printUsage() {
    console.log(`
🍿 YACA Stremio Meta Validator
----------------------------------
Simula una richiesta all'endpoint /meta/ di YACA per un utente specifico.
Stampa l'oggetto JSON esatto che verrà restituito a Stremio, permettendoti
di validare che tutti i dati (titolo, poster, background, generi) siano formattati bene.

Uso:
  node scripts/test_stremio_meta.js <userId> <type> <id>

Esempio:
  node scripts/test_stremio_meta.js "gabriele29" movie tmdb:157336
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 3) printUsage();

const userId = args[0];
const type = args[1];
const id = args[2];

if (!process.env.MONGODB_URI) {
    console.error("❌ ERRORE: MONGODB_URI non trovata nel file .env");
    process.exit(1);
}

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        console.log(`\n🔎 Cerco configurazione per l'utente "${userId}"...`);
        const userConfig = await UserConfig.resolveUserConfig(userId);
        
        if (!userConfig) {
            console.error(`❌ ERRORE: Nessuna configurazione valida trovata per l'utente ${userId}`);
            process.exit(1);
        }

        console.log(`✅ Configurazione trovata. Profilo attivo: ${userConfig.activeProfileId || 'global'}`);
        console.log(`\n📡 Simulo Handler Meta per: [${type}] ${id}...`);
        
        const handlerArgs = { type, id };
        let response = await metaHandler(handlerArgs, userConfig);

        if (!response || !response.meta) {
            console.log(`\n⚠️ Risposta ricevuta, ma il campo 'meta' è vuoto. YACA ha restituito 404.`);
        } else {
            // Applica il sanitizzatore proprio come fa stremio.js
            response.meta = sanitizeCatalogMeta(response.meta, {
                shouldApplyEpisodeBadge: false,
                isLandscapeEnabled: false,
                userConfig,
                hostUrl: 'https://yaca.internal.test'
            });

            console.log(`\n📦 PAYLOAD META GENERATO:`);
            console.log(`=================================================`);
            console.log(JSON.stringify(response.meta, null, 2));
            console.log(`=================================================`);
            console.log(`\n✅ Validazione base riuscita. Se questo fosse Stremio, aprirebbe la pagina dettaglio.`);
        }

    } catch (e) {
        console.error("❌ Errore:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`\n👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
