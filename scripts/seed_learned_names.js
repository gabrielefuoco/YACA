#!/usr/bin/env node

/**
 * seed_learned_names.js — riempie l'archivio dei **nomi appresi** una tantum.
 *
 * Il lavoro e' gia' stato fatto: ogni volta che un titolo del Tier 2 e' stato mostrato,
 * l'arricchimento ha chiamato TMDB con `it-IT` e il dettaglio (con il nome italiano) e' rimasto
 * in Redis. **Le chiavi sono in due famiglie**, perche' `src/clients/tmdb.js` ha due cache con
 * la stessa radice e due forme di chiave (`CacheManager` ci mette davanti il namespace):
 *   - `tmdb_details_raw:full:v2:<tipo>:<id>`  — il dettaglio **completo** (arricchito);
 *   - `tmdb_details_raw:v2:<tipo>:<id>`       — il dettaglio "soltanto" (una versione).
 * Entrambe portano `title` (italiano) e `original_title`, quindi entrambe sono utili: in
 * produzione sono ~200 e ~245 chiavi. Questo script le legge **tutte e due** e scrive le righe
 * corrispondenti nella tabella `learned_names`, cosi' la ricerca per nome italiano non parte da
 * zero.
 *
 * Non promuove niente: scrive solo `id`, nome italiano, titolo originale e anno. Nessuna chiamata
 * di rete a TMDB, nessun Tier 1 toccato. Se Redis non e' raggiungibile esce dicendolo — ma
 * **lo aspetta**, perche' `redisClient` si connette da solo e in modo asincrono (vedi sotto).
 *
 * LA CORSA ALL'AVVIO, PERCHE' ESISTE `aspettaRedis`: `redisClient` si connette da solo, e in un
 * processo una tantum (`docker exec`) il socket non e' ancora pronto quando lo script guarda
 * `isAvailable`: era quindi **sempre** "Redis non raggiungibile", anche con Redis perfettamente
 * sano. Il rimedio e' lo stesso del drenatore dei poster (`aspettaRedis` in
 * `scripts/drena-coda-poster.js`): si interroga a brevi intervalli, con un tetto, e se scade si
 * dice che il motivo e' quello e non una tabella vuota.
 *
 * Uso:  node scripts/seed_learned_names.js [--dry-run] [--attesa-redis <ms>]
 */

const redisClient = require('../src/cache/redisClient');
const { learnNames, searchLearnedNames, learnedNamesPath, closeLearnedNames } = require('../src/db/learnedNames');

// Le due famiglie di chiavi, esattamente come le costruisce `src/clients/tmdb.js`.
// `KEY_PATTERNS` e' l'unico posto in cui sono nominate: `parseKey` accetta le due forme
// (stesso `:v2:<tipo>:<id>`, con o senza il segmento `full` in mezzo).
const KEY_PATTERNS = ['tmdb_details_raw:full:v2:*', 'tmdb_details_raw:v2:*'];

// Tetto dell'attesa e passo fra un'interrogazione e l'altra: stessi numeri (e stesso motivo) di
// `scripts/drena-coda-poster.js`. Il tetto non e' un'attesa di guarigione, e' il tempo entro cui
// una connessione sana e' gia' arrivata.
const DEFAULT_ATTESA_REDIS_MS = 10000;
const INTERVALLO_ATTESA_REDIS_MS = 100;

/**
 * La chiave di cache porta gia' il tipo e l'id, in **due** forme:
 * `tmdb_details_raw:full:v2:movie:950387` e `tmdb_details_raw:v2:movie:49051`.
 * Il segmento `full` c'e' solo nella prima famiglia, quindi e' opzionale.
 * @returns {{mediaType: 'movie'|'tv', tmdbId: number}|null}
 */
function parseKey(key) {
    const m = /^tmdb_details_raw:(?:full:)?v2:(movie|series|tv):(\d+)$/.exec(String(key));
    if (!m) return null;
    return { mediaType: m[1] === 'tv' ? 'tv' : 'movie', tmdbId: Number(m[2]) };
}

/** Una dormita semplice, e non un `setTimeout` lasciato appeso: qui si aspetta sul serio. */
function _dormi(ms) {
    return new Promise((risolvi) => { setTimeout(risolvi, ms); });
}

/**
 * Aspetta che il client Redis sia davvero connesso, **prima della prima lettura**.
 *
 * Copia del pattern di `aspettaRedis` (`scripts/drena-coda-poster.js`), con lo stesso
 * contratto: `isAvailable` e' una **getter**, non c'e' nessun evento da ascoltare, quindi si
 * interroga a brevi intervalli e si esce comunque al tetto. Un client che non espone la
 * proprieta' (uno stub, un fake) non ha niente da aspettare: niente attesa inventata.
 *
 * @param {object} [redis] il client condiviso (o `null`)
 * @param {object} [opzioni]
 * @param {number} [opzioni.tettoMs]      aspetta massima (default `DEFAULT_ATTESA_REDIS_MS`)
 * @param {number} [opzioni.intervalloMs] passo fra un'interrogazione e l'altra
 * @param {object} [opzioni.log]
 * @returns {Promise<{pronto: boolean, interrogazioni: number, attesaMs: number}>}
 */
