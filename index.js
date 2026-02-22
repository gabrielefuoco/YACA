require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const { initSupabase } = require('./src/utils/database');
const configureRoute = require('./src/api/configure');
const UserConfig = require('./src/models/UserConfig');
const { catalogHandler } = require('./src/handlers/catalogHandler');
const { metaHandler } = require('./src/handlers/metaHandler');
const presets = require('./src/data/presets');

// 1. Inizializza Express
const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Inizializza Supabase Client
initSupabase();

// Endpoint per recuperare i preset disponibili
app.get('/api/presets', (req, res) => {
    res.json({ presets: presets.presets, profileTemplates: presets.profileTemplates });
});

// 2. Registra endpoint configuration (Frontend Web Web)
app.post('/api/configure', configureRoute);

app.get('/api/configure/:uuid', async (req, res) => {
    try {
        const userConfig = await UserConfig.findOne({ uuid: req.params.uuid });
        if (!userConfig) {
            return res.status(404).json({ error: "Configurazione non trovata" });
        }
        return res.json(userConfig);
    } catch (err) {
        console.error("Errore recupero config:", err);
        return res.status(500).json({ error: "Errore interno" });
    }
});

app.get('/:uuid/configure', (req, res) => {
    res.redirect(`/?uuid=${req.params.uuid}`);
});

// 3. Endpoint dinamico per il Manifest di Stremio (L'addon vero e proprio risponde qui)
app.get('/:uuid/manifest.json', async (req, res) => {
    const { uuid } = req.params;

    try {
        const userConfig = await UserConfig.findOne({ uuid });
        if (!userConfig) {
            return res.status(404).json({ error: "Configurazione non trovata. Reinstalla l'addon." });
        }

        // Costruiamo il manifest di default base
        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: '1.0.0',
            name: 'YACA (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            resources: ['catalog', 'meta'],
            types: ['movie', 'series', 'anime'],
            catalogs: [
                { id: 'yaca_discover_movies', type: 'movie', name: 'Esplora Film (TMDB)' },
                { id: 'yaca_discover_series', type: 'series', name: 'Esplora Serie (TMDB)' },
                { id: 'yaca_anime_trending', type: 'anime', name: 'Anime Popolari (Kitsu)' },
                // La ricerca libera per usare Mistral al volo da Stremio
                { id: 'yaca_ai_search', type: 'movie', name: 'Ricerca AI', extra: [{ name: 'search', isRequired: true }] }
            ],
            idPrefixes: ['tt', 'tmdb:', 'kitsu:'],
            behaviorHints: {
                configurable: true,
                configurationRequired: true
            }
        };

        let activeProfileCatalogs = [];
        if (userConfig.profiles && userConfig.activeProfileId) {
            const profile = userConfig.profiles.find(p => p.id === userConfig.activeProfileId);
            if (profile && profile.catalogs) {
                activeProfileCatalogs = profile.catalogs;
            }
        } else if (userConfig.catalogs) {
            // Retrocompatibilità per configurazioni senza profili
            activeProfileCatalogs = userConfig.catalogs;
        }

        // Inietta Dinamicamente i cataloghi personalizzati (Prompt dell'utente) e i Preset
        if (activeProfileCatalogs.length > 0) {
            for (const cat of activeProfileCatalogs) {
                const isPreset = cat.id.startsWith('yaca_preset_');
                // Aggiungiamo il catalogo al manifest. Per i preset usiamo il loro tipo, per l'AI default 'movie' per ora
                manifest.catalogs.unshift({
                    id: cat.id,
                    type: cat.type || 'movie',
                    name: isPreset ? cat.name : `AI: ${cat.name}`
                });
            }
        }

        // Inietta i Cataloghi Trakt se l'utente ha configurato l'username
        if (userConfig.traktUsername) {
            manifest.catalogs.unshift(
                { id: 'trakt_watchlist_movies', type: 'movie', name: 'Trakt Watchlist' },
                { id: 'trakt_watchlist_series', type: 'series', name: 'Trakt Watchlist' },
                { id: 'trakt_favorites_movies', type: 'movie', name: 'Trakt Preferiti' },
                { id: 'trakt_favorites_series', type: 'series', name: 'Trakt Preferiti' }
            );
        }

        return res.json(manifest);
    } catch (err) {
        console.error("Manifest Error:", err);
        return res.status(500).json({ error: "Errore caricamento manifest" });
    }
});

// Helper interno per parsare i parametri "extra" stile Stremio (es. "search=avengers&skip=20")
function parseExtra(extraString) {
    if (!extraString) return {};
    const extra = {};
    const params = extraString.split('&');
    for (const p of params) {
        const [k, v] = p.split('=');
        if (k && v) extra[k] = decodeURIComponent(v);
    }
    return extra;
}

// 4. Endpoint per i Cataloghi Stremio
app.get(['/:uuid/catalog/:type/:id.json', '/:uuid/catalog/:type/:id/:extra.json'], async (req, res) => {
    const { uuid, type, id, extra: extraStr } = req.params;
    const extra = parseExtra(extraStr);

    // Converti skip in intero se presente
    if (extra.skip) extra.skip = parseInt(extra.skip, 10) || 0;

    const args = { type, id, extra };
    const response = await catalogHandler(args, uuid);

    res.setHeader('Cache-Control', 'max-age=1800, public'); // Stremio caching
    res.json(response);
});

// 5. Endpoint per i Metadati Stremio
app.get('/:uuid/meta/:type/:id.json', async (req, res) => {
    const { uuid, type, id } = req.params;

    const args = { type, id };
    const response = await metaHandler(args, uuid);

    res.setHeader('Cache-Control', 'max-age=86400, public'); // Cache giornaliera
    res.json(response);
});

// Avvia il server
app.listen(PORT, () => {
    console.log(`🚀 YACA Server in esecuzione su http://localhost:${PORT}`);
});
