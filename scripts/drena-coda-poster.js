#!/usr/bin/env node
/**
 * drena-coda-poster.js — il drenatore della coda dei poster, come script da timer.
 *
 * PERCHÉ ESISTE: i poster composti sono file statici serviti da `/erdb-poster/<file>`
 * (`src/api/staticPosters.js`). Finché il titolo non cambia, quel file va bene per mesi. Ma
 * quando un titolo diventa doppiato, o esce un episodio, quel file è vecchio e aspettare il
 * TTL non è un'opzione. Il diff del giro mette in coda un evento per ogni cambiamento
 * (`scripts/push-diff-in-coda.js`): questo script è la metà che beve quella coda e rifà i
 * file, uno per uno.
 *
 * **QUI NON C'È IL LAVORO, C'È SOLO LA CORSA.** Il giro è `src/cache/drenaPoster.js`, che è già
 * scritto, testato e con tutto iniettato (`take`, `done`, `fail`, `cercaKitsu`, `base`,
 * `outDir`, `fetchImpl`, `batch`, `timeoutMs`, `log`). Questo file sa solo tre cose che quel
 * modulo non deve sapere: da quale parte stanno la coda e Redis, da quale cartella si serve la
 * rotta (`getCacheDir()`), e come si arriva alla mappa degli anime. Il nome file e l'URL li
 * decide `posterDaEvento` (che a sua volta chiama il costruttore), quindi non si riscrivono
 * qui: un nome inventato produrrebbe file che la rotta non chiederebbe mai.
 *
 * I MOTIVI DEI FALLIMENTI ARRIVANO GIÀ CONTATI. `drena` restituisce i suoi conteggi e, accanto,
 * l'elenco dei fallimenti con il codice del motivo (`http_404`, `non_jpeg`, …) e gli avvisi del
 * giro: qui si sommano e si mettono nella riga di riepilogo, senza leggere nessuna riga di log.
 * Prima si faceva il contrario — si contava la riga `[DrenaPoster] fallito …` con una regex —
 * e funzionava, ma i due file erano legati da una frase: se la frase cambiava, i motivi
 * finivano tutti in `altro` e la riga di riepilogo sembrava regolarissima.
 *
 * GIRA SU TIMER, non sempre acceso: una raffica breve, un lotto piccolo, poi esce. Per questo
 * **non lancia mai**: dentro un timer un'eccezione non gestita uccide il processo e nessuno se
 * ne accorge. Redis giù, ERDB giù, evento malformato: si logga e si esce con **0**. L'unica
 * uscita diversa è 1, ed è una sola: la configurazione sbagliata (manca la base ERDB), che è
 * un errore da correggere e non una condizione da riprovare domani — e che deve rumorosa.
 *
 * USO
 *   node scripts/drena-coda-poster.js --base http://127.0.0.1:3100/Tk-xxx
 *   ERDB_LOCAL_BASE=http://127.0.0.1:3100/Tk-xxx node scripts/drena-coda-poster.js
 *   node scripts/drena-coda-poster.js --dry-run          # dice cosa farebbe, senza toccare nulla
 *   node scripts/drena-coda-poster.js --out /data/erdb-cache --batch 50
 *
 * LA BASE È OBBLIGATORIA, e non ha un default di comodo: senza `--base` o `ERDB_LOCAL_BASE`
 * ogni richiesta sarebbe un 404 (l'istanza risponde sotto il path del token) e il timer
 * consumerebbe 5 tentativi per evento per scoprire la stessa cosa ogni volta. Meglio un
 * systemctl status che dice "manca la base" che un journal pieno di 404.
 *
 * LA CORSA ALL'AVVIO È IL GUASTO CHE SEMBRA SANO. `src/cache/redisClient.js` si connette in
 * modo **asincrono**: quando questo script lo richiede, il socket non è ancora pronto e
 * `isAvailable` è `false`. Un `take` a quel punto non prende niente e non solleva niente
 * (`enableOfflineQueue: false` fa degradare `codaEventi` in lista vuota), quindi il giro si
 * chiude "0 presi" con codice 0 **senza aver mai guardato la coda**. Sui poster semplici
 * quello non si vede: semplicemente non si aggiornano mai, e il timer gira ogni 10 minuti
 * senza drenare. Per questo, **prima del primo `take`** si aspetta il client (vedi
 * `aspettaRedis`): e se proprio non si connette, si dice a chiare che è quello il motivo —
 * "coda vuota" e "coda non guardata" sono due guasti opposti e vanno detti con parole diverse.
 *
 * LA MAPPA DEGLI ANIME È IL PEZZO CHE FA PAURA. `resolveKitsuDaTmdbId` restituisce
 * `{kitsuId, motivo}`, mentre `drena` vuole `cercaKitsu(id, tipo) -> id | niente`: qui c'è
 * l'adattatore, che **conta** i motivi e in particolare `store_non_pronto`. Non è una riga
 * persa nel log: è il caso in cui 8.263 poster anime vengono rifatti solo dal lato TMDB e
 * nessuno se ne accorgerebbe, quindi viene detto a voce (una volta, la prima) e contato nel
 * riepilogo di fine giro.
 */

