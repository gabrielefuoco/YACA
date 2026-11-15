/**
 * src/posters/gcPosterCache.js
 *
 * Garbage Collector del volume dei poster composti (/data/erdb-cache).
 * Due sole regole di eleggibilità:
 * 1. File temporanei orfani (.tmp*) più vecchi di 15 minuti.
 * 2. Poster con mtime più vecchio di ttlDays (default 60 giorni).
 *
 * Protezioni inderogabili:
 * - Barriera di sicurezza: mai toccare file con mtime più recente di 60 minuti.
 * - Mai cancellare file il cui nome non sia interpretabile da erdbIdDaNomeFile.
 * - Salta sempre i metadati di controllo: versioni.json, report.json, sorgenti.json.
 * - dryRun attivo per default: safe-by-default in invocazione programmatica.
 */

const fs = require('fs');
const path = require('path');
const { erdbIdDaNomeFile } = require('./posterDaEvento');
const { VERSIONI_FILE_NAME } = require('./volumeContract');

const DEFAULT_MAX_DELETE = 500;
const DEFAULT_TTL_DAYS = 60;
const WRITER_GRACE_MS = 60 * 60 * 1000; // 60 min: mai toccare scritture recenti
const TMP_ORPHAN_MS = 15 * 60 * 1000;   // 15 min: .tmp orfani
const DAY_MS = 24 * 60 * 60 * 1000;
const SKIPPED_FILES = new Set([VERSIONI_FILE_NAME, 'report.json', 'sorgenti.json']);

/**
 * Esegue il Garbage Collector sulla cache dei poster.
 *
 * @param {object} [opts]
 * @param {string} opts.cacheDir Percorso cartella cache
 * @param {boolean} [opts.dryRun=true] Se true simula senza cancellare
 * @param {number} [opts.maxDelete=500] Limite cancellazioni per esecuzione
 * @param {number} [opts.ttlDays=60] Giorni di retention su mtime
 * @param {number} [opts.now=Date.now()] Timestamp di riferimento
 * @returns {Promise<{esaminati: number, bytesTotali: number, bytesLiberati: number, cancellati: number, perMotivo: {tmp_orfano: number, scaduto_ttl: number}, fileRimossi: string[], dryRun: boolean}>}
 */
async function gcPosterCache(opts = {}) {
    const {
        cacheDir,
        dryRun = true,
        maxDelete = DEFAULT_MAX_DELETE,
        ttlDays = DEFAULT_TTL_DAYS,
        now = Date.now()
    } = opts;

    const report = {
        esaminati: 0,
        bytesTotali: 0,
        bytesLiberati: 0,
        cancellati: 0,
        perMotivo: { tmp_orfano: 0, scaduto_ttl: 0 },
        fileRimossi: [],
        dryRun
    };

    if (!cacheDir || !fs.existsSync(cacheDir)) return report;

    const entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
    const candidates = [];

    for (const dirent of entries) {
        if (!dirent.isFile()) continue;
        const name = dirent.name;
        if (SKIPPED_FILES.has(name)) continue;

        const fullPath = path.join(cacheDir, name);
        let stat;
        try {
            stat = await fs.promises.stat(fullPath);
        } catch (_) {
            continue;
        }

        report.esaminati++;
        report.bytesTotali += stat.size;
        const ageMs = now - stat.mtimeMs;

        // 1. File .tmp orfani di scritture interrotte (> 15 min)
        if (name.includes('.tmp')) {
            if (ageMs > TMP_ORPHAN_MS) {
                candidates.push({ name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs, motivo: 'tmp_orfano', priority: 1 });
            }
            continue;
        }

        // Barriera di sicurezza: mai toccare file toccati/creati negli ultimi 60 min
        if (ageMs < WRITER_GRACE_MS) continue;

        // Nome non interpretabile dal parser dei poster: tenere sempre
        if (!erdbIdDaNomeFile(name)) continue;

        // 2. TTL su mtime: poster più vecchi di ttlDays
        if (ageMs > ttlDays * DAY_MS) {
            candidates.push({ name, fullPath, size: stat.size, mtimeMs: stat.mtimeMs, motivo: 'scaduto_ttl', priority: 2 });
        }
    }

    candidates.sort((a, b) => (a.priority - b.priority) || (a.mtimeMs - b.mtimeMs));
    const limit = Math.max(0, Number(maxDelete) || 0);
    const toDelete = candidates.slice(0, limit);

    for (const target of toDelete) {
        if (!dryRun) {
            try {
                await fs.promises.unlink(target.fullPath);
            } catch (_) {
                continue;
            }
        }
        report.cancellati++;
        report.bytesLiberati += target.size;
        report.perMotivo[target.motivo] = (report.perMotivo[target.motivo] || 0) + 1;
        report.fileRimossi.push(target.name);
    }

    return report;
}

function parseCliArgs(argv) {
    const opts = {
        cacheDir: process.env.ERDB_CACHE_DIR || '/data/erdb-cache',
        dryRun: false,
        maxDelete: DEFAULT_MAX_DELETE,
        ttlDays: DEFAULT_TTL_DAYS
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            opts.dryRun = true;
        } else if (arg === '--max-delete' && argv[i + 1]) {
            opts.maxDelete = parseInt(argv[++i], 10);
        } else if (arg === '--ttl-days' && argv[i + 1]) {
            opts.ttlDays = parseInt(argv[++i], 10);
        } else if (arg === '--cache-dir' && argv[i + 1]) {
            opts.cacheDir = argv[++i];
        }
    }
    return opts;
}

if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('Uso: node src/posters/gcPosterCache.js [--dry-run] [--max-delete <n>] [--ttl-days <n>] [--cache-dir <dir>]');
        process.exit(0);
    }
    const opts = parseCliArgs(process.argv.slice(2));
    gcPosterCache(opts)
        .then((report) => {
            console.log(JSON.stringify(report, null, 2));
            process.exit(0);
        })
        .catch((err) => {
            console.error('[GC] Errore:', err);
            process.exit(1);
        });
}

module.exports = {
    gcPosterCache,
    DEFAULT_MAX_DELETE,
    DEFAULT_TTL_DAYS,
    WRITER_GRACE_MS,
    TMP_ORPHAN_MS,
    parseCliArgs
};
