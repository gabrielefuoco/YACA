require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const configureRoute = require('./src/api/configure');
const UserConfig = require('./src/models/UserConfig');
const { catalogHandler } = require('./src/handlers/catalogHandler');
const { metaHandler } = require('./src/handlers/metaHandler');
const { getPresets, profileTemplates } = require('./src/data/presets');
const { parseExtra, sanitizeString, isAllowedUrl } = require('./src/utils/helpers');
const { getBlurredImageUrl, addBadgeToImage } = require('./src/utils/imageProcessor');
const { clearAllTmdbCaches } = require('./src/clients/tmdb');
const { clearIdCache } = require('./src/id_mapping/id_cache');
const TmdbRequestCache = require('./src/models/TmdbRequestCache');
const LRUCache = require('./src/utils/LRUCache');

// 1. Inizializza Express
const app = express();
const PORT = process.env.PORT || 7000;

// Cache RAM per badge poster (TTL 14 giorni, max 500 immagini)
const badgeImageCache = new LRUCache({ max: 500, ttl: 14 * 24 * 60 * 60 * 1000 });

// CORS configurabile tramite variabile d'ambiente (default: permissivo per retrocompatibilità con Stremio)
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS;
const corsOptions = corsOrigins
    ? { origin: corsOrigins.split(',').map(o => o.trim()), methods: ['GET', 'POST'] }
    : { methods: ['GET', 'POST'] };
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

/**
 * Middleware helper: decodifica la configurazione Base64 dall'URL.
 */
function decodeConfigParam(configBase64) {
    return UserConfig.decodeConfig(configBase64);
}

// Health check endpoint per monitoring e deployment platforms
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.2',
        uptime: Math.floor(process.uptime())
    });
});

// Endpoint per recuperare i preset disponibili
app.get('/api/presets', (req, res) => {
    res.json({ presets: getPresets(), profileTemplates });
});

// Endpoint per anteprima catalogo: restituisce i primi 20 risultati TMDB con poster
const PREVIEW_TIMEOUT_MS = 8000;
app.post('/api/preview-catalog', async (req, res) => {
    const { presetId, filters: customFilters, type: customType } = req.body;
    const tmdbKey = req.body.tmdbKey || process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        return res.status(400).json({ error: 'TMDB API key non configurata sul server' });
    }
    if (!presetId && !customFilters) {
        return res.status(400).json({ error: 'presetId o filters obbligatori' });
    }
    const sanitizedTmdbKey = sanitizeString(tmdbKey);

    let discoverType, discoverFilters;

    if (presetId) {
        const sanitizedPresetId = sanitizeString(presetId);
        const preset = getPresets().find(p => p.id === sanitizedPresetId);
        if (!preset) {
            return res.status(404).json({ error: 'Preset non trovato' });
        }
        discoverType = preset.type === 'series' ? 'tv' : 'movie';
        discoverFilters = preset.filters;
    } else {
        discoverType = customType === 'series' ? 'tv' : 'movie';
        discoverFilters = {};
        const allowedFilterKeys = [
            'sort_by', 'with_genres', 'with_keywords', 'with_cast', 'with_crew',
            'with_companies', 'with_original_language', 'vote_average.gte', 'vote_count.gte',
            'primary_release_date.gte', 'primary_release_date.lte',
            'first_air_date.gte', 'first_air_date.lte'
        ];
        for (const [key, value] of Object.entries(customFilters)) {
            if (allowedFilterKeys.includes(key) && value !== undefined && value !== '') {
                if (typeof value === 'string') {
                    discoverFilters[key] = sanitizeString(value);
                } else if (typeof value === 'number') {
                    if (key === 'vote_average.gte') {
                        discoverFilters[key] = Math.max(0, Math.min(10, Number(value) || 0));
                    } else if (key === 'vote_count.gte') {
                        discoverFilters[key] = Math.max(0, Math.floor(Number(value) || 0));
                    } else {
                        discoverFilters[key] = Number(value) || 0;
                    }
                }
            }
        }
    }

    try {
        const tmdbRes = await axios.get(`https://api.themoviedb.org/3/discover/${discoverType}`, {
            params: {
                api_key: sanitizedTmdbKey,
                language: 'it-IT',
                region: 'IT',
                page: 1,
                ...discoverFilters
            },
            timeout: PREVIEW_TIMEOUT_MS
        });
        const items = (tmdbRes.data?.results || []).slice(0, 20).map(item => ({
            id: item.id,
            title: item.title || item.name || '',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
            vote: item.vote_average || 0,
            year: (item.release_date || item.first_air_date || '').substring(0, 4)
        }));
        res.json({ items });
    } catch (err) {
        const status = err.response?.status;
        if (status === 401) {
            return res.status(401).json({ error: 'Chiave TMDB non valida' });
        }
        return res.status(500).json({ error: 'Errore nel recupero dati da TMDB' });
    }
});

