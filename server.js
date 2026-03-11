/**
 * YACA Custom Server: Express API + Next.js (con NextAuth.js)
 *
 * Architettura:
 *   - Express gestisce TUTTE le rotte API (/api/*) tranne /api/auth/*
 *   - Next.js gestisce le rotte di autenticazione (/api/auth/*) via NextAuth
 *   - Next.js gestisce il rendering delle pagine frontend
 *   - Singolo processo, singola porta
 */

require('dotenv').config();
const path = require('path');
const next = require('next');
const connectDB = require('./src/db/connection');
const { disconnectRedis } = require('./src/cache/redisClient');

const dev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 7000;

const nextApp = next({
    dev,
    dir: path.join(__dirname, 'frontend'),
});
const nextHandle = nextApp.getRequestHandler();

async function main() {
    // 1. Connessione a MongoDB (necessaria sia per Express che per NextAuth)
    await connectDB();

    // 2. Prepara Next.js (compila le pagine e le rotte API auth)
    await nextApp.prepare();

    // 3. Importa l'app Express con tutte le rotte API già configurate
    const expressApp = require('./index');

    // 4. Delega tutto il resto a Next.js (pagine frontend + /api/auth/*)
    //    Next.js gestirà automaticamente i cookie di sessione JWT via NextAuth
    expressApp.all('/{*path}', (req, res) => {
        return nextHandle(req, res);
    });

    // 5. Avvia il server unificato
    const server = expressApp.listen(PORT, () => {
        console.log(`🚀 YACA Server (Express + Next.js) in esecuzione su http://localhost:${PORT}`);
        console.log(`   ├── API Express: /api/* (stateless, JWT-authenticated)`);
        console.log(`   ├── Auth NextAuth: /api/auth/* (JWT cookies HttpOnly)`);
        console.log(`   └── Frontend Next.js: tutto il resto`);
        if (!process.env.HOST_URL && !process.env.RENDER_EXTERNAL_URL) {
            console.warn('⚠️ HOST_URL non configurato nel file .env.');
        }
    });

    // 6. Graceful shutdown
    const shutdown = (signal) => {
        console.log(`\n${signal} ricevuto. Spegnimento in corso...`);
        server.close(async () => {
            console.log('Server chiuso correttamente.');
            try {
                await nextApp.close();
                await disconnectRedis();
                const mongoose = require('mongoose');
                await mongoose.disconnect();
                console.log('Tutte le connessioni chiuse.');
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
}

main().catch((err) => {
    console.error('Errore fatale durante l\'avvio del server:', err);
    process.exit(1);
});
