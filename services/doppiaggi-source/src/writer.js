/**
 * writer.js
 * Scrittura del file delle annotazioni doppiaggio ITA.
 *
 * FORMATO (deciso dal ticket 04 della mappa `.scratch/doppiaggio-ita`):
 * NDJSON, una riga per voce:
 *     {"t":"movie","id":123,"ita":true}
 *     {"t":"tv","id":456,"ita":null}
 * - chiave **(tipo, id)**: 5.933 id TMDB vivono in *entrambe* le tabelle (movies e tv), quindi il tipo
 *   fa parte della chiave e non può essere omesso;
 * - nel file finiscono **solo** `true` e `null`: l'**assenza di riga vale `false`** (i titoli con scrittura
 *   non latina non entrano nel file, e restano fuori per costruzione);
 * - accanto c'è un `*.meta.json` con i conteggi e il timestamp: serve alla guardia qui sotto e al core.
 *
 * Il **parquet tipato** lo materializza il **core** (che ha già DuckDB) leggendo questo file: qui non
 * entrano dipendenze native, il modulo resta senza dipendenze.
 *
 * GUARDIA: il file non deve mai diventare più povero del precedente. Se i `true` calano oltre il 2%
 * rispetto al meta esistente, **non si sovrascrive** e si restituisce `reason: 'guard'`. È una regola del
 * *file* (l'ultimo valido resta valido); il **merge** nel catalogo ha invece scelto di non bloccare mai
 * il dump — sono due posti diversi, con due decisioni diverse.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DEFAULT_FILENAME = 'ita_annotations.jsonl';
const GUARD_THRESHOLD = 0.02;

/** `ita_annotations.jsonl` -> `ita_annotations.meta.json` (nella stessa cartella) */
function metaPathFor(outputPath) {
    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath).replace(/\.jsonl$/i, '');
    return path.join(dir, `${base}.meta.json`);
}

/** Da `tmdb:movie:123` + tipo -> `{ t: 'movie', id: 123 }`. Il tipo dell'id vince su quello della card. */
function splitId(id, type, explicitT) {
    if (explicitT === 'movie' || explicitT === 'tv') {
        return { t: explicitT, id: Number(id) };
    }
    const parts = String(id || '').split(':');
    const numeric = Number(parts[parts.length - 1]);
    const fromId = parts[1] === 'movie' || parts[1] === 'tv' ? parts[1] : null;
    return { t: fromId || (type === 'movie' ? 'movie' : 'tv'), id: numeric };
}

/**
 * Dalle annotazioni del matcher alle righe del file: solo `true`/`null`, in ordine stabile
 * (tipo, id) per avere diff leggibili e file confrontabili fra un giro e l'altro.
 * @param {Array<{id:string,type:string,ita:boolean|null,t?:string}>} annotations
 */
function toRows(annotations) {
    const rows = [];
    for (const a of annotations || []) {
        if (!a || (a.ita !== true && a.ita !== null)) continue; // false (e tutto il resto) = assente dal file
        // `splitId(id, type, explicitT)`: una riga già strutturata ha `t` e nessun `type`, e il `t` esplicito
        // deve vincere sul prefisso dell'id. (Le due correzioni concorrenti dello stesso bug erano equivalenti:
        // teniamo quella che passa il `t` come parametro dedicato.)
        const { t, id } = splitId(a.id, a.type, a.t);
        if (!Number.isFinite(id)) continue;
        rows.push({ t, id, ita: a.ita === true ? true : null });
    }
    rows.sort((x, y) => (x.t === y.t ? x.id - y.id : x.t < y.t ? -1 : 1));
    return rows;
}

function readPreviousMeta(metaPath) {
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (_) {
        return null;
    }
}

/**
 * Scrive le annotazioni.
 *
 * @param {Array} annotations output di `matchCatalog().annotations`
 * @param {object} [opts]
 * @param {string} [opts.outputPath] percorso del `.jsonl` (obbligatorio se non è dry-run)
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.respectGuard=true] disattivabile nei test
 * @param {string} [opts.source] nome della fonte annotato nel meta
 * @param {number} [opts.guardThreshold] soglia di calo ammessa sui `true` (default 2%)
 * @returns {Promise<{written:boolean, reason?:string, path:string|null, metaPath?:string, count:number,
 *                    counts:{rows:number,true:number,null:number}, previous?:object|null}>}
 */
async function writeAnnotations(annotations, opts = {}) {
    const rows = toRows(annotations);
    const counts = {
        rows: rows.length,
        true: rows.filter((r) => r.ita === true).length,
        null: rows.filter((r) => r.ita === null).length
    };

    if (opts.dryRun) {
        return { written: false, reason: 'dry-run', path: opts.outputPath || null, count: rows.length, counts };
    }

    if (!opts.outputPath) {
        throw new Error('writeAnnotations: outputPath è obbligatorio quando non è dry-run');
    }

    const outputPath = opts.outputPath;
    const metaPath = metaPathFor(outputPath);
    const previous = readPreviousMeta(metaPath);
    const threshold = typeof opts.guardThreshold === 'number' ? opts.guardThreshold : GUARD_THRESHOLD;

    if (opts.respectGuard !== false && previous && previous.counts && previous.counts.true > 0) {
        const floor = previous.counts.true * (1 - threshold);
        if (counts.true < floor) {
            return {
                written: false,
                reason: 'guard',
                path: outputPath,
                metaPath,
                count: rows.length,
                counts,
                previous
            };
        }
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tmpPath = `${outputPath}.tmp`;
    const body = rows.length ? `${rows.map((r) => JSON.stringify(r)).join('\n')}\n` : '';
    fs.writeFileSync(tmpPath, body, 'utf8');
    fs.renameSync(tmpPath, outputPath); // atomica: o il file vecchio, o quello nuovo, mai un mezzo file

    const meta = {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        source: opts.source || 'antoniogenna.net/doppiaggio',
        file: path.basename(outputPath),
        counts
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 1)}\n`, 'utf8');

    return { written: true, path: outputPath, metaPath, count: rows.length, counts, previous };
}

module.exports = {
    SCHEMA_VERSION,
    DEFAULT_FILENAME,
    GUARD_THRESHOLD,
    metaPathFor,
    splitId,
    toRows,
    writeAnnotations
};