async function aspettaRedis(redis, {
    tettoMs = DEFAULT_ATTESA_REDIS_MS,
    intervalloMs = INTERVALLO_ATTESA_REDIS_MS,
    log = console
} = {}) {
    const subito = { pronto: true, interrogazioni: 0, attesaMs: 0 };
    if (!redis) return subito;
    const ora = redis.isAvailable;
    if (ora === true) return { ...subito, interrogazioni: 1 };
    if (typeof ora === 'undefined') return subito;

    if (!(tettoMs > 0)) return { pronto: false, interrogazioni: 1, attesaMs: 0 };
    const passo = Math.max(1, Math.min(intervalloMs > 0 ? intervalloMs : INTERVALLO_ATTESA_REDIS_MS, tettoMs));

    const inizio = Date.now();
    let interrogazioni = 1;
    log.log(`[LearnedNames] Redis non e' ancora connesso: aspetto al massimo ${tettoMs} ms ` +
        `(ogni ${passo} ms) prima di leggere l'archivio…`);

    while (Date.now() - inizio < tettoMs) {
        await _dormi(passo);
        interrogazioni += 1;
        if (redis.isAvailable === true) {
            const attesaMs = Date.now() - inizio;
            log.log(`[LearnedNames] Redis connesso dopo ${attesaMs} ms: leggo l'archivio.`);
            return { pronto: true, interrogazioni, attesaMs };
        }
    }
    return { pronto: false, interrogazioni, attesaMs: Date.now() - inizio };
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

/** Tutte le chiavi delle due famiglie, in un solo elenco (i `keys` si chiedono una volta per pattern). */
async function _chiavi(redis) {
    const chiavi = [];
    for (const pattern of KEY_PATTERNS) {
        const trovate = await redis.keys(pattern);
        chiavi.push(...trovate);
    }
    return chiavi;
}

async function main({
    dryRun = false,
    attesaRedisMs = DEFAULT_ATTESA_REDIS_MS,
    redis = redisClient,
    log = console
} = {}) {
    // NON al primo controllo: `redisClient` si connette in modo asincrono e in un processo una
    // tantum il primo `false` non vuol dire "Redis giù", vuol dire "non ancora partito".
    const attesa = await aspettaRedis(redis, { tettoMs: attesaRedisMs, log });
    if (!attesa.pronto) {
        log.error(`[LearnedNames] Redis NON connesso dopo ${attesaRedisMs} ms: niente da cui imparare. ` +
            'Non e\' un archivio vuoto: o Redis non gira, o REDIS_URL non e\' raggiungibile da qui. ' +
            'Riprovare quando Redis è su (docker compose ps redis).');
        return { scanned: 0, written: 0 };
    }

    log.log(`[LearnedNames] Archivio: ${learnedNamesPath()}${dryRun ? ' (dry-run: nessuna scrittura)' : ''}`);
    const chiavi = await _chiavi(redis);
    log.log(`[LearnedNames] Chiavi lette (${KEY_PATTERNS.join(' + ')}): ${chiavi.length}`);

    // Un id può comparire nelle due famiglie: una riga sola per titolo (`learned_names` è
    // `INSERT OR IGNORE` sull'id, ma meglio non dipendere da quello per il conteggio).
    const perId = new Map();
    for (const key of chiavi) {
        const raw = await redis.get(key);
        if (!raw) continue;
        let envelope;
        try {
            envelope = JSON.parse(raw);
        } catch (_err) {
            continue;
        }
        const entry = toEntry(key, envelope);
        if (!entry) continue;
        const id = `${entry.type}:${entry.tmdbId}`;
        if (!perId.has(id)) perId.set(id, entry);
    }
    const entries = [...perId.values()];
    const doppioni = chiavi.length - perId.size;

    if (dryRun) {
        log.log(`[LearnedNames] Voci utilizzabili: ${entries.length} (nessuna scrittura eseguita)`);
        entries.slice(0, 10).forEach(e => log.log(`  - ${e.type} ${e.tmdbId}: ${e.titleIt} (${e.originalTitle}, ${e.year || '?'})`));
        return { scanned: chiavi.length, written: 0 };
    }

    const written = await learnNames(entries);
    // Un nome imparato e' subito cercabile: una prova sola, per non dichiarare vittoria a vuoto.
    const prova = await searchLearnedNames((entries[0] || {}).titleIt || '', { limit: 1 });
    log.log(`[LearnedNames] Righe scritte: ${written} | tabella: ${entries.length} voci` +
        `${doppioni > 0 ? `, ${doppioni} chiavi doppie fra le due famiglie` : ''}, ` +
        `verifica ricerca: ${prova.length} risultati`);
    closeLearnedNames();
    return { scanned: chiavi.length, written };
}

if (require.main === module) {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const i = argv.indexOf('--attesa-redis');
    const attesaRedisMs = i >= 0 && Number.isFinite(Number(argv[i + 1])) && Number(argv[i + 1]) > 0
        ? Number(argv[i + 1])
        : DEFAULT_ATTESA_REDIS_MS;
    main({ dryRun, attesaRedisMs }).then(() => process.exit(0)).catch(err => {
        console.error('[LearnedNames] Errore durante il seed:', err.message);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseKey,
    toEntry,
    aspettaRedis,
    KEY_PATTERNS,
    DEFAULT_ATTESA_REDIS_MS,
    INTERVALLO_ATTESA_REDIS_MS
};
