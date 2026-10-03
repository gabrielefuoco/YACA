/**
 * itaAnnotations.js
 * Le annotazioni "doppiato in italiano" del catalogo, lette dal file prodotto da
 * `services/doppiaggi-source` e servite come snapshot in RAM.
 *
 * CONTRATTO (deciso dal ticket 04 della mappa `.scratch/doppiaggio-ita`):
 *   {"t":"movie","id":5,"ita":true}    → doppiato
 *   {"t":"tv","id":1399,"ita":null}    → indecisione (omonimia irrisolta)
 *   riga assente                       → `false` (nessuna traccia di doppiaggio)
 * La chiave è **(tipo, tmdb id)**: 5.933 id TMDB vivono in entrambe le tabelle, quindi il tipo
 * fa parte della chiave e non si può omettere.
 *
 * PERCHÉ UNO SNAPSHOT E NON LA COLONNA DEL PARQUET: il badge si applica a card che arrivano da
 * **21 cataloghi** (Trakt, hero, watchlist, simulcast) che non passano dal parquet e non hanno
 * quella colonna. Una lettura per finestra (TTL) copre tutti, a costo di ~1,6 MB di RAM.
 *
 * DEGRADO (deciso, non un incidente): se il file manca o è rotto lo snapshot è **vuoto** e nessun
 * badge viene applicato. Il catalogo resta fresco; il badge si spegne. Non lancia mai.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/** TTL dello snapshot: una lettura per finestra, non una per item. */
const CACHE_TTL_MS = 60 * 1000;
const FILE_NAME = 'ita_annotations.jsonl';

/** Stessa risoluzione del dump TMDB: `TMDB_DUMP_DIR`, altrimenti `/data/tmdb`, altrimenti `.cache/tmdb`. */
function annotationsDir() {
    if (process.env.ITA_ANNOTATIONS_DIR) return process.env.ITA_ANNOTATIONS_DIR;
    if (process.env.TMDB_DUMP_DIR) return process.env.TMDB_DUMP_DIR;
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

function annotationsPath() {
    return process.env.ITA_ANNOTATIONS_PATH || path.join(annotationsDir(), FILE_NAME);
}

function emptySnapshot(error, filePath) {
    return {
        byKey: new Map(),
        count: 0,
        trueCount: 0,
        nullCount: 0,
        generatedAt: null,
        loadedAt: Date.now(),
        path: filePath,
        error: error || null
    };
}

async function readFile(filePath) {
    const snapshot = emptySnapshot(null, filePath);
    if (!fs.existsSync(filePath)) {
        snapshot.error = 'file assente';
        return snapshot;
    }

    try {
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });
        for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let row;
            try {
                row = JSON.parse(trimmed);
            } catch (_) {
                continue; // riga corrotta: si ignora, non si butta il file
            }
            if (!row || (row.t !== 'movie' && row.t !== 'tv')) continue;
            if (row.ita !== true && row.ita !== null) continue; // `false` non entra nel file per contratto
            const id = Number(row.id);
            if (!Number.isFinite(id)) continue;

            // Il terzo stato va **conservato**: `row.ita === true` lo appiattirebbe a `false`,
            // che è la stessa trappola di `COALESCE(ann.ita, false)` nel merge (ticket 04).
            const status = row.ita === true ? true : null;
            snapshot.byKey.set(`${row.t}:${id}`, status);
            snapshot.count++;
            if (status === true) snapshot.trueCount++;
            else snapshot.nullCount++;
        }
    } catch (error) {
        snapshot.error = error.message;
    }

    return snapshot;
}

let cache = { snapshot: null, fetchedAt: 0 };

/**
 * Lettura in corso, chiave unica: le chiamate concorrenti aspettano **quella** lettura invece di
 * aprirne una identica. Stesso pattern di `activePromises` in `src/cache/CacheManager.js`: la
 * promise viene tolta quando si assesta (anche se fallisce), così nessun errore resta in circolo e
 * il chiamante dopo ritenta.
 */
const activePromises = new Map();
const SNAPSHOT_KEY = 'snapshot';

/**
 * Snapshot delle annotazioni, con cache L1 a TTL breve. Non lancia mai: in caso di errore
 * restituisce uno snapshot vuoto (nessun badge), che è il degrado deciso.
 *
 * SINGLE-FLIGHT: aperte N schede mentre la griglia carica, senza questo passaggio ogni chiamata
 * leggeva il file per conto proprio (misurato: 20 letture di 24.119 righe, ~430 ms di CPU sprecata).
 * Ora ne fanno una sola e le altre 19 aspettano la stessa promise.
 *
 * `force` salta il TTL ma non la lettura in volo: quella è più recente di qualunque snapshot in
 * cache, quindi aspettarla serve `force` lo stesso (e non costa una seconda lettura del file).
 *
 * @param {{force?: boolean}} [options]
 */
async function getSnapshot(options = {}) {
    const now = Date.now();
    if (!options.force && cache.snapshot && now - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.snapshot;
    }

    const inFlight = activePromises.get(SNAPSHOT_KEY);
    if (inFlight) return inFlight;

    const readPromise = (async () => {
        let snapshot;
        try {
            snapshot = await readFile(annotationsPath());
        } catch (error) {
            snapshot = emptySnapshot(error.message, annotationsPath());
        }
        if (snapshot.error) {
            // Una lettura **fallita non entra in cache**: il chiamante riceve comunque lo snapshot
            // vuoto (il degrado sopra), ma il successivo ritenta invece di aspettare 60 s un
            // errore che magari è solo transitorio (EMFILE, EIO).
            console.warn(`[ItaAnnotations] snapshot vuoto: ${snapshot.error} (${snapshot.path})`);
        } else {
            cache = { snapshot, fetchedAt: now };
        }
        return snapshot;
    })();

    activePromises.set(SNAPSHOT_KEY, readPromise);
    // `finally` dentro la promise: si esegue anche se il chiamante è andato via. Il confronto
    // evita che una lettura vecchia cancelli dalla mappa una lettura più nuova (dopo un `reset`).
    readPromise.finally(() => {
        if (activePromises.get(SNAPSHOT_KEY) === readPromise) activePromises.delete(SNAPSHOT_KEY);
    }).catch(() => {}); // il `finally` non deve generare rejection non gestita

    return readPromise;
}

/**
 * Stato di un titolo: `true` doppiato, `null` indecisione, `false` nessuna traccia (o file assente).
 * @param {object} snapshot
 * @param {'movie'|'tv'} type
 * @param {number|string} tmdbId
 */
function getStatus(snapshot, type, tmdbId) {
    if (!snapshot || !snapshot.byKey) return false;
    const id = Number(tmdbId);
    if (!Number.isFinite(id)) return false;
    const key = `${type === 'movie' ? 'movie' : 'tv'}:${id}`;
    if (!snapshot.byKey.has(key)) return false;
    return snapshot.byKey.get(key);
}

/** Solo per il badge: `true` se doppiato. `null` e `false` non producono badge. */
function isDubbed(snapshot, type, tmdbId) {
    return getStatus(snapshot, type, tmdbId) === true;
}

/** Solo per i test. */
function reset() {
    cache = { snapshot: null, fetchedAt: 0 };
    activePromises.clear();
}

module.exports = {
    CACHE_TTL_MS,
    FILE_NAME,
    annotationsDir,
    annotationsPath,
    getSnapshot,
    getStatus,
    isDubbed,
    reset
};
