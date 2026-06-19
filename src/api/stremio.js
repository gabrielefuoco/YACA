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
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const TextToSVG = require('text-to-svg');

let textToSVG = null;
// Try bundled Noto Sans first, then text-to-svg's built-in default font (ipag.ttf)
try {
    const fontPath = path.join(__dirname, '../assets/fonts/noto-sans.ttf');
    textToSVG = TextToSVG.loadSync(fontPath);
    console.log('[Badge] Font loaded: noto-sans.ttf from', fontPath);
} catch (e1) {
    console.warn('[Badge] Could not load noto-sans.ttf:', e1.message);
    try {
        textToSVG = TextToSVG.loadSync(); // uses built-in ipag.ttf from text-to-svg package
        console.log('[Badge] Font loaded: text-to-svg default (ipag.ttf)');
    } catch (e2) {
        console.error('[Badge] CRITICAL: No font available for badge rendering:', e2.message);
    }
}
if (textToSVG) {
    // Verify the font actually works
    try {
        const testPath = textToSVG.getPath('Test', { fontSize: 24, attributes: { fill: 'white' } });
        console.log('[Badge] Font verification OK, test path length:', testPath.length);
    } catch (ev) {
        console.error('[Badge] Font verification FAILED:', ev.message);
        textToSVG = null;
    }
}

const badgeCache = new CacheManager('poster_badges', {
    ramMax: 1000,
    ramTtlMs: 1000 * 60 * 60 * 24, // 24 hours in RAM
    mongoTtlMs: 1000 * 60 * 60 * 24 * 7, // 7 days in MongoDB
    swrMs: 0
});
const { catalogHandler } = require('../handlers/catalogHandler');
const { metaHandler } = require('../handlers/metaHandler');
const { streamHandler } = require('../handlers/streamHandler');
const { parseExtra } = require('../utils/helpers');

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

