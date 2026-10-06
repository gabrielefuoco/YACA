const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { stremioClient } = require('../clients/stremio');
const { traktClient } = require('../clients/trakt');
const { updateStremioAddonCollection } = require('../utils/stremioAddon');
const UserConfig = require('../models/UserConfig');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const CacheManager = require('../cache/CacheManager');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const { urlPosterDaRottaLegacy } = require('../catalog/formatters/StremioFormatter');
const { catalogHandler } = require('../handlers/catalogHandler');
const { metaHandler, isMetaDubbed } = require('../handlers/metaHandler');
const { streamHandler } = require('../handlers/streamHandler');
const { parseExtra } = require('../utils/helpers');
const { getPresets } = require('../data/presets');
const { isCatalogConformant } = require('../catalog/catalogKind');

// Rate limiter for sync-status polling (max 30 requests per minute per IP)
const syncStatusLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const {
    SORT_OPTIONS,
    SORT_MAP,
    getSortByValue
} = require('../catalog/catalogSorting');

const defaultExtra = [{ name: 'skip' }];
const presetExtra = [{ name: 'sortBy', isRequired: false, options: SORT_OPTIONS }, { name: 'skip' }];
const searchExtra = [{ name: 'search', isRequired: true }];

let canonicalPresetsMap = null;
function getCanonicalPresetsMap() {
    if (!canonicalPresetsMap) {
        try {
            const presets = getPresets();
            canonicalPresetsMap = new Map(presets.map(p => [p.id, p]));
        } catch (e) {
            console.error('[stremio] Failed to load canonical presets for catalog extra:', e.message);
            canonicalPresetsMap = new Map();
        }
    }
    return canonicalPresetsMap;
}

function getCatalogExtra(cat) {
    if (!cat) return presetExtra;
    if (cat.extra) return cat.extra;

    // Regola data-driven: se il catalogo dichiara sortable === false o _provider === 'airing_state'
    if (cat.sortable === false || cat._provider === 'airing_state' || cat._provider === 'anilist_simulcast') {
        return defaultExtra;
    }

    // Risoluzione canonica da presets.js
    const presetMap = getCanonicalPresetsMap();
    const baseId = cat.id && cat.id.startsWith('yaca_preset_') ? cat.id.replace('yaca_preset_', '') : cat.id;
    const canonical = presetMap.get(baseId) || (cat.id ? presetMap.get(cat.id) : null);
    if (canonical && (canonical.sortable === false || canonical._provider === 'airing_state' || canonical._provider === 'anilist_simulcast')) {
        return defaultExtra;
    }

    return presetExtra;
}

// Stremio API: Login con credenziali Stremio per ottenere authKey
router.post('/stremio-auth', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email e password obbligatorie' });
    }
    try {
        const stremioRes = await stremioClient.post('/api/login', { email, password }, { timeout: 10000 });
        const data = stremioRes.data;
        if (data && data.result && data.result.authKey) {
            return res.json({ success: true, authKey: data.result.authKey, email: data.result.user?.email || email });
        }
        return res.json({ success: false, error: data?.result?.error || 'Credenziali non valide' });
    } catch (_err) {
        return res.json({ success: false, error: 'Errore di connessione al servizio di autenticazione.' });
    }
});

// Check if user already exists in DB by stremio authKey (skip Trakt for returning users)
router.post('/check-user', async (req, res) => {
    const { authKey, email } = req.body;
    if (!authKey && !email) {
        return res.status(400).json({ exists: false, error: 'authKey o email obbligatorio' });
    }
    try {
        let existingAccount = null;
        if (email) {
            existingAccount = await UserAccount.findOne({ email }).lean();
        }
        if (!existingAccount && authKey) {
            existingAccount = await UserAccount.findOne({ 'apiKeys.stremio': authKey }).lean();
        }

        if (existingAccount?.userId) {
            // Read profiles from AddonConfig (Two-Table Split)
            const addonConfig = existingAccount.addonUuid
                ? await AddonConfig.findOne({ uuid: existingAccount.addonUuid }).lean()
                : null;

            return res.json({
                exists: true,
                userId: existingAccount.userId,
                traktToken: existingAccount.apiKeys?.trakt || null,
                traktRefreshToken: existingAccount.apiKeys?.traktRefreshToken || null,
                configVersion: addonConfig?.config?.configVersion || null,
                profiles: addonConfig?.profiles || [],
                activeProfileId: addonConfig?.config?.activeProfileId || 'global'
            });
        }
        return res.json({ exists: false });
    } catch (err) {
        console.error('Errore check-user:', err.message);
        return res.status(500).json({ exists: false, error: 'Errore interno' });
    }
});

