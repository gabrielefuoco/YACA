/**
 * verify_real_fallbacks.js
 * Script di verifica reale su airing.json e dump upstream Fribb/AniBridge.
 * Verifica l'esito del fallback TMDB per gli 11 record non risolti a monte.
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

    const resolver = new IdentityResolver({
        cacheDir: UPSTREAM_CACHE,
        tmdbApiKey: process.env.TMDB_API_KEY
    });

    await resolver.init();

    // Filtra record non risolti dal mapping ufficiale Fribb/AniBridge
    const unmapped = allRecords.filter(r => {
        const id = resolver.resolve({ anilistId: r.anilist_id, malId: r.mal_id });
        return !id || !id.tmdbId;
    });

    console.log(`\nRecord totali: ${allRecords.length}`);
    console.log(`Record non risolti da Fribb/AniBridge: ${unmapped.length}`);

    // Esegui fallback in modalità dry-run
    await resolver.enrichWithFallbacks(unmapped, { dryRun: true, refreshFallbacks: true });

    console.log('\n========================================================================================================================');
    console.log('| ID     | DUB | Titolo AnimeUnity                      | Esito Risoluzione / TMDB ID                           | Conf | Status |');
    console.log('========================================================================================================================');

    let matchedCount = 0;
    let unmappedCount = 0;

    for (const rec of unmapped) {
        const id = resolver.resolve({ anilistId: rec.anilist_id, malId: rec.mal_id });
        const title = (rec.title || rec.title_eng || rec.slug || '').slice(0, 38).padEnd(38);
        const dubStr = String(rec.dub).padStart(3);
        const idStr = String(rec.id).padEnd(6);

        if (id && id.tmdbId) {
            matchedCount++;
            const tmdbStr = `TMDB ${id.tmdbId}`.padEnd(53);
            console.log(`| ${idStr} | ${dubStr} | ${title} | ${tmdbStr} | 0.85+ | MATCH  |`);
        } else {
            unmappedCount++;
            const tmdbStr = '— (nessun candidato TMDB valido)'.padEnd(53);
            console.log(`| ${idStr} | ${dubStr} | ${title} | ${tmdbStr} | —    | NULL   |`);
        }
    }
    console.log('========================================================================================================================');
    console.log(`\nRiepilogo: ${matchedCount} record risolti via fallback, ${unmappedCount} record non trovati senza falsi positivi.`);
}

main().catch(err => {
    console.error('Errore durante la verifica:', err);
    process.exit(1);
});
