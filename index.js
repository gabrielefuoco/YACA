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
const { blurImage } = require('./src/utils/imageProcessor');

// 1. Inizializza Express
const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

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

// Endpoint per la sfocatura immagini proxy (usato nei metadati TMDB e Trakt)
app.get('/blur', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).send('URL mancante');
    }
    try {
        const imageBuffer = await blurImage(url);
        if (imageBuffer) {
            res.set('Content-Type', 'image/jpeg');
            // Cache per 1 settimana
            res.set('Cache-Control', 'public, max-age=604800');
            return res.send(imageBuffer);
        } else {
            return res.status(500).send('Errore elaborazione immagine');
        }
    } catch (err) {
        return res.status(500).send('Errore elaborazione immagine');
    }
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

// Stremio API: Login con credenziali Stremio per ottenere authKey
app.post('/api/stremio-auth', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email e password obbligatorie' });
    }
    try {
        const stremioRes = await axios.post('https://api.strem.io/api/login', { email, password }, { timeout: 10000 });
        const data = stremioRes.data;
        if (data && data.result && data.result.authKey) {
            return res.json({ success: true, authKey: data.result.authKey, email: data.result.user?.email || email });
        }
        return res.json({ success: false, error: data?.result?.error || 'Credenziali non valide' });
    } catch (err) {
        const errMsg = err.response?.data?.result?.error || err.message || 'Errore di connessione';
        return res.json({ success: false, error: errMsg });
    }
});

