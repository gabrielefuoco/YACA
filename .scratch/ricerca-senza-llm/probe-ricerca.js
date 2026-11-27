/**
 * Sonda end-to-end della ricerca unificata sul DuckDB VERO (non mock: i parquet in `.cache/tmdb`).
 *
 *   node .scratch/ricerca-senza-llm/probe-ricerca.js
 *
 * Misura, per ogni query: esito, primi titoli, millisecondi, e se il piano AI è stato
 * interrogato o no. Con `MISTRAL=1` (e `MISTRAL_API_KEY` nell'ambiente/.env) prova anche il
 * ramo AI; senza, solo quello locale.
 */

require('dotenv').config();

const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');

const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');

const QUERY = [
    'batman',
    'blade runner',
    'interstellar',
    'film horror anni 80 sulle navi',
    'film tipo interstellar'
];

async function main() {
    const conAi = process.argv.includes('--ai');
    if (!conAi) delete process.env.MISTRAL_API_KEY;

    console.log(`[probe] indice: ${process.env.DUCKDB_PATH}`);
    console.log(`[probe] ramo AI: ${conAi ? 'ATTIVO' : 'spento (solo locale)'}`);

    const avvio = Date.now();
    await indice.init();
    console.log(`[probe] indice pronto in ${Date.now() - avvio} ms\n`);

    for (const q of QUERY) {
        const inizio = Date.now();
        const items = await cercaUnificata({
            q,
            type: 'movie',
            skip: 0,
            userConfig: {},
            activeProfileSettings: {},
            tmdbApiKey: process.env.TMDB_API_KEY || null
        });
        const ms = Date.now() - inizio;

        console.log(`\n=== "${q}" → ${items.length} risultati in ${ms} ms`);
        for (const item of items.slice(0, 6)) {
            console.log(`   ${item.id.padEnd(14)} ${String(item.name).slice(0, 52).padEnd(54)} ${item._tier2 ? '[tier2]' : ''}`);
        }
        if (items.length === 0) console.log('   (nessun risultato)');
    }

    await indice.close?.();
    process.exit(0);
}

main().catch(err => {
    console.error('[probe] errore:', err);
    process.exit(1);
});