const drenaPoster = require('../src/cache/drenaPoster');
const { drena, eventoDaErdbId, classificaMotivo, DEFAULT_BATCH, DEFAULT_TIMEOUT_MS } = drenaPoster;
// `classificaMotivo` è del modulo del giro e vive lì perché è lì che nascono i messaggi: nel
// giro vero i motivi arrivano già scritti in `drena.fallimenti` e questo file non li tocca
// affatto. Qui serve solo per il `--dry-run`, che non chiama `drena` e produce i suoi guasti.
// Il nome del file e l'elenco degli id da rinfrescare: entrambi li decide
// `posterDaEvento`, che è pure il posto dove si vede se a un evento serve anche il Kitsu.
const { erdbIdsDaEvento, nomeFileDaEvento } = require('../src/cache/posterDaEvento');
// La cartella dei poster: la stessa risoluzione della rotta che li serve. Se le due
// divergessero, il drenatore scriverebbe file perfetti che nessuno vedrebbe mai.
const { getCacheDir } = require('../src/api/staticPosters');

// `MOTIVI_RESOLVE_KITSU.STORE_NON_PRONTO` di `src/data/animeMappingStore.js`. Il nome è
// scritto qui invece che importato per non tirare dentro il modulo pesante (che a sua volta
// tira DuckDB) a ogni `require` dello script: `preparaMappa` controlla sotto che i due
// nomi coincidano e, se no, lo dice.
const STORE_NON_PRONTO = 'store_non_pronto';

// Quanto si aspetta la mappa degli anime. `init()` scarica due file (Anibridge e Fribb,
// qualche MB) e poi scrive la tabella in DuckDB: è un giro lungo, non una richiesta. Il
// timeout serve a non far pendere il timer; se scade la mappa non è pronta e gli anime
// restano solo TMDB — rumorosamente (vedi `mappaNonPronto` nel riepilogo).
const DEFAULT_ATTESA_MAPPA_MS = 90000;

// Il tetto del processo intero, con `unref` (vedi in fondo): 10 richieste da 20 s + la mappa.
const DEFAULT_TIMEOUT_GIRO_MS = 600000;

// Il tetto dell'attesa di Redis e il passo con cui si riprova. Il tetto è corto **per
// scelta**: il client si connette in decine di millisecondi quando tutto va bene, e su una
// macchina lenta un secondo è già generoso. Il tetto non serve a "guarire" Redis (nessuno
// aspetta 10 s un socket che non arriverà): serve a coprire il tempo di connessione vero. E
// a che cosa succede dopo non importa: è il timer, dieci minuti dopo, a riprovare.
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

// Il messaggio dell'uscita 1: scritto perché si legga da `systemctl status` senza dover
// aprire il journal. Dice cosa manca, come si chiama la variabile e perché si esce diversi.
const MESSAGGIO_BASE = [
    '[Drena] CONFIGURAZIONE: manca la base dell\'istanza ERDB locale.',
    '  Serve --base http://<host>:<porta>/<Tk-token> oppure ERDB_LOCAL_BASE.',
    '  La base COMPRENDE il token: senza si prende un 404 su ogni poster, e la coda',
    '  consumerebbe i suoi 5 tentativi per evento per scoprire ogni volta la stessa cosa.',
    '  La variabile si mette nel .env letto dalla unit (EnvironmentFile=/srv/yaca/.env);',
    '  `systemctl status yaca-drena` per vedere il journal, `journalctl -u yaca-drena` per il seguito.',
    '  Esce 1 perché è una configurazione da correggere, non un guasto da riprovare domani.'
].join('\n');

