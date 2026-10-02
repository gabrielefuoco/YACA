#!/usr/bin/env node
/**
 * push-diff-in-coda.js
 * Spinge nella **coda degli eventi** i cambi di doppiaggio dell'ultimo giro.
 *
 * PERCHÉ ESISTE: `services/doppiaggi-source` confronta il giro nuovo con il precedente e scrive
 * `ita_annotations.diff.json` (ogni poster composto è un file statico: se un titolo è diventato
 * doppiato, o ha smesso di esserlo, quel file è vecchio e va rifatto). Questo script è il ponte:
 * legge quell'artefatto e mette in coda `push({tipo, id, badge})` per ogni cambiamento, così il
 * drenatore (`take`/`done`, un passo dopo) ha il lavoro da fare senza dover sapere nulla di scraping.
 *
 * USO
 *   node scripts/push-diff-in-coda.js                      # percorso di default
 *   node scripts/push-diff-in-coda.js --file /data/tmdb/ita_annotations.diff.json
 *   ITA_DIFF_PATH=/data/tmdb/ita_annotations.diff.json node scripts/push-diff-in-coda.js
 *   node scripts/push-diff-in-coda.js --dry-run            # legge e conta, non spinge nulla
 *
 * DOVE STA IL FILE: `--file`, altrimenti `ITA_DIFF_PATH`, altrimenti la stessa risoluzione dei
 * dump (`ITA_DIFF_DIR` → `ITA_ANNOTATIONS_DIR` → `TMDB_DUMP_DIR` → `/data/tmdb` se esiste →
 * `.cache/tmdb` in locale). In produzione i file vivono in `/data/tmdb/`.
 *
 * IDEMPOTENTE, e non per merito nostro: è `codaEventi.push` a deduplicare (stesso `tipo` + stesso
 * `id` già in attesa ⇒ non entra una seconda volta, `HSETNX`). Qui non c'è nessun memo e nessun
 * file di stato: rilanciare lo script sullo stesso artefatto non può raddoppiare nulla, e non
 * può nemmeno perdere un evento se il file è lo stesso. Va detto perché è una proprietà che
 * *gira su un timer*: se il drenatore è fermo e il timer passa due volte, la coda deve restare quella.
 *
 * SILENZIOSO, MAI: questo script gira dentro un timer. Un file assente, illeggibile o malformato
 * è una condizione attesa (il giro delle 04:00 non è ancora passato, il file è in scrittura, il
 * diff è di un altro formato) e non è un errore: si dice perché e si esce con 0. Solo un guasto
 * vero dello script esce diversamente.
 */

const fs = require('fs');
const path = require('path');
const codaEventi = require('../src/cache/codaEventi');
const redisClient = require('../src/cache/redisClient');

const FILE_NAME = 'ita_annotations.diff.json';

/**
 * Stessa risoluzione dei dump di `src/data/itaAnnotations.js`: in produzione `/data/tmdb`,
 * in locale la cache del catalogo. Il default non è un dettaglio: se il percorso fosse sbagliato
 * lo script direbbe "file assente" ogni volta e nessuno se ne accorgerebbe.
 */
function dirDati(env = process.env) {
    if (env.ITA_DIFF_DIR) return env.ITA_DIFF_DIR;
    if (env.ITA_ANNOTATIONS_DIR) return env.ITA_ANNOTATIONS_DIR;
    if (env.TMDB_DUMP_DIR) return env.TMDB_DUMP_DIR;
    if (fs.existsSync('/data')) return '/data/tmdb';
    return path.resolve(__dirname, '..', '.cache', 'tmdb');
}

function percorsoDiffDefault(env = process.env) {
    if (env.ITA_DIFF_PATH) return path.resolve(env.ITA_DIFF_PATH);
    return path.join(dirDati(env), FILE_NAME);
}

function parseArgs(argv = [], env = process.env) {
    const opts = { filePath: percorsoDiffDefault(env), dryRun: false, help: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--file' || arg === '--diff') {
            const valore = argv[++i];
            if (!valore) throw new Error(`${arg} richiede un percorso`);
            opts.filePath = path.resolve(valore);
        } else if (arg === '--dry-run') {
            opts.dryRun = true;
        } else if (arg === '--help' || arg === '-h') {
            opts.help = true;
        }
    }
    return opts;
}

