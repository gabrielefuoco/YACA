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
 *   node scripts/push-diff-in-coda.js --attesa-redis 20000 # attende di più la connessione
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
 * SILENZIOSO, MAI (quasi): un file assente, illeggibile o malformato è una condizione attesa
 * (il giro delle 04:00 non è ancora passato, il file è in scrittura, il diff è di un altro
 * formato) e non è un errore: si dice perché e si esce con 0. E quando non c'è nessun evento
 * da spingere non si guarda neanche Redis: si aspetterebbe un socket che non serve a niente.
 *
 * IL CODICE DI USCITA È IL CONTRATTO CON CHI CHIAMA. `ops/yaca-doppiaggi.sh` (passo 8) esce con
 * 0 solo se questo script esce 0, e in quel caso stampa "i poster cambiati sono in coda": se qui
 * si esce 0 anche quando niente è stato accodato, quel messaggio è una bugia e il guasto è
 * invisibile. Perciò 0 = "ogni evento dell'artefatto è in coda, o lo era già"; 1 = "c'è almeno
 * un evento che NON ho messo in coda". I due esiti di una `push` che risponde `false` non sono
 * la stessa cosa e non vengono più mescolati in una frase: "era già in attesa" è idempotenza (si
 * conta, non è un guasto) e "non sono riuscito a metterlo" è una perdita (si nomina, e fa 1).
 *
 * LA CORSA ALL'AVVIO, PERCHÉ ESISTE `aspettaRedis`: `src/cache/redisClient.js` si connette da
 * solo e in modo asincrono. Alla prima `push` il socket non è ancora pronto, e con
 * `enableOfflineQueue: false` il comando muore con "Stream isn't writeable and enableOfflineQueue
 * options is false"; `codaEventi` degrada e restituisce `false`, e **l'evento è perso**: il giro
 * dopo non lo riporterà (il diff è un delta), quel poster resta vecchio fino al TTL della sua
 * fascia — fino a 200 giorni — e nessuno se ne accorge. Quindi, prima della prima `push`, si
 * aspetta il client: stesso rimedio e stesse parole di `aspettaRedis` in
 * `scripts/drena-coda-poster.js`, che beve dalla stessa coda.
 *
 * PERCHÉ LA CORREZIONE STA QUI E NON IN `src/cache/codaEventi.js`: quel modulo è condiviso con
 * l'app e la sua coda **deve** degradare quando Redis non c'è (l'app è una cache: si ricostruisce,
 * e una coda che solleva porterebbe fuori un errore dove prima non ce n'era). Qui degradare in
 * silenzio significa perdere un delta, e il posto dove il guasto esiste è lo script da timer.
 */

const fs = require('fs');
const path = require('path');
const codaEventi = require('../src/cache/codaEventi');
const redisClient = require('../src/cache/redisClient');

const FILE_NAME = 'ita_annotations.diff.json';

// Tetto dell'attesa del client Redis e passo fra un'interrogazione e l'altra. Come nel
// drenatore: il tetto non serve a guarire Redis (nessuno aspetta 10 s un socket che non
// arriverà), serve a coprire il tempo di connessione vero, che è di decine di millisecondi
// quando tutto va bene. Scaduto il tetto la risposta è "non ho potuto scrivere" e la decisione
// la prende `main`, che esce 1.
const DEFAULT_ATTESA_REDIS_MS = 10000;
const INTERVALLO_ATTESA_REDIS_MS = 100;

// Quante voci si guardano per separare "era già in coda" da "non sono riuscito a metterlo in
// coda". La coda cresce di 10-50 voci al giorno con TTL di 7 giorni, quindi duemila sono
// abbondanti; e se un giorno non bastassero, lo sbaglio è verso "non spinto" — che è la parte
// che fa rumore e che si rimedia rilanciando — e non verso "tutto a posto" per un evento perso.
const LOTTO_VERIFICA_CODA = 2000;

/** Come chiama `codaEventi` le sue chiavi: leggibile nel log, e senza ambiguità. */
function chiaveEvento(evento) {
    return `${evento.tipo}|${evento.id}`;
}

/** Una dormita semplice, e non un `setTimeout` lasciato appeso: qui si aspetta sul serio. */
function _dormi(ms) {
    return new Promise((risolvi) => { setTimeout(risolvi, ms); });
}

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
    const opts = {
        filePath: percorsoDiffDefault(env),
        dryRun: false,
        help: false,
        attesaRedisMs: DEFAULT_ATTESA_REDIS_MS
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        // `--flag valore` e `--flag=valore` contano come la stessa cosa: i due stili si mescolano
        // nelle righe di un timer, e un'opzione che ne accetta uno solo è un trabucco.
        const eq = arg.indexOf('=');
        const flag = eq === -1 ? arg : arg.slice(0, eq);
        const inline = eq === -1 ? null : arg.slice(eq + 1);
        if (arg === '--file' || arg === '--diff' || flag === '--file' || flag === '--diff') {
            const valore = inline !== null ? inline : argv[++i];
            if (!valore) throw new Error(`${flag} richiede un percorso`);
            opts.filePath = path.resolve(valore);
        } else if (arg === '--attesa-redis' || flag === '--attesa-redis') {
            const valore = inline !== null ? inline : argv[++i];
            if (!valore) throw new Error('--attesa-redis richiede un numero di millisecondi');
            opts.attesaRedisMs = interoPositivo(valore, '--attesa-redis', DEFAULT_ATTESA_REDIS_MS);
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
  --attesa-redis <ms>
                  Quanto aspettare che il client Redis sia connesso prima della prima push
                  (default ${DEFAULT_ATTESA_REDIS_MS}). Copre la connessione pigra: una push su
                  un socket non ancora pronto è un evento perso, e il diff non lo riporterà.
  --dry-run       Legge l'artefatto e conta i cambiamenti senza accodare nulla
  --help, -h      Mostra questa guida

La deduplica è della coda (stesso tipo + stesso id già in attesa): rilanciare lo script
sullo stesso artefatto non raddoppia nulla.

Esito: 0 se ogni evento dell'artefatto è in coda (spinto adesso o già in attesa), 1 se almeno
uno non è stato possibile metterlo in coda. Un file assente o vuoto non è un guasto: esce 0.
`);
}

/** Numero positivo da riga di comando, col default quando non c'è. */
function interoPositivo(valore, flag, defaulto) {
    if (valore === undefined || valore === null || valore === '') return defaulto;
    const numero = Number(valore);
    if (!Number.isFinite(numero) || numero <= 0) {
        throw new Error(`${flag} vuole un numero positivo di millisecondi, non "${valore}"`);
    }
    return Math.floor(numero);
}

/**
 * Aspetta che il client Redis sia davvero connesso, **prima della prima `push`**.
 *
 * Stesso contratto di `aspettaRedis` (`scripts/drena-coda-poster.js`), che beve dalla stessa
 * coda e ha lo stesso difetto: `isAvailable` è una **getter**, non c'è nessun evento da
 * ascoltare, quindi si interroga a brevi intervalli e si esce comunque al tetto. Un client che
 * non espone la proprietà (uno stub, un fake) non ha niente da aspettare: niente attesa
 * inventata.
 *
 * @param {object} [redis] il client condiviso (o `null`)
 * @param {object} [opzioni]
 * @param {number} [opzioni.tettoMs]      aspetta massima (default `DEFAULT_ATTESA_REDIS_MS`)
 * @param {number} [opzioni.intervalloMs] passo fra un'interrogazione e l'altra
 * @param {object} [opzioni.log]
 * @returns {Promise<{pronto: boolean, interrogazioni: number, attesaMs: number}>}
 */
async function aspettaRedis(redis, {
    tettoMs = DEFAULT_ATTESA_REDIS_MS,
    intervalloMs = INTERVALLO_ATTESA_REDIS_MS,
    log = console
} = {}) {
    const subito = { pronto: true, interrogazioni: 0, attesaMs: 0 };
    // Una sola lettura per decidere: `isAvailable` è una getter e qua non si fa niente di più.
    // Senza client, o con un client che non espone la proprietà (uno stub, un fake): niente da
    // aspettare, e non si deve inventare un'attesa su una proprietà inesistente.
    if (!redis) return subito;
    const ora = redis.isAvailable;
    if (ora === true) return { ...subito, interrogazioni: 1 };
    if (typeof ora === 'undefined') return subito;

    if (!(tettoMs > 0)) return { pronto: false, interrogazioni: 1, attesaMs: 0 };
    const passo = Math.max(1, Math.min(intervalloMs > 0 ? intervalloMs : INTERVALLO_ATTESA_REDIS_MS, tettoMs));

    const inizio = Date.now();
    let interrogazioni = 1;
    log.log(`[PushDiff] Redis non è ancora connesso: aspetto al massimo ${tettoMs} ms (ogni ${passo} ms) ` +
        'prima di spingere…');

    while (Date.now() - inizio < tettoMs) {
        await _dormi(passo);
        interrogazioni += 1;
        if (redis.isAvailable === true) {
            const attesaMs = Date.now() - inizio;
            log.log(`[PushDiff] Redis connesso dopo ${attesaMs} ms: spingo.`);
            return { pronto: true, interrogazioni, attesaMs };
        }
    }
    return { pronto: false, interrogazioni, attesaMs: Date.now() - inizio };
}

/** Perché non si è spinto nulla: la coda irraggiungibile, non una coda già piena. */
function messaggioRedisNonPronto(tettoMs, eventi) {
    return `Redis NON pronto dopo ${tettoMs} ms: nessuno dei ${eventi} eventi è stato spinto, `
        + 'e non è che la coda li avesse già — è che non sono riuscito a scriverci. '
        + 'Nessun allarme silenzioso: il giro dopo non li riporterà (il diff è un delta).';
}

/**
 * Una `push` che risponde `false` non dice **perché**: `codaEventi.push` risponde `false` sia per
 * "era già in attesa" (idempotenza, nessun problema) sia per "non sono riuscito a scrivere"
 * (guasto, e l'evento è perso). L'unica fonte pubblica per separarli è la coda stessa: `take`
 * non toglie nulla, quindi si guarda e basta.
 *
 * La fotografia si fa una volta sola e si riusa: nel giro normale nessuna `push` torna `false`
 * (tutti gli eventi sono nuovi) e non si guarda niente; il caso in cui si guarda è il rilancio
 * sullo stesso artefatto o il guasto, ed è quello che va raccontato.
 */
function verificatoreInCoda(coda, log) {
    let scatto = null;
    return async function inCoda(evento) {
        if (scatto === null) {
            scatto = [];
            try {
                const inAttesa = await coda.take(LOTTO_VERIFICA_CODA);
                if (Array.isArray(inAttesa)) scatto = inAttesa;
            } catch (err) {
                // Una coda che non risponde nemmeno a `take` non può confermare niente: si dice,
                // e si risponde "non in coda" — la parte che fa rumore.
                log.warn(`[PushDiff] non riesco a guardare la coda per separare "già in coda" da ` +
                    `"non spinto": ${err.message}. Lo conto come non spinto.`);
            }
        }
        return scatto.some((e) => e && String(e.tipo) === String(evento.tipo) && String(e.id) === String(evento.id));
    };
}

/**
 * La riga che chiude il giro: tre numeri, mai "X non spinte (già in attesa, oppure coda non
 * raggiungibile)". Quei due casi hanno esiti opposti — uno è idempotenza, l'altro è una perdita
 * — e mischiati in una frase nessuno può decidere se il lavoro è stato fatto.
 */
function rigaRiepilogo(riassunto, log) {
    log.log(`[PushDiff] ${riassunto.eventi} cambiamenti in ${path.basename(riassunto.filePath)}: ` +
        `${riassunto.spinte} spinte adesso, ${riassunto.giaInCoda} già in coda, ${riassunto.falliti} falliti.`);

    if (!riassunto.falliti) return;

    const mostrati = riassunto.perduti.slice(0, 10);
    const altri = riassunto.perduti.length - mostrati.length;
    log.error(`[PushDiff] ${riassunto.falliti} eventi NON sono in coda: ${mostrati.join(', ')}` +
        `${altri > 0 ? `, e altri ${altri}` : ''}. I loro poster restano vecchi fino al TTL della fascia.`);
    log.error('[PushDiff] il diff è un delta: il giro dopo NON li riporterà. Finché l\'artefatto è quello ' +
        'di adesso si rimettono in coda rilanciando (è idempotente): ' +
        `node scripts/push-diff-in-coda.js --file ${riassunto.filePath}`);
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
 * Il giro completo: leggi l'artefatto, **aspetta che Redis sia connesso**, spinge ogni
 * cambiamento nella coda e conta i tre esiti che non vanno mescolati: spinto adesso, già in
 * attesa, non spinto.
 *
 * Non lancia mai: file assente, illeggibile o malformato sono condizioni attese dentro un timer,
 * quindi tornano con un `motivo` e zero eventi. La deduplica è della coda, non qui.
 *
 * @param {object} [opts]
 * @param {string} [opts.filePath] percorso dell'artefatto
 * @param {{push: Function, take?: Function}} [opts.coda] la coda (default: quella dell'app)
 * @param {object} [opts.redis] il client da aspettare (default: quello condiviso dell'app)
 * @param {object} [opts.log] logger
 * @param {boolean} [opts.dryRun] conta senza accodare
 * @param {number} [opts.attesaRedisMs] tetto dell'attesa del client
 * @param {number} [opts.attesaRedisIntervalloMs] passo fra un'interrogazione e l'altra
 * @returns {Promise<{filePath:string, eventi:number, spinte:number, giaInCoda:number, falliti:number,
 *                    perduti:string[], scartati:number, primoGiro:boolean, motivo:string|null,
 *                    saltato:string|null}>}
 */
async function pushDiffInCoda(opts = {}) {
    const {
        filePath = percorsoDiffDefault(),
        coda = codaEventi,
        redis = redisClient,
        log = console,
        dryRun = false,
        attesaRedisMs = DEFAULT_ATTESA_REDIS_MS,
        attesaRedisIntervalloMs = INTERVALLO_ATTESA_REDIS_MS
    } = opts;

    const riassunto = {
        filePath,
        eventi: 0,
        spinte: 0,
        giaInCoda: 0,
        falliti: 0,
        perduti: [],      // i `tipo|id` che NON sono in coda: i nomi, non un numero
        scartati: 0,
        primoGiro: false,
        motivo: null,
        saltato: null     // il giro non è andato avanti, e perché
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

    // Giro bloccato dalla guardia del writer: su disco non è cambiato niente, quindi l'artefatto
    // è vuoto e qui non c'è niente da accodare. Si dice comunque, perché un artefatto vuoto con
    // `guardia: true` è un'informazione, non un file morto.
    //
    // `cambiNonApplicati` NON viene letto, e non deve esserlo: sono i titoli che il giro avrebbe
    // toccato e che non sono stati applicati, quindi nessun poster da rifare *adesso*. Il giorno
    // in cui quei titoli verranno davvero doppiati, saranno un diff nuovo ad accodarli.
    if (artefatto.guardia === true) {
        const scartatiDalGiro = Number(artefatto.conteggioNonApplicati) || (Array.isArray(artefatto.cambiNonApplicati) ? artefatto.cambiNonApplicati.length : 0);
        log.log(`[PushDiff] giro bloccato dalla guardia: nessun doppiaggio è cambiato, 0 eventi` +
            (scartatiDalGiro > 0 ? ` (${scartatiDalGiro} cambi non applicati, non sono eventi).` : '.'));
    }

    if (dryRun) {
        log.log(`[PushDiff] dry-run: ${eventi.length} cambiamenti in ${path.basename(filePath)}, nessuno spinto.`);
        return riassunto;
    }

    // Nessun evento = nessuna coda da toccare: non si aspetta Redis e non lo si guarda. Un giro
    // di primo giro (o bloccato dalla guardia) non deve costare 10 s di attesa per niente, e non
    // deve nemmeno uscire 1 perché un socket non serve a nessuno.
    if (!eventi.length) {
        rigaRiepilogo(riassunto, log);
        return riassunto;
    }

    // PRIMA DELLA PRIMA PUSH, e per la ragione più cara di questo file: il diff è un delta.
    // `redisClient` si connette in modo asincrono e `enableOfflineQueue: false` fa fallire
    // ogni comando su un socket non ancora pronto ("Stream isn't writeable and enableOfflineQueue
    // options is false"): `codaEventi` degrada a `false`, l'evento non entra in coda e il giro
    // dopo non lo riporterà mai. Quel poster resta vecchio fino al TTL della sua fascia e non
    // c'è nessun allarme. Quindi si aspetta il client, e se proprio non arriva si dice che è
    // quello il motivo — "coda irraggiungibile" e "già in coda" sono due guasti opposti.
    const attesa = await aspettaRedis(redis, { tettoMs: attesaRedisMs, intervalloMs: attesaRedisIntervalloMs, log });
    if (!attesa.pronto) {
        riassunto.saltato = messaggioRedisNonPronto(attesaRedisMs, eventi.length);
        log.warn(`[PushDiff] ${riassunto.saltato}`);
        riassunto.falliti = eventi.length;
        riassunto.perduti = eventi.map(chiaveEvento);
        rigaRiepilogo(riassunto, log);
        return riassunto;
    }

    const inCoda = verificatoreInCoda(coda, log);

    for (const evento of eventi) {
        let accodato = false;
        try {
            accodato = await coda.push(evento);
        } catch (err) {
            // `codaEventi` non lancia mai; si è qui perché un `push` finto o un futuro coda
            // diverso non deve trasformare un problema in un'eccezione non gestita dentro un timer.
            log.warn(`[PushDiff] push di ${chiaveEvento(evento)} lanciato: ${err.message}`);
        }
        if (accodato) {
            riassunto.spinte++;
            continue;
        }

        // `false` è ambiguo, e l'ambiguità è il difetto: si guarda la coda e si separa. "C'era
        // già" è idempotenza — nessun problema, e il numero esce accanto agli altri. "Non c'è"
        // è una perdita, e una perdita ha un nome (`perduti`) e un codice di uscita.
        if (await inCoda(evento)) {
            riassunto.giaInCoda++;
        } else {
            riassunto.falliti++;
            riassunto.perduti.push(chiaveEvento(evento));
            log.warn(`[PushDiff] ${chiaveEvento(evento)} NON è in coda: la push non l'ha accodato e ` +
                `la coda non lo contiene. Il suo poster resta vecchio fino al TTL della sua fascia.`);
        }
    }

    rigaRiepilogo(riassunto, log);

    return riassunto;
}

