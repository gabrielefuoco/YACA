#!/usr/bin/env node
/**
 * drenaCodaPoster.js — il drenatore della coda dei poster, come comando del modulo poster.
 *
 * PERCHÉ ESISTE: i poster composti sono file statici serviti da `/erdb-poster/<file>`
 * (`src/api/staticPosters.js`). Finché il titolo non cambia, quel file va bene per mesi. Ma
 * quando un titolo diventa doppiato, o esce un episodio, quel file è vecchio e aspettare il
 * TTL non è un'opzione. Il diff del giro mette in coda un evento per ogni cambiamento
 * (`scripts/push-diff-in-coda.js`): questo comando è la metà che beve quella coda e rifà i
 * file, uno per uno.
 *
 * Il comando è una PROPRIETÀ DEL MODULO, non un accidente: il consumatore fuori dal processo
 * è il timer di sistema (`ops/yaca-poster-eventi.service`), quindi il comando deve vivere
 * qui con le sue opzioni, la sua gestione di Redis e il suo watchdog.
 */

const drenaPoster = require('./drenaPoster');
const { drena, eventoDaErdbId, classificaMotivo, DEFAULT_BATCH, DEFAULT_TIMEOUT_MS } = drenaPoster;
const { erdbIdsDaEvento, nomeFileDaEvento } = require('./posterDaEvento');
const DEFAULT_CACHE_DIR = '/data/erdb-cache';
const getCacheDir = () => process.env.ERDB_CACHE_DIR || DEFAULT_CACHE_DIR;

const STORE_NON_PRONTO = 'store_non_pronto';
const DEFAULT_ATTESA_MAPPA_MS = 90000;
const DEFAULT_TIMEOUT_GIRO_MS = 600000;
const DEFAULT_ATTESA_REDIS_MS = 10000;
const INTERVALLO_ATTESA_REDIS_MS = 100;

const HELP = [
    'Drena la coda degli eventi: rifà i poster dei titoli diventati (o non più) doppiati.',
    'Gira su timer: una raffica breve, poi esce. Non lancia mai (codice 0 anche se Redis',
    'o ERDB sono giù); esce 1 solo se manca la configurazione.',
    '',
    '  --base <url>      base dell\'istanza ERDB locale, col token: OBBLIGATORIA',
    `                    (--base, oppure $ERDB_LOCAL_BASE nel .env del timer)`,
    '  --out <dir>       cartella dei poster (default: ERDB_CACHE_DIR, quella che serve la rotta)',
    `  --batch <n>       quanti eventi per giro (default ${DEFAULT_BATCH})`,
    `  --timeout <ms>    timeout per richiesta (default ${DEFAULT_TIMEOUT_MS}, 0 = nessuno)`,
    `  --attesa-mappa <ms>  attesa massima del caricamento mappa anime (default ${DEFAULT_ATTESA_MAPPA_MS})`,
    `  --attesa-redis <ms>  attesa massima che Redis si connetta, prima di guardare la coda`,
    `                    (default ${DEFAULT_ATTESA_REDIS_MS}); se scade il giro salta e lo dice`,
    '  --dry-run         dice cosa farebbe: nessun download, nessuna scrittura, nessun done/fail',
    '  --help, -h        questo messaggio'
].join('\n');

const MESSAGGIO_BASE = [
    '[Drena] CONFIGURAZIONE: manca la base dell\'istanza ERDB locale.',
    '  Serve --base http://<host>:<porta>/<Tk-token> oppure ERDB_LOCAL_BASE.',
    '  La base COMPRENDE il token: senza si prende un 404 su ogni poster, e la coda',
    '  consumerebbe i suoi 5 tentativi per evento per scoprire ogni volta la stessa cosa.',
    '  La variabile si mette nel .env letto dalla unit (EnvironmentFile=/srv/yaca/.env);',
    '  `systemctl status yaca-drena` per vedere il journal, `journalctl -u yaca-drena` per il seguito.',
    '  Esce 1 perché è una configurazione da correggere, non un guasto da riprovare domani.'
].join('\n');

function messaggioRedisNonPronto(tettoMs) {
    return `Redis NON pronto dopo ${tettoMs} ms: questo giro NON ha drenato niente, `
        + 'e non è che la coda fosse vuota — è che non sono riuscito a guardarla. '
        + 'Nessun file scritto e nessun allarme: il timer riproverà al giro dopo.';
}

function interoPositivo(valore, flag, defaulto) {
    if (valore === undefined || valore === null || valore === '') return defaulto;
    const numero = Number(valore);
    if (!Number.isFinite(numero) || numero <= 0) {
        throw new Error(`${flag} deve essere un numero positivo (ricevuto: ${valore})`);
    }
    return Math.floor(numero);
}

