/**
 * src/indice/people.js
 *
 * L'INDICE DELLE PERSONE (fetta 1 della ricerca a sintassi esplicita).
 *
 * Perché esiste. Con la sintassi esplicita l'utente può scrivere `cast leonardo dicaprio`, e
 * rispondere «chi è?» scandendo il JSON del cast a ogni query costa **711 ms** misurati su
 * movies.parquet (unnest + group by): il doppio di una ricerca intera. Le persone sono
 * 483.485 nel cast dei film + 73.490 nelle serie + 39.369 registi: un Map in RAM costerebbe
 * ~60-80 MB e 1-2 s di avvio, e sarebbe volatile.
 *
 * Quindi: un file SQLite **persistente** accanto a `titles_fts5.db`, con FTS5 sul nome
 * normalizzato (lookup atteso 1-5 ms), costruito dai parquet una volta e ricostruibile.
 * Stessa forma del Tier 2: stesso `dataDir`, stessa convenzione di nome, stessa regola
 * «assente o rotto ⇒ `[]`, la ricerca continua».
 *
 * Cosa c'è dentro, per persona e per ruolo:
 *   name_norm  nome normalizzato (minuscole, senza accenti, spazi collassati) — è ciò che si cerca
 *   name       nome come lo scrive TMDB — è ciò che si mostra
 *   tmdb_id    id TMDB della persona
 *   ruolo      actor | director | writer | creator
 *   titoli     quanti titoli del nostro dump la contengono in quel ruolo
 *
 * Una riga per (persona, ruolo): `cast X` può escludere i registi senza una seconda tabella, e
 * due righe della stessa persona si fondono in fase di risposta (`ruoli: [...]`).
 *
 * Filtro `adult`: i titoli per adulti non contribuiscono ai conteggi — una persona che compare
 * solo in quelli non deve affiorare da una ricerca.
 */

const duckdb = require('duckdb');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { normalizza, distanza } = require('../infra/testo');

/** Nome del file: sta accanto a `titles_fts5.db` e `learned_names.db` (stessa cartella dati). */
const PEOPLE_DB_FILE = 'people.db';

/** Oltre questa distanza di Levenshtein due nomi non sono lo stesso nome. */
const DISTANZA_MASSIMA = 2;

/**
 * Quanti candidati si guardano nel ripiego fuzzy, per token. Bounded e volutamente basso: la
 * build inserisce in ordine di ruolo e numero di titoli, quindi i rowid bassi sono le persone
 * più presenti — un tetto di 500 trova i nomi che la gente scrive e non paga 3000 Levenshtein
 * su una query sbagliata.
 */
const FUZZY_CANDIDATI = 500;

/** Stessa risoluzione di `tier2.defaultDataDir` / `learnedNames.defaultDataDir`. */
function defaultDataDir() {
    if (process.env.TMDB_DUMP_DIR) return path.resolve(process.env.TMDB_DUMP_DIR);
    if (fs.existsSync('/data/tmdb')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

function defaultPeopleDbPath() {
    if (process.env.PEOPLE_DB) return path.resolve(process.env.PEOPLE_DB);
    return path.join(defaultDataDir(), PEOPLE_DB_FILE);
}

function toSqlPath(filePath) {
    return `'${String(filePath).replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

/** Query FTS5: ogni token è un prefisso (`"leo"* "dicaprio"*`). AND implicito. */
function sanitizePeopleQuery(input) {
    const normalizzato = normalizza(input);
    if (!normalizzato) return '';
    return normalizzato
        .split(/\s+/)
        .filter(Boolean)
        .map(token => `"${token.replace(/"/g, '""')}"*`)
        .join(' ');
}

/**
 * Il limite superiore di un prefisso, per una ricerca a intervallo.
 *
 * `word LIKE 'non%'` NON usa l'indice in SQLite (l'ottimizzazione del LIKE scatta solo con
 * `case_sensitive_like` o `COLLATE NOCASE`): misurato, 83 ms per raccogliere 500 candidati —
 * più di tutto il resto del ripiego. `word >= 'non' AND word < 'noo'` è un range scan vero.
 */

/**
 * Il limite superiore di un prefisso, per una ricerca a intervallo.
 *
 * `word LIKE 'non%'` NON usa l'indice in SQLite (l'ottimizzazione del LIKE scatta solo con
 * `case_sensitive_like` o `COLLATE NOCASE`): misurato, 83 ms per raccogliere 500 candidati —
 * più di tutto il resto del ripiego. `word >= 'non' AND word < 'noo'` è un range scan vero.
 */
