#!/usr/bin/env node
/**
 * cli.js - Entrypoint CLI per il servizio standalone tmdb-daemon di YACA.
 *
 * Utilizzo:
 *   node cli.js              # Avvia il daemon orario persistente
 *   node cli.js --once       # Esegue un singolo giro batch (cold start o daily sync) ed esce
 *   node cli.js --status     # Mostra lo stato corrente letto dall'artefatto (dump_status.json)
 *   node cli.js --health-check # Exit 0 se il sync è recente e sano, exit 1 se stantio o in errore
 */
require('dotenv').config();
const { runTmdbDumpDaemon, stopDaemon } = require('./tmdbDumpDaemon');
const TmdbDumpStore = require('./tmdbDumpStore');

const args = process.argv.slice(2);
const once = args.includes('--once');
const status = args.includes('--status');
const healthCheck = args.includes('--health-check');

const store = new TmdbDumpStore();

if (status) {
    console.log(JSON.stringify(store.loadStatus(), null, 2));
    process.exit(0);
}

if (healthCheck) {
    const s = store.loadStatus();
    if (s.isStale || s.phase === 'error') {
        console.error(`[TmdbDaemon HealthCheck] UNHEALTHY: phase=${s.phase}, isStale=${s.isStale}, reason=${s.staleReason}`);
        process.exit(1);
    }
    console.log(`[TmdbDaemon HealthCheck] OK: phase=${s.phase}, lastSync=${s.lastSync}`);
    process.exit(0);
}

process.on('SIGTERM', () => {
    console.log('[TmdbDaemon Service] SIGTERM ricevuto. Arresto ordinato...');
    stopDaemon();
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('[TmdbDaemon Service] SIGINT ricevuto. Arresto ordinato...');
    stopDaemon();
    process.exit(0);
});

runTmdbDumpDaemon({ once }).catch((err) => {
    console.error('[TmdbDaemon Service] Errore fatale:', err);
    process.exit(1);
});
