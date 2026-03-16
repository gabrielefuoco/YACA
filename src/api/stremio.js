const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { stremioClient } = require('../clients/stremio');
const { traktClient } = require('../clients/trakt');
const { updateStremioAddonCollection } = require('../utils/stremioAddonSync');
const UserConfig = require('../models/UserConfig');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const { requireAuth } = require('../middleware/requireAuth');
const { catalogHandler } = require('../handlers/catalogHandler');
const { metaHandler } = require('../handlers/metaHandler');
const { streamHandler } = require('../handlers/streamHandler');
const { resolveHostUrl, parseExtra } = require('../utils/helpers');

// Rate limiter for sync-status polling (max 30 requests per minute per IP)
const syncStatusLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

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
const searchExtra = [{ name: 'search', isRequired: true }];

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
        return res.status(500).json({ error: "Errore di connessione a Trakt." });
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
        return res.status(500).json({ error: "Errore recupero token Trakt." });
    }
});

// --- STREMIO ADDON ENDPOINTS ---

// Root manifest (senza config) - MOVED TO TOP to avoid shadowing by parameterized routes
router.get('/manifest.json', (req, res) => {
    const hostUrl = resolveHostUrl(req);
    const manifest = {
        id: 'org.stremio.yaca.catalog',
        version: '1.0.4',
        name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
        description: 'Catalogo Intelligente Potenziato da AI - Configurazione Richiesta',
        logo: `${hostUrl}/logo_yaca.png`,
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

// Manifest di Stremio (Dinamico)
router.get(['/:userHandle/manifest.json', '/:userHandle/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(400).json({ error: "Configurazione non valida" });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    try {
        const cv = userConfig.configVersion;
        const dynamicVersion = cv ? `1.0.2+${cv}` : '1.0.2';

        const activeProfileId = userConfig.activeProfileId || 'global';
        const profile = userConfig.profiles?.find(p => p.id === activeProfileId) || (userConfig.profiles?.[0]);

        const catalogs = [
            { id: 'yaca-profiles', type: 'other', name: '👥 Cambia Profilo' },
            { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search', extra: searchExtra },
            // Hero Catalogs (Personalized)
            { id: 'yaca_true_blend_movies', type: 'movie', name: '⭐ Scelti per Te', extra: [{ name: 'skip' }] },
            { id: 'yaca_true_blend_series', type: 'series', name: '⭐ Scelti per Te', extra: [{ name: 'skip' }] },
            { id: 'yaca_seed_network_movies', type: 'movie', name: '🕸️ La Rete dei tuoi Preferiti', extra: [{ name: 'skip' }] },
            { id: 'yaca_seed_network_series', type: 'series', name: '🕸️ La Rete dei tuoi Preferiti', extra: [{ name: 'skip' }] },
            { id: 'yaca_hidden_gems_movies', type: 'movie', name: '💎 Gemme Nascoste', extra: [{ name: 'skip' }] },
            { id: 'yaca_hidden_gems_series', type: 'series', name: '💎 Gemme Nascoste', extra: [{ name: 'skip' }] },
            { id: 'yaca_trakt_filtered_movies', type: 'movie', name: '🌐 Suggeriti dalla Community', extra: [{ name: 'skip' }] },
            { id: 'yaca_trakt_filtered_series', type: 'series', name: '🌐 Suggeriti dalla Community', extra: [{ name: 'skip' }] },
        ];

        // Add User Presets
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

        const hostUrl = resolveHostUrl(req);
        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: dynamicVersion,
            name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            logo: `${hostUrl}/logo_yaca.png`,
            resources: [
                'catalog',
                'meta',
                { name: 'stream', types: ['movie', 'series', 'other'], idPrefixes: ['yaca-profile-'] }
            ],
            types: ['movie', 'series', 'other'],
            catalogs: catalogs,
            idPrefixes: ['tt', 'tmdb:', 'kitsu:', 'yaca-profile-'],
            behaviorHints: {
                configurable: true,
                configurationRequired: false
            },
            contactEmail: 'yaca.addon@proton.me',
            configurationURL: `${hostUrl}/${req.params.userHandle}/configure`
        };

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
        return res.status(400).json({ metas: [] });
    }
    const { type, id, extra: extraStr } = req.params;
    let extra = parseExtra(extraStr);

    if (req.query) {
        extra = { ...extra, ...req.query };
    }

    if (extra.skip) extra.skip = parseInt(extra.skip, 10) || 0;
    else extra.skip = 0;

    if (extra.genre) {
        extra.sortBy = getSortByValue(extra.genre, type);
    }

    const args = { type, id, extra };
    const hostUrl = resolveHostUrl(req);

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

// StreamHandler
router.get(['/:userHandle/stream/:type/:id.json', '/:userHandle/:configVersion/stream/:type/:id.json'], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(400).json({ streams: [] });
    }
    const { type, id } = req.params;
    const configVersion = req.params.configVersion || '';
    const args = { type, id };
    const hostUrl = resolveHostUrl(req);

    try {
        const response = await streamHandler(args, userConfig, hostUrl, configVersion);
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
router.get('/sync-status/:userId', syncStatusLimiter, requireAuth, async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    // Ensure authenticated user can only access their own sync status
    if (req.user.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
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

// Switch Profile
router.get('/users/:userId/switch-profile/:profileId', async (req, res) => {
    const { userId, profileId } = req.params;

    try {
        const userConfig = await UserConfig.resolveUserConfig(userId);
        if (!userConfig) return res.status(404).send('User not found');

        const profileExists = userConfig.profiles && userConfig.profiles.some(p => p.id === profileId);
        if (!profileExists) return res.status(400).send('Profile not found');

        const newConfigVersion = Date.now().toString(36);
        await UserConfig.saveUser({
            userId,
            config: {
                activeProfileId: profileId,
                configVersion: newConfigVersion
            }
        });

        const stremioAuthKey = userConfig.apiKeys?.stremio;
        if (stremioAuthKey) {
            const hostUrl = resolveHostUrl(req);
            const manifestUrl = `${hostUrl}/${userId}/${newConfigVersion}/manifest.json`;
            updateStremioAddonCollection(stremioAuthKey, manifestUrl)
                .then(r => console.log(`[Profile Switch] Sync Stremio completato per utente ${userId}: ${r.success}`))
                .catch(e => console.error(`[Profile Switch] Errore sync Stremio utente ${userId}:`, e));
        }

        res.redirect('/assets/profile_updated.mp4');
    } catch (err) {
        console.error(`Errore switch profile per user ${userId}:`, err.message);
        res.status(500).send('Internal validation error');
    }
});

module.exports = router;