/**
 * La riga del giro saltato: **una**, e scritta in modo che da sola si capiscano tre cose
 * distinte — che non è successo nulla, che non è una coda vuota, e che il timer riproverà.
 * `codaEventi` con Redis giù restituisce una lista vuota senza lanciare, quindi la
 * differenza fra "non c'era niente" e "non ho potuto guardare" sta tutta qui: senza questa
 * frase il journal dice `0 presi` e sembra tutto sano.
 *
 * @param {number} tettoMs il tetto che è scaduto
 * @returns {string} il testo del motivo, senza il prefisso `[Drena]` (chi lo stampa ce lo mette)
 */
function messaggioRedisNonPronto(tettoMs) {
    return `Redis NON pronto dopo ${tettoMs} ms: questo giro NON ha drenato niente, `
        + 'e non è che la coda fosse vuota — è che non sono riuscito a guardarla. '
        + 'Nessun file scritto e nessun allarme: il timer riproverà al giro dopo.';
}

/**
 * Numero positivo da riga di comando, col default quando non c'è.
 * @throws {Error} se il valore non è un numero positivo: è un errore di digitazione, quindi
 *   un codice 1 con la lista delle opzioni, non un giro silenzioso con il default.
 */
function interoPositivo(valore, flag, defaulto) {
    if (valore === undefined || valore === null || valore === '') return defaulto;
    const numero = Number(valore);
    if (!Number.isFinite(numero) || numero <= 0) {
        throw new Error(`${flag} deve essere un numero positivo (ricevuto: ${valore})`);
    }
    return Math.floor(numero);
}

/**
 * Parsing degli argomenti. Supporta sia `--flag valore` sia `--flag=valore`.
 *
 * La base **non** viene validata qui: resta `null` se manca, e la decide `main` (che deve
 * poter rispondere 1 con il messaggio suo, non con un'eccezione di parsing). Così anche un
 * `--dry-run` senza base si vede che è un problema di configurazione e non di sintassi.
 *
 * @param {string[]} [argv]
 * @param {object}   [env]
 * @returns {{base: string|null, out: string|null, batch: number, timeoutMs: number,
 *            attesaMappaMs: number, attesaRedisMs: number, dryRun: boolean, help: boolean}}
 */
function parseArgs(argv = [], env = process.env) {
    const opts = {
        base: env.ERDB_LOCAL_BASE || null,
        out: null,           // null = la risoluzione della rotta (ERDB_CACHE_DIR)
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

/** Come il nome del motivo nello store: se cambia lì, lo si dice invece di contare zero. */
function avvisaMotivo(store, log) {
    const motivi = store && store.motiviResolveKitsu;
    if (!motivi) return;
    if (motivi.STORE_NON_PRONTO && motivi.STORE_NON_PRONTO !== STORE_NON_PRONTO) {
        log.warn(`[Drena] ATTENZIONE: lo store chiama "${motivi.STORE_NON_PRONTO}" il motivo che qui ` +
            `era "${STORE_NON_PRONTO}": i poster anime senza mappa NON vengono più contati.`);
    }
}

/**
 * L'adattatore che `drena` vuole: `cercaKitsu(id, tipo) -> id | null`.
 *
 * `resolveKitsuDaTmdbId` dà `{kitsuId, motivo}` e `drena` vuole un id o niente, quindi qui
 * si scarta il resto — ma **non il motivo**. I motivi sono il punto: `store_non_pronto` non è
 * "non è un anime", è la nostra mappa che non è ancora caricata, e la differenza vale 8.263
 * poster. Per questo si conta, e la prima volta si dice ad alta voce.
 *
 * Non lancia: uno store rotto fa `null` (l'evento viene rifatto solo dal lato TMDB, che è
 * comunque un progresso) invece di far cadere il giro.
 *
 * @param {object} store il singleton `animeMappingStore`
 * @param {object} stato  il riepilogo da aggiornare (contatori `mappa`)
 * @param {object} log
 * @returns {(id: string|number, tipo: string) => (string|null)}
 */
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
            // `mappato` non si conta: è il caso buono, e si vede già dai file scritti.
            // Qui contano le lacune (un anime di cui non sappiamo il Kitsu) e gli errori.
            stato.motivi[motivo] = (stato.motivi[motivo] || 0) + 1;
        }

        return esito && esito.kitsuId !== null && esito.kitsuId !== undefined
            ? String(esito.kitsuId)
            : null;
    };
}

