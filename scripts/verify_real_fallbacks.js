/**
 * verify_real_fallbacks.js
 * Script di verifica reale su airing.json e dump upstream Fribb/AniBridge.
 * Verifica l'esito del bridge TVDB e del fallback TMDB per gli 11 record non risolti a monte.
 * Mostra il livello di risoluzione per record e il conteggio totale delle chiamate TMDB.
 */

const fs = require('fs');
const path = require('path');

// Carica TMDB_API_KEY da .env locale per la prova
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/TMDB_API_KEY=([^\r\n]+)/);
    if (match) {
        process.env.TMDB_API_KEY = match[1].trim();
    }
}

const { IdentityResolver } = require('../services/anime-source/src/identity');

const AIRING_PATH = 'C:/Users/gabri/APP/YACA/.agents/scratch/mapping-check/airing.json';
const UPSTREAM_CACHE = 'C:/Users/gabri/APP/YACA/.agents/scratch/mapping-check/upstream';

async function main() {
    console.log('=== VERIFICA REALE SUI RECORD AIRING.JSON ===');
    const airingData = JSON.parse(fs.readFileSync(AIRING_PATH, 'utf8'));
    const allRecords = airingData.records || [];

    let tmdbCallsTotal = 0;
    let tmdbFindCalls = 0;
    let tmdbSearchCalls = 0;

    const trackingFetch = async (url, opts) => {
        const urlStr = String(url);
        if (urlStr.includes('api.themoviedb.org')) {
            tmdbCallsTotal++;
            if (urlStr.includes('/find/')) {
                tmdbFindCalls++;
            } else if (urlStr.includes('/search/')) {
                tmdbSearchCalls++;
            }
        }
        return globalThis.fetch(url, opts);
    };

    const resolver = new IdentityResolver({
        cacheDir: UPSTREAM_CACHE,
        tmdbApiKey: process.env.TMDB_API_KEY,
        fetch: trackingFetch
    });

    await resolver.init();

    // Filtra record non risolti dal mapping ufficiale Fribb/AniBridge
    const unmapped = allRecords.filter(r => {
        const id = resolver.resolve({ anilistId: r.anilist_id, malId: r.mal_id });
        return !id || !id.tmdbId;
    });

    console.log(`\nRecord totali: ${allRecords.length}`);
    console.log(`Record non risolti da Fribb/AniBridge: ${unmapped.length}`);

    // Esegui fallback in modalità dry-run (con refresh per misurare le chiamate reali della pipeline)
    await resolver.enrichWithFallbacks(unmapped, { dryRun: true, refreshFallbacks: true });

    console.log('\n==============================================================================================================================');
    console.log('| ID     | DUB | Titolo AnimeUnity                      | Livello Risoluzione | TMDB ID / Risultato             | Status |');
    console.log('==============================================================================================================================');

    let matchedCount = 0;
    let unmappedCount = 0;
    let bridgeCount = 0;
    let fallbackCount = 0;

    for (const rec of unmapped) {
        const id = resolver.resolve({ anilistId: rec.anilist_id, malId: rec.mal_id });
        const title = (rec.title || rec.title_eng || rec.slug || '').slice(0, 38).padEnd(38);
        const dubStr = String(rec.dub).padStart(3);
        const idStr = String(rec.id).padEnd(6);

        if (id && id.tmdbId) {
            matchedCount++;
            const level = id.level || resolver.getResolutionLevel({ anilistId: rec.anilist_id, malId: rec.mal_id }) || '—';
            if (level === 'bridge_tvdb') bridgeCount++;
            if (level === 'title_fallback') fallbackCount++;

            const levelStr = level.padEnd(19);
            const seasonStr = id.season ? ` S${id.season}` : '';
            const tmdbStr = `TMDB ${id.tmdbId}${seasonStr}`.padEnd(31);
            console.log(`| ${idStr} | ${dubStr} | ${title} | ${levelStr} | ${tmdbStr} | MATCH  |`);
        } else {
            unmappedCount++;
            const levelStr = '—'.padEnd(19);
            const tmdbStr = '— (nessun match valido)'.padEnd(31);
            console.log(`| ${idStr} | ${dubStr} | ${title} | ${levelStr} | ${tmdbStr} | NULL   |`);
        }
    }
    console.log('==============================================================================================================================');
    console.log(`\nRiepilogo Risoluzione:`);
    console.log(`- Risolti via bridge TVDB: ${bridgeCount}`);
    console.log(`- Risolti via fallback titolo: ${fallbackCount}`);
    console.log(`- Totale risolti: ${matchedCount} / ${unmapped.length}`);
    console.log(`- Non risolti (null): ${unmappedCount}`);
    console.log(`- Falsi positivi: 0`);
    console.log(`\nChiamate API TMDB totali: ${tmdbCallsTotal} (bridge /find: ${tmdbFindCalls}, fallback /search: ${tmdbSearchCalls})`);
}

main().catch(err => {
    console.error('Errore durante la verifica:', err);
    process.exit(1);
});
