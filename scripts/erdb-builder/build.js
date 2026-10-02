#!/usr/bin/env node
/**
 * Costruisce in locale la cache dei poster di EasyRatingsDB (ERDB).
 *
 * Il giro dura ore e va potenzialmente interrotto, quindi la regola che conta e':
 * se il file di destinazione esiste gia' e NON e' vuoto, si salta e basta.
 * Un file vuoto (o un download abortito) viene invece rifatto.
 *
 * Uso:
 *   node scripts/erdb-builder/build.js --list titoli.jsonl --base https://easyratingsdb.com/CHIAVE --out cache/erdb
 *
 * Opzioni:
 *   --list <file>        lista JSONL, una riga per titolo: {"erdbId":"tmdb:movie:27205","badge":"ITA"}
 *   --base <url>         base ERDB (obbligatoria)
 *   --out <dir>          cartella di destinazione (creata se manca)
 *   --delay <ms>         pausa fra una richiesta e l'altra (default 300)
 *   --concurrency <n>    worker in parallelo (default 1: servizio di una persona sola)
 *
 * Alla fine scrive <out>/report.json con resi / saltati / falliti e i motivi dei fallimenti.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DELAY = 300;
const DEFAULT_CONCURRENCY = 1;
const REPORT_FILE = 'report.json';

// ---------------------------------------------------------------------------
// Funzioni pure (testabili senza rete e senza filesystem)
// ---------------------------------------------------------------------------

/**
 * Ripulisce l'`erdbId` per usarlo come nome file.
 * I ':' che separano i segmenti (`tmdb:movie:27205`) non possono stare in un
 * nome file: diventano trattini, quindi `tmdb-movie-27205`.
 * Il formato dell'`erdbId` NON viene reinterpretato qui: lo produce gia' la funzione
 * `getErdbId` dell'app, che resta l'unica fonte di verita.
 */
function sanitizeErdbId(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .trim()
        .replace(/[^A-Za-z0-9._-]+/g, '-') // i ':' (e qualsiasi altro separatore) -> '-'
        .replace(/^[-._]+|[-._]+$/g, '');
}

/** Ripulisce un pezzo di nome file mantenendolo leggibile e deterministico. */
function sanitizePart(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * Nome file deterministico per un poster: `tmdb-movie-27205_ITA.jpg`.
 * Funzione pura: stesse voci in ingresso -> stesso nome in uscita, sempre.
 */
function posterFileName(entry) {
    const erdbId = sanitizeErdbId(entry.erdbId);
    if (!erdbId) {
        throw new Error(`campo "erdbId" mancante o non valido: ${JSON.stringify(entry)}`);
    }
    const badge = entry.badge === undefined || entry.badge === null || entry.badge === ''
        ? ''
        : `_${sanitizePart(entry.badge)}`;
    return `${erdbId}${badge}.jpg`;
}

/**
 * URL del poster: `{base}/poster/{erdbId}.jpg?badge={badge}` (badge omesso se assente).
 * L'`erdbId` va nel path cosi' com'e', come nell'app: i ':' sono leciti in un path segment.
 */
function posterUrl(base, entry) {
    const cleanBase = String(base).replace(/\/+$/, '');
    const url = `${cleanBase}/poster/${entry.erdbId}.jpg`;
    if (entry.badge === undefined || entry.badge === null || entry.badge === '') {
        return url;
    }
    return `${url}?badge=${encodeURIComponent(entry.badge)}`;
}

/**
 * Decide se un file gia' presente puo' essere considerato riusato.
 * `stats` e' il risultato di fs.stat: esiste solo se non e' null.
 * Vuoto = 0 byte: un download abortito non deve bloccare la ripresa.
 */
function isReusable(stats) {
    return Boolean(stats) && stats.isFile() && stats.size > 0;
}

/** I byte scaricati sono un'immagine? (ERDBpuo' rispondere con una pagina di errore HTML) */
function isUsableImage(buffer, contentType) {
    const isImageContentType = typeof contentType === 'string' && /^image\//i.test(contentType.trim());
    if (isImageContentType) return true;
    return Buffer.isBuffer(buffer) && buffer.length >= 3 &&
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * Normalizza una riga JSONL in `{erdbId, badge}` oppure lancia.
 * L'`erdbId` arriva gia' pronto dalla lista (lo produce `getErdbId` nell'app):
 * qui non si applicano le regole di conversione, cosi' resta una sola fonte di verita'.
 */
function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new Error('la riga non e\' un oggetto JSON');
    }
    const erdbId = raw.erdbId === undefined || raw.erdbId === null ? '' : String(raw.erdbId).trim();
    if (!erdbId) throw new Error('campo "erdbId" mancante');
    const badge = raw.badge === undefined || raw.badge === null ? '' : String(raw.badge).trim();
    return { erdbId, badge };
}

/**
 * Legge il JSONL. Righe vuote e commenti (`#`) vengono ignorati.
 * Le righe rotte finiscono in `errors` invece di far esplodere tutto il giro.
 */
function parseJsonl(text) {
    const entries = [];
    const errors = [];
    const lines = String(text).split(/\r?\n/);
    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        let raw;
        try {
            raw = JSON.parse(trimmed);
        } catch (err) {
            errors.push({ line: lineNumber, motivo: `JSON non valido: ${err.message}` });
            return;
        }
        try {
            entries.push(normalizeEntry(raw));
        } catch (err) {
            errors.push({ line: lineNumber, motivo: err.message });
        }
    });
    return { entries, errors };
}

