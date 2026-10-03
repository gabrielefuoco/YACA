#!/usr/bin/env node

/**
 * seed_learned_names.js — riempie l'archivio dei **nomi appresi** una tantum.
 *
 * Il lavoro e' gia' stato fatto: ogni volta che un titolo del Tier 2 e' stato mostrato,
 * l'arricchimento ha chiamato TMDB con `it-IT` e il dettaglio (con il nome italiano) e' rimasto
 * in Redis sotto `tmdb_details_raw:full:v2:<tipo>:<id>`. Questo script legge quelle chiavi e
 * scrive le righe corrispondenti nella tabella `learned_names`, cosi' la ricerca per nome italiano
 * non parte da zero.
 *
 * Non promuove niente: scrive solo `id`, nome italiano, titolo originale e anno. Nessuna chiamata
 * di rete a TMDB, nessun Tier 1 toccato. Se Redis non e' raggiungibile esce dicendolo.
 *
 * Uso:  node scripts/seed_learned_names.js [--dry-run]
 */

const redisClient = require('../src/cache/redisClient');
const { learnNames, searchLearnedNames, learnedNamesPath, closeLearnedNames } = require('../src/db/learnedNames');

const KEY_PATTERN = 'tmdb_details_raw:full:v2:*';

/** La chiave di cache porta gia' il tipo e l'id: `tmdb_details_raw:full:v2:movie:950387`. */
function parseKey(key) {
    const m = /:full:v2:(movie|series|tv):(\d+)$/.exec(key);
    if (!m) return null;
    return { mediaType: m[1] === 'tv' ? 'tv' : 'movie', tmdbId: Number(m[2]) };
}

/** La busta di CacheManager e' `{ v, t }`; dentro c'e' il dettaglio grezzo di TMDB. */
function toEntry(key, envelope) {
    const parsed = parseKey(key);
    if (!parsed) return null;
    const details = envelope && typeof envelope === 'object' && 'v' in envelope ? envelope.v : envelope;
    if (!details || typeof details !== 'object') return null;

    const titleIt = details.title || details.name || '';
    const originalTitle = details.original_title || details.original_name || '';
    const date = details.release_date || details.first_air_date || '';
    if (!titleIt || !originalTitle) return null;

    return {
        tmdbId: parsed.tmdbId,
        type: parsed.mediaType,
        titleIt,
        originalTitle,
        year: /^\d{4}/.test(date) ? date.slice(0, 4) : null
    };
}

async function main({ dryRun = false } = {}) {
    if (!redisClient.isAvailable) {
        console.error('[LearnedNames] Redis non raggiungibile: niente da cui imparare.');
        return { scanned: 0, written: 0 };
    }

    console.log(`[LearnedNames] Archivio: ${learnedNamesPath()}${dryRun ? ' (dry-run: nessuna scrittura)' : ''}`);
    const keys = await redisClient.keys(KEY_PATTERN);
    console.log(`[LearnedNames] Chiavi ${KEY_PATTERN}: ${keys.length}`);

    const entries = [];
    for (const key of keys) {
        const raw = await redisClient.get(key);
        if (!raw) continue;
        let envelope;
        try {
            envelope = JSON.parse(raw);
        } catch (_err) {
            continue;
        }
        const entry = toEntry(key, envelope);
        if (entry) entries.push(entry);
    }

    if (dryRun) {
        console.log(`[LearnedNames] Voci utilizzabili: ${entries.length} (nessuna scrittura eseguita)`);
        entries.slice(0, 10).forEach(e => console.log(`  - ${e.type} ${e.tmdbId}: ${e.titleIt} (${e.originalTitle}, ${e.year || '?'})`));
        return { scanned: keys.length, written: 0 };
    }

    const written = await learnNames(entries);
    // Un nome imparato e' subito cercabile: una prova sola, per non dichiarare vittoria a vuoto.
    const prova = await searchLearnedNames((entries[0] || {}).titleIt || '', { limit: 1 });
    console.log(`[LearnedNames] Righe scritte: ${written} | tabella: ${entries.length} voci, verifica ricerca: ${prova.length} risultati`);
    closeLearnedNames();
    return { scanned: keys.length, written };}

if (require.main === module) {
    const dryRun = process.argv.slice(2).includes('--dry-run');
    main({ dryRun }).then(() => process.exit(0)).catch(err => {
        console.error('[LearnedNames] Errore durante il seed:', err.message);
        process.exit(1);
    });
}

module.exports = { main, parseKey, toEntry };