function limitePrefisso(prefisso) {
    const caratteri = Array.from(String(prefisso || ''));
    if (caratteri.length === 0) return '';
    const ultimo = caratteri[caratteri.length - 1];
    caratteri[caratteri.length - 1] = String.fromCodePoint(ultimo.codePointAt(0) + 1);
    return caratteri.join('');
}

// ============================================================================
// COSTRUZIONE
// ============================================================================

/** Le colonne che contengono persone, per tabella e per ruolo. */
function colonnePersone({ haFilm, haSerie }) {
    const colonne = [];
    if (haFilm) {
        colonne.push({ tabella: 'movies', colonna: 'cast', ruolo: 'actor' });
        colonne.push({ tabella: 'movies', colonna: 'directors', ruolo: 'director' });
        colonne.push({ tabella: 'movies', colonna: 'writers', ruolo: 'writer' });
    }
    if (haSerie) {
        colonne.push({ tabella: 'tv', colonna: 'cast', ruolo: 'actor' });
        colonne.push({ tabella: 'tv', colonna: 'created_by', ruolo: 'creator' });
    }
    return colonne;
}

/**
 * La query che estrae (persona, ruolo, titoli) dai parquet.
 *
 * I campi si estraggono **dentro** ogni ramo dell'UNION (`x->>'id'`), non dopo la fusione: il
 * tipo comune di più colonne JSON in un UNION non è JSON, e `persona->>'name'` su quel tipo
 * diventa un indice di lista («Failed to cast value to numerical»). È un errore che si vede
 * solo con dati veri, quindi il ramo resta esplicito.
 */
function buildPeopleSelect({ moviesParquet, tvParquet }) {
    const rami = [];
    for (const { tabella, colonna, ruolo } of colonnePersone({
        haFilm: Boolean(moviesParquet),
        haSerie: Boolean(tvParquet)
    })) {
        const file = tabella === 'movies' ? moviesParquet : tvParquet;
        rami.push(`
            SELECT json_extract_string(x, '$.id') AS id,
                   json_extract_string(x, '$.name') AS nome,
                   '${ruolo}' AS ruolo,
                   COALESCE(CAST(popularity AS DOUBLE), 0) AS popolarita
            FROM (
                SELECT unnest(from_json("${colonna}", '["JSON"]')) AS x, popularity
                FROM read_parquet(${toSqlPath(file)})
                WHERE "${colonna}" IS NOT NULL
                  AND COALESCE(adult, false) = false
            )`);
    }

    return `
        WITH righe AS (
            ${rami.join('\n            UNION ALL\n')}
        )
        SELECT id, max(nome) AS nome, ruolo, count(*) AS titoli, sum(popolarita) AS popolarita
        FROM righe
        WHERE id IS NOT NULL AND nome IS NOT NULL
        GROUP BY id, ruolo
        ORDER BY ruolo, popolarita DESC
    `;
}

function eseguiDuck(con, sql) {
    return new Promise((resolve, reject) => {
        con.all(sql, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
}

function chiudiDuck(con, db) {
    return new Promise((resolve) => {
        if (!con) {
            if (db) db.close(() => resolve());
            else resolve();
            return;
        }
        con.close(() => (db ? db.close(() => resolve()) : resolve()));
    });
}

async function replaceFile(sourceFile, destinationFile, attempts = 15) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            if (process.platform === 'win32') {
                fs.copyFileSync(sourceFile, destinationFile);
                try { fs.unlinkSync(sourceFile); } catch (_) { /* niente */ }
                return;
            }
            fs.renameSync(sourceFile, destinationFile);
            return;
        } catch (error) {
            lastError = error;
            if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
            await new Promise(r => setTimeout(r, Math.min(50 * (2 ** attempt), 1000)));
        }
    }
    throw lastError;
}

/**
 * Costruisce `people.db` dai parquet del dump.
 *
 * @param {object} [options]
 * @param {string} [options.dataDir] cartella dei parquet
 * @param {string} [options.dbFile] percorso del file SQLite da scrivere
 * @param {string} [options.moviesParquet]
 * @param {string} [options.tvParquet]
 * @param {number} [options.batchSize=25000]
 * @returns {Promise<{success: true, count: number, perRuolo: object, dbFile: string, dbSizeMb: number, durationMs: number}>}
 */
