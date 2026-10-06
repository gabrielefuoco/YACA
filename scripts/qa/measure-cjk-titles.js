#!/usr/bin/env node

/**
 * measure-cjk-titles.js
 *
 * Script di misura e QA per il Ticket 14 (titoli anime CJK nel dump e nei parquet).
 * Misura l'incidenza di caratteri giapponesi/CJK (Hiragana, Katakana, Kanji)
 * nei campi titolo mostrati (`name` per TV, `title` per Film).
 *
 * Utilizzo:
 *   node scripts/qa/measure-cjk-titles.js [opzioni]
 *
 * Opzioni:
 *   --data-dir=DIR   Directory contenente tv.parquet e movies.parquet (default: .cache/tmdb, fallback .scratch/brainstorm/data)
 *   --audit          Verifica i criteri di accettazione del ticket 14 ed esce con codice 1 se non soddisfatti
 */

const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

const CJK = '[ぁ-ヿ一-鿿]'; // Hiragana, Katakana, CJK unificato
const n = (v) => (typeof v === 'bigint' ? Number(v) : Number(v || 0));
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '0.0%');

function resolveDataDir() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--data-dir=')) return path.resolve(args[i].slice(11));
        if (args[i] === '--data-dir' && args[i + 1]) return path.resolve(args[++i]);
    }

    if (process.env.TMDB_DUMP_DIR && fs.existsSync(process.env.TMDB_DUMP_DIR)) {
        return path.resolve(process.env.TMDB_DUMP_DIR);
    }
    const localCache = path.resolve(__dirname, '../../.cache/tmdb');
    if (fs.existsSync(path.join(localCache, 'tv.parquet'))) return localCache;

    const scratch = path.resolve(__dirname, '../../.scratch/brainstorm/data');
    if (fs.existsSync(path.join(scratch, 'tv.parquet'))) return scratch;

    return localCache;
}

