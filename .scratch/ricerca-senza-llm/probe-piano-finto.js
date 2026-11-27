/**
 * Sonda del ramo AI SENZA un LLM vero.
 *
 * La chiave Mistral presente in `.env` risponde 402 («no api budget»), quindi il cervello vero
 * non è verificabile da qui. Ma il pezzo che ci interessa — piano JSON → normalizzazione →
 * SQL su DuckDB — si può verificare sostituendo solo il client: si inietta un piano realistico
 * e si guarda che cosa il motore locale ne fa.
 *
 *   node .scratch/ricerca-senza-llm/probe-piano-finto.js
 */

require('dotenv').config();

const path = require('path');
process.env.DUCKDB_PATH = process.env.DUCKDB_PATH || path.resolve(__dirname, '../../.cache/tmdb/catalog.duckdb');

const PIANI = {
    'film horror anni 80 sulle navi': {
        queries: [{
            strategy: 'discovery',
            genre_ids: [27],
            year_from: '1980',
            year_to: '1989',
            keyword: 'ship',
            target: 'tmdb'
        }]
    },
    'film tipo interstellar': {
        queries: [{ strategy: 'similar', similar_to: 'Interstellar', target: 'tmdb' }]
    }
};

// Il client finto va installato PRIMA che `src/ai` venga caricato: il router destruttura
// `createAiClient` una volta sola, all'import.
const aiClientModule = require('../../src/ai/client');
aiClientModule.createAiClient = () => ({
    chat: {
        complete: async ({ messages }) => {
            const userMessage = (messages || []).find(m => m.role === 'user')?.content || '';
            const prompt = /QUERY: "(.*)"/.exec(userMessage)?.[1] || '';
            const piano = PIANI[prompt] || { queries: [{ strategy: 'discovery', genre_ids: [27], target: 'tmdb' }] };
            console.log(`   [piano finto] "${prompt}" → ${JSON.stringify(piano.queries[0])}`);
            return { choices: [{ message: { content: JSON.stringify(piano) } }] };
        }
    }
});

const indice = require('../../src/indice');
const { cercaUnificata } = require('../../src/ricerca/ricercaUnificata');

async function main() {
    await indice.init();
    console.log('[probe] indice pronto\n');

    for (const q of Object.keys(PIANI)) {
        const inizio = Date.now();
        const items = await cercaUnificata({
            q,
            type: 'movie',
            skip: 0,
            // chiave finta: serve solo a far considerare «AI disponibile» la ricerca
            userConfig: { apiKeys: { mistral: 'chiave-finta', tmdb: process.env.TMDB_API_KEY } },
            activeProfileSettings: {},
            tmdbApiKey: process.env.TMDB_API_KEY || null
        });
        console.log(`\n=== "${q}" → ${items.length} risultati in ${Date.now() - inizio} ms`);
        for (const item of items.slice(0, 8)) {
            console.log(`   ${String(item.id).padEnd(14)} ${String(item.name).slice(0, 60)}`);
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
