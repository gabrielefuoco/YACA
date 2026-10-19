/**
 * src/posters/volumeContract.js
 *
 * Contratto del volume della cache poster (Ticket 57).
 *
 * I poster composti arrivano all'app attraverso il volume `yaca_erdb_cache:/data/erdb-cache`
 * (configurabile con `ERDB_CACHE_DIR`).
 * Questo modulo definisce e verifica il contratto formale sul volume:
 * 1. Versione dichiarata del contenuto: `versioni.json` scritto dal produttore
 *    (offline dump `scripts/erdb-builder/build.js` e drenatore `src/posters/drenaCodaPoster.js`),
 *    leggibile dall'app (`leggiVersioniVolume`, `getStatoVolume`).
 * 2. Verifica e osservabilità: rileva il caso silenzioso (l'app chiede un poster il cui nome
 *    non corrisponde a nessun file nel volume, oppure la versione del volume non è allineata)
 *    e lo rende osservabile tramite warning strutturati, contatori in memoria e l'endpoint di salute.
 */

const fs = require('fs');
const path = require('path');
const { BADGE_IMG_VERSION } = require('../stremio/formatters/posterBadgeVersion');

const VERSIONI_FILE_NAME = 'versioni.json';
const CONTRATTO_VERSION = 1;
const SCHEMA_VERSION = 1;
const CONVENZIONE_NOMI = 'calcolaVersionePoster';
const MAX_ULTIMI_MANCANTI = 50;

/**
 * Calcola l'oggetto delle versioni attese per il volume poster,
 * derivate dal disegno del badge e dalla convenzione di denominazione.
 */
function calcolaVersioniVolume() {
    return {
        contratto: CONTRATTO_VERSION,
        schemaVersion: SCHEMA_VERSION,
        versioni: {
            disegno: BADGE_IMG_VERSION,
            convenzione: CONVENZIONE_NOMI
        }
    };
}

/**
 * Scrive in modo atomico (file temporaneo + rename) il file versioni.json nella cartella indicata.
 * Invocato dai produttori del volume: dump offline e drenatore.
 */