async function buildPeopleIndex({
    dataDir = defaultDataDir(),
    dbFile,
    moviesParquet,
    tvParquet,
    batchSize = 25000
} = {}) {
    const resolvedDataDir = path.resolve(dataDir);
    const resolvedDbFile = dbFile ? path.resolve(dbFile) : path.join(resolvedDataDir, PEOPLE_DB_FILE);
    const resolvedMovies = moviesParquet ? path.resolve(moviesParquet) : path.join(resolvedDataDir, 'movies.parquet');
    const resolvedTv = tvParquet ? path.resolve(tvParquet) : path.join(resolvedDataDir, 'tv.parquet');

    const haFilm = fs.existsSync(resolvedMovies);
    const haSerie = fs.existsSync(resolvedTv);
    if (!haFilm && !haSerie) {
        throw new Error('Nessun parquet trovato per people.db (movies.parquet / tv.parquet)');
    }

    const tmpDb = `${resolvedDbFile}.tmp`;
    if (fs.existsSync(tmpDb)) {
        try { fs.unlinkSync(tmpDb); } catch (_) { /* niente */ }
    }

    const inizio = Date.now();
    let duckDb = null;
    let con = null;
    let sqlite = null;

    try {
        duckDb = new duckdb.Database(':memory:');
        con = duckDb.connect();

        const righe = await eseguiDuck(con, buildPeopleSelect({
            moviesParquet: haFilm ? resolvedMovies : null,
            tvParquet: haSerie ? resolvedTv : null
        }));

        sqlite = new Database(tmpDb);
        sqlite.pragma('journal_mode = OFF');
        sqlite.pragma('synchronous = OFF');
        sqlite.pragma('cache_size = -64000');
        sqlite.exec(`
            CREATE VIRTUAL TABLE people USING fts5(
                name_norm,
                tmdb_id UNINDEXED,
                name UNINDEXED,
                ruolo UNINDEXED,
                titoli UNINDEXED,
                popolarita UNINDEXED,
                tokenize = 'unicode61 remove_diacritics 2'
            );
            -- Indice delle parole: FTS5 non è fuzzy, e un refuso sul PRIMO token di un nome
            -- («cristopher nolan») non si recupera con un LIKE sul nome intero. Qui ogni parola
            -- ha la sua riga con il rowid della persona: la ricerca per prefisso è un range scan
            -- sull'indice, non una scansione di 600k nomi.
            CREATE TABLE people_words (word TEXT NOT NULL, person_rowid INTEGER NOT NULL);
        `);

        const insert = sqlite.prepare('INSERT INTO people VALUES (?, ?, ?, ?, ?, ?)');
        const insertWord = sqlite.prepare('INSERT INTO people_words VALUES (?, ?)');
        const perRuolo = {};
        let count = 0;
        let batch = [];

        const scrivi = sqlite.transaction((righeBatch) => {
            for (const riga of righeBatch) {
                const info = insert.run(riga[0], riga[1], riga[2], riga[3], riga[4], riga[5]);
                const rowid = Number(info.lastInsertRowid);
                for (const parola of riga[6]) insertWord.run(parola, rowid);
            }
        });

        for (const riga of righe) {
            const nomeNorm = normalizza(riga.nome);
            if (!nomeNorm) continue;
            const ruolo = String(riga.ruolo || 'actor');
            const titoli = Number(riga.titoli) || 0;
            const popolarita = Number(riga.popolarita) || 0;
            const parole = [...new Set(nomeNorm.split(' ').filter(p => p.length >= 2))];
            batch.push([nomeNorm, String(riga.id), String(riga.nome), ruolo, titoli, popolarita, parole]);
            perRuolo[ruolo] = (perRuolo[ruolo] || 0) + 1;
            count += 1;
            if (batch.length >= batchSize) {
                scrivi(batch);
                batch = [];
            }
        }
        if (batch.length > 0) scrivi(batch);

        sqlite.exec('CREATE INDEX people_words_word ON people_words(word);');

        sqlite.close();
        sqlite = null;

        await replaceFile(tmpDb, resolvedDbFile);

        const durationMs = Date.now() - inizio;
        return {
            success: true,
            count,
            perRuolo,
            dbFile: resolvedDbFile,
            dbSizeMb: Number((fs.statSync(resolvedDbFile).size / (1024 * 1024)).toFixed(2)),
            durationMs
        };
    } catch (err) {
        if (sqlite) {
            try { sqlite.close(); } catch (_) { /* niente */ }
        }
        if (fs.existsSync(tmpDb)) {
            try { fs.unlinkSync(tmpDb); } catch (_) { /* niente */ }
        }
        throw err;
    } finally {
        if (con || duckDb) {
            try { await chiudiDuck(con, duckDb); } catch (_) { /* niente */ }
        }
    }
}

// ============================================================================
// LETTURA
// ============================================================================

