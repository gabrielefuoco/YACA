/**
 * learnedNames.js
 *
 * L'archivio dei **nomi appresi**: i titoli italiani che l'app ha **già visto una volta**.
 *
 * Il percorso e' gia' intero, nessuna parte viene reinventata:
 *   - l'**arricchimento** (`src/catalog/tier2Enrich.js`) chiama gia' TMDB con `it-IT` per ogni
 *     titolo del Tier 2 che mostra, e il dettaglio resta in cache (`tmdb_details_raw`): il nome
 *     italiano **e' gia' li', gratis**, semplicemente non e' cercabile da nessuna parte;
 *   - questo modulo lo **scrive** in una tabella e lo rende **cercabile** al passo successivo.
 *
 * Perche' un SQLite `better-sqlite3` e non il DuckDB dei cataloghi: `duckDbStore` e' `:memory:`
 * e viene ricostruito da zero dai parquet a ogni avvio, quindi un nome appreso evaporerebbe al
 * primo riavvio — mentre la promise di questa tabella e' "una volta cercato, resta trovabile".
 * Qui invece il dato e' **persistente**, il driver (`better-sqlite3`) e' gia' una dipendenza
 * usata da `src/db/tier2Index.js`, e `LIKE` sul titolo normalizzato fa il lavoro di un indice.
 * Nessuna dipendenza nuova, nessun servizio nuovo.
 *
 * Tre garanzie, in ordine:
 *   - **la scrittura non ferma mai niente**: e' fire-and-forget, avvolta, e ogni errore (cartella
 *     assente, file illeggibile, tabella corrotta, disco pieno) viene ingoiato e loggato una volta;
 *   - **la ricerca non solleva mai**: archivio assente o corrotto => `[]`, esattamente come
 *     prima che la tabella esistesse;
 *   - **si scrive solo il nuovo**: `INSERT OR IGNORE` sull'id, quindi un titolo gia' appreso non
 *     viene riscritto a ogni richiesta.
 *
 * Nessuna promozione: qui restano solo `id`, nome italiano, titolo originale e anno. Un titolo
 * resta del Tier 2, di seconda classe, anche dopo che il suo nome e' stato imparato.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/** Nome del file: sta nella stessa cartella dell'indice FTS5 (stessa convenzione di `tier2Index`). */
const DB_FILE = 'learned_names.db';

// Tetto di crescita: la tabella e' una **cache** di nomi, non un archivio di consultazione.
// Se si riempie (navigazione lunga e molto diversificata) si butta via il coda' piu' vecchia:
// i nomi buttati non si perdono, tornano a essere imparati alla prima ricerca che li riporta in pagina.
const MAX_ROWS = 20000;

// Dopo quanti errori consecutivi di scrittura l'archivio si dichiara inutilizzabile: evita di
// riprovare (e ripetere il log) per tutta la vita su un filesystem che non scrive.
const MAX_WRITE_ERRORS = 5;