// Endpoint per la sfocatura immagini: redirect a wsrv.nl (proxy esterno gratuito)
const ALLOWED_IMAGE_HOSTS = ['image.tmdb.org', 'media.kitsu.app', 'walter.trakt.tv', 'artworks.thetvdb.com', 'via.placeholder.com'];
app.get('/blur', (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).send('URL mancante');
    }
    if (!isAllowedUrl(url, ALLOWED_IMAGE_HOSTS)) {
        console.warn(`Blur endpoint: URL bloccato dalla protezione SSRF: ${url}`);
        return res.status(403).send('URL non consentito');
    }
    const blurredUrl = getBlurredImageUrl(url);
    res.set('Cache-Control', 'public, max-age=604800');
    return res.redirect(302, blurredUrl);
});

// Endpoint per aggiungere badge (numero episodio) su poster
// Protetto contro SSRF: accetta solo URL di CDN immagini noti
app.get('/badge/poster.jpg', async (req, res) => {
    const { url, text } = req.query;
    if (!url || !text) {
        return res.status(400).send('URL e text obbligatori');
    }
    if (!isAllowedUrl(url, ALLOWED_IMAGE_HOSTS)) {
        console.warn(`Badge endpoint: URL bloccato dalla protezione SSRF: ${url}`);
        return res.status(403).send('URL non consentito');
    }
    const safeText = sanitizeString(String(text)).slice(0, 10);
    if (!safeText || !/^[A-Za-z0-9:]+$/.test(safeText)) {
        return res.status(400).send('Testo badge non valido');
    }
    const cacheKey = url + '_' + safeText;
    const cachedImage = badgeImageCache.get(cacheKey);
    if (cachedImage) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=1209600');
        return res.send(cachedImage);
    }
    try {
        const imageBuffer = await addBadgeToImage(url, safeText);
        if (imageBuffer) {
            badgeImageCache.set(cacheKey, imageBuffer);
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=1209600');
            return res.send(imageBuffer);
        } else {
            return res.redirect(301, url);
        }
    } catch (_err) {
        return res.redirect(301, url);
    }
});

// Endpoint per validare una TMDB API Key
app.post('/api/validate-tmdb-key', async (req, res) => {
    const tmdbKey = req.body.tmdbKey || process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        return res.status(400).json({ valid: false, error: 'TMDB API key non configurata sul server' });
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
    } catch (_err) {
        return res.json({ success: false, error: 'Errore di connessione al servizio di autenticazione.' });
    }
});

// Stremio API: Aggiorna addon nella collezione dell'utente (senza reinstallare manualmente)
app.post('/api/stremio-addon-update', async (req, res) => {
    const { authKey, manifestUrl } = req.body;
    if (!authKey || !manifestUrl) {
        return res.status(400).json({ success: false, error: 'authKey e manifestUrl obbligatori' });
    }

    try {
        const parsed = new URL(manifestUrl);
        if (!parsed.pathname.endsWith('/manifest.json')) {
            return res.status(400).json({ success: false, error: 'URL manifest non valido' });
        }
        const isProd = process.env.NODE_ENV === 'production';
        if (isProd && parsed.protocol !== 'https:') {
            return res.status(400).json({ success: false, error: 'Il manifest URL deve usare HTTPS' });
        }
        if (isProd && !isAllowedUrl(manifestUrl, [])) {
            return res.status(400).json({ success: false, error: 'URL manifest non consentito' });
        }
    } catch (_e) {
        return res.status(400).json({ success: false, error: 'URL non valido' });
    }

    try {
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

        const addonId = 'org.stremio.yaca.catalog';
        const existingIdx = addons.findIndex(a => a.manifest?.id === addonId);

        const manifestRes = await axios.get(manifestUrl, { timeout: 10000 });
        const manifest = manifestRes.data;

        if (existingIdx !== -1) {
            addons[existingIdx].transportUrl = manifestUrl;
            addons[existingIdx].manifest = manifest;
        } else {
            addons.push({
                transportUrl: manifestUrl,
                transportName: 'http',
                manifest: manifest,
                flags: { official: false, protected: false }
            });
        }

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
        console.error("Errore stremio-addon-update:", err.message);
        return res.json({ success: false, error: 'Errore di connessione al servizio Stremio.' });
    }
});

