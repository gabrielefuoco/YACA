/**
 * writer.js
 * Scrittura del file di annotazioni doppiaggio.
 *
 * NOTA ARCHITETTURALE:
 * // TODO: il formato è deciso dal ticket 04 della mappa doppiaggio-ita — non inventarlo
 * Questo modulo funge attualmente solo da gancio provvisorio (hook).
 */

const fs = require('fs');
const path = require('path');

/**
 * Scrive le annotazioni su disco in un formato minimale in sospeso.
 * @param {Array<object>} rows Righe annotate del catalogo
 * @param {object} [opts={}] Opzioni di scrittura
 * @param {string} [opts.outputPath] Percorso del file di destinazione
 * @param {boolean} [opts.dryRun=false] Se true, non scrive fisicamente su disco
 * @param {object} [opts.metadata] Metadati opzionali di sintesi
 * @returns {Promise<{ written: boolean, path: string|null, count: number }>}
 */
async function writeAnnotations(rows, opts = {}) {
    // TODO: il formato è deciso dal ticket 04 della mappa doppiaggio-ita — non inventarlo
    if (opts.dryRun) {
        return {
            written: false,
            path: null,
            count: Array.isArray(rows) ? rows.length : 0
        };
    }

    const defaultPath = path.resolve(__dirname, '..', '.cache', 'annotations_preview.json');
    const targetFile = opts.outputPath || defaultPath;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });

    // Output minimale provvisorio in attesa del ticket 04
    const payload = {
        _notice: 'FORMATO PROVVISORIO: In attesa di definizione definitiva dal ticket 04',
        generatedAt: new Date().toISOString(),
        metadata: opts.metadata || {},
        totalRecords: Array.isArray(rows) ? rows.length : 0,
        // Nel preview salviamo un campione o le voci attive per non eccedere le dimensioni
        records: Array.isArray(rows) ? rows.filter((r) => r.ita !== false) : []
    };

    fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf8');

    return {
        written: true,
        path: targetFile,
        count: payload.records.length
    };
}

module.exports = {
    writeAnnotations
};