// Stremio API: Aggiorna addon nella collezione dell'utente (senza reinstallare manualmente)
app.post('/api/stremio-addon-update', async (req, res) => {
    const { authKey, manifestUrl } = req.body;
    if (!authKey || !manifestUrl) {
        return res.status(400).json({ success: false, error: 'authKey e manifestUrl obbligatori' });
    }
    try {
        // 1. Recupera la collezione attuale di addon dell'utente
        const getRes = await axios.post('https://api.strem.io/api/addonCollectionGet', {
            type: 'AddonCollectionGet',
            authKey,
            update: true,
            addFromURL: []
        }, { timeout: 10000 });

        const addons = getRes.data?.result?.addons;
        if (!addons || !Array.isArray(addons)) {
            return res.json({ success: false, error: 'Impossibile recuperare la collezione addon' });
        }

        // 2. Cerca il nostro addon (YACA) nella collezione
        const addonId = 'org.stremio.yaca.catalog';
        const existingIdx = addons.findIndex(a => a.manifest?.id === addonId);

        // 3. Recupera il nuovo manifest dal nostro server
        const manifestRes = await axios.get(manifestUrl, { timeout: 10000 });
        const manifest = manifestRes.data;

        if (existingIdx !== -1) {
            // Aggiorna l'addon esistente
            addons[existingIdx].transportUrl = manifestUrl;
            addons[existingIdx].manifest = manifest;
        } else {
            // Aggiungi come nuovo addon
            addons.push({
                transportUrl: manifestUrl,
                transportName: 'http',
                manifest: manifest,
                flags: { official: false, protected: false }
            });
        }

        // 4. Salva la collezione aggiornata
        const setRes = await axios.post('https://api.strem.io/api/addonCollectionSet', {
            type: 'AddonCollectionSet',
            authKey,
            addons
        }, { timeout: 10000 });

        if (setRes.data?.result?.success) {
            return res.json({ success: true });
        }
        return res.json({ success: false, error: setRes.data?.result?.error || 'Errore aggiornamento collezione' });
    } catch (err) {
        const errMsg = err.response?.data?.result?.error || err.message || 'Errore di connessione';
        return res.json({ success: false, error: errMsg });
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

app.get(['/:uuid/configure', '/:uuid/:configVersion/configure'], (req, res) => {
    if (!isValidUUID(req.params.uuid)) {
        return res.status(400).json({ error: "UUID non valido" });
    }
    res.redirect(`/?uuid=${req.params.uuid}`);
});

// Opzioni di ordinamento disponibili in Stremio per i cataloghi TMDB
const SORT_OPTIONS = ['Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi'];
const SORT_MAP = {
    'Popolarità': 'popularity.desc',
    'Voto Medio': 'vote_average.desc',
    'Data di Uscita': null, // Gestito dinamicamente per movie/series
    'Incassi': 'revenue.desc'
};

function getSortByValue(genreExtra, type) {
    if (!genreExtra || !Object.prototype.hasOwnProperty.call(SORT_MAP, genreExtra)) return 'popularity.desc';
    if (genreExtra === 'Data di Uscita') {
        return type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
    }
    return SORT_MAP[genreExtra];
}

// Extra standard per cataloghi con ordinamento
const discoverExtra = [{ name: 'genre', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];
const presetExtra = [{ name: 'genre', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];

// 3. Endpoint dinamico per il Manifest di Stremio (L'addon vero e proprio risponde qui)
// Supporta sia /:uuid/manifest.json (retrocompatibilità) che /:uuid/:configVersion/manifest.json
app.get(['/:uuid/manifest.json', '/:uuid/:configVersion/manifest.json'], async (req, res) => {
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

        // Versione dinamica: include configVersion per forzare aggiornamento in Stremio
        const cv = userConfig.configVersion;
        const dynamicVersion = cv ? `1.0.2+${cv}` : '1.0.2';

        // Costruiamo il manifest di default base
        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: dynamicVersion,
            name: 'YACA (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            logo: `${req.protocol}://${req.get('host')}/logo.png`,
            resources: ['catalog', 'meta'],
            types: ['movie', 'series'],
            catalogs: [
                { id: 'yaca_discover_movies', type: 'movie', name: 'Esplora Film (TMDB)', extra: discoverExtra },
                { id: 'yaca_discover_series', type: 'series', name: 'Esplora Serie (TMDB)', extra: discoverExtra },
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
                manifest.catalogs.unshift({
                    id: cat.id,
                    type: cat.type || 'movie',
                    name: isPreset ? cat.name : `AI: ${cat.name}`,
                    extra: presetExtra
                });
            }
        }

        // Inietta i Cataloghi Trakt se l'utente ha configurato l'username
        if (userConfig.apiKeys && userConfig.apiKeys.trakt) {
            manifest.catalogs.unshift(
                // Cataloghi personali (richiedono profilo pubblico)
                { id: 'trakt_recommendations_movies', type: 'movie', name: 'Trakt Consigliati', extra: [{ name: 'skip' }] },
                { id: 'trakt_recommendations_series', type: 'series', name: 'Trakt Consigliati', extra: [{ name: 'skip' }] },
                { id: 'trakt_watchlist_movies', type: 'movie', name: 'Trakt Watchlist', extra: [{ name: 'skip' }] },
                { id: 'trakt_watchlist_series', type: 'series', name: 'Trakt Watchlist', extra: [{ name: 'skip' }] },
                { id: 'trakt_history_movies', type: 'movie', name: 'Trakt Cronologia', extra: [{ name: 'skip' }] },
                { id: 'trakt_history_series', type: 'series', name: 'Trakt Cronologia', extra: [{ name: 'skip' }] },
                { id: 'trakt_ratings_movies', type: 'movie', name: 'Trakt Valutazioni', extra: [{ name: 'skip' }] },
                { id: 'trakt_ratings_series', type: 'series', name: 'Trakt Valutazioni', extra: [{ name: 'skip' }] },
                { id: 'trakt_favorites_movies', type: 'movie', name: 'Trakt Preferiti', extra: [{ name: 'skip' }] },
                { id: 'trakt_favorites_series', type: 'series', name: 'Trakt Preferiti', extra: [{ name: 'skip' }] },
                // Cataloghi pubblici globali
                { id: 'trakt_trending_movies', type: 'movie', name: 'Trakt Tendenze', extra: [{ name: 'skip' }] },
                { id: 'trakt_trending_series', type: 'series', name: 'Trakt Tendenze', extra: [{ name: 'skip' }] },
                { id: 'trakt_popular_movies', type: 'movie', name: 'Trakt Popolari', extra: [{ name: 'skip' }] },
                { id: 'trakt_popular_series', type: 'series', name: 'Trakt Popolari', extra: [{ name: 'skip' }] }
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

// 4. Endpoint per i Cataloghi Stremio (con e senza configVersion)
app.get([
    '/:uuid/catalog/:type/:id.json',
    '/:uuid/catalog/:type/:id/:extra.json',
    '/:uuid/:configVersion/catalog/:type/:id.json',
    '/:uuid/:configVersion/catalog/:type/:id/:extra.json'
], async (req, res) => {
    const { uuid, type, id, extra: extraStr } = req.params;
    if (!isValidUUID(uuid)) {
        return res.status(400).json({ metas: [] });
    }
    const extra = parseExtra(extraStr);

    // Converti skip in intero se presente
    if (extra.skip) extra.skip = parseInt(extra.skip, 10) || 0;

    // Gestisci il parametro di ordinamento (genre usato come sort in Stremio)
    if (extra.genre) {
        extra.sortBy = getSortByValue(extra.genre, type);
    }

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

// 5. Endpoint per i Metadati Stremio (con e senza configVersion)
app.get(['/:uuid/meta/:type/:id.json', '/:uuid/:configVersion/meta/:type/:id.json'], async (req, res) => {
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
const server = app.listen(PORT, () => {
    console.log(`🚀 YACA Server in esecuzione su http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n${signal} ricevuto. Spegnimento in corso...`);
    server.close(() => {
        console.log('Server chiuso correttamente.');
        process.exit(0);
    });
    // Forza lo spegnimento dopo 10 secondi
    setTimeout(() => {
        console.error('Spegnimento forzato dopo timeout.');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