// --- Trakt Device Authentication ---
app.post('/api/trakt/device/code', async (req, res) => {
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) return res.status(400).json({ error: 'TRAKT_CLIENT_ID mancante nel server.' });

    try {
        const response = await axios.post('https://api.trakt.tv/oauth/device/code', {
            client_id: clientId
        }, { headers: { 'Content-Type': 'application/json' } });
        return res.json(response.data);
    } catch (err) {
        console.error("Errore Trakt Code:", err.response?.data || err.message);
        return res.status(500).json({ error: "Errore di connessione a Trakt." });
    }
});

app.post('/api/trakt/device/token', async (req, res) => {
    const { device_code } = req.body;
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;

    if (!device_code) return res.status(400).json({ error: 'device_code mancante' });
    if (!clientId || !clientSecret) return res.status(400).json({ error: 'TRAKT_CLIENT_SECRET o ID mancanti nel server (.env). Contattare l`amministratore.' });

    try {
        const response = await axios.post('https://api.trakt.tv/oauth/device/token', {
            code: device_code,
            client_id: clientId,
            client_secret: clientSecret
        }, { headers: { 'Content-Type': 'application/json' } });

        return res.json(response.data);
    } catch (err) {
        const status = err.response?.status;
        if (status === 400 || status === 429) {
            return res.json({ pending: true });
        } else if (status === 404 || status === 410) {
            return res.json({ error: 'Token scaduto o invalido' });
        } else if (status === 409) {
            return res.json({ error: 'Utente ha negato l\'accesso' });
        }
        console.error("Errore Trakt Token:", err.response?.data || err.message);
        return res.status(500).json({ error: "Errore recupero token Trakt." });
    }
});

// 2. Registra endpoint configuration (Frontend Web)
app.post('/api/configure', configureRoute);

// Redirect per configurazione da URL Base64
app.get(['/:configBase64/configure', '/:configBase64/:configVersion/configure'], (req, res) => {
    res.redirect(`/?config=${encodeURIComponent(req.params.configBase64)}`);
});

// Endpoint per svuotare tutte le cache globali del sistema (solo per test)
app.post('/api/clear-cache', async (req, res) => {
    try {
        clearAllTmdbCaches();
        clearIdCache();
        const cacheResult = TmdbRequestCache.clear();
        res.json({ success: true, dbCleared: cacheResult.deleted });
    } catch (err) {
        console.error('Errore svuotamento cache:', err);
        res.status(500).json({ error: 'Errore durante lo svuotamento della cache.' });
    }
});

// Opzioni di ordinamento disponibili in Stremio per i cataloghi TMDB
const SORT_OPTIONS = ['Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi'];
const SORT_MAP = {
    'Popolarità': 'popularity.desc',
    'Voto Medio': 'vote_average.desc',
    'Data di Uscita': null,
    'Incassi': 'revenue.desc'
};

function getSortByValue(genreExtra, type) {
    if (!genreExtra || !Object.prototype.hasOwnProperty.call(SORT_MAP, genreExtra)) return 'popularity.desc';
    if (genreExtra === 'Data di Uscita') {
        return type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
    }
    return SORT_MAP[genreExtra];
}