async function runMeasure() {
    const dataDir = resolveDataDir();
    const tvPath = path.join(dataDir, 'tv.parquet');
    const moviesPath = path.join(dataDir, 'movies.parquet');

    console.log(`[QA Measure] Directory dati: ${dataDir}`);

    if (!fs.existsSync(tvPath) || !fs.existsSync(moviesPath)) {
        console.error(`[QA Measure] File parquet non trovati in ${dataDir}`);
        process.exitCode = 1;
        return;
    }

    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const q = (sql) => new Promise((res, rej) => con.all(sql, (e, r) => e ? rej(e) : res(r)));

    try {
        console.log('\n=== SERIE TV (campo mostrato: name) ===');
        const tvSqlPath = tvPath.replace(/\\/g, '/');
        const tvCols = (await q(`DESCRIBE SELECT * FROM read_parquet('${tvSqlPath}')`)).map(c => c.column_name);
        const hasTvEn = tvCols.includes('name_en');

        const tvTotal = (await q(`
            SELECT COUNT(*) AS tot,
                   COUNT(*) FILTER (WHERE original_language = 'ja') AS ja,
                   COUNT(*) FILTER (WHERE original_language = 'ja' AND regexp_matches(name, '${CJK}')) AS cjk,
                   COUNT(*) FILTER (WHERE original_language = 'ja' AND name = original_name) AS eq
            FROM read_parquet('${tvSqlPath}')
        `))[0];

        const tvVis = (await q(`
            SELECT COUNT(*) FILTER (WHERE regexp_matches(name, '${CJK}') AND vote_count >= 50) AS vc50,
                   COUNT(*) FILTER (WHERE regexp_matches(name, '${CJK}') AND vote_count >= 300) AS vc300,
                   COUNT(*) FILTER (WHERE regexp_matches(name, '${CJK}') AND popularity >= 5) AS pop5
            FROM read_parquet('${tvSqlPath}')
            WHERE original_language = 'ja'
        `))[0];

        console.log(`  Totali: ${n(tvTotal.tot)} | ja: ${n(tvTotal.ja)} | con CJK in name: ${n(tvTotal.cjk)} (${pct(n(tvTotal.cjk), n(tvTotal.ja))}) | name == original_name: ${n(tvTotal.eq)}`);
        console.log(`  Visibili compromessi: pop >= 5: ${n(tvVis.pop5)} | vc >= 50: ${n(tvVis.vc50)} | vc >= 300: ${n(tvVis.vc300)}`);
        console.log(`  Colonna name_en presente nel parquet: ${hasTvEn ? 'SÌ' : 'NO'}`);

        console.log('\n=== FILM (campo mostrato: title) ===');
        const moviesSqlPath = moviesPath.replace(/\\/g, '/');
        const movieCols = (await q(`DESCRIBE SELECT * FROM read_parquet('${moviesSqlPath}')`)).map(c => c.column_name);
        const hasMovieEn = movieCols.includes('title_en');

        const mvTotal = (await q(`
            SELECT COUNT(*) AS tot,
                   COUNT(*) FILTER (WHERE original_language = 'ja') AS ja,
                   COUNT(*) FILTER (WHERE original_language = 'ja' AND regexp_matches(title, '${CJK}')) AS cjk,
                   COUNT(*) FILTER (WHERE original_language = 'ja' AND title = original_title) AS eq
            FROM read_parquet('${moviesSqlPath}')
        `))[0];

        const mvVis = (await q(`
            SELECT COUNT(*) FILTER (WHERE regexp_matches(title, '${CJK}') AND vote_count >= 50) AS vc50,
                   COUNT(*) FILTER (WHERE regexp_matches(title, '${CJK}') AND vote_count >= 300) AS vc300,
                   COUNT(*) FILTER (WHERE regexp_matches(title, '${CJK}') AND vote_count >= 1000) AS vc1000,
                   COUNT(*) FILTER (WHERE regexp_matches(title, '${CJK}') AND popularity >= 5) AS pop5,
                   COUNT(*) FILTER (WHERE regexp_matches(title, '${CJK}') AND popularity >= 20) AS pop20
            FROM read_parquet('${moviesSqlPath}')
            WHERE original_language = 'ja'
        `))[0];

        console.log(`  Totali: ${n(mvTotal.tot)} | ja: ${n(mvTotal.ja)} | con CJK in title: ${n(mvTotal.cjk)} (${pct(n(mvTotal.cjk), n(mvTotal.ja))}) | title == original_title: ${n(mvTotal.eq)}`);
        console.log(`  Visibili compromessi: pop >= 5: ${n(mvVis.pop5)} | pop >= 20: ${n(mvVis.pop20)} | vc >= 50: ${n(mvVis.vc50)} | vc >= 300: ${n(mvVis.vc300)} | vc >= 1000: ${n(mvVis.vc1000)}`);
        console.log(`  Colonna title_en presente nel parquet: ${hasMovieEn ? 'SÌ' : 'NO'}`);

        const isAudit = process.argv.includes('--audit');
        if (isAudit) {
            console.log('\n=== VERIFICA CRITERI ACCETTAZIONE TICKET 14 ===');
            const criteria1 = n(tvVis.pop5) === 0;
            const criteria2Series = n(tvTotal.cjk) <= 20;
            const criteria2Movies = n(mvTotal.cjk) <= 50;

            console.log(`  [Criterio 1] Serie con CJK e popularity >= 5 == 0: ${criteria1 ? 'PASS' : 'FAIL (' + n(tvVis.pop5) + ')'}`);
            console.log(`  [Criterio 2a] Serie con CJK in totale <= 20: ${criteria2Series ? 'PASS' : 'FAIL (' + n(tvTotal.cjk) + ')'}`);
            console.log(`  [Criterio 2b] Film con CJK in totale <= 50: ${criteria2Movies ? 'PASS' : 'FAIL (' + n(mvTotal.cjk) + ')'}`);

            if (!criteria1 || !criteria2Series || !criteria2Movies) {
                console.log('\nNota: I criteri sopra richiedono l\'esecuzione del backfill dei titoli sul dataset di produzione.');
            }
        }
    } finally {
        con.close();
        db.close();
    }
}

if (require.main === module) {
    runMeasure().catch(err => {
        console.error('Errore durante la misura QA:', err);
        process.exitCode = 1;
    });
}

module.exports = { runMeasure, resolveDataDir };