/** Stessa risoluzione di `tier2Index.defaultDataDir` / `tier1Promotion`: i dati stanno insieme. */
function defaultDataDir() {
    if (process.env.TMDB_DUMP_DIR) return path.resolve(process.env.TMDB_DUMP_DIR);
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

/** Il percorso dell'archivio: `LEARNED_NAMES_DB` se impostato, altrimenti la cartella dei dati. */
function defaultDbPath() {
    if (process.env.LEARNED_NAMES_DB) return path.resolve(process.env.LEARNED_NAMES_DB);
    return path.join(defaultDataDir(), DB_FILE);
}

/**
 * Normalizzazione per la ricerca: minuscole, senza accenti, solo lettere e cifre.
 * Cosi' `Perù`, `PERU'` e `peru` cadono sulla stessa chiave, e `LIKE` (case-insensitive solo
 * per l'ASCII in SQLite) basta perche' il testo salvato e' gia' piegato.
 */
function normalizeText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

/** I token con cui si cerca: parole intere, niente prefissi a caso. */
function titleTokens(value) {
    const clean = normalizeText(value);
    if (!clean) return [];
    return clean.split(' ').filter(t => t.length > 0);
}

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS learned_names (
        tmdb_id        INTEGER NOT NULL,
        media_type     TEXT    NOT NULL,
        title_it       TEXT    NOT NULL,
        title_search   TEXT    NOT NULL,
        original_title TEXT,
        year           TEXT,
        learned_at     INTEGER NOT NULL,
        PRIMARY KEY (media_type, tmdb_id)
    );
    CREATE INDEX IF NOT EXISTS learned_names_title ON learned_names (title_search);
`;

class LearnedNamesStore {
    constructor({ dbPath = defaultDbPath() } = {}) {
        this.dbPath = path.resolve(dbPath);
        this.db = null;
        this.disabled = false;
        this.writeErrors = 0;
        this._warned = false;
    }

    /** Una volta sola: apre (o crea) il file e garantisce la tabella. Solleva se non puo'. */
    _open() {
        if (this.db) return this.db;

        // La cartella non viene creata: l'archivio vive dove vivono gia' i dati. Se qualcuno
        // non ha ancora la cartella (ambiente vuoto, test) non si scrive e non si crea nulla.
        if (!fs.existsSync(path.dirname(this.dbPath))) {
            const err = new Error(`cartella dati assente: ${path.dirname(this.dbPath)}`);
            err.code = 'ENODIR';
            throw err;
        }

        const db = new Database(this.dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 2000');
        db.exec(SCHEMA);
        this.db = db;
        this._insert = db.prepare(`
            INSERT OR IGNORE INTO learned_names
                (tmdb_id, media_type, title_it, title_search, original_title, year, learned_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        this._count = db.prepare('SELECT count(*) AS n FROM learned_names');
        this._prune = db.prepare(`
            DELETE FROM learned_names WHERE rowid IN (
                SELECT rowid FROM learned_names ORDER BY learned_at ASC, rowid ASC LIMIT ?
            )
        `);
        return db;
    }

    _noteError(where, err) {
        if (!this._warned) {
            this._warned = true;
            console.warn(
                `[LearnedNames] Archivio dei nomi appresi non utilizzabile (${where}): ` +
                `la ricerca continua come prima, senza nomi imparati.`,
                err ? err.message : ''
            );
        }
    }

    /**
     * Si puo' scrivere? No se l'archivio e' stato abbandonato, e no se la cartella dei dati non
     * c'e': l'archivio vive dove vivono i dati, non viene creato dal nulla (e in quel caso non
     * viene nemmeno segnalato: e' la stessa condizione in cui non c'e' l'indice del Tier 2).
     */
    canWrite() {
        return !this.disabled && fs.existsSync(path.dirname(this.dbPath));
    }

    /**
     * Scrive un lotto di nomi. Accetta voci pubbliche `{ tmdbId, type, titleIt, originalTitle,
     * year }` e scarta da solo quelle inutili. **Non solleva mai**: ritorna quante voci ha
     * tentato di scrivere, 0 se l'archivio non e' utilizzabile.
     * Il chiamante la usa fire-and-forget, quindi qui si paga (qualche millisecondo di SQLite)
     * senza che nessuno lo aspetti.
     */
    write(entries) {
        if (!this.canWrite()) return 0;
        const rows = (Array.isArray(entries) ? entries : [entries]).map(toLearnableRow).filter(Boolean);
        if (rows.length === 0) return 0;

        try {
            this._open();
            const now = Date.now();
            const tx = this.db.transaction((batch) => {
                for (const r of batch) this._insert.run(r.tmdbId, r.mediaType, r.titleIt, r.searchText, r.originalTitle, r.year, now);
            });
            tx(rows);

            // Tetto di crescita: la coda' piu' vecchia esce, il resto resta.
            const { n } = this._count.get();
            if (Number(n) > MAX_ROWS) this._prune.run(Number(n) - MAX_ROWS);

            this.writeErrors = 0;
            return rows.length;
        } catch (err) {
            this.writeErrors += 1;
            this._noteError('scrittura', err);
            if (this.writeErrors >= MAX_WRITE_ERRORS) this.disabled = true;
            try { if (this.db) this.db.close(); } catch (_e) { /* gia' chiuso o mai aperto */ }
            this.db = null;
            this._insert = null;
            this._count = null;
            this._prune = null;
            return 0;
        }
    }

    /**
     * Cerca fra i nomi appresi: **tutti** i token devono comparire nel titolo italiano salvato.
     * Solo lettura, e su un archivio assente non crea nulla: semplicemente non ci sono nomi.
     */
    search(tokens, { type = null, limit = 5 } = {}) {
        if (this.disabled) return [];
        if (!Array.isArray(tokens) || tokens.length === 0) return [];
        if (!fs.existsSync(this.dbPath)) return [];

        try {
            let where = tokens.map(() => 'title_search LIKE ?').join(' AND ');
            const params = tokens.map(t => `%${t}%`);
            if (type) {
                where += ' AND media_type = ?';
                params.push(type);
            }
            params.push(limit);
            return this._open().prepare(`
                SELECT tmdb_id, media_type, title_it, original_title, year
                FROM learned_names
                WHERE ${where}
                ORDER BY learned_at DESC
                LIMIT ?
            `).all(...params);
        } catch (err) {
            this._noteError('lettura', err);
            return [];
        }
    }

    /** Numero di nomi imparati (diagnostico, e usato dai test). */
    count() {
        if (!fs.existsSync(this.dbPath)) return 0;
        try {
            return Number(this._open().prepare('SELECT count(*) AS n FROM learned_names').get().n);
        } catch (_err) {
            return 0;
        }
    }

    close() {
        if (this.db) {
            try { this.db.close(); } catch (_e) { /* gia' chiuso */ }
        }
        this.db = null;
        this._insert = null;
        this._count = null;
        this._prune = null;
        this.disabled = false;
        this.writeErrors = 0;
    }
}