/** Il riepilogo della mappa, tutto a zero: anche il caso "non è servita". */
function nuovoStatoMappa() {
    return {
        caricata: false,   // la mappa è pronta e interrogabile
        servita: false,    // in questo giro c'era qualcosa da mappare
        tentata: false,    // abbiamo provato a caricarla
        chiamate: 0,
        storeNonPronto: 0,
        errori: 0,
        motivi: {}
    };
}

/**
 * La mappa degli anime, nel formato che `drena` chiede, senza scaricare nulla se non serve.
 *
 * - se è già pronta (l'app la tiene in memoria, o un giro precedente l'ha caricata) si usa e basta;
 * - se nel lotto non c'è nessun id TMDB da risolvere, **non** si carica (vedi `_serveMappa`);
 * - in `--dry-run` non si carica mai: il dry-run non deve toccare la rete, e senza mappa dice
 *   esattamente quello che mostrerebbe (id TMDB), dichiarandolo;
 * - altrimenti `init()` con un tetto di attesa, e comunque si passa l'adattatore: se la mappa
 *   non è pronta, ogni evento anime risponde `store_non_pronto` e viene contato.
 *
 * @returns {Promise<{cercaKitsu: Function|null, stato: object}>}
 */
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
    // `init()` si lascia dietro il suo `setInterval` di sincronizzazione ogni 12 ore: è
    // `unref`, quindi non tiene vivo il processo e qui non serve staccarlo — ma è il motivo
    // per cui il giro dura minuti e non un'ora.
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

/** Una dormita semplice, e non un `setTimeout` lasciato appeso: qui si aspetta sul serio. */
function _dormi(ms) {
    return new Promise((risolvi) => { setTimeout(risolvi, ms); });
}

/**
 * Aspetta che il client Redis sia pronto, **prima del primo `take`**.
 *
 * PERCHÉ STA QUI E NON NEL CLIENT: `redisClient` si connette da solo e in modo asincrono, e
 * la cache dell'app ha bene a degradare quando Redis non c'è (è una cache: si ricostruisce).
 * Qui no: un `take` su un socket non ancora pronto non prende niente e non lancia niente
 * (`enableOfflineQueue: false` fa degradare `codaEventi` in lista vuota), quindi il giro
 * finirebbe "0 presi" senza aver guardato niente, con codice 0, e i poster non si
 * aggiornerebbero mai senza che nessuno se ne accorga. Il rimedio è nel solo posto dove il
 * guasto esiste — lo script da timer — e non in un modulo che l'app condivide.
 *
 * `isAvailable` è una **getter**: non si può aspettare un evento (non c'è), si può solo
 * chiederlo. Quindi si interroga a brevi intervalli, con un tetto, e si esce comunque: il
 * tetto non è un'attesa di guarigione, è il tempo entro cui una connessione sana è già
 * arrivata. Finito il tetto la risposta è "non guardare niente" e la decisione la prende
 * `gira`.
 *
 * @param {object} [redis] il client condiviso (o `null`: senza client non c'è niente da aspettare)
 * @param {object} [opzioni]
 * @param {number} [opzioni.tettoMs]       aspetta massima (default `DEFAULT_ATTESA_REDIS_MS`)
 * @param {number} [opzioni.intervalloMs]  passo fra un'interrogazione e l'altra
 * @param {object} [opzioni.log]
 * @returns {Promise<{pronto: boolean, interrogazioni: number, attesaMs: number}>}
 */