function printHelp() {
    console.log(`
Legge ${FILE_NAME} (l'artefatto del diff di services/doppiaggi-source) e spinge ogni
cambiamento nella coda degli eventi: push({tipo, id, badge}).

Uso:
  node scripts/push-diff-in-coda.js [opzioni]

Opzioni:
  --file <path>   Percorso dell'artefatto diff
                  (default: $ITA_DIFF_PATH, altrimenti la cartella dei dump: /data/tmdb)
  --dry-run       Legge l'artefatto e conta i cambiamenti senza accodare nulla
  --help, -h      Mostra questa guida

La deduplica è della coda (stesso tipo + stesso id già in attesa): rilanciare lo script
sullo stesso artefatto non raddoppia nulla.
`);
}

/**
 * Legge e valida l'artefatto. Non lancia: ogni motivo di rinuncia è un `motivo` e un `ok: false`.
 * @returns {{ok: boolean, artefatto: object|null, motivo: string|null}}
 */
function leggiArtefatto(filePath) {
    if (!fs.existsSync(filePath)) {
        return { ok: false, artefatto: null, motivo: `file assente (${filePath})` };
    }

    let testo;
    try {
        testo = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        // Anche una cartella o un permesso negato finiscono qui: non è un artefatto da leggere.
        return { ok: false, artefatto: null, motivo: `file illeggibile (${err.code || err.message})` };
    }

    let artefatto;
    try {
        artefatto = JSON.parse(testo);
    } catch (err) {
        return { ok: false, artefatto: null, motivo: `JSON malformato (${err.message})` };
    }

    if (!artefatto || typeof artefatto !== 'object' || Array.isArray(artefatto)) {
        return { ok: false, artefatto: null, motivo: 'il file non contiene un oggetto JSON' };
    }
    if (!Array.isArray(artefatto.changes)) {
        return { ok: false, artefatto: null, motivo: 'il file non ha una lista `changes` (formato diverso?)' };
    }

    return { ok: true, artefatto, motivo: null };
}

/**
 * Un cambiamento diventa un evento `{tipo, id, badge}`; quello che non ha un `tipo` o un `id`
 * leggibili viene scartato (contato, nonNascosto). Il `badge` si conserva com'è, `null` compreso:
 * togliere il badge è un lavoro come metterlo, e la coda sa distinguerlo (`ITA` vs `null`).
 */
function eventoDaCambio(cambio) {
    if (!cambio || typeof cambio !== 'object') return null;

    const tipo = typeof cambio.tipo === 'string' ? cambio.tipo.trim() : '';
    let id = '';
    if (typeof cambio.id === 'number' && Number.isFinite(cambio.id)) id = String(cambio.id);
    else if (typeof cambio.id === 'string' && cambio.id.trim()) id = cambio.id.trim();

    if (!tipo || !id) return null;
    return { tipo, id, badge: cambio.badge === undefined ? null : cambio.badge };
}

function eventiDaArtefatto(artefatto) {
    const eventi = [];
    let scartati = 0;
    for (const cambio of artefatto.changes || []) {
        const evento = eventoDaCambio(cambio);
        if (evento) eventi.push(evento);
        else scartati++;
    }
    return { eventi, scartati };
}

/**
 * Il giro completo: leggi l'artefatto, spinge ogni cambiamento nella coda.
 *
 * Non lancia mai: file assente, illeggibile o malformato sono condizioni attese dentro un timer,
 * quindi tornano con un `motivo` e zero eventi. La deduplica è della coda, non qui.
 *
 * @param {object} [opts]
 * @param {string} [opts.filePath] percorso dell'artefatto
 * @param {{push: Function}} [opts.coda] la coda (default: quella dell'app)
 * @param {object} [opts.log] logger
 * @param {boolean} [opts.dryRun] conta senza accodare
 * @returns {Promise<{filePath:string, eventi:number, spinte:number, giaInCoda:number,
 *                    scartati:number, primoGiro:boolean, motivo:string|null}>}
 */