/** Costruisce l'oggetto di report.json. */
function buildReport({ total, resi, saltati, falliti, fallimenti, durataMs, startedAt, finishedAt }) {
    const secondi = Math.round(durataMs / 1000);
    const minuti = Math.floor(secondi / 60);
    return {
        generatoIl: new Date(finishedAt).toISOString(),
        iniziatoIl: new Date(startedAt).toISOString(),
        totale: total,
        resi,
        saltati,
        falliti,
        durataMs,
        durata: `${minuti}m ${String(secondi % 60).padStart(2, '0')}s`,
        fallimenti
    };
}

/** --delay / --concurrency: interi positivi. */
function toPositiveInt(value, flag) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${flag} deve essere un intero >= 1 (ricevuto: ${value})`);
    }
    return parsed;
}

/** Parsing degli argomenti CLI. Supporta sia `--flag valore` sia `--flag=valore`. */
function parseArgs(argv = []) {
    const options = {
        base: null,
        list: null,
        out: null,
        delay: DEFAULT_DELAY,
        concurrency: DEFAULT_CONCURRENCY,
        help: false
    };

    const readValue = (flag, inline, indexRef) => {
        if (inline !== null) return inline;
        const value = argv[indexRef.value + 1];
        if (value === undefined) throw new Error(`Manca il valore di ${flag}`);
        indexRef.value += 1;
        return value;
    };

    const indexRef = { value: 0 };
    for (; indexRef.value < argv.length; indexRef.value++) {
        const arg = argv[indexRef.value];
        if (!arg.startsWith('-')) throw new Error(`Argomento sconosciuto: ${arg}`);

        const eq = arg.indexOf('=');
        const flag = eq === -1 ? arg : arg.slice(0, eq);
        const inline = eq === -1 ? null : arg.slice(eq + 1);

        switch (flag) {
            case '--base': options.base = readValue(flag, inline, indexRef); break;
            case '--list': options.list = readValue(flag, inline, indexRef); break;
            case '--out': options.out = readValue(flag, inline, indexRef); break;
            case '--delay': options.delay = toPositiveInt(readValue(flag, inline, indexRef), flag); break;
            case '--concurrency':
                options.concurrency = toPositiveInt(readValue(flag, inline, indexRef), flag);
                break;
            case '--help':
            case '-h': options.help = true; break;
            default: throw new Error(`Argomento sconosciuto: ${flag}`);
        }
    }

    return options;
}

const HELP = [
    'Costruisce la cache locale dei poster ERDB (ripartibile: salta i file gia\' scaricati).',
    '',
    '  --list <file>       lista JSONL: {"erdbId":"tmdb:movie:27205","badge":"ITA"}',
    '  --base <url>        base ERDB, obbligatoria',
    '  --out <dir>         cartella di destinazione',
    `  --delay <ms>        pausa fra le richieste (default ${DEFAULT_DELAY})`,
    `  --concurrency <n>   worker in parallelo (default ${DEFAULT_CONCURRENCY})`,
    '  --help              questo messaggio'
].join('\n');

// ---------------------------------------------------------------------------
// Logica con I/O (iniettabile, cosi' i test non toccano la rete)
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scarica un poster. Scrive su file temporaneo e poi rinomina: niente file a meta'. */
async function downloadPoster(entry, { base, outDir, fetchImpl = globalThis.fetch }) {
    const fileName = posterFileName(entry);
    const target = path.join(outDir, fileName);
    const url = posterUrl(base, entry);
    const response = await fetchImpl(url);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isUsableImage(buffer, response.headers && response.headers.get('content-type'))) {
        throw new Error(`risposta non e' un'immagine (${buffer.length} byte)`);
    }

    const tmp = `${target}.tmp`;
    await fs.promises.writeFile(tmp, buffer);
    await fs.promises.rename(tmp, target);
    return { fileName, target, bytes: buffer.length };
}

/**
 * Gira il ciclo di download con ripresa.
 * Opzioni: { list, base, out, delay, concurrency, fetchImpl, onProgress, shouldStop }
 */
async function run({
    list,
    base,
    out,
    delay = DEFAULT_DELAY,
    concurrency = DEFAULT_CONCURRENCY,
    fetchImpl = globalThis.fetch,
    onProgress = null,
    shouldStop = null
} = {}) {
    const startedAt = Date.now();
    const outDir = out;
    await fs.promises.mkdir(outDir, { recursive: true });

    const text = await fs.promises.readFile(list, 'utf8');
    const { entries, errors } = parseJsonl(text);

    for (const err of errors) {
        console.error(`Riga ${err.line} ignorata: ${err.motivo}`);
    }

    const fallimenti = [
        ...errors.map((err) => ({ riga: err.line, motivo: err.motivo }))
    ];

    let resi = 0;
    let saltati = 0;
    const cursore = { index: 0 };

    const worker = async () => {
        while (cursore.index < entries.length) {
            if (shouldStop && shouldStop()) return;
            const entry = entries[cursore.index];
            const position = cursore.index;
            cursore.index += 1;

            const fileName = posterFileName(entry);
            const target = path.join(outDir, fileName);
            // stats resta null se il file non esiste: in quel caso lo scarichiamo.
            const stats = await fs.promises.stat(target).catch(() => null);

            // La regola chiave: esiste e non e' vuoto -> si salta.
            if (isReusable(stats)) {
                saltati += 1;
                if (onProgress) onProgress({ entry, esito: 'saltato', posizione: position + 1, totale: entries.length });
                continue;
            }

            try {
                const result = await downloadPoster(entry, { base, outDir, fetchImpl });
                resi += 1;
                if (onProgress) onProgress({ entry, esito: 'reso', bytes: result.bytes, posizione: position + 1, totale: entries.length });
            } catch (err) {
                fallimenti.push({
                    erdbId: entry.erdbId,
                    badge: entry.badge,
                    file: fileName,
                    motivo: err && err.message ? err.message : String(err)
                });
                if (onProgress) onProgress({ entry, esito: 'fallito', motivo: err.message, posizione: position + 1, totale: entries.length });
            }

            // Cortesia: pausa dopo ogni richiesta (non dopo quelle saltate).
            if (delay > 0 && position < entries.length - 1) {
                await sleep(delay);
            }
        }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, Math.max(entries.length, 1)); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    const finishedAt = Date.now();
    const report = buildReport({
        total: entries.length,
        resi,
        saltati,
        falliti: fallimenti.length,
        fallimenti,
        durataMs: finishedAt - startedAt,
        startedAt,
        finishedAt
    });

    await fs.promises.writeFile(
        path.join(outDir, REPORT_FILE),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
    );

    return report;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv = process.argv.slice(2)) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (err) {
        console.error(`${err.message}\n\n${HELP}`);
        process.exitCode = 1;
        return null;
    }

    if (options.help) {
        console.log(HELP);
        return null;
    }

    const mancanti = ['base', 'list', 'out'].filter((k) => !options[k]);
    if (mancanti.length) {
        console.error(`Opzioni obbligatorie mancanti: ${mancanti.map((k) => `--${k}`).join(', ')}\n\n${HELP}`);
        process.exitCode = 1;
        return null;
    }

    let fermarsi = false;
    process.on('SIGINT', () => {
        if (fermarsi) process.exit(130);
        fermarsi = true;
        console.log('\nInterrotto: finisco il titolo corrente e salvo il report. Rilancia lo stesso comando per riprendere.');
    });

    const report = await run({
        list: options.list,
        base: options.base,
        out: options.out,
        delay: options.delay,
        concurrency: options.concurrency,
        onProgress: ({ esito, entry, posizione, totale }) => {
            const etichetta = `${entry.erdbId}${entry.badge ? ` (${entry.badge})` : ''}`;
            if (esito === 'reso') console.log(`[${posizione}/${totale}] reso    ${etichetta}`);
            else if (esito === 'saltato') console.log(`[${posizione}/${totale}] saltato ${etichetta}`);
            else console.log(`[${posizione}/${totale}] FALLITO ${etichetta}`);
        },
        shouldStop: () => fermarsi
    });

    console.log(`\nFatto: ${report.resi} resi, ${report.saltati} saltati, ${report.falliti} falliti in ${report.durata}`);
    console.log(`Report: ${path.join(options.out, REPORT_FILE)}`);
    if (report.falliti > 0) process.exitCode = 2;
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_DELAY,
    DEFAULT_CONCURRENCY,
    REPORT_FILE,
    HELP,
    sanitizePart,
    sanitizeErdbId,
    posterFileName,
    posterUrl,
    isReusable,
    isUsableImage,
    normalizeEntry,
    parseJsonl,
    buildReport,
    parseArgs,
    downloadPoster,
    run,
    main
};