function parseArgs(argv = [], env = process.env) {
    const opts = {
        base: env.ERDB_LOCAL_BASE || null,
        out: null,
        batch: DEFAULT_BATCH,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        attesaMappaMs: DEFAULT_ATTESA_MAPPA_MS,
        attesaRedisMs: DEFAULT_ATTESA_REDIS_MS,
        dryRun: false,
        help: false
    };

    let i = 0;
    const valoreDi = (flag, inline) => {
        if (inline !== null) return inline;
        const valore = argv[++i];
        if (valore === undefined) throw new Error(`${flag} richiede un valore`);
        return valore;
    };

    for (; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('-')) throw new Error(`argomento sconosciuto: ${arg}`);

        const eq = arg.indexOf('=');
        const flag = eq === -1 ? arg : arg.slice(0, eq);
        const inline = eq === -1 ? null : arg.slice(eq + 1);

        switch (flag) {
            case '--base': opts.base = valoreDi(flag, inline); break;
            case '--out': opts.out = valoreDi(flag, inline); break;
            case '--batch': opts.batch = interoPositivo(valoreDi(flag, inline), flag, DEFAULT_BATCH); break;
            case '--timeout': opts.timeoutMs = interoPositivo(valoreDi(flag, inline), flag, DEFAULT_TIMEOUT_MS); break;
            case '--attesa-mappa': opts.attesaMappaMs = interoPositivo(valoreDi(flag, inline), flag, DEFAULT_ATTESA_MAPPA_MS); break;
            case '--attesa-redis': opts.attesaRedisMs = interoPositivo(valoreDi(flag, inline), flag, DEFAULT_ATTESA_REDIS_MS); break;
            case '--dry-run': opts.dryRun = true; break;
            case '--help':
            case '-h': opts.help = true; break;
            default: throw new Error(`argomento sconosciuto: ${flag}`);
        }
    }

    return opts;
}

function avvisaMotivo(store, log) {
    const motivi = store && store.motiviResolveKitsu;
    if (!motivi) return;
    if (motivi.STORE_NON_PRONTO && motivi.STORE_NON_PRONTO !== STORE_NON_PRONTO) {
        log.warn(`[Drena] ATTENZIONE: lo store chiama "${motivi.STORE_NON_PRONTO}" il motivo che qui ` +
            `era "${STORE_NON_PRONTO}": i poster anime senza mappa NON vengono più contati.`);
    }
}

function adattatoreKitsu(store, stato, log) {
    let dettoIlPrimo = false;
    return (id, tipo) => {
        stato.chiamate += 1;
        let esito;
        try {
            esito = store.resolveKitsuDaTmdbId(id, tipo);
        } catch (err) {
            stato.errori += 1;
            log.warn(`[Drena] resolveKitsuDaTmdbId ha lanciato su ${tipo}:${id}: ${err && err.message ? err.message : err}`);
            return null;
        }

        const motivo = esito && esito.motivo ? String(esito.motivo) : '';
        if (motivo === STORE_NON_PRONTO) {
            stato.storeNonPronto += 1;
            if (!dettoIlPrimo) {
                dettoIlPrimo = true;
                log.warn('[Drena] AVVISO: la mappa degli anime NON è pronta (store_non_pronto): ' +
                    'in questo giro i poster anime vengono rifatti solo dal lato TMDB, il lato Kitsu no. ' +
                    'Non è un dettaglio: sono decine di migliaia di poster. Contati nel riepilogo.');
            }
        } else if (motivo && motivo !== 'mappato') {
            stato.motivi[motivo] = (stato.motivi[motivo] || 0) + 1;
        }

        return esito && esito.kitsuId !== null && esito.kitsuId !== undefined
            ? String(esito.kitsuId)
            : null;
    };
}

function nuovoStatoMappa() {
    return {
        caricata: false,
        servita: false,
        tentata: false,
        chiamate: 0,
        storeNonPronto: 0,
        errori: 0,
        motivi: {}
    };
}

