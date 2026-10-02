const fs = require('fs');
const path = require('path');

/**
 * **Promozione Tier 2 → Tier 1**: la scrittura che rende un titolo del catalogo completo.
 *
 * Il Tier 1 (`master_movies.jsonl` / `master_tv.jsonl`) è una riga JSON per titolo. Quando un
 * titolo che sta **solo** nel Tier 2 viene toccato, i suoi dettagli si scaricano una volta e il
 * titolo va **promosso**: questo modulo è l'unico posto che scrive la riga promossa.
 *
 * Il file in produzione è di centinaia di MB, quindi qui si fa **solo append**: niente
 * ricaricamento in memoria, niente riscrittura. `hasTier1Id` scorre il file a blocchi e si ferma
 * appena trova l'id; le righe vuote o malformate si saltano e si continua.
 *
 * **Forma della riga**: è quella delle righe già nel file (verificata su `master_movies.jsonl` e
 * `master_tv.jsonl`), cioè l'oggetto prodotto da `TmdbDumpClient.fetchMovie/fetchTv`, con i campi
 * "annidati" già serializzati come stringhe JSON. L'ordine delle chiavi è quello canonico qui
 * sotto: `read_json_auto` di DuckDB e la conversione in parquet leggono per nome, quindi l'ordine
 * non è funzionale, ma tenerlo identico rende le righe promosse indistinguibili dalle altre.
 *
 * Nota: questo modulo **non** aggancia la promozione a `metaHandler` e **non** ricostruisce i
 * parquet. Scrive la riga e basta; il resto è lavoro di chi chiama.
 */

const CHUNK_SIZE = 1 << 20; // 1 MB: blocchi grossi, ma abbastanza piccoli da non trattenere il file

const TIER1_FILES = {
    movie: 'master_movies.jsonl',
    tv: 'master_tv.jsonl'
};

// Ordine canonico delle chiavi: identico a quello delle righe reali (TmdbDumpClient.fetchMovie /
// fetchTv). `watch_providers_us` sulle serie è in coda perché il campo è arrivato dopo: si replica.
const MOVIE_FIELDS = [
    'cast', 'keywords', 'trailer_key', 'logo_path', 'recommendations',
    'watch_providers_it', 'watch_providers_us',
    'production_companies', 'production_countries', 'spoken_languages', 'genres',
    'id', 'imdb_id', 'title', 'original_title', 'original_language', 'overview', 'release_date',
    'runtime', 'vote_average', 'vote_count', 'popularity', 'status', 'poster_path', 'backdrop_path',
    'directors', 'writers', 'tagline', 'collection_id', 'collection_name', 'content_rating',
    'adult', 'budget', 'revenue', '_fetched_at'
];

const TV_FIELDS = [
    'cast', 'keywords', 'trailer_key', 'logo_path', 'recommendations',
    'watch_providers_it',
    'production_companies', 'production_countries', 'spoken_languages', 'genres',
    'id', 'imdb_id', 'tvdb_id', 'name', 'original_name', 'original_language', 'overview',
    'first_air_date', 'last_air_date', 'number_of_seasons', 'number_of_episodes',
    'vote_average', 'vote_count', 'popularity', 'status', 'in_production', 'type',
    'poster_path', 'backdrop_path', 'created_by', 'networks', 'tagline', 'content_rating',
    'adult', 'runtime', '_fetched_at', 'watch_providers_us'
];

// Nel Tier 1 questi campi sono **stringhe JSON**, non array: è il flattening di
// extractCommonTmdbData. Se il chiamante passa ancora array/oggetti (payload TMDB grezzo) li
// serializziamo qui, così la riga promossa è identica a quella delle righe già nel file.
const JSON_STRING_FIELDS = new Set([
    'cast', 'keywords', 'recommendations', 'production_companies', 'production_countries',
    'spoken_languages', 'genres', 'directors', 'writers', 'created_by', 'networks'
]);

// Watch provider: JSON stringa **o null**, mai `"[]"` (è il risultato di un oggetto intero, non di
// una lista): se manca resta null, come nelle righe già nel file.
const NULLABLE_JSON_FIELDS = new Set(['watch_providers_it', 'watch_providers_us']);

const NUMBER_FIELDS = new Set([
    'id', 'tvdb_id', 'runtime', 'vote_average', 'vote_count', 'popularity', 'collection_id',
    'number_of_seasons', 'number_of_episodes', 'budget', 'revenue'
]);

const BOOLEAN_FIELDS = new Set(['adult', 'in_production']);

