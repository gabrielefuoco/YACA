require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const { initSupabase } = require('./src/utils/database');
const configureRoute = require('./src/api/configure');
const UserConfig = require('./src/models/UserConfig');
const { catalogHandler } = require('./src/handlers/catalogHandler');
const { metaHandler } = require('./src/handlers/metaHandler');
const presets = require('./src/data/presets');
const { isValidUUID, parseExtra } = require('./src/utils/helpers');

// 1. Inizializza Express
const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Inizializza Supabase Client
const supabaseClient = initSupabase();
if (!supabaseClient) {
    console.error("⚠️ Supabase non inizializzato: le funzionalità che richiedono il database non saranno disponibili.");
}

// Health check endpoint per monitoring e deployment platforms
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.2',
        uptime: Math.floor(process.uptime()),
        database: supabaseClient ? 'connected' : 'unavailable'
    });
});

// Endpoint per recuperare i preset disponibili
app.get('/api/presets', (req, res) => {
    res.json({ presets: presets.presets, profileTemplates: presets.profileTemplates });
});

// Endpoint per validare una TMDB API Key
app.post('/api/validate-tmdb-key', async (req, res) => {
    const { tmdbKey } = req.body;
    if (!tmdbKey) {
        return res.status(400).json({ valid: false, error: 'Chiave non fornita' });
    }
    try {
        const testRes = await axios.get('https://api.themoviedb.org/3/configuration', {
            params: { api_key: tmdbKey },
            timeout: 5000
        });
        if (testRes.data && testRes.data.images) {
            return res.json({ valid: true });
        }
        return res.json({ valid: false, error: 'Risposta non valida da TMDB' });
    } catch (err) {
        const status = err.response?.status;
        if (status === 401) {
            return res.json({ valid: false, error: 'Chiave TMDB non valida (401 Unauthorized)' });
        }
        return res.json({ valid: false, error: 'Impossibile verificare la chiave. Riprova.' });
    }
});

// 2. Registra endpoint configuration (Frontend Web Web)
app.post('/api/configure', configureRoute);

app.get('/api/configure/:uuid', async (req, res) => {
    try {
        if (!isValidUUID(req.params.uuid)) {
            return res.status(400).json({ error: "UUID non valido" });
        }
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
    if (!isValidUUID(uuid)) {
        return res.status(400).json({ error: "UUID non valido" });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    try {
        const userConfig = await UserConfig.findOne({ uuid });
        if (!userConfig) {
            return res.status(404).json({ error: "Configurazione non trovata. Reinstalla l'addon." });
        }

        // Costruiamo il manifest di default base
        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: '1.0.2',
            name: 'YACA (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            logo: `${req.protocol}://${req.get('host')}/logo.png`,
            resources: ['catalog', 'meta'],
            types: ['movie', 'series'],
            catalogs: [
                { id: 'yaca_discover_movies', type: 'movie', name: 'Esplora Film (TMDB)', extra: [{ name: 'skip' }] },
                { id: 'yaca_discover_series', type: 'series', name: 'Esplora Serie (TMDB)', extra: [{ name: 'skip' }] },
                { id: 'yaca_anime_trending', type: 'series', name: 'Anime Popolari (Kitsu)', extra: [{ name: 'skip' }] },
                { id: 'yaca_ai_search', type: 'movie', name: 'Ricerca AI (Film)', extra: [{ name: 'search', isRequired: true }, { name: 'skip' }] },
                { id: 'yaca_ai_search_series', type: 'series', name: 'Ricerca AI (Serie)', extra: [{ name: 'search', isRequired: true }, { name: 'skip' }] }
            ],
            idPrefixes: ['tt', 'tmdb:', 'kitsu:'],
            behaviorHints: {
                configurable: true,
                configurationRequired: false
            },
            contactEmail: 'yaca.addon@proton.me',
            configurationURL: `${req.protocol}://${req.get('host')}/${uuid}/configure`
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
                    name: isPreset ? cat.name : `AI: ${cat.name}`,
                    extra: [{ name: 'skip' }]
                });
            }
        }

        // Inietta i Cataloghi Trakt se l'utente ha configurato l'username
        if (userConfig.apiKeys && userConfig.apiKeys.trakt) {
            manifest.catalogs.unshift(
                { id: 'trakt_watchlist_movies', type: 'movie', name: 'Trakt Watchlist', extra: [{ name: 'skip' }] },
                { id: 'trakt_watchlist_series', type: 'series', name: 'Trakt Watchlist', extra: [{ name: 'skip' }] },
                { id: 'trakt_favorites_movies', type: 'movie', name: 'Trakt Preferiti', extra: [{ name: 'skip' }] },
                { id: 'trakt_favorites_series', type: 'series', name: 'Trakt Preferiti', extra: [{ name: 'skip' }] }
            );
        }

        return res.json(manifest);
    } catch (err) {
        console.error("Manifest Error:", err);
        return res.status(500).json({ error: "Errore caricamento manifest" });
    }
});

// Root manifest (senza UUID) per guidare l'utente alla configurazione
app.get('/manifest.json', (req, res) => {
    const manifest = {
        id: 'org.stremio.yaca.catalog',
        version: '1.0.2',
        name: 'YACA (Yet Another Catalog Addon)',
        description: 'Catalogo Intelligente Potenziato da AI - Configurazione Richiesta',
        logo: `${req.protocol}://${req.get('host')}/logo.png`,
        contactEmail: 'yaca.addon@proton.me',
        resources: [],
        types: [],
        catalogs: [],
        behaviorHints: {
            configurable: true,
            configurationRequired: true
        }
    };
    res.json(manifest);
});

// 4. Endpoint per i Cataloghi Stremio
app.get(['/:uuid/catalog/:type/:id.json', '/:uuid/catalog/:type/:id/:extra.json'], async (req, res) => {
    const { uuid, type, id, extra: extraStr } = req.params;
    if (!isValidUUID(uuid)) {
        return res.status(400).json({ metas: [] });
    }
    const extra = parseExtra(extraStr);

    // Converti skip in intero se presente
    if (extra.skip) extra.skip = parseInt(extra.skip, 10) || 0;

    const args = { type, id, extra };

    try {
        const response = await catalogHandler(args, uuid);
        res.setHeader('Cache-Control', 'max-age=1800, public'); // Stremio caching
        res.json(response);
    } catch (err) {
        console.error("Errore Catalog Endpoint:", err.message);
        res.json({ metas: [] });
    }
});

// 5. Endpoint per i Metadati Stremio
app.get('/:uuid/meta/:type/:id.json', async (req, res) => {
    const { uuid, type, id } = req.params;
    if (!isValidUUID(uuid)) {
        return res.status(400).json({ meta: null });
    }

    const args = { type, id };

    try {
        const response = await metaHandler(args, uuid);
        res.setHeader('Cache-Control', 'max-age=86400, public'); // Cache giornaliera
        res.json(response);
    } catch (err) {
        console.error("Errore Meta Endpoint:", err.message);
        res.json({ meta: null });
    }
});

// Avvia il server
app.listen(PORT, () => {
    console.log(`🚀 YACA Server in esecuzione su http://localhost:${PORT}`);
});