async function aspettaRedis(redis, {
    tettoMs = DEFAULT_ATTESA_REDIS_MS,
    intervalloMs = INTERVALLO_ATTESA_REDIS_MS,
    log = console
} = {}) {
    const subito = { pronto: true, interrogazioni: 0, attesaMs: 0 };
    // Una sola lettura per decidere: `isAvailable` è una getter e qua non si fa niente di
    // più. Senza client, o con un client che non espone la proprietà (uno stub, un fake):
    // niente da aspettare, e non si deve inventare un'attesa su una proprietà inesistente.
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

/** Dopo `ms` la promessa è un fallimento: un caricamento che non finisce non tiene il timer. */
function _conTimeout(promessa, ms, cosa) {
    if (!(ms > 0)) return promessa;
    let timer = null;
    const scadenza = new Promise((_, respingi) => {
        timer = setTimeout(() => respingi(new Error(`timeout dopo ${ms} ms durante: ${cosa}`)), ms);
    });
    return Promise.race([promessa, scadenza]).finally(() => clearTimeout(timer));
}

/** `motivi: http_404=1, timeout=1` — per count decrescente, poi per nome (riproducibile). */
function testoConti(conteggi) {
    return Object.keys(conteggi || {})
        .filter((k) => conteggi[k] > 0)
        .sort((a, b) => (conteggi[b] - conteggi[a]) || a.localeCompare(b))
        .map((k) => `${k}=${conteggi[k]}`)
        .join(', ');
}

/**
 * La riga di fine giro: quanti presi, resi, falliti, e **perché**.
 *
 * I motivi sono aggregati (`http_404=7`) e non un elenco di righe: il journal di un timer
 * deve stare in una schermata, e 50 righe identiche insegnano meno di `http_404=50`.
 * La mappa non pronta ha la sua frase, perché è l'unica cosa che in questo giro può
 * riuscire "soddisfacente" (`0 falliti`) mentre lascia fuori tutti i poster Kitsu.
 * Idem `avvisi: redis=1`: con Redis giù `codaEventi.take` degrada e restituisce una lista
 * vuota, quindi "0 presi" sembrerebbe una coda svuotata quando in realtà non si è guardata
 * niente. Sono due fatti opposti e la differenza è tutta lì.
 *
 * Un giro **saltato** (Redis mai connesso, vedi `aspettaRedis`) non usa i numeri: `0 presi`
 * in quel caso sarebbe la bug più difficile da vedere di tutta la catena, quindi la riga
 * ristampa il motivo per cui non è successo nulla.
 */
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

/**
 * Un giro di drenaggio: la coda vera, il lavoro vero, il riepilogo vero.
 *
 * Tutto è iniettato anche qui (`coda`, `fetchImpl`, `log`): il test gira con una coda in
 * memoria e un `fetch` che restituisce byte preparati a mano, senza Redis, senza rete e senza
 * ERDB. Non lancia mai.
 *
 * @param {object}   [opzioni]
 * @param {object}   [opzioni.coda]        la coda degli eventi (default: quella dell'app)
 * @param {Function} [opzioni.fetchImpl]   `fetch` iniettabile
 * @param {object}   [opzioni.store]       `animeMappingStore` (default: caricato su richiesta)
 * @param {Function} [opzioni.drenaImpl]   il giro vero (default: `drenaPoster.drena`; nei
 *   test un finto, per provare che il riepilogo legge l'elenco dei fallimenti e non il log)
 * @param {object}   [opzioni.log]
 * @param {string}   [opzioni.base]        base ERDB, col token
 * @param {string}   [opzioni.outDir]      cartella dei poster
 * @param {number}   [opzioni.batch]
 * @param {number}   [opzioni.timeoutMs]
 * @param {number}   [opzioni.attesaMappaMs]
 * @param {number}   [opzioni.attesaRedisMs]
 * @param {boolean}  [opzioni.dryRun]
 * @returns {Promise<object>} il riepilogo
 */
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
        // I tre campi che la riga di riepilogo ristampa: senza, il riepilogo direbbe
        // `dry-run: 0 da rifare` e `out=undefined` proprio nei due casi che contano.
        dryRun,
        base,
        outDir,
        // Il giro NON è andato avanti, e perché. Vuoto = giro normale; una frase = saltato,
        // e il riepilogo allora non deve stampare `0 presi`, che sembrerebbe una coda svuotata.
        saltato: null
    };

    // PRIMA DI QUALUNQUE COSA CHE TOCCA LA CODA. Il client Redis si connette in modo
    // asincrono e un `take` su un socket non ancora pronto restituisce una lista vuota
    // senza lanciare: il giro chiuderebbe "0 presi" con codice 0 senza aver guardato niente,
    // e i poster semplici non si aggiornerebbero mai senza che nessuno se ne accorga. Quindi
    // si aspetta il client, e se non arriva si dice che è quello il motivo — non "coda vuota".
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
        // La mappa costa secondi e qualche MB di rete (`init` scarica Anibridge e Fribb): su
        // un timer che si sveglia ogni volta, scaricarla per un lotto senza anime è spesa
        // buttata. `take` NON toglie gli eventi, quindi si può sbirciare prima e lasciare che
        // `drena` torni a prenderli: due comandi Redis in più, e la differenza è un giro
        // vuoto che costa 0,7 s invece di 7.
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