// Valori di default per i campi assenti: `null` ovunque, tratti dove il file reale ha un valore
// concreto (i booleani sono sempre presenti, budget/revenue valgono 0 se TMDB non li dà).
const FIELD_DEFAULTS = {
    adult: false,
    in_production: false,
    budget: 0,
    revenue: 0,
    overview: '' // nel file reale è sempre una stringa, vuota quando TMDB non dà niente
};

function defaultDataDir() {
    // Stessa convenzione di tier2Index.defaultDataDir / TmdbDumpStore (che non vogliamo richiedere
    // qui: tirerebbe dentro duckdb e better-sqlite3 per un modulo che scrive una riga).
    if (process.env.TMDB_DUMP_DIR) return path.resolve(process.env.TMDB_DUMP_DIR);
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '../../.cache/tmdb');
}

/** 'movie' | 'tv' a partire da quello che scrive il resto del codice ('movies', 'tv', 'tv_series'…). */
function normalizeTipo(tipo) {
    const value = String(tipo || '').trim().toLowerCase();
    if (value === 'movie' || value === 'movies' || value === 'film') return 'movie';
    if (value === 'tv' || value === 'tvs' || value === 'tv_series' || value === 'serie') return 'tv';
    throw new Error(`Tipo non riconosciuto: "${tipo}" (atteso "movie" o "tv")`);
}

/** Numero, oppure null se non è un id numerico valido. */
function normalizeId(id) {
    if (typeof id === 'number') return Number.isFinite(id) ? Math.trunc(id) : null;
    if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number.parseInt(id.trim(), 10);
    return null;
}

function toJsonString(value) {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '[]';
    return JSON.stringify(value);
}

function toNullableString(value) {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : String(value);
}

function toNumberOrNull(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return null;
}

/** Il percorso del Tier 1 per un tipo, se il chiamante non ne passa uno esplicito. */
function tier1FileFor(tipo, dataDir = null) {
    const tipoNorm = normalizeTipo(tipo);
    return path.join(dataDir ? path.resolve(dataDir) : defaultDataDir(), TIER1_FILES[tipoNorm]);
}

/**
 * La **riga** del Tier 1 per questi dettagli: stesso schema e stesso ordine di chiavi delle righe
 * già nel file, con `id` numerico e `_fetched_at` = momento della promozione (ISO).
 *
 * @param {object} dettagli record del titolo (di norma l'output di TmdbDumpClient.fetchMovie/fetchTv)
 * @param {'movie'|'tv'} tipo
 * @returns {object} la riga, pronta per `JSON.stringify`
 */
function toTier1Line(dettagli, tipo) {
    if (!dettagli || typeof dettagli !== 'object') {
        throw new Error('Dettagli del titolo mancanti: serve un oggetto con almeno `id` e `title`/`name`');
    }
    const tipoNorm = normalizeTipo(tipo);
    const fields = tipoNorm === 'tv' ? TV_FIELDS : MOVIE_FIELDS;

    const id = normalizeId(dettagli.id);
    if (id === null) {
        throw new Error(`Dettagli senza id numerico valido (${JSON.stringify(dettagli.id)})`);
    }

    const fetchedAt = new Date().toISOString();
    const line = {};

    for (const field of fields) {
        if (field === '_fetched_at') {
            line._fetched_at = fetchedAt;
        } else if (field === 'id') {
            line.id = id;
        } else if (JSON_STRING_FIELDS.has(field)) {
            line[field] = toJsonString(dettagli[field]);
        } else if (NULLABLE_JSON_FIELDS.has(field)) {
            const value = dettagli[field];
            line[field] = value === null || value === undefined ? null : toJsonString(value);
        } else if (NUMBER_FIELDS.has(field)) {
            line[field] = toNumberOrNull(dettagli[field]);
        } else if (BOOLEAN_FIELDS.has(field)) {
            line[field] = dettagli[field] === undefined || dettagli[field] === null
                ? FIELD_DEFAULTS[field]
                : Boolean(dettagli[field]);
        } else if (dettagli[field] !== undefined) {
            line[field] = toNullableString(dettagli[field]);
        } else {
            // Campo assente: si mette il default dello schema (null, o 0/''/-false dove il file
            // reale ha un valore concreto).
            line[field] = FIELD_DEFAULTS[field] !== undefined ? FIELD_DEFAULTS[field] : null;
        }
    }

    return line;
}

/** La riga come stringa JSON, cioè esattamente ciò che va appeso al file. */
function toTier1Json(dettagli, tipo) {
    return JSON.stringify(toTier1Line(dettagli, tipo));
}

