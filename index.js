require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { createAxiosInstance } = require('./src/utils/httpClient');
const rateLimit = require('express-rate-limit');

const configureRoute = require('./src/api/configure');
const UserConfig = require('./src/models/UserConfig');
const { getPresets, profileTemplates } = require('./src/data/presets');
const { sanitizeString, isAllowedUrl, resolveHostUrl } = require('./src/utils/helpers');
const { getBlurredImageUrl, addBadgeToImage } = require('./src/utils/imageProcessor');
const { ALLOWED_IMAGE_HOSTS } = require('./src/config');
const connectDB = require('./src/db/connection');
const { generateMergedName } = require('./src/api/mergeRoutes');
const { getProfileAnalytics } = require('./src/api/analytics');
const { disconnectRedis } = require('./src/cache/redisClient');
const { preWarmRedisFromMongo } = require('./src/cache/preWarm');
const { loginHandler, meHandler, logoutHandler } = require('./src/api/auth/index.js');
const { requireAuth } = require('./src/middleware/requireAuth');
const { csrfProtection } = require('./src/middleware/csrfProtection');
const { inputSanitizer } = require('./src/middleware/inputSanitizer');
const errorMiddleware = require('./src/middleware/errorMiddleware');

const stremioRoutes = require('./src/api/stremio');
const tmdbRoutes = require('./src/api/tmdb');
const adminRoutes = require('./src/api/admin');
const catalogRoutes = require('./src/api/catalog');

// Connessione MongoDB
connectDB().then(() => {
    // Pre-warm Redis from MongoDB after DB connection is established
    preWarmRedisFromMongo().catch(err => console.error('[Boot] PreWarm error:', err.message));
});

// 1. Inizializza Express
const app = express();
app.set('trust proxy', 1);


const PORT = process.env.PORT || 7000;

const BADGE_CACHE_TTL_SECS = 14 * 24 * 60 * 60; // 1209600
const badgeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
});