async function preparaMappa({ store, log, dryRun = false, attesaMs = DEFAULT_ATTESA_MAPPA_MS }) {
    const stato = nuovoStatoMappa();
    if (!store) return { cercaKitsu: null, stato };

    avvisaMotivo(store, log);

    if (store.isReady) {
        stato.caricata = true;
        stato.servita = true;
        return { cercaKitsu: adattatoreKitsu(store, stato, log), stato };
    }

    if (dryRun) {
        log.log('[Drena] dry-run: mappa anime non pronta e non la carico (il dry-run non prende ' +
            'niente dalla rete): per gli anime vedrai solo il lato TMDB, non il Kitsu.');
        return { cercaKitsu: null, stato };
    }

    stato.servita = true;
    stato.tentata = true;
    log.log(`[Drena] mappa anime non pronta: la carico (attesa massima ${attesaMs} ms)…`);
    try {
        await _conTimeout(Promise.resolve().then(() => store.init()), attesaMs, 'mappa anime');
    } catch (err) {
        log.warn(`[Drena] mappa anime non caricata: ${err && err.message ? err.message : err}`);
    }
    stato.caricata = Boolean(store.isReady);
    if (!stato.caricata) {
        log.warn('[Drena] la mappa anime resta non pronta: gli anime di questo giro avranno solo ' +
            'il poster TMDB. Va rincarata, non dimenticata.');
    }
    return { cercaKitsu: adattatoreKitsu(store, stato, log), stato };
}

function _dormi(ms) {
    return new Promise((risolvi) => { setTimeout(risolvi, ms); });
}

async function aspettaRedis(redis, {
    tettoMs = DEFAULT_ATTESA_REDIS_MS,
    intervalloMs = INTERVALLO_ATTESA_REDIS_MS,
    log = console
} = {}) {
    const subito = { pronto: true, interrogazioni: 0, attesaMs: 0 };
    if (!redis) return subito;
    const ora = redis.isAvailable;
    if (ora === true) return { ...subito, interrogazioni: 1 };
    if (typeof ora === 'undefined') return subito;

    if (!(tettoMs > 0)) return { pronto: false, interrogazioni: 1, attesaMs: 0 };
    const passo = Math.max(1, Math.min(intervalloMs > 0 ? intervalloMs : INTERVALLO_ATTESA_REDIS_MS, tettoMs));

    const inizio = Date.now();
    let interrogazioni = 1;
    log.log(`[Drena] Redis non è ancora connesso: aspetto al massimo ${tettoMs} ms (ogni ${passo} ms) ` +
        'prima di guardare la coda…');

    while (Date.now() - inizio < tettoMs) {
        await _dormi(passo);
        interrogazioni += 1;
        if (redis.isAvailable === true) {
            const attesaMs = Date.now() - inizio;
            log.log(`[Drena] Redis connesso dopo ${attesaMs} ms: guardo la coda.`);
            return { pronto: true, interrogazioni, attesaMs };
        }
    }
    return { pronto: false, interrogazioni, attesaMs: Date.now() - inizio };
}

function _conTimeout(promessa, ms, cosa) {
    if (!(ms > 0)) return promessa;
    let timer = null;
    const scadenza = new Promise((_, respingi) => {
        timer = setTimeout(() => respingi(new Error(`timeout dopo ${ms} ms durante: ${cosa}`)), ms);
    });
    return Promise.race([promessa, scadenza]).finally(() => clearTimeout(timer));
}

function testoConti(conteggi) {
    return Object.keys(conteggi || {})
        .filter((k) => conteggi[k] > 0)
        .sort((a, b) => (conteggi[b] - conteggi[a]) || a.localeCompare(b))
        .map((k) => `${k}=${conteggi[k]}`)
        .join(', ');
}

function rigaRiepilogo(r) {
    const parti = [];
    if (r.saltato) {
        parti.push(`[Drena] giro saltato: ${r.saltato}`);
    } else {
        parti.push(`[Drena] ${r.presi} presi, ${r.resi} resi, ${r.falliti} falliti`);
    }
    if (r.dryRun && !r.saltato) parti.push(`dry-run: ${r.daRifare} da rifare, ${r.falliti} non interpretabili`);

    const motivi = testoConti(r.motivi);
    if (motivi) parti.push(`motivi: ${motivi}`);
    const note = testoConti(r.note);
    if (note) parti.push(`avvisi: ${note}`);

    if (r.mappa && r.mappa.storeNonPronto > 0) {
        parti.push(`mappa anime NON pronta (${STORE_NON_PRONTO} su ${r.mappa.storeNonPronto} eventi: ` +
            'i poster Kitsu corrispondenti NON sono stati rifatti)');
    }
    if (r.mappa && r.mappa.errori > 0) {
        parti.push(`resolveKitsuDaTmdbId ha lanciato ${r.mappa.errori} volte`);
    }
    const motiviMappa = testoConti(r.mappa && r.mappa.motivi);
    if (motiviMappa) parti.push(`mappa anime: ${motiviMappa}`);

    parti.push(`out=${r.outDir}`);
    return `${parti.join(' — ')}`;
}