// Manifest di Stremio (Dinamico)
router.get(['/:userHandle/manifest.json', '/:userHandle/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = await UserConfig.resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(400).json({ error: "Configurazione non valida" });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    try {
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

        // Filter: only show hero catalogs if they are enabled in the active profile's selectedPresets.
        // If selectedPresets is not configured yet, show all of them.
        const activeHeroCatalogs = Array.isArray(selectedPresets)
            ? heroCatalogs.filter(c => selectedPresets.includes(c.id))
            : heroCatalogs;

        const catalogs = [
            { id: 'yaca-profiles', type: 'other', name: '👥 Cambia Profilo' },
            { id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search', extra: searchExtra },
            { id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search', extra: searchExtra },
            ...activeHeroCatalogs
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

        const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
        const manifest = {
            id: 'org.stremio.yaca.catalog',
            version: dynamicVersion,
            name: 'YACA 🇮🇹 (Yet Another Catalog Addon)',
            description: 'Catalogo Intelligente Potenziato da AI',
            logo: `${hostUrl}/fiamma_yaca.png`,
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
    const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;

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
            const hostUrl = req.context?.hostUrl || `${req.protocol}://${req.get('host')}`;
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

// Dynamic image overlay route for episode badges
router.get('/images/poster/:type/:id/:episode', async (req, res) => {
    const { type, id, episode } = req.params;
    const originalUrl = req.query.original;

    if (!originalUrl) {
        return res.status(400).send('Original image URL is required');
    }

    // Security check: validate the original image URL host
    try {
        const parsedUrl = new URL(originalUrl);
        const allowedHosts = [
            'image.tmdb.org',
            'easyratingsdb.com',
            'media.kitsu.io'
        ];
        const isAllowed = allowedHosts.some(host => 
            parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host)
        );

        if (!isAllowed) {
            console.warn(`[BadgeCache] Rejected unauthorized domain: ${parsedUrl.hostname}`);
            return res.status(403).send('Unauthorized image domain');
        }
    } catch (e) {
        return res.status(400).send('Invalid original image URL');
    }

    const cacheKey = `${id}_${episode}_v11`;
    console.log(`[Badge] Request: id=${id}, episode="${episode}", textToSVG=${!!textToSVG}`);

    // Helper to perform the download and composition
    const generateBadgeImage = async (url, badgeText) => {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const baseImageBuffer = Buffer.from(response.data);

        // Get original dimensions
        const imgMeta = await sharp(baseImageBuffer).metadata();
        const W = imgMeta.width || 342;
        const H = imgMeta.height || 513;

        const textLen = badgeText.length;
        const fontSize = 24;
        const badgeWidth = Math.max(110, textLen * 14 + 36);
        const badgeHeight = 44;
        const rx = Math.round(badgeHeight / 2);

        let svgContent = '';
        if (textToSVG) {
            const metrics = textToSVG.getMetrics(badgeText, { fontSize });
            const textWidth = metrics.width;
            const x = (badgeWidth - textWidth) / 2;
            const y = (badgeHeight / 2) + (metrics.ascender / 2) - 2;
            const svgPath = textToSVG.getPath(badgeText, {
                x: x,
                y: y,
                fontSize: fontSize,
                attributes: { fill: '#ffffff', 'font-weight': 'bold' } // noto-sans doesn't have bold variant loaded, but we can try to pass attribute or just rely on its regular weight
            });
            svgContent = svgPath;
        } else {
            const xmlEscapedBadgeText = badgeText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            svgContent = `<text x="${badgeWidth / 2}" y="${badgeHeight / 2}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${xmlEscapedBadgeText}</text>`;
        }

        // Render directly via single SVG
        const svg = `<svg width="${badgeWidth}" height="${badgeHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="${rx}" fill="#0f172a"/>
            <rect x="2" y="2" width="${badgeWidth - 4}" height="${badgeHeight - 4}" rx="${rx - 2}" fill="none" stroke="#f59e0b" stroke-width="3"/>
            ${svgContent}
        </svg>`;

        // Composite badge onto poster at top-right
        const offset = 12;
        const badgeLeft = Math.max(0, W - badgeWidth - offset);
        const badgeTop = offset;

        return await sharp(baseImageBuffer)
            .composite([{
                input: Buffer.from(svg),
                top: badgeTop,
                left: badgeLeft
            }])
            .jpeg({ quality: 90 })
            .toBuffer();
    };

    try {
        // Retrieve from Cache (checks L1 RAM first, then L2 MongoDB)
        const cachedBase64 = await badgeCache.get(cacheKey);
        if (cachedBase64) {
            const buffer = Buffer.from(cachedBase64, 'base64');
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours client cache
            return res.send(buffer);
        }

        // Cache miss: generate composite image
        const processedBuffer = await generateBadgeImage(originalUrl, episode);

        // Save to cache (persists to RAM and MongoDB)
        await badgeCache.set(cacheKey, processedBuffer.toString('base64'));

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(processedBuffer);
    } catch (err) {
        console.error(`[BadgeCache] Error generating badge for ${id}:`, err.message);

        // Fail-safe: redirect to original URL or fallback
        const fallbackUrl = req.query.fallback || originalUrl;
        res.redirect(302, fallbackUrl);

        // Asynchronously retry generation in the background so it's ready next time
        setTimeout(async () => {
            try {
                console.log(`[BadgeCache] Background retry generating badge for ${id}...`);
                const retryBuffer = await generateBadgeImage(originalUrl, episode);
                await badgeCache.set(cacheKey, retryBuffer.toString('base64'));
                console.log(`[BadgeCache] Background retry success for ${id}!`);
            } catch (retryErr) {
                console.error(`[BadgeCache] Background retry failed for ${id}:`, retryErr.message);
            }
        }, 5000);
    }
});

// Simple in-memory cache for HEAD requests to avoid spamming ERDB
const fallbackHeadCache = new Map();

// Fallback route for ERDB posters that might 404 (e.g. unmapped Kitsu items)
router.get('/images/fallback', async (req, res) => {
    const { url, fallback } = req.query;
    if (!url || !fallback) {
        return res.status(400).send('Missing url or fallback parameter');
    }

    if (fallbackHeadCache.has(url)) {
        const isOk = fallbackHeadCache.get(url);
        return res.redirect(302, isOk ? url : fallback);
    }

    try {
        // Fast HEAD request to check if the primary URL exists
        await axios.head(url, { timeout: 3000 });
        // It exists! Cache and redirect to the primary URL
        fallbackHeadCache.set(url, true);
        res.redirect(302, url);
    } catch (err) {
        // Doesn't exist (404) or timeout. Cache and redirect to fallback
        fallbackHeadCache.set(url, false);
        console.warn(`[Fallback] Primary image failed (${err.message}), using fallback: ${fallback}`);
        res.redirect(302, fallback);
    }
});

module.exports = router;