/** Chiude il client Redis condiviso: senza, il processo resterebbe vivo sul socket. */
async function chiudiRedis(redis = redisClient) {
    if (!redis || typeof redis.quit !== 'function') return;
    try {
        await redis.quit();
    } catch (_) { /* era già chiuso: niente da dire */ }
}

/**
 * Il corpo del comando: parsa, gira, chiude Redis, **dice il codice di uscita**.
 *
 * Il codice è il contratto con `ops/yaca-doppiaggi.sh` (passo 8), che in base a questo numero
 * stampa o "i poster cambiati sono in coda" o un errore. Quindi: 0 se ogni evento dell'artefatto
 * è in coda — spinto adesso o già in attesa, che sono la stessa cosa dal punto di vista del
 * poster che deve essere rifatto — e 1 se almeno uno non l'ho potuto mettere. Un file assente
 * o un artefatto vuoto restano 0: non c'è nessun evento da perdere, e svegliere qualcuno per
 * quello sarebbe il modo migliore per farsi ignorare al primo guasto vero.
 *
 * @param {string[]} [argv]
 * @param {object}   [env]
 * @param {object}   [dip] dipendenze per i test: `{coda, redis, log}`
 * @returns {Promise<number>} il codice di uscita
 */
async function main(argv = process.argv.slice(2), env = process.env, dip = {}) {
    const log = dip.log || console;

    let opts;
    try {
        opts = parseArgs(argv, env);
    } catch (err) {
        log.error(`[PushDiff] ${err.message}`);
        return 1;
    }

    if (opts.help) {
        printHelp();
        return 0;
    }

    const redis = dip.redis === undefined ? redisClient : dip.redis;
    const coda = dip.coda === undefined ? codaEventi : dip.coda;

    try {
        // REDIS_URL (e il resto dell'ambiente) stanno nel .env dell'app, come negli altri script.
        try { require('dotenv').config(); } catch (_) { /* dotenv assente: si usa l'ambiente com'è */ }
        const esito = await pushDiffInCoda({ ...opts, coda, redis, log });
        return esito.falliti > 0 ? 1 : 0;
    } catch (err) {
        // A questo punto è un guasto vero dello script (non un file che non c'è): si dice forte.
        log.error('[PushDiff] errore inatteso:', err);
        return 1;
    } finally {
        await chiudiRedis(redis);
    }
}