class PeopleSearchClient {
    constructor({ dbPath = defaultPeopleDbPath(), readOnly = true } = {}) {
        this.dbPath = path.resolve(dbPath);
        this.readOnly = readOnly;
        this.db = null;
        // Un errore di apertura non è per sempre: il file può essere nel mezzo di una riscrittura
        // (il daemon lo sostituisce dopo ogni Tier 2), o il disco può essere occupato un istante.
        // Marcarlo "rotto" per la vita del processo vorrebbe dire che una ricerca `cast`/`regista`
        // resta vuota fino al riavvio: si riprova, ma non a ogni singola query.
        this.brokenUntil = 0;
        this._stmt = null;
        this._stmtRuolo = null;
        this._stmtWords = null;
        this._stmtByRowid = null;
    }

    init() {
        if (this.db) return true;
        if (Date.now() < this.brokenUntil) return false;
        if (!fs.existsSync(this.dbPath)) return false;

        try {
            this.db = new Database(this.dbPath, { readonly: this.readOnly });
            this.db.pragma('cache_size = -16000');
        this._stmt = this.db.prepare(`
            SELECT tmdb_id, name, ruolo, titoli, popolarita
            FROM people
            WHERE people MATCH ?
            ORDER BY popolarita DESC, titoli DESC
            LIMIT ?
        `);
        this._stmtRuolo = this.db.prepare(`
            SELECT tmdb_id, name, ruolo, titoli, popolarita
            FROM people
            WHERE people MATCH ? AND ruolo = ?
            ORDER BY popolarita DESC, titoli DESC
            LIMIT ?
        `);
        this._stmtWords = this.db.prepare(`
            SELECT person_rowid
            FROM people_words
            WHERE word >= ? AND word < ?
            LIMIT ?
        `);
        this._stmtByRowid = this.db.prepare(`
            SELECT tmdb_id, name, ruolo, titoli, popolarita, name_norm
            FROM people
            WHERE rowid IN (SELECT value FROM json_each(?))
        `);
        return true;
        } catch (err) {
            // File corrotto, non-SQLite, permessi: non si riprova a ogni ricerca (sarebbe un log e
            // un'apertura per query), ma nemmeno si rinuncia per sempre. Sessanta secondi di
            // divieto bastano a non tempestare il disco, e a far guarire l'indice da solo appena
            // il file torna leggibile — è la stessa regola dei payload vuoti in cache.
            console.error('[PeopleIndex] Indice non utilizzabile (nuovo tentativo fra 60s):', err.message);
            try { if (this.db) this.db.close(); } catch (_e) { /* niente */ }
            this.db = null;
            this.brokenUntil = Date.now() + 60 * 1000;
            return false;
        }
    }

    /**
     * Cerca una persona. Non solleva: senza indice restituisce `[]`.
     *
     * @param {string} nome
     * @param {object} [options]
     * @param {number} [options.limit=5]
     * @param {'actor'|'director'|'writer'|'creator'|null} [options.ruolo]
     * @param {number} [options.minTitoli=1] scarta gli omonimi con un solo titolo
     * @returns {Array<{tmdbId: string, name: string, ruoli: string[], titoli: number, distanza: number}>}
     */
    search(nome, { limit = 5, ruolo = null, minTitoli = 1 } = {}) {
        if (!this.init()) return [];

        const query = sanitizePeopleQuery(nome);
        if (!query) return [];

        // Si chiedono più righe del limite di PERSONE: le righe sono per (persona, ruolo), quindi
        // tagliare a `limit` prima di aggregare può perdere il secondo ruolo e far dipendere il
        // conteggio dei titoli dalla forma della query ("dicaprio" vs "leonardo dicaprio").
        const righeDaChiedere = Math.min(40, Math.max(limit, limit * 4));

        let righe;
        try {
            righe = ruolo
                ? this._stmtRuolo.all(query, ruolo, righeDaChiedere)
                : this._stmt.all(query, righeDaChiedere);
        } catch (err) {
            console.error('[PeopleIndex] Query FTS error:', err.message);
            righe = [];
        }

        if (righe.length === 0) {
            righe = this._ricercaFuzzy(nome, { limit, ruolo });
        }

        const persone = this._aggrega(righe, Math.max(1, Number(limit) || 5));
        // Il filtro sui titoli si applica DOPO la fusione dei ruoli: una persona che ha un solo
        // film da attore e uno da regista non è un omonimo da scartare.
        const soglia = Math.max(1, Number(minTitoli) || 1);
        return persone.filter(persona => persona.titoli >= soglia);
    }