async function gira({
    coda,
    fetchImpl,
    store,
    drenaImpl = drena,
    redis = null,
    log = console,
    base,
    outDir,
    batch = DEFAULT_BATCH,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    attesaMappaMs = DEFAULT_ATTESA_MAPPA_MS,
    attesaRedisMs = DEFAULT_ATTESA_REDIS_MS,
    dryRun = false
} = {}) {
    const stato = {
        presi: 0,
        resi: 0,
        falliti: 0,
        daRifare: 0,
        motivi: {},
        note: {},
        mappa: null,
        dryRun,
        base,
        outDir,
        saltato: null
    };

    const attesa = await aspettaRedis(redis, { tettoMs: attesaRedisMs, log });
    if (!attesa.pronto) {
        stato.note.redis = 1;
        stato.saltato = messaggioRedisNonPronto(attesaRedisMs);
        log.warn(`[Drena] ${stato.saltato}`);
        return stato;
    }

    if (dryRun) {
        await dryRunGiro({ coda, log, store, redis, base, outDir, batch, attesaMappaMs, stato });
    } else {
        const serveMappa = await _serveMappa({ coda, batch, log });
        let cercaKitsu = null;
        let mappa = nuovoStatoMappa();
        if (serveMappa) {
            ({ cercaKitsu, stato: mappa } = await preparaMappa({ store, log, dryRun: false, attesaMs: attesaMappaMs }));
        } else {
            log.log('[Drena] nel lotto non c\'è nessun id TMDB da mappare: la mappa anime non serve.');
        }
        stato.mappa = mappa;

        const riepilogo = await drenaImpl({
            take: (n) => coda.take(n),
            done: (evento) => coda.done(evento),
            fail: (evento) => coda.fail(evento),
            cercaKitsu,
            base,
            outDir,
            fetchImpl,
            batch,
            timeoutMs,
            log
        });

        stato.presi = riepilogo.presi;
        stato.resi = riepilogo.resi;
        stato.falliti = riepilogo.falliti;
        _contaMotivi(stato, riepilogo);
        _notaRedis(stato, redis, log);
    }

    return stato;
}

async function _serveMappa({ coda, batch, log }) {
    try {
        const eventi = await coda.take(batch);
        if (!Array.isArray(eventi) || !eventi.length) return false;
        return eventi.some((evento) => {
            const id = evento && evento.id !== undefined && evento.id !== null
                ? String(evento.id).trim()
                : '';
            return id !== '' && !id.startsWith('kitsu:');
        });
    } catch (err) {
        log.warn(`[Drena] non riesco a sbirciare la coda (${err && err.message ? err.message : err}): ` +
            'carico la mappa anime per sicurezza.');
        return true;
    }
}

function _contaMotivi(stato, riepilogo) {
    const fallimenti = Array.isArray(riepilogo && riepilogo.fallimenti) ? riepilogo.fallimenti : [];
    for (const voce of fallimenti) {
        const motivo = voce && voce.motivo ? String(voce.motivo) : 'altro';
        stato.motivi[motivo] = (stato.motivi[motivo] || 0) + 1;
    }
    const note = (riepilogo && riepilogo.note) || {};
    for (const chiave of Object.keys(note)) {
        const numero = Number(note[chiave]);
        if (!Number.isFinite(numero) || numero <= 0) continue;
        stato.note[chiave] = (stato.note[chiave] || 0) + numero;
    }
}

function _notaRedis(stato, redis, log) {
    if (!redis || redis.isAvailable !== false) return;
    stato.note.redis = (stato.note.redis || 0) + 1;
    log.warn('[Drena] Redis non raggiungibile: giro vuoto perché non si è potuto leggere la coda, ' +
        'non perché la coda fosse vuota.');
}