if (require.main === module) {
    // Il watchdog non ref': se per un motivo qualunque il processo restasse appeso sul socket
    // Redis, il timer deve comunque finire. `unref` così non tiene vivo il loop da solo.
    //
    // Il tetto del watchdog non è un numero fisso: è **l'attesa di Redis più 5 s**, perché il
    // lavoro legittimo più lungo di questo script è proprio quell'attesa. Con i vecchi 5 s
    // fissi il watchdog avrebbe ammazzato il processo a metà attesa e il passo 8 avrebbe
    // stampato "i poster cambiati sono in coda" per un giro mai arrivato al primo `push`.
    let tetto = DEFAULT_ATTESA_REDIS_MS;
    try {
        tetto = parseArgs(process.argv.slice(2), process.env).attesaRedisMs;
    } catch (_) { /* argomenti rotti: `main` lo dirà e uscirà 1 */ }

    let finito = false;
    const watchdog = setTimeout(() => {
        // Se il giro non è finito non si può dire che la push è riuscita: si esce 1. Il passo 8
        // allora urlerebbe per un guasto vero invece di dichiarare vittoria.
        process.exit(finito ? (process.exitCode || 0) : 1);
    }, tetto + 5000);
    watchdog.unref();

    main().then((codice) => { finito = true; process.exitCode = codice; });
}

module.exports = {
    FILE_NAME,
    DEFAULT_ATTESA_REDIS_MS,
    INTERVALLO_ATTESA_REDIS_MS,
    LOTTO_VERIFICA_CODA,
    dirDati,
    percorsoDiffDefault,
    parseArgs,
    leggiArtefatto,
    eventoDaCambio,
    eventiDaArtefatto,
    aspettaRedis,
    messaggioRedisNonPronto,
    verificaInCoda: verificatoreInCoda,
    rigaRiepilogo,
    pushDiffInCoda,
    main
};