    /**
     * Ripiego per i refusi: FTS5 non è fuzzy. Si raccolgono i candidati per prefisso di OGNI
     * token (3 caratteri: «cristopher nolan» sbaglia il nome ma «nolan» è giusto) usando
     * `people_words` — un range scan sull'indice — e si misura la distanza di Levenshtein sul
     * nome intero. Costo bounded: `FUZZY_CANDIDATI` rowid per token, solo quando la FTS ha
     * dato zero.
     */
    _ricercaFuzzy(nome, { limit = 5, ruolo = null } = {}) {
        const atteso = normalizza(nome);
        const prefissi = [...new Set(
            atteso.split(' ').filter(t => t.length >= 3).map(t => t.slice(0, 3))
        )];
        if (prefissi.length === 0) return [];

        const rowids = new Set();
        for (const prefisso of prefissi) {
            try {
                // Niente DISTINCT in SQL: con DISTINCT + LIMIT SQLite scandisce tutte le parole
                // del prefisso per deduplicarle. La deduplica la fa il Set qui sotto e il LIMIT
                // ferma il range scan.
                const righe = this._stmtWords.all(prefisso, limitePrefisso(prefisso), FUZZY_CANDIDATI);
                for (const riga of righe) rowids.add(Number(riga.person_rowid));
            } catch (err) {
                console.error('[PeopleIndex] Query fuzzy error:', err.message);
                return [];
            }
        }
        if (rowids.size === 0) return [];

        let candidati;
        try {
            candidati = this._stmtByRowid.all(JSON.stringify([...rowids]));
        } catch (err) {
            console.error('[PeopleIndex] Lettura candidati fuzzy fallita:', err.message);
            return [];
        }

        const trovati = [];
        for (const candidato of candidati) {
            const d = distanza(atteso, candidato.name_norm);
            if (d > DISTANZA_MASSIMA) continue;
            if (ruolo && candidato.ruolo !== ruolo) continue;
            trovati.push({ ...candidato, distanza: d });
        }

        trovati.sort((a, b) => (a.distanza - b.distanza) || (Number(b.popolarita) - Number(a.popolarita)));
        return trovati.slice(0, limit);
    }

    /** Fonde le righe per ruolo nella stessa persona: una persona, i suoi ruoli, i suoi titoli. */
    _aggrega(righe, limite) {
        const perId = new Map();
        for (const riga of righe) {
            const id = String(riga.tmdb_id);
            const titoli = Number(riga.titoli) || 0;
            const popolarita = Number(riga.popolarita) || 0;
            const esistente = perId.get(id);
            if (!esistente) {
                perId.set(id, {
                    tmdbId: id,
                    name: riga.name,
                    ruoli: [riga.ruolo],
                    titoli,
                    popolarita,
                    distanza: riga.distanza !== undefined ? riga.distanza : 0
                });
                continue;
            }
            if (!esistente.ruoli.includes(riga.ruolo)) esistente.ruoli.push(riga.ruolo);
            esistente.titoli += titoli;
            esistente.popolarita += popolarita;
            if (riga.distanza !== undefined) esistente.distanza = Math.min(esistente.distanza, riga.distanza);
        }
        return Array.from(perId.values()).slice(0, limite);
    }

    close() {
        if (this.db) {
            try { this.db.close(); } catch (_) { /* niente */ }
            this.db = null;
            this._stmt = null;
            this._stmtRuolo = null;
            this._stmtWords = null;
            this._stmtByRowid = null;
        }
    }
}


function getPeopleStats({ dataDir = defaultDataDir(), dbFile } = {}) {
    const resolvedDbFile = dbFile ? path.resolve(dbFile) : path.join(path.resolve(dataDir), PEOPLE_DB_FILE);
    const esiste = fs.existsSync(resolvedDbFile);
    let righe = null;
    let sizeMb = 0;

    if (esiste) {
        sizeMb = Number((fs.statSync(resolvedDbFile).size / (1024 * 1024)).toFixed(2));
        try {
            const db = new Database(resolvedDbFile, { readonly: true });
            righe = Number(db.prepare('SELECT count(*) AS count FROM people').get()?.count || 0);
            db.close();
        } catch (_err) {
            righe = null;
        }
    }

    return { dataDir: path.resolve(dataDir), dbFile: resolvedDbFile, exists: esiste, rows: righe, sizeMb };
}

module.exports = {
    PEOPLE_DB_FILE,
    DISTANZA_MASSIMA,
    defaultDataDir,
    defaultPeopleDbPath,
    normalizzaNome: normalizza,
    sanitizePeopleQuery,
    limitePrefisso,
    distanza,
    buildPeopleSelect,
    buildPeopleIndex,
    PeopleSearchClient,
    getPeopleStats
};