async function scriviVersioniVolume(dir, { produttore = 'erdb-builder' } = {}) {
    if (!dir || typeof dir !== 'string') {
        throw new Error('scriviVersioniVolume: percorso dir non specificato');
    }

    await fs.promises.mkdir(dir, { recursive: true });

    const targetFile = path.join(dir, VERSIONI_FILE_NAME);
    const tmpFile = `${targetFile}.tmp_${Date.now()}_${process.pid}`;

    const contenuto = {
        contratto: CONTRATTO_VERSION,
        schemaVersion: SCHEMA_VERSION,
        versioni: {
            disegno: BADGE_IMG_VERSION,
            convenzione: CONVENZIONE_NOMI
        },
        produttore,
        aggiornatoIl: new Date().toISOString()
    };

    await fs.promises.writeFile(tmpFile, `${JSON.stringify(contenuto, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tmpFile, targetFile);

    return contenuto;
}

/**
 * Versione sincrona di scrittura di versioni.json (utile per test o setup immediati).
 */
function scriviVersioniVolumeSync(dir, { produttore = 'erdb-builder' } = {}) {
    if (!dir || typeof dir !== 'string') {
        throw new Error('scriviVersioniVolumeSync: percorso dir non specificato');
    }

    fs.mkdirSync(dir, { recursive: true });

    const targetFile = path.join(dir, VERSIONI_FILE_NAME);
    const tmpFile = `${targetFile}.tmp_${Date.now()}_${process.pid}`;

    const contenuto = {
        contratto: CONTRATTO_VERSION,
        schemaVersion: SCHEMA_VERSION,
        versioni: {
            disegno: BADGE_IMG_VERSION,
            convenzione: CONVENZIONE_NOMI
        },
        produttore,
        aggiornatoIl: new Date().toISOString()
    };

    fs.writeFileSync(tmpFile, `${JSON.stringify(contenuto, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpFile, targetFile);

    return contenuto;
}

/**
 * Legge il file versioni.json dal volume della cache e ne valida la coerenza con l'app.
 */
function leggiVersioniVolume(dir) {
    if (!dir || typeof dir !== 'string') {
        return {
            presente: false,
            valido: false,
            motivo: 'cartella_non_specificata',
            contratto: null,
            versioni: null,
            produttore: null,
            aggiornatoIl: null,
            path: null
        };
    }

    const targetFile = path.join(dir, VERSIONI_FILE_NAME);
    if (!fs.existsSync(targetFile)) {
        return {
            presente: false,
            valido: false,
            motivo: 'file_versioni_assente',
            contratto: null,
            versioni: null,
            produttore: null,
            aggiornatoIl: null,
            path: targetFile
        };
    }

    let raw;
    try {
        raw = fs.readFileSync(targetFile, 'utf8');
    } catch (err) {
        return {
            presente: true,
            valido: false,
            motivo: `errore_lettura: ${err.message}`,
            contratto: null,
            versioni: null,
            produttore: null,
            aggiornatoIl: null,
            path: targetFile
        };
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        return {
            presente: true,
            valido: false,
            motivo: `json_non_valido: ${err.message}`,
            contratto: null,
            versioni: null,
            produttore: null,
            aggiornatoIl: null,
            path: targetFile
        };
    }

    if (!parsed || typeof parsed !== 'object') {
        return {
            presente: true,
            valido: false,
            motivo: 'formato_non_valido',
            contratto: null,
            versioni: null,
            produttore: null,
            aggiornatoIl: null,
            path: targetFile
        };
    }

    const disegno = parsed.versioni && parsed.versioni.disegno;
    const disallineato = disegno !== BADGE_IMG_VERSION;

    return {
        presente: true,
        valido: !disallineato,
        motivo: disallineato
            ? `versione_disegno_disallineata (volume: ${disegno || 'assente'}, app: ${BADGE_IMG_VERSION})`
            : null,
        contratto: parsed.contratto || 1,
        schemaVersion: parsed.schemaVersion || 1,
        versioni: parsed.versioni || null,
        produttore: parsed.produttore || null,
        aggiornatoIl: parsed.aggiornatoIl || null,
        path: targetFile
    };
}

// ---------------------------------------------------------------------------
// Osservabilità e tracciamento richieste in memoria
// ---------------------------------------------------------------------------

const statistiche = {
    richieste: 0,
    trovati: 0,
    mancanti: 0,
    ultimiMancanti: []
};

function getStatistichePoster() {
    return {
        richieste: statistiche.richieste,
        trovati: statistiche.trovati,
        mancanti: statistiche.mancanti,
        ultimiMancanti: [...statistiche.ultimiMancanti]
    };
}

function azzeraStatistichePoster() {
    statistiche.richieste = 0;
    statistiche.trovati = 0;
    statistiche.mancanti = 0;
    statistiche.ultimiMancanti = [];
}

function _defaultRegistraRichiesta({ fileName, trovato, cacheDir, motivo = null }) {
    statistiche.richieste += 1;
    if (trovato) {
        statistiche.trovati += 1;
        return { registrato: true, trovato: true };
    }

    statistiche.mancanti += 1;
    const voce = {
        fileName,
        motivo: motivo || 'file_mancante',
        timestamp: new Date().toISOString()
    };

    if (statistiche.ultimiMancanti.length >= MAX_ULTIMI_MANCANTI) {
        statistiche.ultimiMancanti.shift();
    }
    statistiche.ultimiMancanti.push(voce);

    console.warn(`[StaticPosters] ANOMALIA: poster richiesto non presente nel volume: ${fileName}`);
    return { registrato: true, trovato: false, voce };
}

function _defaultVerificaPresenza(fileName, dir) {
    const filePath = path.join(dir, fileName);
    let presente = false;
    try {
        presente = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch {
        presente = false;
    }

    const volume = leggiVersioniVolume(dir);
    if (!presente) {
        return {
            ok: false,
            presente: false,
            volumeValido: volume.valido,
            motivo: 'file_mancante',
            fileName,
            path: filePath
        };
    }

    if (!volume.valido) {
        return {
            ok: false,
            presente: true,
            volumeValido: false,
            motivo: volume.motivo,
            fileName,
            path: filePath
        };
    }

    return {
        ok: true,
        presente: true,
        volumeValido: true,
        motivo: null,
        fileName,
        path: filePath
    };
}

/**
 * Observer configurabile/patchabile per test e sonde (decisione 34: il codice di prova
 * disabilita il seam da fuori tramite patch dell'istanza dell'oggetto).
 */
const volumeObserver = {
    registraRichiesta: (dati) => _defaultRegistraRichiesta(dati),
    verificaPresenza: (fileName, dir) => _defaultVerificaPresenza(fileName, dir)
};

function registraRichiestaPoster(dati) {
    return volumeObserver.registraRichiesta(dati);
}

function verificaPresenzaPoster(fileName, dir) {
    return volumeObserver.verificaPresenza(fileName, dir);
}

/**
 * Restituisce lo stato globale del volume e delle verifiche,
 * per l'endpoint di health check e le sonde.
 */
function getStatoVolume(dir) {
    const volumeInfo = leggiVersioniVolume(dir);
    const atteso = calcolaVersioniVolume();

    let dirEsiste = false;
    try {
        dirEsiste = fs.existsSync(dir);
    } catch {
        dirEsiste = false;
    }

    const ok = Boolean(dirEsiste && volumeInfo.presente && volumeInfo.valido);

    return {
        ok,
        contratto: CONTRATTO_VERSION,
        versioni: atteso.versioni,
        volume: {
            presente: volumeInfo.presente,
            allineato: volumeInfo.valido,
            path: dir,
            versioni: volumeInfo.versioni,
            produttore: volumeInfo.produttore,
            aggiornatoIl: volumeInfo.aggiornatoIl,
            motivo: volumeInfo.motivo
        },
        statistiche: getStatistichePoster()
    };
}

module.exports = {
    VERSIONI_FILE_NAME,
    CONTRATTO_VERSION,
    SCHEMA_VERSION,
    CONVENZIONE_NOMI,
    MAX_ULTIMI_MANCANTI,
    calcolaVersioniVolume,
    scriviVersioniVolume,
    scriviVersioniVolumeSync,
    leggiVersioniVolume,
    getStatistichePoster,
    azzeraStatistichePoster,
    registraRichiestaPoster,
    verificaPresenzaPoster,
    getStatoVolume,
    volumeObserver
};
