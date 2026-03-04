require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const configureRoute = require('./src/api/configure');
const UserConfig = require('./src/models/UserConfig');
const { catalogHandler, buildDiscoveryParams } = require('./src/handlers/catalogHandler');
const { metaHandler } = require('./src/handlers/metaHandler');
const { generateTmdbFiltersFromPrompt } = require('./src/ai/router');
const { getPresets, profileTemplates } = require('./src/data/presets');
const { parseExtra, sanitizeString, isAllowedUrl } = require('./src/utils/helpers');
const { getBlurredImageUrl, addBadgeToImage } = require('./src/utils/imageProcessor');
const { streamHandler } = require('./src/handlers/streamHandler');
const { clearAllTmdbCaches } = require('./src/clients/tmdb');
const { clearIdCache } = require('./src/id_mapping/id_cache');
const TmdbRequestCache = require('./src/models/TmdbRequestCache');
const LRUCache = require('./src/utils/LRUCache');
const { rateLimitedMap } = require('./src/utils/rateLimiter');
const { updateStremioAddonCollection } = require('./src/utils/stremioAddonSync');
const connectDB = require('./src/db/connection');
const User = require('./src/db/models/User');
const BadgeImage = require('./src/db/models/BadgeImage');
const { syncIncrementalRecommendations } = require('./src/engines/hybridRecommendations');

// Connessione MongoDB
connectDB();

// 1. Inizializza Express
const app = express();
const PORT = process.env.PORT || 7000;

// Cache RAM per badge poster (TTL 14 giorni, max 500 immagini)
const BADGE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const BADGE_CACHE_TTL_SECS = 14 * 24 * 60 * 60; // 1209600
const badgeImageCache = new LRUCache({ max: 500, ttl: BADGE_CACHE_TTL_MS });

// CORS configurabile tramite variabile d'ambiente (default: permissivo per retrocompatibilità con Stremio)
const corsOrigins = process.env.CORS_ALLOWED_ORIGINS;
const corsOptions = corsOrigins
    ? { origin: corsOrigins.split(',').map(o => o.trim()), methods: ['GET', 'POST'] }
    : { methods: ['GET', 'POST'] };
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'frontend', 'out')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

/**
 * Helper per risolvere la configurazione utente (Stateful).
 * @param {string} userId - userId (MongoDB)
 * @returns {Promise<object|null>} Configurazione utente normalizzata
 */
async function resolveUserConfig(userId) {
    if (!userId) return null;

    const user = await UserConfig.getUser(userId);
    if (user) {
        return {
            userId: user.userId,
            apiKeys: user.apiKeys,
            profiles: user.profiles,
            activeProfileId: user.config?.activeProfileId,
            configVersion: user.config?.configVersion
        };
    }

    return null;
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
// 2. API per il frontend (configurazione)
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await UserConfig.getUser(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: "Utente non trovato" });
        }
        res.json(user);
    } catch (err) {
        console.error("Errore fetch utente:", err);
        res.status(500).json({ error: "Errore interno" });
    }
});

app.get('/api/presets', (req, res) => {
    res.json({ presets: getPresets(), profileTemplates });
});