// CORS configurabile tramite variabile d'ambiente (default: permissivo per retrocompatibilità con Stremio)
const corsOptions = { origin: '*', credentials: true, methods: ['GET', 'POST'] };
const resolveUserConfig = (userId) => UserConfig.resolveUserConfig(userId);

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// 1. ASSET FAIL-SAFE (Direct routes for critical branding)
app.get(['/fiamma_yaca.png', '/logo_yaca.png'], (req, res) => {
    const fileName = req.path.split('/').pop();
    const filePath = path.join(__dirname, 'public', fileName);
    
    console.log(`[Asset Request] ${req.path} -> checking ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error(`[Asset Error] File not found: ${filePath}`);
        // Fallback check in current dir or frontend/out
        const altPath = path.join(__dirname, fileName);
        if (fs.existsSync(altPath)) {
            console.log(`[Asset Found] Found in root: ${altPath}`);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'image/png');
            return res.sendFile(altPath);
        }
        return res.status(404).json({ error: 'Asset not found', path: filePath });
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Origin');
    res.sendFile(filePath);
});

// Diagnostic route for the user
app.get('/debug-assets', (req, res) => {
    const pubDir = path.join(__dirname, 'public');
    const publicFiles = fs.existsSync(pubDir) ? fs.readdirSync(pubDir) : [];
    const rootFiles = fs.readdirSync(__dirname);
    
    console.log(`[Debug Assets] __dirname: ${__dirname}`);
    console.log(`[Debug Assets] Public folder exists: ${fs.existsSync(pubDir)}`);
    console.log(`[Debug Assets] Public files: ${publicFiles.join(', ')}`);
    console.log(`[Debug Assets] Root files: ${rootFiles.filter(f => !f.startsWith('.')).join(', ')}`);
    
    res.json({
        cwd: process.cwd(),
        dirname: __dirname,
        publicFiles,
        rootFiles: rootFiles.filter(f => !f.startsWith('.')),
        env: {
            SPACE_HOST: process.env.SPACE_HOST,
            NODE_ENV: process.env.NODE_ENV
        }
    });
});

// 2. STATIC ASSETS (Actual files from public/ or frontend/out/)
const staticOptions = {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
};
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(path.join(__dirname, 'frontend', 'out'), staticOptions));

// 3. STREMIO ADDON ROUTES
app.use('/', stremioRoutes);

// Health check endpoint per monitoring e deployment platforms
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.4',
        uptime: Math.floor(process.uptime())
    });
});

// Rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 20,                 // max 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi. Riprova tra qualche minuto.' }
});

// --- AUTH ROUTES (JWT HttpOnly Cookie) ---
app.post('/api/auth/login', cookieParser(), authLimiter, csrfProtection, loginHandler);
// app.post('/api/auth/guest', cookieParser(), authLimiter, csrfProtection, guestHandler);
app.get('/api/auth/me', cookieParser(), authLimiter, meHandler);
app.post('/api/auth/logout', cookieParser(), csrfProtection, logoutHandler);



// --- CONFIG & UTILITY ROUTES ---
app.use('/api', tmdbRoutes);
app.use('/api', adminRoutes);
app.use('/api', catalogRoutes);

app.get('/api/user/:userId', inputSanitizer, async (req, res) => {
    try {
        const user = await UserConfig.resolveUserConfig(req.params.userId);
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



// Endpoint per la sfocatura immagini: redirect a wsrv.nl (proxy esterno gratuito)
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
// Zero bandwidth: genera l'URL CDN ImageKit e fa redirect 302.
// Il client (Smart TV, browser) scarica l'immagine direttamente dai server CDN globali di ImageKit.
app.get('/badge/poster.jpg', badgeLimiter, async (req, res) => {
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

    // addBadgeToImage now returns a CDN URL (string) instead of downloading the image
    const badgeUrl = addBadgeToImage(url, safeText);
    if (badgeUrl) {
        res.set('Cache-Control', `public, max-age=${BADGE_CACHE_TTL_SECS}`);
        return res.redirect(302, badgeUrl);
    } else {
        // ImageKit not configured — redirect to the original poster URL
        return res.redirect(301, url);
    }
});





// 2. Registra endpoint configuration (Frontend Web)
const configureLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.post('/api/configure', cookieParser(), configureLimiter, csrfProtection, requireAuth, configureRoute);
app.post('/api/ai/generate-merged-name', generateMergedName);

// 2.1 Sync & Profile Endpoints
const syncLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
app.get('/api/sync/global-queue', syncLimiter, require('./src/api/sync/global-queue'));
app.post('/api/sync/enrich', syncLimiter, inputSanitizer, require('./src/api/sync/enrich'));

// Unified Profiles API (DNA, Analytics, Sync Status)
const profileRoutes = require('./src/api/profiles');
const profileLimiter = rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/profiles', profileLimiter, inputSanitizer, profileRoutes);

// Catch-all route per gestire il routing lato client di Next.js
// Catch-all route per gestire il routing lato client di Next.js (Solo per richieste che sembrano pagine)
app.get(/^(?!\/api|\/manifest\.json|.*\.(png|jpg|jpeg|gif|svg|ico|js|css|json|mp4|webm)).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'out', 'index.html'));
});

// Centralized error handler (must be last)
app.use(errorMiddleware);

// Avvia il server
const server = app.listen(PORT, () => {
    console.log(`🚀 YACA Server in esecuzione su http://localhost:${PORT}`);
    if (!process.env.HOST_URL && !process.env.RENDER_EXTERNAL_URL) {
        console.warn('⚠️ HOST_URL non configurato nel file .env. Verranno usati gli header proxy (X-Forwarded-Host/X-Forwarded-Proto) quando disponibili.');
    }
});

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n${signal} ricevuto. Spegnimento in corso...`);
    server.close(async () => {
        console.log('Server chiuso correttamente.');
        try {
            await disconnectRedis();
            const mongoose = require('mongoose');
            await mongoose.disconnect();
            console.log('MongoDB disconnesso.');
        } catch (err) {
            console.error('Errore durante la disconnessione:', err.message);
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
