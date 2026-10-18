const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    stremioClient,
    updateStremioAddonCollection,
    buildManifest,
    buildRootManifest,
    resolveCatalogType,
    getCatalogExtra,
    defaultExtra,
    presetExtra,
    searchExtra,
    getSortByValue,
    SORT_OPTIONS,
    SORT_MAP
} = require('../stremio');
const { traktClient } = require('../clients/trakt');
const getUserConfig = () => require('../models/UserConfig');
const AddonConfig = require('../models/AddonConfig');
const { accountDi, trovaAccountPerEmailOAuthKey } = require('../configurazione');
const CacheManager = require('../cache/CacheManager');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const { urlPosterDaRottaLegacy } = require('../stremio/formatters/StremioFormatter');
const { catalogHandler } = require('../stremio');
const { metaHandler, isMetaDubbed } = require('../meta');
const { parseExtra } = require('../infra/helpers');
const { getPresets } = require('../catalog/presets');
const { isCatalogConformant } = require('../catalog/catalogKind');

// Rate limiter for sync-status polling (max 30 requests per minute per IP)
const syncStatusLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const cookieParser = require('cookie-parser');
const { utenteDallaSessione } = require('../middleware/sessione');



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
        const existingAccount = await trovaAccountPerEmailOAuthKey({ email, stremioAuthKey: authKey });

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
    const manifest = buildRootManifest(hostUrl);
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
});

// Manifest di Stremio (Dinamico)
router.get(['/:userHandle/manifest.json', '/:userHandle/:configVersion/manifest.json'], async (req, res) => {
    const userConfig = await getUserConfig().resolveUserConfig(req.params.userHandle);
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
    const userConfig = await getUserConfig().resolveUserConfig(req.params.userHandle);
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
        const { contestoDi } = require('../profile');
        userConfig.context = await contestoDi({
            userId: userConfig.userId,
            profileId: userConfig.activeProfileId,
            addonUuid: userConfig.addonUuid,
            user: userConfig
        });
        userConfig.activeProfileId = userConfig.context.profileId;
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
    const userConfig = await getUserConfig().resolveUserConfig(req.params.userHandle);
    if (!userConfig) {
        return res.status(200).json({ meta: null });
    }
    const { type, id } = req.params;
    const args = { type, id };

    try {
        const response = await metaHandler(args, userConfig);
        
        if (response && response.meta) {
            const { sanitizeCatalogMeta } = require('../stremio/formatters/StremioFormatter');
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

// Stream endpoint — compatibility fallback for cached Stremio manifests
router.get(['/:userHandle/stream/:type/:id.json', '/:userHandle/:configVersion/stream/:type/:id.json'], (req, res) => {
    res.json({ streams: [] });
});

// Sync Status Polling endpoint (Phase 0.4: Dumb Frontend Pattern)
// Frontend polls this every 3-5 seconds while syncStatus.isSyncing is true.
// Requires JWT authentication to prevent unauthorized access to user sync data.
// Uses unidirectional join: UserAccount.addonUuid → AddonConfig.uuid (no userId in AddonConfig).
router.get('/sync-status/:userId', cookieParser(), syncStatusLimiter, async (req, res) => {
    const sessionUserId = utenteDallaSessione(req);
    if (!sessionUserId) {
        return res.status(401).json({
            error: {
                code: 'non_autenticato',
                message: 'Sessione assente o scaduta.'
            }
        });
    }

    // Previene IDOR: ignora req.params.userId e usa l'utente autenticato nella sessione
    const userId = sessionUserId;
    try {
        // Unidirectional join: find the user's addonUuid, then query AddonConfig by uuid
        const account = await accountDi(userId);
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
        return res.status(500).json({ error: { code: 'non_disponibile', message: 'Errore interno.' } });
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

// Il builder del manifest è riusato dal modulo stremio per aggiornare la collezione
// Stremio SENZA scaricare il manifest dalla URL pubblica: dentro il container l'hostname pubblico
// (es. mate.taild24589.ts.net) non è risolvibile, quindi quel fetch falliva e il resync non
// aggiornava mai la URL installata in Stremio.
module.exports.buildManifest = buildManifest;
