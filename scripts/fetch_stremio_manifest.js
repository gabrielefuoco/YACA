const mongoose = require('mongoose');
require('dotenv').config();
const UserConfig = require('../src/models/UserConfig');

function printUsage() {
    console.log(`
📡 YACA Manifest Fetcher
----------------------------------
Simula la generazione del manifest.json di Stremio per un utente specifico.

Uso:
  node scripts/fetch_stremio_manifest.js <userId>

Esempio:
  node scripts/fetch_stremio_manifest.js "gabriele29"
`);
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) printUsage();

const userId = args[0];

if (!process.env.MONGODB_URI) {
    console.error("❌ ERRORE: MONGODB_URI non trovata nel file .env");
    process.exit(1);
}

async function run() {
    try {
        console.log(`🔌 Connessione a MongoDB...`);
        await mongoose.connect(process.env.MONGODB_URI);

        console.log(`\n🔎 Cerco configurazione per l'utente "${userId}"...`);
        // UserConfig.resolveUserConfig fetches both UserAccount and AddonConfig internally
        const userConfig = await UserConfig.resolveUserConfig(userId);
        
        if (!userConfig) {
            console.error(`❌ ERRORE: Nessuna configurazione valida trovata per l'utente ${userId}`);
            process.exit(1);
        }

        const cv = userConfig.configVersion?.toString().replace(/_/g, '-');
        const dynamicVersion = cv ? `1.0.4+${cv}` : '1.0.4';

        const activeProfileId = userConfig.activeProfileId || 'global';
        const profile = userConfig.profiles?.find(p => p.id === activeProfileId) || (userConfig.profiles?.[0]);

        console.log(`✅ Profilo attivo: "${profile?.name || activeProfileId}" (Versione Config: ${dynamicVersion})`);

        const selectedPresets = profile?.raw_ui_state?.selectedPresets;
        const heroCatalogs = [
            { id: 'yaca_true_blend_movies', type: 'movie', name: '⭐ Scelti per Te', extra: [{ name: 'skip' }] },
            { id: 'yaca_true_blend_series', type: 'series', name: '⭐ Scelti per Te', extra: [{ name: 'skip' }] },
            { id: 'yaca_seed_network_movies', type: 'movie', name: '🕸️ La Rete dei tuoi Preferiti', extra: [{ name: 'skip' }] },
            { id: 'yaca_seed_network_series', type: 'series', name: '🕸️ La Rete dei tuoi Preferiti', extra: [{ name: 'skip' }] },
            { id: 'yaca_hidden_gems_movies', type: 'movie', name: '💎 Gemme Nascoste', extra: [{ name: 'skip' }] },
            { id: 'yaca_hidden_gems_series', type: 'series', name: '💎 Gemme Nascoste', extra: [{ name: 'skip' }] },
            { id: 'yaca_trakt_filtered_movies', type: 'movie', name: '🌐 Suggeriti dalla Community', extra: [{ name: 'skip' }] },
            { id: 'yaca_trakt_filtered_series', type: 'series', name: '🌐 Suggeriti dalla Community', extra: [{ name: 'skip' }] },
        ];

        const activeHeroCatalogs = Array.isArray(selectedPresets)
            ? heroCatalogs.filter(c => selectedPresets.includes(c.id))
            : heroCatalogs;

        const searchExtra = [
            { name: "search", isRequired: true }
        ];

        const presetExtra = [
            { name: "genre", isRequired: false },
            { name: "skip", isRequired: false }
        ];

        const catalogs = [
            { id: 'yaca-profiles', type: 'other', name: '👥 Cambia Profilo' },
            { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search', extra: searchExtra },
            ...activeHeroCatalogs
        ];

        if (profile && profile.catalogs && Array.isArray(profile.catalogs)) {
            profile.catalogs.forEach(p => {
                if (p.isActive !== false) {
                    catalogs.push({
                        id: p.id,
                        type: p.type === 'series' ? 'series' : 'movie',
                        name: p.name,
                        extra: presetExtra
                    });
                }
            });
        }

        const hostUrl = "https://yaca.internal.test";
        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: dynamicVersion,
            name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            logo: `${hostUrl}/fiamma_yaca.png`,
            resources: [
                'catalog',
                'meta',
                { name: 'stream', types: ['movie', 'series', 'other'], idPrefixes: ['tt', 'tmdb:', 'kitsu:', 'yaca-profile-'] }
            ],
            types: ['movie', 'series', 'other'],
            catalogs: catalogs,
            idPrefixes: ['tt', 'tmdb:', 'kitsu:', 'yaca-profile-'],
            behaviorHints: {
                configurable: true,
                configurationRequired: false
            }
        };

        console.log(`\n📋 MANIFEST.JSON GENERATO:`);
        console.log(`=================================================`);
        console.log(JSON.stringify(manifest, null, 2));
        console.log(`=================================================`);
        console.log(`Totale Cataloghi Esportati: ${catalogs.length}`);

    } catch (e) {
        console.error("❌ Errore:", e.message);
    } finally {
        await mongoose.disconnect();
        console.log(`\n👋 Disconnesso da MongoDB.`);
        process.exit(0);
    }
}

run();