async function dryRunGiro({ coda, log, store, redis, base, outDir, batch, attesaMappaMs, stato }) {
    const { cercaKitsu, stato: mappa } = await preparaMappa({ store, log, dryRun: true, attesaMs: attesaMappaMs });
    stato.mappa = mappa;

    let eventi;
    try {
        eventi = await coda.take(batch);
    } catch (err) {
        log.warn(`[Drena] take fallito: ${err && err.message ? err.message : err}`);
        stato.note.take = 1;
        return;
    }
    if (!Array.isArray(eventi) || !eventi.length) {
        _notaRedis(stato, redis, log);
        log.log('[Drena] coda vuota: niente da rifare.');
        return;
    }

    stato.presi = eventi.length;
    log.log(`[Drena] dry-run: ${eventi.length} eventi, ${base}, scriverei in ${outDir}`);

    for (let posizione = 0; posizione < eventi.length; posizione++) {
        const evento = eventi[posizione];
        const progresso = `(${posizione + 1}/${eventi.length})`;
        try {
            for (const erdbId of erdbIdsDaEvento(evento, cercaKitsu)) {
                const { tipo, id, badge } = eventoDaErdbId(erdbId, evento);
                log.log(`[Drena] da rifare ${nomeFileDaEvento({ tipo, id, badge })} ${progresso}`);
            }
            stato.daRifare += 1;
        } catch (err) {
            stato.falliti += 1;
            const motivo = err && err.message ? err.message : String(err);
            stato.motivi[classificaMotivo(motivo)] = (stato.motivi[classificaMotivo(motivo)] || 0) + 1;
            log.warn(`[Drena] non interpretabile ${evento && evento.tipo}:${evento && evento.id} ${progresso}: ${motivo}`);
        }
    }
}

const DEFAULT_ATTESA_QUIT_MS = 2000;

async function chiudiRedis(redisClient, attesaMs = DEFAULT_ATTESA_QUIT_MS) {
    if (!redisClient) return;
    try {
        if (typeof redisClient.quit === 'function') {
            await _conTimeout(Promise.resolve().then(() => redisClient.quit()), attesaMs, 'quit di Redis');
        }
    } catch (_) { /* chiusura fallback sotto */ }
    try {
        if (typeof redisClient.disconnect === 'function') redisClient.disconnect();
    } catch (_) { /* niente da dire */ }
}

async function main(argv = process.argv.slice(2), env = process.env, dip = {}) {
    const log = dip.log || console;

    let opts;
    try {
        opts = parseArgs(argv, env);
    } catch (err) {
        log.error(`[Drena] ${err.message}\n\n${HELP}`);
        return 1;
    }

    if (opts.help) {
        log.log(HELP);
        return 0;
    }

    if (!opts.base || !String(opts.base).trim()) {
        log.error(MESSAGGIO_BASE);
        return 1;
    }

    const redisClient = dip.redisClient === undefined ? _caricaRedis(log) : dip.redisClient;

    try {
        try { require('dotenv').config(); } catch (_) { /* dotenv assente */ }

        const outDir = opts.out || env.ERDB_CACHE_DIR || getCacheDir();
        const coda = dip.coda || require('./codaEventi');
        const store = dip.store === undefined ? _caricaStoreMappa(log) : dip.store;

        const riepilogo = await gira({
            coda,
            fetchImpl: dip.fetchImpl,
            store,
            redis: redisClient,
            log,
            base: String(opts.base).trim(),
            outDir,
            batch: opts.batch,
            timeoutMs: opts.timeoutMs,
            attesaMappaMs: opts.attesaMappaMs,
            attesaRedisMs: opts.attesaRedisMs,
            dryRun: opts.dryRun
        });

        log.log(rigaRiepilogo(riepilogo));
        return 0;
    } catch (err) {
        log.error('[Drena] errore inatteso:', err);
        return 1;
    } finally {
        await chiudiRedis(redisClient);
    }
}

function _caricaRedis(log) {
    try {
        return require('../cache/redisClient');
    } catch (err) {
        log.error('[Drena] ioredis non installabile: la coda non è raggiungibile.',
            err && err.message ? err.message : err);
        return null;
    }
}

function _caricaStoreMappa(log) {
    try {
        return require('../anime').animeMappingStore;
    } catch (err) {
        log.warn(`[Drena] mappa anime non caricabile (${err && err.message ? err.message : err}): ` +
            'i poster anime di questo giro avranno solo il lato TMDB.');
        return null;
    }
}

if (require.main === module) {
    const watchdog = setTimeout(() => process.exit(process.exitCode || 0), DEFAULT_TIMEOUT_GIRO_MS);
    watchdog.unref();

    main().then((codice) => { process.exitCode = codice; });
}

module.exports = {
    DEFAULT_CACHE_DIR,
    getCacheDir,
    STORE_NON_PRONTO,
    DEFAULT_ATTESA_MAPPA_MS,
    DEFAULT_ATTESA_REDIS_MS,
    INTERVALLO_ATTESA_REDIS_MS,
    DEFAULT_TIMEOUT_GIRO_MS,
    HELP,
    MESSAGGIO_BASE,
    messaggioRedisNonPronto,
    aspettaRedis,
    parseArgs,
    interoPositivo,
    adattatoreKitsu,
    preparaMappa,
    classificaMotivo,
    testoConti,
    rigaRiepilogo,
    gira,
    dryRunGiro,
    chiudiRedis,
    main
};