const store = new LearnedNamesStore();

/**
 * Normalizza una voce in una riga scrivibile, o `null` se non vale la pena scriverla.
 * Un nome che coincide con il titolo originale **non** viene imparato: non aggiunge nulla e
 * l'indice FTS5 trova gia' quel titolo per come e' (e i risultati appresi vanno in coda, quindi
 * finirebbero solo come duplicati).
 */
function toLearnableRow(entry) {
    if (!entry) return null;
    const tmdbId = Number(String(entry.tmdbId === null || entry.tmdbId === undefined ? '' : entry.tmdbId).replace(/^tmdb:/i, ''));
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;

    const mediaType = entry.type === 'series' || entry.type === 'tv' ? 'tv' : 'movie';
    const titleIt = typeof entry.titleIt === 'string' ? entry.titleIt.trim() : '';
    const originalTitle = typeof entry.originalTitle === 'string' ? entry.originalTitle.trim() : '';
    if (!titleIt) return null;

    const searchText = normalizeText(titleIt);
    if (!searchText) return null;
    // Il nome non e' italiano (o non esiste): l'indice FTS5 su quel titolo funziona gia'.
    if (originalTitle && normalizeText(originalTitle) === searchText) return null;

    const year = entry.year === null || entry.year === undefined ? null : String(entry.year).trim().slice(0, 4) || null;
    return {
        tmdbId,
        mediaType,
        titleIt,
        searchText,
        originalTitle: originalTitle || null,
        year
    };
}

/**
 * Scrive i nomi imparati. **Fire-and-forget**: non richiama mai `await`, resta comunque una
 * promise per chi vuole misurare. Non solleva mai, qualunque cosa succeda all'archivio.
 *
 * @param {Array<object>|object} entries voci `{ tmdbId, type, titleIt, originalTitle, year }`
 * @returns {Promise<number>} quante righe sono state tentate (0 se l'archivio non c'e')
 */
function learnNames(entries) {
    const list = (Array.isArray(entries) ? entries : [entries]);
    if (list.length === 0) return Promise.resolve(0);
    // Archivio non utilizzabile (cartella assente, errori ripetuti): non si programma nemmeno
    // il lavoro in background, cosi' l'arricchimento non lascia nulla sospeso dietro.
    if (!store.canWrite()) return Promise.resolve(0);

    // Scrittura differita di un tick: l'arricchimento che l'ha chiamata restituisce subito e
    // nessuna risposta di ricerca aspetta il disco.
    return new Promise((resolve) => {
        const run = () => {
            let written;
            try {
                written = store.write(list);
            } catch (_err) {
                written = 0; // difensivo: `write` non solleva, ma qui non si lascia mai scappare nulla
            }
            resolve(written);
        };        const timer = setTimeout(run, 0);
        if (typeof timer.unref === 'function') timer.unref();
    });
}

/**
 * Ricerca fra i nomi appresi. **Non solleva mai**: archivio assente, illeggibile o corrotto
 * restituiscono `[]`, cioe' esattamente la risposta di prima che la tabella esistesse.
 *
 * @param {string} query testo cercato dall'utente
 * @param {{type?: string, limit?: number}} [options]
 * @returns {Promise<Array<object>>} righe `{ tmdb_id, media_type, title_it, original_title, year }`
 */
function searchLearnedNames(query, { type = null, limit = 5 } = {}) {
    const tokens = titleTokens(query);
    if (tokens.length === 0) return Promise.resolve([]);
    try {
        return Promise.resolve(store.search(tokens, { type, limit }));
    } catch (_err) {
        return Promise.resolve([]);
    }
}

module.exports = {
    LearnedNamesStore,
    DB_FILE,
    MAX_ROWS,
    normalizeText,
    titleTokens,
    toLearnableRow,
    learnNames,
    searchLearnedNames,
    defaultDataDir,
    defaultDbPath,
    /** Chiude il file (test, reload). */
    closeLearnedNames: () => store.close(),
    /** Il path in uso (diagnostica). */
    learnedNamesPath: () => store.dbPath
};
