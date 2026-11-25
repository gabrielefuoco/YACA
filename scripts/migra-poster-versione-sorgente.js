#!/usr/bin/env node
/**
 * migra-poster-versione-sorgente.js — migrazione una tantum per il ticket 08.
 *
 * Il nome del poster composto ora include il token dell'immagine sorgente (TMDB
 * `poster_path`). Al primo deploy della nuova formula, TUTTI i file già nel volume
 * avrebbero un nome vecchio, quindi la rotta risponderebbe 404 finché il renderer non
 * li rifà: 105.732 poster, cioè ore di ERDB e una raffica di miss.
 *
 * Questo script evita entrambe le cose, senza renderizzare niente:
 *   1. semina `sorgenti.json` (erdbId -> token) leggendo `poster_path` dai parquet;
 *   2. crea per ogni file esistente il nome nuovo, calcolato con la STESSA funzione del
 *      runtime (`posterFileName`), così app e volume concordano per costruzione.
 *
 * Il nome nuovo è un **hardlink**, non una rinomina: durante la finestra di deploy il vecchio
 * nome continua a rispondere 200 (niente raffica di 404, niente render), e il GC (ticket 09)
 * raccoglierà i nomi vecchi con il suo TTL. Stesso inode: il disco non cresce.
 *
 * L'immagine NON viene rigenerata: il file linkato è quello che c'era. Per i titoli la cui
 * locandina è cambiata su TMDB, la versione nuova verrà prodotta al prossimo cambio di badge
 * (o dal prefill notturno): è un ceiling accettato e dichiarato.
 *
 * Uso (default: dry-run, non tocca niente):
 *   node scripts/migra-poster-versione-sorgente.js [--dir /data/erdb-cache] [--parquet /data/tmdb] [--apply]
 */

const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const { posterFileName } = require('../src/posters/erdb/build');
const { erdbIdDaNomeFile } = require('../src/posters/posterDaEvento');
const volumeContract = require('../src/posters/volumeContract');

const SKIP = new Set([volumeContract.VERSIONI_FILE_NAME, 'report.json', 'sorgenti.json']);

function parseArgs(argv) {
    const opts = {
        dir: process.env.ERDB_CACHE_DIR || '/data/erdb-cache',
        parquet: process.env.TMDB_DUMP_DIR || (fs.existsSync('/data/tmdb') ? '/data/tmdb' : path.resolve(__dirname, '../.cache/tmdb')),
        apply: false,
        pruneOld: false
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') opts.apply = true;
        else if (a === '--prune-old') opts.pruneOld = true;
        else if (a === '--dir') opts.dir = argv[++i];
        else if (a === '--parquet') opts.parquet = argv[++i];
        else if (a === '--help') { console.log(__filename, '[--dir D] [--parquet D] [--apply] [--prune-old]'); process.exit(0); }
        else throw new Error(`argomento non riconosciuto: ${a}`);
    }
    return opts;
}

function queryAll(con, sql) {
    return new Promise((resolve, reject) => con.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));
}

async function leggiSorgenti(parquetDir) {
    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const map = new Map();
    try {
        for (const [file, type] of [['movies.parquet', 'movie'], ['tv.parquet', 'tv']]) {
            const p = path.join(parquetDir, file).replace(/\\/g, '/').replace(/'/g, "''");
            if (!fs.existsSync(path.join(parquetDir, file))) {
                console.warn(`[migra] ${file} assente, salto`);
                continue;
            }
            const rows = await queryAll(con, `SELECT CAST(id AS BIGINT) id, CAST(poster_path AS VARCHAR) poster_path FROM read_parquet('${p}') WHERE poster_path IS NOT NULL`);
            for (const r of rows) map.set(`tmdb:${type}:${Number(r.id)}`, r.poster_path);
            console.log(`[migra] ${type}: ${rows.length} poster_path`);
        }
    } finally {
        await new Promise((resolve) => con.close(() => db.close(resolve)));
    }
    return map;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    console.log(`[migra] volume=${opts.dir} parquet=${opts.parquet} modalita=${opts.apply ? 'APPLY' : 'dry-run'}`);

    const sorgenti = await leggiSorgenti(opts.parquet);
    if (sorgenti.size === 0) throw new Error('nessun poster_path letto dai parquet: mi fermo');

    const files = fs.readdirSync(opts.dir).filter((n) => !SKIP.has(n) && !n.includes('.tmp'));
    const report = { esaminati: files.length, rinominati: 0, giaOk: 0, senzaToken: 0, conflitti: 0, errori: 0 };
    const rinomine = [];

    for (const nome of files) {
        const riconosciuto = erdbIdDaNomeFile(nome);
        if (!riconosciuto) continue;
        const { erdbId, badge } = riconosciuto;
        const source = sorgenti.get(erdbId);
        if (!source) { report.senzaToken++; continue; }

        let nuovoNome;
        try {
            nuovoNome = posterFileName({ erdbId, badge: badge === undefined ? null : badge, source });
        } catch (err) {
            report.errori++;
            continue;
        }
        if (nuovoNome === nome) { report.giaOk++; continue; }
        if (fs.existsSync(path.join(opts.dir, nuovoNome))) {
            // Il sostituto c'è già: questo è il nome vecchio, e con --prune-old si toglie.
            report.conflitti++;
            if (opts.pruneOld) rinomine.push([nome, null]);
            continue;
        }
        rinomine.push([nome, nuovoNome]);
    }

    // La mappa si scrive SEMPRE (è ciò che rende concordi drenatore e formatter), anche in dry-run
    // solo se richiesto: in dry-run si mostra e basta.
    const mappaOut = path.join(opts.dir, 'sorgenti.json');
    const mappaJson = {};
    for (const [erdbId, source] of sorgenti) {
        const token = path.basename(String(source).split('?')[0]).replace(/\.(jpg|jpeg|webp|png)$/i, '');
        if (/^[A-Za-z0-9_-]{6,}$/.test(token)) mappaJson[erdbId] = token;
    }
    console.log(`[migra] mappa: ${Object.keys(mappaJson).length} token`);

    if (opts.apply) {
        const tmp = `${mappaOut}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(mappaJson), 'utf8');
        fs.renameSync(tmp, mappaOut);
    }

    for (const [vecchio, nuovo] of rinomine) {
        if (nuovo === null) {
            if (opts.apply) {
                try { fs.unlinkSync(path.join(opts.dir, vecchio)); } catch (_) { report.errori++; continue; }
            }
            report.pulitiVecchi = (report.pulitiVecchi || 0) + 1;
            continue;
        }
        if (opts.apply) {
            try { fs.linkSync(path.join(opts.dir, vecchio), path.join(opts.dir, nuovo)); }
            catch (_) { report.errori++; continue; }
        }
        report.rinominati++;
    }

    console.log('[migra] report', JSON.stringify(report));
    if (!opts.apply) {
        for (const [v, n] of rinomine.slice(0, 5)) console.log(`[migra]   ${v} -> ${n || '(cancellato: nome vecchio)'}`);
        console.log('[migra] dry-run: niente scritto. Rilanciare con --apply per applicare.');
    }
}

main().catch((err) => { console.error('[migra] errore:', err.message); process.exit(1); });