// Stremio API: Aggiorna addon nella collezione dell'utente (senza reinstallare manualmente)
router.post('/stremio-addon-update', async (req, res) => {
    const { authKey, manifestUrl } = req.body;
    if (!authKey || !manifestUrl) {
        return res.status(400).json({ success: false, error: 'authKey e manifestUrl obbligatori' });
    }

    try {
        const parsed = new URL(manifestUrl);
        if (!parsed.pathname.endsWith('/manifest.json')) {
            return res.status(400).json({ success: false, error: 'URL manifest non valido' });
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
router.post('/trakt/device/code', async (req, res) => {
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) return res.status(400).json({ error: 'TRAKT_CLIENT_ID mancante nel server.' });

    try {
        const response = await traktClient.post('/oauth/device/code', {
            client_id: clientId
        }, { headers: { 'Content-Type': 'application/json' } });
        return res.json(response.data);
    } catch (err) {
        console.error("Errore Trakt Code:", err.response?.data || err.message);
        const errorDetail = err.response?.data?.error_description 
            ? `${err.response.data.error}: ${err.response.data.error_description}`
            : (err.response?.data?.error || err.message || "Errore di connessione a Trakt.");
        return res.status(err.response?.status || 500).json({ error: errorDetail });
    }
});

router.post('/trakt/device/token', async (req, res) => {
    const { device_code } = req.body;
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;

    if (!device_code) return res.status(400).json({ error: 'device_code mancante' });
    if (!clientId || !clientSecret) return res.status(400).json({ error: 'TRAKT_CLIENT_SECRET o ID mancanti nel server (.env).' });

    try {
        const response = await traktClient.post('/oauth/device/token', {
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
        const errorDetail = err.response?.data?.error_description 
            ? `${err.response.data.error}: ${err.response.data.error_description}`
            : (err.response?.data?.error || err.message || "Errore recupero token Trakt.");
        return res.status(err.response?.status || 500).json({ error: errorDetail });
    }
});

// --- STREMIO ADDON ENDPOINTS ---

// Root manifest (senza config) - MOVED TO TOP to avoid shadowing by parameterized routes
router.get('/manifest.json', (req, res) => {
    const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
    const manifest = {
        id: 'org.stremio.yaca.catalog',
        version: '1.0.4',
        name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
        description: 'Catalogo Intelligente Potenziato da AI - Configurazione Richiesta',
        logo: `${hostUrl}/fiamma_yaca.png`,
        contactEmail: 'yaca.addon@proton.me',
        resources: [],
        types: [],
        catalogs: [],
        behaviorHints: {
            configurable: true,
            configurationRequired: true
        },
        // Point to root for configuration if no user context
        configurationURL: `${hostUrl}/`
    };
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

function resolveCatalogType(cat) {
    if (!cat) return 'movie';
    const raw = (cat.kind || cat.type || '').toString().toLowerCase().trim();
    if (raw === 'series') return 'series';
    if (raw === 'anime') return 'anime';
    if (raw === 'other') return 'other';
    return 'movie';
}

function buildManifest(userConfig, hostUrl = 'http://localhost:7000', userHandle = null) {
    const cv = userConfig.configVersion?.toString().replace(/_/g, '-');
    const dynamicVersion = cv ? `1.0.4+${cv}` : '1.0.4';

    const activeProfileId = userConfig.activeProfileId || 'global';
    const profile = userConfig.profiles?.find(p => p.id === activeProfileId) || (userConfig.profiles?.[0]);

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

    const typeSelectors = profile?.settings?.typeSelectors;

    // Filter: only show hero catalogs if they are enabled in the active profile's selectedPresets
    // and conformant to typeSelectors.
    const activeHeroCatalogs = (
        Array.isArray(selectedPresets)
            ? heroCatalogs.filter(c => selectedPresets.includes(c.id))
            : heroCatalogs
    ).filter(c => isCatalogConformant(c, typeSelectors));

    const catalogs = [
        { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
        { id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
        { id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search', extra: searchExtra },
        { id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search', extra: searchExtra },
        { id: 'yaca_watchlist_movies', type: 'movie', name: '🎬 I Film della tua Watchlist', extra: [{ name: 'skip' }] },
        { id: 'yaca_watchlist_series', type: 'series', name: '📺 Le Serie della tua Watchlist', extra: [{ name: 'skip' }] },
        { id: 'yaca_watchlist_anime', type: 'anime', name: '🎌 Gli Anime della tua Watchlist', extra: [{ name: 'skip' }] },
        ...activeHeroCatalogs
    ];

    // Tracciamo gli ID già presenti per deduplicare cataloghi custom e di profilo
    // (escludendo yaca_search_standard e yaca_search_ai che compaiono 2 volte per movie e series)
    const seenCatalogIds = new Set(
        catalogs
            .map(c => c.id)
            .filter(id => id !== 'yaca_search_standard' && id !== 'yaca_search_ai')
    );

    // Add User Presets
    if (profile && profile.catalogs && Array.isArray(profile.catalogs)) {
        profile.catalogs.forEach(p => {
            if (p.isActive !== false && p.id && !seenCatalogIds.has(p.id)) {
                if (isCatalogConformant(p, typeSelectors)) {
                    seenCatalogIds.add(p.id);
                    catalogs.push({
                        id: p.id,
                        type: resolveCatalogType(p),
                        name: p.name,
                        extra: getCatalogExtra(p)
                    });
                }
            }
        });
    }

    // Add Custom Catalogs (e.g. Matchmaker, custom lists)
    if (userConfig.customCatalogs && Array.isArray(userConfig.customCatalogs)) {
        userConfig.customCatalogs.forEach(c => {
            if (c.isActive !== false && c.id && !seenCatalogIds.has(c.id)) {
                if (isCatalogConformant(c, typeSelectors)) {
                    seenCatalogIds.add(c.id);
                    catalogs.push({
                        id: c.id,
                        type: resolveCatalogType(c),
                        name: c.name,
                        extra: getCatalogExtra(c)
                    });
                }
            }
        });
    }

    const configHandle = userHandle || userConfig.userHandle || userConfig.addonUuid || 'unknown';
    return {
        id: 'org.stremio.yaca.catalog',
        version: dynamicVersion,
        name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
        description: 'Catalogo Intelligente Potenziato da AI',
        logo: `${hostUrl}/fiamma_yaca.png`,
        resources: [
            'catalog',
            'meta',
            { name: 'stream', types: ['movie', 'series', 'anime', 'other'], idPrefixes: ['tt', 'tmdb:', 'kitsu:'] }
        ],
        types: ['movie', 'series', 'anime', 'other'],
        catalogs: catalogs,
        idPrefixes: ['tt', 'tmdb:', 'kitsu:'],
        behaviorHints: {
            configurable: true,
            configurationRequired: false
        },
        contactEmail: 'yaca.addon@proton.me',
        configurationURL: `${hostUrl}/${configHandle}/configure`
    };
}

// Manifest di Stremio (Dinamico)
router.get(['/:userHandle/manifest.json', '/:userHandle/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(400).json({ error: "Configurazione non valida" });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    try {
        const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
        const manifest = buildManifest(userConfig, hostUrl, req.params.userHandle);
        return res.json(manifest);
    } catch (err) {
        console.error("Manifest Error:", err);
        return res.status(500).json({ error: "Errore caricamento manifest" });
    }
});

// (Moved to top)

// CatalogHandler
router.get([
    '/:userHandle/catalog/:type/:id.json',
    '/:userHandle/catalog/:type/:id/:extra.json',
    '/:userHandle/:configVersion/catalog/:type/:id.json',
    '/:userHandle/:configVersion/catalog/:type/:id/:extra.json'
], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(200).json({ metas: [] });
    }
    const { type, id, extra: extraStr } = req.params;
    let extra = parseExtra(extraStr);

    if (req.query) {
        extra = { ...extra, ...req.query };
    }

    if (extra.skip) extra.skip = parseInt(extra.skip, 10) || 0;
    else extra.skip = 0;

    const sortBy = extra.sortBy || extra.genre || null;
    if (sortBy) {
        extra.sortBy = getSortByValue(sortBy, type);
    }

    const args = { type, id, extra };
    const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;

    try {
        const response = await catalogHandler(args, userConfig, hostUrl);
        res.setHeader('Cache-Control', 'max-age=60, public');
        res.json(response);
    } catch (err) {
        console.error("Errore Catalog Endpoint:", err.message);
        res.json({ metas: [] });
    }
});

// MetaHandler
router.get(['/:userHandle/meta/:type/:id.json', '/:userHandle/:configVersion/meta/:type/:id.json'], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(200).json({ meta: null });
    }
    const { type, id } = req.params;
    const args = { type, id };

    try {
        const response = await metaHandler(args, userConfig);
        
        if (response && response.meta) {
            const { sanitizeCatalogMeta } = require('../catalog/formatters/StremioFormatter');
            const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
            
            // Apply ERDB styling to meta response
            response.meta = sanitizeCatalogMeta(response.meta, {
                shouldApplyEpisodeBadge: false, // Do not badge the poster in detail view
                isLandscapeEnabled: false, // Poster remains portrait
                userConfig,
                hostUrl,
                isMetaDetail: true,
                // SOLO per il poster: i file in cache dei titoli doppiati hanno il suffisso `_ITA`
                // e senza questo la scheda li cercerebbe senza suffisso, non li troverebbe e
                // resterebbe sul poster di TMDB. Non imposta alcun badge: sulla scheda non
                // compare niente di nuovo, cambia solo il poster. Stessa lettura dei cataloghi.
                itaCacheBadge: await isMetaDubbed(response.meta, type)
            });
        }

        res.setHeader('Cache-Control', type === 'series' ? 'max-age=1800, public' : 'max-age=86400, public');
        res.json(response);
    } catch (err) {
        console.error("Errore Meta Endpoint:", err.message);
        res.json({ meta: null });
    }
});

// StreamHandler
router.get(['/:userHandle/stream/:type/:id.json', '/:userHandle/:configVersion/stream/:type/:id.json'], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(200).json({ streams: [] });
    }
    const { type, id } = req.params;
    const args = { type, id };

    try {
        const response = await streamHandler(args, userConfig);
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.json(response);
    } catch (err) {
        console.error("Errore Stream Endpoint:", err.message);
        res.json({ streams: [] });
    }
});

// Sync Status Polling endpoint (Phase 0.4: Dumb Frontend Pattern)
// Frontend polls this every 3-5 seconds while syncStatus.isSyncing is true.
// Requires JWT authentication to prevent unauthorized access to user sync data.
// Uses unidirectional join: UserAccount.addonUuid → AddonConfig.uuid (no userId in AddonConfig).
router.get('/sync-status/:userId', syncStatusLimiter, async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
        // Unidirectional join: find the user's addonUuid, then query AddonConfig by uuid
        const account = await UserAccount.findOne({ userId }).lean();
        if (!account?.addonUuid) {
            return res.json({ isSyncing: false, total: 0, current: 0, lastSync: null });
        }
        const config = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
        if (!config) {
            return res.json({ isSyncing: false, total: 0, current: 0, lastSync: null });
        }
        return res.json(config.syncStatus || { isSyncing: false, total: 0, current: 0, lastSync: null });
    } catch (err) {
        console.error('[SyncStatus] Error:', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// Configure Redirect: When Stremio opens the configure gear icon, redirect to Frontend Login.
// This ensures no UUID context is leaked — the user must authenticate via JWT.
// FRONTEND_URL is a server-side env variable, not user-controlled input.
router.get('/:userHandle/configure', (_req, res) => {
    const frontendUrl = process.env.FRONTEND_URL;
    // Validate FRONTEND_URL is a well-formed URL or relative path before redirecting.
    if (frontendUrl) {
        if (frontendUrl.startsWith('/')) {
            return res.redirect(302, frontendUrl);
        }
        try {
            const parsed = new URL(frontendUrl);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                return res.redirect(302, parsed.href);
            }
        } catch (_e) { /* malformed URL — fall through to default */ }
    }
    res.redirect(302, '/');
});

// Rotta legacy `/images/poster/…`: trampolino 302 verso la rotta statica `/erdb-poster/…`.
// Serve a spegnere la composizione nel processo (sharp) senza rompere i client che hanno
// già in cache gli URL vecchi: vengono reindirizzati verso la rotta statica che serve il file
// o lo rende al volo tramite ERDB on-miss.
router.get(['/images/poster/:type/:id/:episode/:cacheBuster', '/images/poster/:type/:id/:episode'], async (req, res) => {
    const { type, id, episode } = req.params;
    const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
    const source = req.query.original || req.query.fallback || null;
    const destinazione = urlPosterDaRottaLegacy(hostUrl, {
        type,
        id,
        episode,
        tlBadge: req.query.tlBadge,
        source
    });

    // Id non riconoscibile: un 404 esplicito, mai un file inventato.
    if (!destinazione) return res.status(404).send('Poster non disponibile');

    // 302 e non 301: se un domani la forma dell'URL cambia, i client non se la ricordano.
    return res.redirect(302, destinazione);
});

// Cache dell'esistenza dei poster ERDB: su Redis (sopravvive ai riavvii) con TTL lungo per
// gli "esiste" e corto per i "non c'è", così un 404 non costa 8 secondi di timeout a ogni render.
const ERDB_POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const ERDB_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

// PNG trasparente 1x1: risposta "onesta" quando non abbiamo né il poster ERDB né il
// fallback TMDB. Stremio lo mostra come immagine vuota e, con un TTL corto, torna a
// chiedere tra pochi minuti invece di congelare il buco a video.
const TRANSPARENT_PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
    'base64'
);
const FALLBACK_PLACEHOLDER_MAX_AGE_S = 300;

function sendPlaceholderImage(res) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', `public, max-age=${FALLBACK_PLACEHOLDER_MAX_AGE_S}`);
    return res.send(TRANSPARENT_PNG_1X1);
}

// Se il fallback manca comunque non dobbiamo reindirizzare a un URL vuoto: meglio
// l'immagine segnaposto. Quando `fallback` c'è il comportamento è identico a prima.
function redirectToFallbackOrPlaceholder(res, fallback) {
    if (fallback) {
        return res.redirect(302, fallback);
    }
    return sendPlaceholderImage(res);
}

const erdbHeadCache = new CacheManager('erdb_head', {
    ramMax: 2000,
    ramTtlMs: ERDB_POSITIVE_TTL_MS,
    redisTtlMs: ERDB_POSITIVE_TTL_MS
});

// Fallback route for ERDB posters that might 404 (e.g. unmapped Kitsu items)
router.get('/images/fallback', async (req, res) => {
    const { url, fallback } = req.query;

    // Questa rotta non deve MAI rispondere 4xx/5xx: il client Stremio mette in cache
    // l'errore e il buco a video resta nero per sempre (172 titoli su 117.006 non si
    // riparavano più). Se manca `url` ma c'è `fallback`, si reindirizza al fallback
    // come quando `url` esiste; se mancano entrambi, si manda un'immagine valida.
    if (!url) {
        if (fallback) {
            return res.redirect(302, fallback);
        }
        return sendPlaceholderImage(res);
    }

    const cached = await erdbHeadCache.get(url).catch(() => null);
    if (cached && typeof cached.ok === 'boolean') {
        return cached.ok ? res.redirect(302, url) : redirectToFallbackOrPlaceholder(res, fallback);
    }

    try {
        // Fast HEAD request to check if the primary URL exists
        await axios.head(url, { timeout: 8000 });
        await erdbHeadCache.set(url, { ok: true }, ERDB_POSITIVE_TTL_MS).catch(() => {});
        res.redirect(302, url);
    } catch (err) {
        // Non esiste (404) o timeout: memorizzato in negativo, così non si ritenta a ogni render
        await erdbHeadCache.set(url, { ok: false }, ERDB_NEGATIVE_TTL_MS).catch(() => {});
        console.warn(`[Fallback] ERDB URL failed: ${url} (${err.message}). Using TMDB fallback...`);
        redirectToFallbackOrPlaceholder(res, fallback);
    }
});

router.getSortByValue = getSortByValue;
router.presetExtra = presetExtra;
router.defaultExtra = defaultExtra;
router.getCatalogExtra = getCatalogExtra;
router.SORT_OPTIONS = SORT_OPTIONS;
router.SORT_MAP = SORT_MAP;
router.resolveCatalogType = resolveCatalogType;
router.buildManifest = buildManifest;

module.exports = router;

// Il builder del manifest è riusato da `src/utils/stremioAddon.js` per aggiornare la collezione
// Stremio SENZA scaricare il manifest dalla URL pubblica: dentro il container l'hostname pubblico
// (es. mate.taild24589.ts.net) non è risolvibile, quindi quel fetch falliva e il resync non
// aggiornava mai la URL installata in Stremio.
module.exports.buildManifest = buildManifest;