const presetExtra = [{ name: 'genre', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];

// 3. Endpoint dinamico per il Manifest di Stremio (Base64 config nell'URL)
app.get(['/:configBase64/manifest.json', '/:configBase64/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = decodeConfigParam(req.params.configBase64);
    if (!userConfig) {
        return res.status(400).json({ error: "Configurazione non valida" });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    try {
        const cv = userConfig.configVersion;
        const dynamicVersion = cv ? `1.0.2+${cv}` : '1.0.2';

        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: dynamicVersion,
            name: 'YACA (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            logo: `${req.protocol}://${req.get('host')}/logo.png`,
            resources: ['catalog', 'meta'],
            types: ['movie', 'series'],
            catalogs: [
                { id: 'yaca_ai_search', type: 'movie', name: 'Ricerca AI (Film)', extra: [{ name: 'search', isRequired: true }, { name: 'skip' }] },
                { id: 'yaca_ai_search_series', type: 'series', name: 'Ricerca AI (Serie)', extra: [{ name: 'search', isRequired: true }, { name: 'skip' }] }
            ],
            idPrefixes: ['tt', 'tmdb:', 'kitsu:'],
            behaviorHints: {
                configurable: true,
                configurationRequired: false
            },
            contactEmail: 'yaca.addon@proton.me',
            configurationURL: `${req.protocol}://${req.get('host')}/${req.params.configBase64}/configure`
        };

        let activeProfileCatalogs = [];
        if (userConfig.profiles && userConfig.activeProfileId) {
            const profile = userConfig.profiles.find(p => p.id === userConfig.activeProfileId);
            if (profile && profile.catalogs) {
                activeProfileCatalogs = profile.catalogs;
            }
        } else if (userConfig.catalogs) {
            activeProfileCatalogs = userConfig.catalogs;
        }

        if (activeProfileCatalogs.length > 0) {
            for (const cat of activeProfileCatalogs) {
                const isPreset = cat.id.startsWith('yaca_preset_');
                const catName = sanitizeString(cat.name || '');
                manifest.catalogs.unshift({
                    id: cat.id,
                    type: cat.type || 'movie',
                    name: isPreset ? catName : `AI: ${catName}`,
                    extra: presetExtra
                });
            }
        }

        if (userConfig.apiKeys && userConfig.apiKeys.trakt) {
            manifest.catalogs.unshift(
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

// Root manifest (senza config) per guidare l'utente alla configurazione
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

// 4. Endpoint per i Cataloghi Stremio (Base64 config)
app.get([
    '/:configBase64/catalog/:type/:id.json',
    '/:configBase64/catalog/:type/:id/:extra.json',
    '/:configBase64/:configVersion/catalog/:type/:id.json',
    '/:configBase64/:configVersion/catalog/:type/:id/:extra.json'
], async (req, res) => {
    const userConfig = decodeConfigParam(req.params.configBase64);
    if (!userConfig) {
        return res.status(400).json({ metas: [] });
    }
    const { type, id, extra: extraStr } = req.params;
    const extra = parseExtra(extraStr);

    if (extra.skip) extra.skip = parseInt(extra.skip, 10) || 0;

    if (extra.genre) {
        extra.sortBy = getSortByValue(extra.genre, type);
    }

    const args = { type, id, extra };
    const hostUrl = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;

    try {
        const response = await catalogHandler(args, userConfig, hostUrl);
        res.setHeader('Cache-Control', 'max-age=1800, public');
        res.json(response);
    } catch (err) {
        console.error("Errore Catalog Endpoint:", err.message);
        res.json({ metas: [] });
    }
});

// 5. Endpoint per i Metadati Stremio (Base64 config)
app.get(['/:configBase64/meta/:type/:id.json', '/:configBase64/:configVersion/meta/:type/:id.json'], async (req, res) => {
    const userConfig = decodeConfigParam(req.params.configBase64);
    if (!userConfig) {
        return res.status(400).json({ meta: null });
    }
    const { type, id } = req.params;
    const args = { type, id };

    try {
        const response = await metaHandler(args, userConfig);
        res.setHeader('Cache-Control', type === 'series' ? 'max-age=1800, public' : 'max-age=86400, public');
        res.json(response);
    } catch (err) {
        console.error("Errore Meta Endpoint:", err.message);
        res.json({ meta: null });
    }
});

// Avvia il server
const server = app.listen(PORT, () => {
    console.log(`🚀 YACA Server in esecuzione su http://localhost:${PORT}`);
    if (!process.env.HOST_URL && !process.env.RENDER_EXTERNAL_URL) {
        console.warn('⚠️ HOST_URL non configurato nel file .env. I poster con badge e le immagini sfocate potrebbero non funzionare su client remoti (Stremio). Imposta HOST_URL=https://tuo-dominio.com nel file .env.');
    }
});

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n${signal} ricevuto. Spegnimento in corso...`);
    server.close(() => {
        console.log('Server chiuso correttamente.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Spegnimento forzato dopo timeout.');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