/**
 * Nel lotto c'è qualcosa che la mappa deve risolvere?
 *
 * Un id già in forma Kitsu (`kitsu:265`) è già un id ERDB: la mappa non serve e interrogarla
 * produrrebbe solo spazzatura (è la stessa regola di `erdbIdsDaEvento`). Con una coda vuota
 * la risposta è no, ed è la risposta che conta: un timer che si sveglia tra un diff e l'altro
 * non deve scaricare 9.000 mapping per non trovare niente.
 *
 * Se non si riesce a guardare, si risponde "sì": il caso costoso ma innocuo batte il caso
 * silenziosamente sbagliato.
 */
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

/**
 * Il riepilogo di fine giro, costruito da quello che `drena` **restituisce**: i motivi si
 * contano su `fallimenti` (una voce per evento, con il suo codice) e gli avvisi del giro su
 * `note`. Non si legge nessuna riga di log: due file legati da una frase sono un
 * accoppiamento che regge finché la frase non cambia, e quando cambia finisce tutto in
 * `altro` senza che nessuno se ne accorga.
 *
 * Il codice si copia com'è: è il modulo del giro a sapere cosa è un 404 e cosa è un
 * timeout, qui si sa solo quanto ce ne sono stati (`http_404=7`).
 */
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

/**
 * `codaEventi` degrada senza lanciare: con Redis giù `take` restituisce `[]` e sembra una
 * coda vuota. Il client Redis condiviso sa invece se è connesso (`isAvailable`), quindi la
 * domanda "ho lavorato perché non c'era niente, o perché non ho potuto guardare?" ha una
 * risposta, e va data: nel riepilogo e una volta nel journal.
 */
function _notaRedis(stato, redis, log) {
    if (!redis || redis.isAvailable !== false) return;
    stato.note.redis = (stato.note.redis || 0) + 1;
    log.warn('[Drena] Redis non raggiungibile: giro vuoto perché non si è potuto leggere la coda, ' +
        'non perché la coda fosse vuota.');
}

/**
 * Il giro `--dry-run`: prende gli eventi e dice i file che farebbe, senza scaricare, senza
 * scrivere e senza chiudere niente.
 *
 * Non riusa `drena` perché non ha modo di non scaricare (e il dry-run che scarica è il
 * dry-run che nessuno crede più). Riusa però le funzioni pure di `posterDaEvento`: i nomi
 * file che stampa sono esattamente quelli che il giro vero scriverebbe.
 */
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
            // Un evento velenoso si dice qui e non interrompe gli altri: nel giro vero
            // sarebbe un `fail`, e la coda lo scarterà dopo 5 tentativi.
            stato.falliti += 1;
            const motivo = err && err.message ? err.message : String(err);
            stato.motivi[classificaMotivo(motivo)] = (stato.motivi[classificaMotivo(motivo)] || 0) + 1;
            log.warn(`[Drena] non interpretabile ${evento && evento.tipo}:${evento && evento.id} ${progresso}: ${motivo}`);
        }
    }
}

// Quanto si aspetta il `quit` prima di passare al taglio secco. Su un client già disconnesso
// `quit` può non tornare mai (il comando finisce in coda su uno stream non scrivibile): senza
// questo tetto il processo resterebbe vivo sul socket e il timer non finirebbe mai.
const DEFAULT_ATTESA_QUIT_MS = 2000;

/**
 * Chiude il client Redis condiviso, e poi si accerta che il processo possa uscire.
 *
 * Due tempi, perché `quit` da solo non basta: è una richiesta, e se il socket non è
 * scrivibile resta appesa per sempre; e ioredis continua a riconnettare da solo (c'è un
 * `retryStrategy`), quindi anche dopo un `quit` riuscito a metà ci sarebbe un timer di
 * riconnessione vivo. Dopo il `quit` (o al suo posto, se non torna) c'è il `disconnect`,
 * che chiude i socket e basta: un giro di scarico non ha niente da tenere aperto.
 */
