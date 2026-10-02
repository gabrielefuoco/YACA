#!/usr/bin/env node
/**
 * Fa il giro grosso dei poster senza potersi incastrare, e senza saturare la macchina.
 *
 * Perché esiste (invece di chiamare build.js e basta):
 *
 * - **build.js non ha timeout sulle richieste.** Una richiesta appesa blocca un worker per
 *   sempre, e con due worker appesi il giro non finisce più — ma nessuno se ne accorge, perché
 *   il processo è vivo e non scrive niente. Qui il fetch è incapsulato con un timeout: una
 *   richiesta che non risponde **fallisce** e il giro va avanti. Un blocco diventa un fallimento,
 *   che è una cosa che sappiamo gestire.
 * - **Questa è anche la macchina su cui si lavora**, quindi il giro deve essere un ospite
 *   educato: pochi worker, pausa fra le richieste, e un tetto di memoria sugli errori (non si
 *   accumulano in eterno).
 * - **Un giro lungo va visto.** Ogni minuto scrive una riga di avanzamento con i poster resi,
 *   quelli saltati (già fatti, da una corsa precedente) e i falliti.
 *
 * La ripresa è di build.js: un file già presente e non vuoto viene saltato. Quindi rilanciare
 * questo script **non ricomincia da capo** — è il motivo per cui è sicuro farlo ripartire.
 *
 * Uso:
 *   node ops/erdb-legion/costruisci.js --list <file.jsonl> --base <url-errdb-col-token> --out <dir>
 *
 * Opzioni (oltre a quelle di build.js):
 *   --timeout <ms>       timeout per singola richiesta (default 60000)
 *   --stanco <minuti>    se non cresce il numero di file per N minuti, esce con codice 2
 *                        (default 20). Il rilancio lo fa chi ci sta sopra; qui si esce e basta,
 *                        non si finge di essere vivi.
 */

const fs = require('node:fs');
const path = require('node:path');

const BUILD = path.resolve(__dirname, '..', '..', 'scripts', 'erdb-builder', 'build.js');
const { run } = require(BUILD);

const args = process.argv.slice(2);
const prendi = (nome, difetto) => {
    const i = args.indexOf(nome);
    return i >= 0 && args[i + 1] ? args[i + 1] : difetto;
};
const list = prendi('--list');
const base = prendi('--base');
const out = prendi('--out');
const delay = Number(prendi('--delay', 150));
const concurrency = Number(prendi('--concurrency', 2));
const timeoutMs = Number(prendi('--timeout', 60000));
const stancoDopoMinuti = Number(prendi('--stanco', 20));
// build.js non conosce queste due: le consumiamo noi e non gliele passiamo.
const argsPerBuild = args.filter((a, i) => {
    const precedente = args[i - 1];
    return !['--timeout', '--stanco'].includes(precedente) && !['--timeout', '--stanco'].includes(a);
});

if (!list || !base || !out) {
    console.error('Servono --list, --base e --out. Vedi il commento in testa a questo file.');
    process.exit(1);
}

fs.mkdirSync(out, { recursive: true });

/** Quanti file ci sono già nella cartella: è la misura dell'avanzamento, e non mente. */
function contaFile() {
    try {
        return fs.readdirSync(out).filter((nome) => nome.endsWith('.jpg') || nome.endsWith('.webp')).length;
    } catch {
        return 0;
    }
}

/** fetch con timeout, così una richiesta appesa è un fallimento e non un blocco. */
function fetchConTimeout(url, { timeout = timeoutMs } = {}) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`timeout di ${timeout} ms`)), timeout);
    return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer));
}

let resi = 0;
let saltati = 0;
let falliti = 0;
let ultimoConteggio = contaFile();
let ultimoCambiamento = Date.now();
let ultimoLog = 0;

const prima = contaFile();
const totale = (() => {
    try {
        return fs.readFileSync(list, 'utf8').split('\n').filter((r) => r.trim()).length;
    } catch {
        return null;
    }
})();

console.log(`[giro] inizio. gia' presenti: ${prima}${totale ? ` su ${totale}` : ''}`);
console.log(`[giro] worker: ${concurrency}, pausa: ${delay} ms, timeout: ${timeoutMs} ms, cartella: ${out}`);

const battito = setInterval(() => {
    const adesso = contaFile();
    if (adesso !== ultimoConteggio) {
        ultimoConteggio = adesso;
        ultimoCambiamento = Date.now();
    }
    const daQuanto = Math.round((Date.now() - ultimoCambiamento) / 1000);
    const passati = Math.round((Date.now() - inizio) / 1000);
    if (Date.now() - ultimoLog > 55000) {
        ultimoLog = Date.now();
        const velocita = passati > 0 ? ((adesso - prima) / passati).toFixed(2) : '0';
        console.log(
            `[giro] ${adesso} poster in cartella (+${adesso - prima}) | resi ${resi}, saltati ${saltati}, ` +
            `falliti ${falliti} | ${velocita}/s | ultimo progresso ${daQuanto}s fa`
        );
    }
    if (daQuanto > stancoDopoMinuti * 60) {
        console.error(
            `[giro] fermo da ${Math.round(daQuanto / 60)} minuti: esco con codice 2. ` +
            `Chi mi rilancia non ricomincia da capo — i file presenti vengono saltati.`
        );
        process.exit(2);
    }
}, 30000);

const inizio = Date.now();

run({
    list,
    base,
    out,
    delay,
    concurrency,
    fetchImpl: fetchConTimeout,
    onProgress: (evento) => {
        if (evento.esito === 'reso') resi += 1;
        else if (evento.esito === 'saltato') saltati += 1;
        else falliti += 1;
    }
})
    .then((esito) => {
        clearInterval(battito);
        const finale = contaFile();
        const minuti = ((Date.now() - inizio) / 60000).toFixed(1);
        console.log(`[giro] finito in ${minuti} minuti. In cartella ora: ${finale} (prima erano ${prima}).`);
        console.log(`[giro] resi ${resi}, saltati ${saltati}, falliti ${falliti}`);
        if (esito && Array.isArray(esito.fallimenti) && esito.fallimenti.length > 0) {
            const esempi = esito.fallimenti.slice(0, 5).map((f) => `  ${f.erdbId || f.riga}: ${f.motivo}`);
            console.log(`[giro] primi fallimenti:\n${esempi.join('\n')}`);
            console.log('[giro] (i falliti NON sono persi: un rilancio li ritenta, gli altri li salta)');
        }
        process.exit(0);
    })
    .catch((errore) => {
        clearInterval(battito);
        console.error(`[giro] il giro e' morto: ${errore && errore.message ? errore.message : errore}`);
        console.error('[giro] esco con codice 1: un rilancio riprende da dove era arrivato.');
        process.exit(1);
    });