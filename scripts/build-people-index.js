#!/usr/bin/env node
/**
 * scripts/build-people-index.js
 *
 * Costruisce `people.db` dai parquet del dump (fetta 1 della ricerca a sintassi esplicita).
 *
 *   node scripts/build-people-index.js [--data-dir <cartella>] [--db <file>]
 *
 * È l'unico modo per popolare l'indice delle persone: senza il file, `cast <nome>` degrada
 * (motivo dichiarato) e la ricerca continua con il resto. Ricostruibile a ogni aggiornamento
 * del dump, come il Tier 2.
 */

require('dotenv').config();

const { buildPeopleIndex, getPeopleStats } = require('../src/indice/people');

function argomento(nome) {
    const index = process.argv.indexOf(nome);
    return index > 0 ? process.argv[index + 1] : undefined;
}

(async () => {
    const dataDir = argomento('--data-dir');
    const dbFile = argomento('--db');

    const prima = getPeopleStats({ dataDir, dbFile });
    console.log(`[people] file: ${prima.dbFile}`);
    console.log(`[people] prima: ${prima.exists ? `${prima.rows} righe, ${prima.sizeMb} MB` : 'assente'}`);

    const esito = await buildPeopleIndex({ dataDir, dbFile });
    console.log(`[people] costruito in ${(esito.durationMs / 1000).toFixed(1)} s`);
    console.log(`[people] righe: ${esito.count} (${Object.entries(esito.perRuolo).map(([r, n]) => `${r}=${n}`).join(' ')})`);
    console.log(`[people] file: ${esito.dbFile} (${esito.dbSizeMb} MB)`);
})().catch((err) => {
    console.error('[people] costruzione fallita:', err.message);
    process.exit(1);
});