async function chiudiRedis(redisClient, attesaMs = DEFAULT_ATTESA_QUIT_MS) {
    if (!redisClient) return;
    try {
        if (typeof redisClient.quit === 'function') {
            await _conTimeout(Promise.resolve().then(() => redisClient.quit()), attesaMs, 'quit di Redis');
        }
    } catch (_) { /* era già chiuso, o non è arrivato: il disconnect sotto chiude tutto */ }
    try {
        if (typeof redisClient.disconnect === 'function') redisClient.disconnect();
    } catch (_) { /* niente da dire */ }
}

/**
 * Il corpo del comando: parsa, controlla la configurazione, gira, chiude Redis, dice il
 * codice di uscita.
 *
 * Il codice è 0 quasi sempre, anche quando è andato tutto storto: dentro un timer un
 * codice diverso accende la pagina dei failed e l'unica cosa che chi la guarda è un umano
 * che non c'è. L'unico 1 è la configurazione mancante (base ERDB), che è un errore da
 * correggere adesso e che per questo viene detto ad alta voce e per intero.
 *
 * @param {string[]} [argv]
 * @param {object}   [env]
 * @param {object}   [dip] dipendenze per i test: `{coda, fetchImpl, store, redisClient, log}`
 * @returns {Promise<number>} il codice di uscita
 */
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

    // Il client Redis condiviso va preso comunque, e chiuso nel `finally`: senza, il
    // processo resterebbe vivo sul socket e il timer non finirebbe mai.
    const redisClient = dip.redisClient === undefined ? _caricaRedis(log) : dip.redisClient;

    try {
        // REDIS_URL, ERDB_LOCAL_BASE, ERDB_CACHE_DIR e il resto stanno nel .env dell'app
        // (che è anche l'`EnvironmentFile` della unit), come negli altri script.
        try { require('dotenv').config(); } catch (_) { /* dotenv assente: si usa l'ambiente com'è */ }

        // La cartella si risolve DOPO il .env, altrimenti un `ERDB_CACHE_DIR` messo lì non
        // conterebbe. `getCacheDir()` è la stessa risoluzione della rotta che serve i file:
        // se le due divergessero, il drenatore scriverebbe file perfetti e invisibili.
        const outDir = opts.out || env.ERDB_CACHE_DIR || getCacheDir();

        // La coda: quella dell'app, che è la vera. Su richiesta e non in cima al file,
        // perché `require` di Redis e della coda è gratis ma quello dello store no (vedi
        // `preparaMappa`) e i test passano tutto iniettato.
        const coda = dip.coda || require('../src/cache/codaEventi');
        // Lo store degli anime: caricato solo se qualcuno lo chiede davvero.
        const store = dip.store === undefined
            ? _caricaStoreMappa(log)
            : dip.store;

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
        // Qui si arriva solo per un guasto vero dello script: una coda che lancia è già
        // dentro `drena`, un evento malformato anche. Si dice forte e si esce 1.
        log.error('[Drena] errore inatteso:', err);
        return 1;
    } finally {
        await chiudiRedis(redisClient);
    }
}

/** Il client Redis condiviso, o `null` se il modulo non c'è: senza, `chiudiRedis` non fa nulla. */
function _caricaRedis(log) {
    try {
        return require('../src/cache/redisClient');
    } catch (err) {
        log.error('[Drena] ioredis non installabile: la coda non è raggiungibile.',
            err && err.message ? err.message : err);
        return null;
    }
}

/** Lo store degli anime, o `null` se il modulo non c'è: senza mappa si drena lo stesso. */
function _caricaStoreMappa(log) {
    try {
        return require('../src/data/animeMappingStore');
    } catch (err) {
        log.warn(`[Drena] mappa anime non caricabile (${err && err.message ? err.message : err}): ` +
            'i poster anime di questo giro avranno solo il lato TMDB.');
        return null;
    }
}

if (require.main === module) {
    // Watchdog con `unref`: non tiene vivo il loop da solo, ma se il processo restasse
    // appeso (socket Redis, connessione ERDB, timer interno) il timer deve comunque finire.
    const watchdog = setTimeout(() => process.exit(process.exitCode || 0), DEFAULT_TIMEOUT_GIRO_MS);
    watchdog.unref();

    main().then((codice) => { process.exitCode = codice; });
}

module.exports = {
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