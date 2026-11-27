#!/usr/bin/env node
/**
 * scripts/qa/check-lessico.js
 *
 * Verifica che ogni keyword del lessico italiano esista **davvero** nel dump.
 *
 * Perché: una voce sbagliata non dà errore, dà una pagina vuota. `navi → ship` funziona perché
 * `ship` è una keyword TMDB presente nei parquet; `natalizi → xmas` no, se `xmas` non esiste.
 * Questo controllo va lanciato dopo ogni modifica del lessico.
 *
 *   node scripts/qa/check-lessico.js              # elenca le voci non valide
 *   node scripts/qa/check-lessico.js --cerca nave # cerca keyword che contengono una parola
 */

require('dotenv').config();

const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH
    || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');

const { LESSICO_IT } = require('../../src/ricerca/lessico_it');

async function main() {
    const indice = require('../../src/indice');
    await indice.init();

    const { getKeywordNameMaps } = require('../../src/indice/keywordIds');
    const { nameToId } = getKeywordNameMaps();
    if (!nameToId || nameToId.size === 0) {
        console.error('[lessico] mappa nome↔id non caricata: il dump è pronto?');
        process.exitCode = 1;
        return;
    }

    const indiceCerca = process.argv.indexOf('--cerca');
    if (indiceCerca > 0) {
        const ago = String(process.argv[indiceCerca + 1] || '').toLowerCase();
        const trovati = [...nameToId.keys()].filter(n => n.includes(ago)).slice(0, 40);
        console.log(`[lessico] keyword che contengono "${ago}" (${trovati.length}):`);
        for (const nome of trovati) console.log(`  ${nome} → ${nameToId.get(nome)}`);
        return;
    }

    const chiavi = Object.keys(LESSICO_IT);
    const mancanti = [];
    let valoriTotali = 0;

    for (const chiave of chiavi) {
        for (const valore of LESSICO_IT[chiave]) {
            valoriTotali += 1;
            if (!nameToId.has(String(valore).toLowerCase().trim())) {
                mancanti.push({ chiave, valore });
            }
        }
    }

    console.log(`[lessico] voci: ${chiavi.length} · valori: ${valoriTotali} · keyword nel dump: ${nameToId.size}`);

    if (mancanti.length === 0) {
        console.log('[lessico] tutti i valori esistono nel dump.');
        return;
    }

    console.log(`[lessico] ${mancanti.length} valori NON esistono nel dump:`);
    for (const { chiave, valore } of mancanti) {
        console.log(`  ${chiave} → ${valore}`);
    }
    process.exitCode = 1;
}

main().catch((err) => {
    console.error('[lessico] errore:', err.message);
    process.exit(1);
});