/** Righe del file, a blocchi: non tiene in memoria niente più del blocco corrente. */
async function* readLines(filePath, chunkSize = CHUNK_SIZE) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: chunkSize });
    // Se il file non si può aprire (permessi, rotto) non deve diventare una rejection non gestita:
    // per `hasTier1Id` vuol dire semplicemente "non c'è".
    stream.on('error', () => {});
    let pending = '';
    try {
        for await (const chunk of stream) {
            pending += chunk;
            const lines = pending.split('\n');
            pending = lines.pop(); // l'ultimo pezzo può essere una riga incompleta
            for (const line of lines) yield line;
        }
        if (pending) yield pending;
    } finally {
        // Anche in caso di uscita anticipata (id trovato) il file va chiuso **prima** di tornare:
        // su Windows un handle aperto blocca le operazioni successive sul file.
        stream.destroy();
        if (!stream.closed) await new Promise((resolve) => stream.once('close', resolve));
    }
}

/**
 * L'id è già nel file? Si scorre a blocchi e si esce appena trovato: il file in produzione pesa
 * centinaia di MB e non deve finire in memoria.
 *
 * Le righe vuote o malformate non sono un errore: si saltano e si continua. Solo la riga che
 * contiene l'id viene parsed, e la risposta la decide il suo `id` di primo livello (le righe hanno
 * dentro di sé stringhe JSON con altri `"id":`).
 *
 * @param {string} filePath percorso del `master_*.jsonl`
 * @param {number|string} id
 * @returns {Promise<boolean>} false anche se il file non esiste
 */
async function hasTier1Id(filePath, id) {
    const targetId = normalizeId(id);
    if (targetId === null) throw new Error(`Id non valido per la ricerca: ${JSON.stringify(id)}`);

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return false;

    // Prefiltro: se la riga non contiene l'id, non la si(parsed). Regex unica per tutto il file.
    const candidate = new RegExp(`"id"\\s*:\\s*${targetId}\\s*[,}]`);

    for await (const line of readLines(resolved)) {
        if (line.length < 8) continue; // riga vuota o spazzatura
        if (!candidate.test(line)) continue;
        let row;
        try {
            row = JSON.parse(line);
        } catch (_err) {
            continue; // riga malformata: si continua con la successiva
        }
        if (row && normalizeId(row.id) === targetId) return true;
    }

    return false;
}

/** Il file è già finito con un newline? Se no, la riga nuova va staccata a mano. */
function endsWithNewline(filePath) {
    if (!fs.existsSync(filePath)) return true; // verrà creato: niente da staccare
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return true;
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(1);
        fs.readSync(fd, buffer, 0, 1, stat.size - 1);
        return buffer[0] === 0x0a;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Promuove un titolo nel Tier 1: se l'id c'è già non scrive niente, altrimenti **appende** una
 * riga sola (il file non viene mai riscritto). Se il file non esiste, viene creato.
 *
 * @param {string} [filePath] percorso del `master_*.jsonl` (default: cartella dati + tipo)
 * @param {object} dettagli record del titolo (output di TmdbDumpClient.fetchMovie/fetchTv)
 * @param {'movie'|'tv'} tipo
 * @returns {Promise<{scritto: boolean, motivo: string, id: number, tipo: string, percorso: string}>}
 */
async function promoteToTier1(filePath, dettagli, tipo) {
    const tipoNorm = normalizeTipo(tipo);
    const line = toTier1Line(dettagli, tipoNorm);
    const resolved = path.resolve(filePath || tier1FileFor(tipoNorm));

    const base = { id: line.id, tipo: tipoNorm, percorso: resolved };

    if (await hasTier1Id(resolved, line.id)) {
        return { ...base, scritto: false, motivo: `id ${line.id} già presente nel Tier 1: niente scritto` };
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    // Il file in produzione è grosso: append puro. Se l'ultima riga non era chiusa (file troncato
    // o scritto a mano), si stacca con un newline invece di incollare la riga nuova a quella rotta.
    const prefix = endsWithNewline(resolved) ? '' : '\n';
    fs.appendFileSync(resolved, `${prefix}${JSON.stringify(line)}\n`, 'utf8');

    return { ...base, scritto: true, motivo: `id ${line.id} promosso: riga aggiunta in coda` };
}

module.exports = {
    toTier1Line,
    toTier1Json,
    hasTier1Id,
    promoteToTier1,
    tier1FileFor,
    normalizeTipo,
    normalizeId,
    TIER1_FILES,
    MOVIE_FIELDS,
    TV_FIELDS
};