async function pushDiffInCoda(opts = {}) {
    const {
        filePath = percorsoDiffDefault(),
        coda = codaEventi,
        log = console,
        dryRun = false
    } = opts;

    const riassunto = {
        filePath,
        eventi: 0,
        spinte: 0,
        giaInCoda: 0,
        scartati: 0,
        primoGiro: false,
        motivo: null
    };

    const lettura = leggiArtefatto(filePath);
    if (!lettura.ok) {
        riassunto.motivo = lettura.motivo;
        log.log(`[PushDiff] ${lettura.motivo}: nessun evento da spingere.`);
        return riassunto;
    }

    const artefatto = lettura.artefatto;
    riassunto.primoGiro = artefatto.primoGiro === true;

    const { eventi, scartati } = eventiDaArtefatto(artefatto);
    riassunto.eventi = eventi.length;
    riassunto.scartati = scartati;

    if (scartati > 0) {
        log.warn(`[PushDiff] ${scartati} cambi senza tipo/id leggibili: scartati, gli altri ${eventi.length} vanno in coda.`);
    }

    // Il tetto sui 5.000 cambi lo mette `diff.js` quando scrive: qui è un avviso, non un blocco.
    // L'artefatto porta il numero vero e il drenatore beve a lotto: bloccarlo lascerebbe poster
    // vecchi per un numero che è già stato detto ad alta voce.
    if (artefatto.oltreSoglia === true) {
        log.warn(`[PushDiff] ATTENZIONE: artefatto oltre il tetto (${artefatto.cambiati} cambi). Vengo spinti lo stesso.`);
    }

    if (riassunto.primoGiro) {
        log.log('[PushDiff] artefatto di primo giro: nessun evento per contratto.');
    }

    if (dryRun) {
        log.log(`[PushDiff] dry-run: ${eventi.length} cambiamenti in ${path.basename(filePath)}, nessuno spinto.`);
        return riassunto;
    }

    for (const evento of eventi) {
        let accodato = false;
        try {
            accodato = await coda.push(evento);
        } catch (err) {
            // `codaEventi` non lancia mai; si è qui perché un `push` finto o un futuro coda
            // diverso non deve trasformare un problema in un'eccezione non gestita dentro un timer.
            log.warn(`[PushDiff] push fallito per ${evento.tipo}:${evento.id}: ${err.message}`);
        }
        if (accodato) riassunto.spinte++;
        else riassunto.giaInCoda++;
    }

    log.log(`[PushDiff] ${riassunto.eventi} cambiamenti in ${path.basename(filePath)}: ` +
        `${riassunto.spinte} spinte adesso, ${riassunto.giaInCoda} non spinte ` +
        `(già in attesa, oppure coda non raggiungibile).`);

    return riassunto;
}

/** Chiude il client Redis condiviso: senza, il processo resterebbe vivo sul socket. */
async function chiudiRedis() {
    if (typeof redisClient.quit !== 'function') return;
    try {
        await redisClient.quit();
    } catch (_) { /* era già chiuso: niente da dire */ }
}

async function main(argv = process.argv.slice(2), env = process.env) {
    let opts;
    try {
        opts = parseArgs(argv, env);
    } catch (err) {
        console.error(`[PushDiff] ${err.message}`);
        return 1;
    }

    if (opts.help) {
        printHelp();
        return 0;
    }

    try {
        // REDIS_URL (e il resto dell'ambiente) stanno nel .env dell'app, come negli altri script.
        try { require('dotenv').config(); } catch (_) { /* dotenv assente: si usa l'ambiente com'è */ }
        await pushDiffInCoda(opts);
        return 0;
    } catch (err) {
        // A questo punto è un guasto vero dello script (non un file che non c'è): si dice forte.
        console.error('[PushDiff] errore inatteso:', err);
        return 1;
    } finally {
        await chiudiRedis();
    }
}

if (require.main === module) {
    // watchdog non ref': se per un motivo qualunque il processo restasse appeso sul socket Redis,
    // il timer deve comunque finire. `unref` così non tiene vivo il loop da solo.
    const watchdog = setTimeout(() => process.exit(process.exitCode || 0), 5000);
    watchdog.unref();

    main().then((codice) => { process.exitCode = codice; });
}

module.exports = {
    FILE_NAME,
    dirDati,
    percorsoDiffDefault,
    parseArgs,
    leggiArtefatto,
    eventoDaCambio,
    eventiDaArtefatto,
    pushDiffInCoda,
    main
};
