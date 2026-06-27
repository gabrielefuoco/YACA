require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const configureRoute = require('./src/api/configure/index');
const UserConfig = require('./src/models/UserConfig');
const { getPresets, profileTemplates } = require('./src/data/presets');
const connectDB = require('./src/db/connection');
const { generateMergedName } = require('./src/api/mergeRoutes');
const { loginHandler, meHandler, logoutHandler } = require('./src/api/auth/index.js');
const { inputSanitizer } = require('./src/middleware/inputSanitizer');
const { attachRequestContext } = require('./src/middleware/requestContext');
const errorMiddleware = require('./src/middleware/errorMiddleware');

const stremioRoutes = require('./src/api/stremio');
const tmdbRoutes = require('./src/api/tmdb');
const adminRoutes = require('./src/api/admin');
const catalogRoutes = require('./src/api/catalog');
// Connessione MongoDB
connectDB();

// 1. Inizializza Express
const app = express();
app.set('trust proxy', 1);


const PORT = process.env.PORT || 7000;


// CORS configurabile tramite variabile d'ambiente (default: permissivo per retrocompatibilità con Stremio)
const corsOptions = { origin: '*', credentials: true, methods: ['GET', 'POST'] };

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(attachRequestContext);

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

// Cron endpoint for background cache warming
const { runCacheWarmer } = require('./src/utils/cacheWarmer');
app.get('/api/cron/warmup', (req, res) => {
    // Risponde immediatamente a Uptime Robot per non far scadere il timeout
    res.json({ status: 'ok', message: 'Warmup scheduled' });
    
    // Costruisce l'hostUrl base per il catalogHandler
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    
    // Lancia in background
    runCacheWarmer(hostUrl).catch(err => console.error('[CacheWarmer] Error:', err.message));
});

// Rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 20,                 // max 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi. Riprova tra qualche minuto.' }
});

// --- AUTH ROUTES ---
app.post('/api/auth/login', cookieParser(), authLimiter, loginHandler);
app.get('/api/auth/me', cookieParser(), meHandler);
app.post('/api/auth/logout', cookieParser(), logoutHandler);



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
        res.json({
            ...user,
            hasGlobalErdb: !!process.env.ERDB_CONFIG
        });
    } catch (err) {
        console.error("Errore fetch utente:", err);
        res.status(500).json({ error: "Errore interno" });
    }
});

app.get('/api/presets', (req, res) => {
    res.json({
        presets: getPresets(),
        profileTemplates,
        hasGlobalErdb: !!process.env.ERDB_CONFIG
    });
});

app.get('/test-cf', async (req, res) => {
    const { exec } = require('child_process');
    const url = req.query.url || process.env.CF_WORKER_URL || 'https://yaca-proxy-worker.gabriele-fuoco99.workers.dev';
    exec(`curl -v -I -s "${url}" 2>&1`, (error, stdout, stderr) => {
        res.type('text/plain').send(`URL: ${url}\n\nSTDOUT/STDERR:\n${stdout}\n${stderr}\n\nERROR:\n${error ? error.message : 'none'}`);
    });
});









// 2. Registra endpoint configuration (Frontend Web)
const configureLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.post('/api/configure', cookieParser(), configureLimiter, configureRoute);
app.post('/api/ai/generate-merged-name', cookieParser(), generateMergedName);

// Unified Profiles API (DNA, Sync Status)
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
    
    // Fallback locale in caso non sia configurato nell'env
    const hostUrl = process.env.HOST_URL || `http://localhost:${PORT}`;
    
    // Background queue processor: runs every 30 seconds
    const { processPendingScans } = require('./src/utils/queueProcessor');
    setInterval(() => {
        processPendingScans(hostUrl).catch(err => {
            console.error('[BackgroundQueue] Error in periodic sweep:', err.message);
        });
    }, 30000);

    if (!process.env.HOST_URL && !process.env.RENDER_EXTERNAL_URL) {
        console.warn('⚠️ HOST_URL non configurato nel file .env. Verranno usati gli header proxy (X-Forwarded-Host/X-Forwarded-Proto) quando disponibili.');
    }
});

// Auto-deploy Cloudflare Worker (se configurato)
const { deployCloudflareWorker } = require('./src/utils/cloudflareDeployer');
if (!process.env.CF_WORKER_URL && process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    deployCloudflareWorker().then(url => {
        if (url) {
            process.env.CF_WORKER_URL = url;
            console.log(`[Init] CF_WORKER_URL impostato dinamicamente su: ${url}`);
        } else {
            console.warn('[Init] ⚠️ CF Worker non disponibile. Le richieste Anilist e stream andranno dirette.');
        }
    });
} else if (process.env.CF_WORKER_URL) {
    console.log(`[Init] CF_WORKER_URL già configurato: ${process.env.CF_WORKER_URL}`);
}

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