// Endpoint per anteprima catalogo: restituisce i primi 20 risultati TMDB con poster
const PREVIEW_TIMEOUT_MS = 8000;
const MAX_PROMPT_LENGTH = 500;
const MAX_PREVIEW_CATALOG_NAME_LENGTH = 30;
app.post('/api/preview-catalog', async (req, res) => {
    const { presetId, filters: customFilters, type: customType, prompt } = req.body;
    const tmdbKey = req.body.tmdbKey || process.env.TMDB_API_KEY;
    const mistralKey = req.body.mistralKey || process.env.MISTRAL_API_KEY;
    if (!tmdbKey) {
        return res.status(400).json({ error: 'TMDB API key non configurata sul server' });
    }
    if (!presetId && !customFilters && !prompt) {
        return res.status(400).json({ error: 'presetId, filters o prompt obbligatori' });
    }
    const sanitizedTmdbKey = sanitizeString(tmdbKey);

    let discoverType, discoverFilters, strategy;
    let sanitizedPrompt = null;

    if (presetId) {
        const sanitizedPresetId = sanitizeString(presetId);
        const preset = getPresets().find(p => p.id === sanitizedPresetId);
        if (!preset) {
            return res.status(404).json({ error: 'Preset non trovato' });
        }
        discoverType = preset.type === 'series' ? 'tv' : 'movie';
        discoverFilters = preset.filters;
        strategy = 'discovery';
    } else if (prompt) {
        sanitizedPrompt = sanitizeString(String(prompt)).substring(0, MAX_PROMPT_LENGTH);
        if (!sanitizedPrompt) {
            return res.status(400).json({ error: 'Prompt non valido' });
        }
        const aiFilters = await generateTmdbFiltersFromPrompt(sanitizedPrompt, mistralKey);
        const aiType = customType === 'series' || aiFilters.target === 'kitsu' ? 'series' : 'movie';
        discoverType = aiType === 'series' ? 'tv' : 'movie';
        strategy = aiFilters.strategy || 'discovery';
        discoverFilters = strategy === 'discovery'
            ? await buildDiscoveryParams(aiFilters, sanitizedTmdbKey, aiType)
            : aiFilters;
    } else {
        discoverType = customType === 'series' ? 'tv' : 'movie';
        discoverFilters = {};
        strategy = 'discovery';
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
        let tmdbRes;
        if (strategy === 'multi_search') {
            tmdbRes = await axios.get(`https://api.themoviedb.org/3/search/${discoverType}`, {
                params: {
                    api_key: sanitizedTmdbKey,
                    language: 'it-IT',
                    region: 'IT',
                    page: 1,
                    query: sanitizeString(discoverFilters.text_search || discoverFilters.keyword || '')
                },
                timeout: PREVIEW_TIMEOUT_MS
            });
        } else if (strategy === 'similar' && discoverFilters.similar_to) {
            const searchRes = await axios.get(`https://api.themoviedb.org/3/search/${discoverType}`, {
                params: {
                    api_key: sanitizedTmdbKey,
                    language: 'it-IT',
                    region: 'IT',
                    page: 1,
                    query: sanitizeString(discoverFilters.similar_to)
                },
                timeout: PREVIEW_TIMEOUT_MS
            });
            const targetId = searchRes.data?.results?.[0]?.id;
            if (targetId) {
                tmdbRes = await axios.get(`https://api.themoviedb.org/3/${discoverType}/${targetId}/recommendations`, {
                    params: {
                        api_key: sanitizedTmdbKey,
                        language: 'it-IT',
                        page: 1
                    },
                    timeout: PREVIEW_TIMEOUT_MS
                });
            } else {
                tmdbRes = { data: { results: [] } };
            }
        } else {
            tmdbRes = await axios.get(`https://api.themoviedb.org/3/discover/${discoverType}`, {
                params: {
                    api_key: sanitizedTmdbKey,
                    language: 'it-IT',
                    region: 'IT',
                    page: 1,
                    ...discoverFilters
                },
                timeout: PREVIEW_TIMEOUT_MS
            });
        }
        const items = (tmdbRes.data?.results || []).slice(0, 20).map(item => ({
            id: item.id,
            title: item.title || item.name || '',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
            vote: item.vote_average || 0,
            year: (item.release_date || item.first_air_date || '').substring(0, 4)
        }));
        res.json({
            items,
            filters: discoverFilters,
            type: discoverType === 'tv' ? 'series' : 'movie',
            name: sanitizedPrompt ? sanitizedPrompt.substring(0, MAX_PREVIEW_CATALOG_NAME_LENGTH) : null
        });
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
    const safeText = sanitizeString(String(text)).slice(0, 20);
    // Permetti lettere (incluse accentate), numeri, spazi, due punti e parentesi
    if (!safeText || !/^[\p{L}\p{N}\s:()]+$/u.test(safeText)) {
        return res.status(400).send('Testo badge non valido');
    }

    const cacheKey = url + '_' + safeText;

    // 1. L1 Cache (Memory)
    const cachedImage = badgeImageCache.get(cacheKey);
    if (cachedImage) {
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${BADGE_CACHE_TTL_SECS}`);
        return res.send(cachedImage);
    }

    try {
        // 2. L2 Cache (MongoDB)
        const dbImage = await BadgeImage.findOne({ key: cacheKey });
        if (dbImage) {
            badgeImageCache.set(cacheKey, dbImage.imageData);
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', `public, max-age=${BADGE_CACHE_TTL_SECS}`);
            return res.send(dbImage.imageData);
        }

        // 3. Generation
        const imageBuffer = await addBadgeToImage(url, safeText);
        if (imageBuffer) {
            badgeImageCache.set(cacheKey, imageBuffer);

            // Async save to DB to not block response
            const expiresAt = new Date(Date.now() + BADGE_CACHE_TTL_MS);
            BadgeImage.create({ key: cacheKey, imageData: imageBuffer, expiresAt })
                .catch(err => console.error('Errore persistenza badge DB:', err.message));

            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', `public, max-age=${BADGE_CACHE_TTL_SECS}`);
            return res.send(imageBuffer);
        } else {
            return res.redirect(301, url);
        }
    } catch (_err) {
        return res.redirect(301, url);
    }
});

// TMDB Proxy Search endpoints per Autocomplete
app.get('/api/tmdb/search/keyword', async (req, res) => {
    const query = req.query.query;
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY non configurata sul server' });
    if (!query) return res.json({ results: [] });

    try {
        const response = await axios.get('https://api.themoviedb.org/3/search/keyword', {
            params: {
                api_key: sanitizeString(tmdbKey),
                query: sanitizeString(query),
                page: 1
            },
            timeout: 5000
        });
        return res.json({ results: response.data.results || [] });
    } catch (err) {
        console.error('Errore search keyword:', err.message);
        return res.status(500).json({ error: 'Errore durante la ricerca delle keyword' });
    }
});

app.get('/api/tmdb/search/person', async (req, res) => {
    const query = req.query.query;
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.status(500).json({ error: 'TMDB_API_KEY non configurata sul server' });
    if (!query) return res.json({ results: [] });

    try {
        const response = await axios.get('https://api.themoviedb.org/3/search/person', {
            params: {
                api_key: sanitizeString(tmdbKey),
                query: sanitizeString(query),
                language: 'it-IT',
                page: 1,
                include_adult: false
            },
            timeout: 5000
        });
        return res.json({ results: response.data.results || [] });
    } catch (err) {
        console.error('Errore search person:', err.message);
        return res.status(500).json({ error: 'Errore durante la ricerca delle persone' });
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
        const result = await updateStremioAddonCollection(authKey, manifestUrl);
        if (result.success) {
            return res.json({ success: true });
        }
        return res.json({ success: false, error: result.error });
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

// Endpoint per recuperare i profili dell'utente tramite userId (Sostituisce il decode Base64 frontend)
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId parameter is required' });

    try {
        const userConfig = await resolveUserConfig(userId);
        if (!userConfig) {
            return res.status(404).json({ error: 'Utente non trovato' });
        }
        res.json({
            profiles: userConfig.profiles || [],
            activeProfileId: userConfig.activeProfileId,
            configVersion: userConfig.configVersion
        });
    } catch (err) {
        console.error('Errore durante il recupero dell\'utente:', err.message);
        res.status(500).json({ error: 'Errore interno del server' });
    }
});

// Endpoint per svuotare tutte le cache globali del sistema (solo per test)
app.post('/api/clear-cache', async (req, res) => {
    try {
        await clearAllTmdbCaches();
        await clearIdCache();
        await TmdbRequestCache.clear();

        badgeImageCache.clear();
        await BadgeImage.deleteMany({});

        res.json({ success: true, message: 'Tutte le cache (RAM e DB) sono state svuotate.' });
    } catch (err) {
        console.error('Errore svuotamento cache:', err);
        res.status(500).json({ error: 'Errore durante lo svuotamento della cache.' });
    }
});

// Endpoint per pre-caricare la cache dei cataloghi più usati (es. ping da UptimeRobot)
// Rate limited a 1 richiesta ogni 2 secondi (~30/min) per non bombardare TMDB
const WARMUP_BATCH_SIZE = 1;
const WARMUP_DELAY_MS = 2000;

app.get('/api/cron/warmup', async (req, res) => {
    // Rispondi subito per non far andare in timeout UptimeRobot
    res.status(200).json({ status: 'Warmup avviato in background' });

    if (!process.env.TMDB_API_KEY) {
        console.warn('⚠️  Warmup saltato: TMDB_API_KEY non configurata.');
        return;
    }

    const dummyConfig = { apiKeys: { tmdb: process.env.TMDB_API_KEY } };
    const hostUrl = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:7000';

    // Cataloghi base con handler dedicati
    const baseCatalogs = [
        { type: 'movie', id: 'yaca_discover_movies', extra: { skip: 0 } },
        { type: 'series', id: 'yaca_discover_series', extra: { skip: 0 } },
        { type: 'series', id: 'yaca_anime_trending', extra: { skip: 0 } },
    ];

    // Tutti i preset configurati (aggiornati dinamicamente con date correnti)
    const presetCatalogs = getPresets().map(preset => ({
        type: preset.type,
        id: `yaca_preset_${preset.id}`,
        extra: { skip: 0 }
    }));

    const allCatalogs = [...baseCatalogs, ...presetCatalogs];

    console.log(`🔥 Avvio Pre-Warming di ${allCatalogs.length} cataloghi (rate limit: 1 ogni ${WARMUP_DELAY_MS}ms)...`);

    await rateLimitedMap(
        allCatalogs,
        async (args) => {
            try {
                await catalogHandler(args, dummyConfig, hostUrl);
                console.log(`✅ Cache scaldata per: ${args.id}`);
            } catch (e) {
                console.error(`❌ Errore warmup ${args.id}:`, e.message);
            }
        },
        { batchSize: WARMUP_BATCH_SIZE, delayMs: WARMUP_DELAY_MS }
    );

    // Warmup Fase 2: Raccomandazioni Ibride per Utenti Registrati
    console.log("🔥 Avvio Warmup Raccomandazioni Ibride per utenti registrati...");
    try {
        const users = await User.find({ 'apiKeys.trakt': { $exists: true, $ne: null } });
        console.log(`[Warmup] Trovati ${users.length} utenti con Trakt. Inizio sync...`);

        // Eseguiamo in batch per non saturare le API
        await rateLimitedMap(
            users,
            async (user) => {
                const traktToken = user.apiKeys.trakt;
                const tmdbApiKey = user.apiKeys.tmdb || process.env.TMDB_API_KEY;
                if (!traktToken || !tmdbApiKey) return;

                await syncIncrementalRecommendations(user.userId, 'movie', traktToken, tmdbApiKey);
                await syncIncrementalRecommendations(user.userId, 'series', traktToken, tmdbApiKey);
                console.log(`✅ Recs sincronizzate per utente: ${user.userId}`);
            },
            { batchSize: 1, delayMs: 1000 } // Molto conservativo per Trakt
        );
    } catch (err) {
        console.error("❌ Errore durante il warmup delle raccomandazioni:", err.message);
    }

    console.log(`✅ Pre-Warming completato per ${allCatalogs.length} cataloghi e raccomandazioni utenti.`);
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

// 3. Endpoint dinamico per il Manifest di Stremio
app.get(['/:userHandle/manifest.json', '/:userHandle/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = await resolveUserConfig(req.params.userHandle);
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
            resources: [
                'catalog',
                'meta',
                { name: 'stream', types: ['movie', 'series', 'other'], idPrefixes: ['yaca-profile-'] }
            ],
            types: ['movie', 'series', 'other'],
            catalogs: [
                { id: 'yaca-profiles', type: 'other', name: '👥 Cambia Profilo' },
                { id: 'yaca_search_history', type: 'movie', name: 'Cronologia Ricerche', extra: [{ name: 'skip' }] },
                { id: 'yaca_ai_search', type: 'movie', name: 'Ricerca AI (Film)', extra: [{ name: 'search', isRequired: true }, { name: 'skip' }] },
                { id: 'yaca_ai_search_series', type: 'series', name: 'Ricerca AI (Serie)', extra: [{ name: 'search', isRequired: true }, { name: 'skip' }] }
            ],
            idPrefixes: ['tt', 'tmdb:', 'kitsu:', 'yaca-profile-'],
            behaviorHints: {
                configurable: true,
                configurationRequired: false
            },
            contactEmail: 'yaca.addon@proton.me',
            configurationURL: `${req.protocol}://${req.get('host')}/${req.params.userHandle}/configure`
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

// 4. Endpoint per i Cataloghi Stremio
app.get([
    '/:userHandle/catalog/:type/:id.json',
    '/:userHandle/catalog/:type/:id/:extra.json',
    '/:userHandle/:configVersion/catalog/:type/:id.json',
    '/:userHandle/:configVersion/catalog/:type/:id/:extra.json'
], async (req, res) => {
    const userConfig = await resolveUserConfig(req.params.userHandle);
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

// 5. Endpoint per i Metadati Stremio
app.get(['/:userHandle/meta/:type/:id.json', '/:userHandle/:configVersion/meta/:type/:id.json'], async (req, res) => {
    const userConfig = await resolveUserConfig(req.params.userHandle);
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

// 6. Endpoint per i flussi Stream (usato per i profili)
app.get(['/:userHandle/stream/:type/:id.json', '/:userHandle/:configVersion/stream/:type/:id.json'], async (req, res) => {
    const userConfig = await resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(400).json({ streams: [] });
    }
    const { type, id } = req.params;
    const configVersion = req.params.configVersion || '';
    const args = { type, id };
    const hostUrl = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;

    try {
        const response = await streamHandler(args, userConfig, hostUrl, configVersion);
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.json(response);
    } catch (err) {
        console.error("Errore Stream Endpoint:", err.message);
        res.json({ streams: [] });
    }
});

// 7. Magic Endpoint: Cambio Profilo on-the-fly tramite stream video
app.get('/api/users/:userId/switch-profile/:profileId', async (req, res) => {
    const { userId, profileId } = req.params;

    try {
        const userConfig = await resolveUserConfig(userId);
        if (!userConfig) return res.status(404).send('User not found');

        const profileExists = userConfig.profiles && userConfig.profiles.some(p => p.id === profileId);
        if (!profileExists) return res.status(400).send('Profile not found');

        await UserConfig.saveUser({
            userId,
            config: {
                activeProfileId: profileId,
                configVersion: Date.now().toString(36)
            }
        });

        const stremioAuthKey = userConfig.apiKeys?.stremio;
        if (stremioAuthKey) {
            const hostUrl = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
            const manifestUrl = `${hostUrl}/${userId}/manifest.json`;
            // Sync fire-and-forget
            updateStremioAddonCollection(stremioAuthKey, manifestUrl)
                .then(r => console.log(`[Profile Switch] Sync Stremio completato per utente ${userId}: ${r.success}`))
                .catch(e => console.error(`[Profile Switch] Errore sync Stremio utente ${userId}:`, e));
        } else {
            console.log(`[Profile Switch] Nessuna authKey Stremio salvata per ${userId}. Sync saltata.`);
        }

        res.redirect('/assets/profile_updated.mp4');
    } catch (err) {
        console.error(`Errore switch profile per user ${userId}:`, err.message);
        res.status(500).send('Internal validation error');
    }
});

// 8. Auto-Sync Backend Route (usata dalla Web UI)
app.post('/api/stremio-addon-update', async (req, res) => {
    const { authKey, manifestUrl } = req.body;
    if (!authKey || !manifestUrl) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    try {
        const result = await updateStremioAddonCollection(authKey, manifestUrl);
        res.json(result);
    } catch (err) {
        console.error("Errore aggiornamento Stremio:", err);
        res.status(500).json({ error: "Errore durante la sincronizzazione con Stremio" });
    }
});

// Catch-all route per gestire il routing lato client di Next.js
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'out', 'index.html'));
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
    server.close(async () => {
        console.log('Server chiuso correttamente.');
        try {
            const mongoose = require('mongoose');
            await mongoose.disconnect();
            console.log('MongoDB disconnesso.');
        } catch (err) {
            console.error('Errore durante la disconnessione di MongoDB:', err.message);
        }
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Spegnimento forzato dopo timeout.');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
