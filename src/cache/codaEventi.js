const redisClient = require('./redisClient');

/**
 * Coda degli eventi di ricomposizione dei poster.
 *
 * I poster composti sono file statici serviti da `/erdb-poster/<file>`: finché il titolo non
 * cambia, il file va bene per mesi. Ma quando un titolo diventa doppiato, o esce un episodio
 * nuovo nel simulcast, quel file è vecchio — e aspettare il TTL della cache non è un'opzione.
 *
 * Chi rileva il cambiamento chiama `push({ tipo, id, badge })`: l'evento finisce in coda e
 * un drenatore (compito successivo, non questo) lo consumerà con `take(n)` → `done()`/`fail()`.
 *
 * Contratto:
 * - `push` mette in coda e **non duplica** un evento già in attesa (stesso `tipo` + stesso `id`);
 * - `take` restituisce fino a `n` eventi **senza toglierli**: chi li prende può morire a metà,
 *   e un evento non deve sparire perché il processo che lo stava servendo è morto;
 * - `done` chiude l'evento, `fail` lo lascia in coda per il tentativo dopo.
 *
 * Il modulo non mantiene **nessuno stato in memoria** (l'app è un processo solo: lo stato vero
 * sta in Redis) e **non lancia mai**: se Redis è giù ogni operazione degrada e logga.
 */

// TTL delle tre chiavi: 7 giorni. Un evento non deve scadere prima di essere servito (il
// drenatore può stare fermo per un weekend, un deploy, un Postgres che non parte), ma una voce
// abbandonata per sempre non deve nemmeno restare lì: dopo una settimana sparisce da sola.
const TTL_SECONDS = 7 * 24 * 60 * 60;

// Dopo 5 tentativi falliti l'evento viene scartato. 5 volte abbondano per un fallimento vero
// (build lento, disco pieno, rete che va e viene) e non sono abbastanza per girare all'infinito:
// un evento velenoso non deve poter bloccare la coda per sempre.
const MAX_TENTATIVI = 5;

// Quanti eventi `take(n)` restituisce quando il chiamante non dice nulla. La coda cresce di
// 10-50 voci al giorno: un lotto da 10 la svuota in qualche giorno.
const DEFAULT_BATCH = 10;

// Tre strutture, tutte leggere e tutte con lo stesso TTL:
// - LIST  delle chiavi in ordine di arrivo (è la coda vera e propria);
// - HASH  chiave -> evento in JSON (fa anche da deduplica: `HSETNX` scrive solo se assente);
// - HASH  chiave -> quanti tentativi falliti (letto solo da `fail`).
const K_CODA = 'event_queue:in_attesa';
const K_EVENTI = 'event_queue:eventi';
const K_TENTATIVI = 'event_queue:tentativi';

const CHIAVI_REDIS = [K_CODA, K_EVENTI, K_TENTATIVI];

/**
 * Esegue un comando Redis senza mai propagare l'errore: la coda è un extra, se Redis è giù
 * l'applicazione deve continuare a funzionare come prima. Logga e restituisce il fallback.
 */
async function _esegui(descrizione, operazione, fallback = null) {
    try {
        return await operazione();
    } catch (err) {
        console.warn(`[CodaEventi] ${descrizione} fallito: ${err.message}`);
        return fallback;
    }
}

/**
 * Accetta stringhe e numeri (gli id possono arrivare come `123` o come `kitsu:123:1:1`).
 * Tutto il resto (null, oggetti, stringhe vuote) è un evento malformato e viene rifiutato.
 */
function _pulito(valore) {
    if (typeof valore === 'number') return Number.isFinite(valore) ? String(valore) : '';
    if (typeof valore !== 'string') return '';
    return valore.trim();
}

/**
 * Chiave dell'evento: `tipo|id`. Il `|` non compare mai nei nostri id (che usano `:`), quindi
 * due eventi diversi non possono finire con la stessa chiave.
 */
function _chiave(tipo, id) {
    return `${tipo}|${id}`;
}

/** Ricostruisce la chiave dalla chiamata `{ tipo, id }`; stringa vuota se l'evento è malformato. */
function _chiaveDaEvento(evento) {
    if (!evento || typeof evento !== 'object') return '';
    const tipo = _pulito(evento.tipo);
    const id = _pulito(evento.id);
    if (!tipo || !id) {
        console.warn('[CodaEventi] evento scartato: manca "tipo" o "id"');
        return '';
    }
    return _chiave(tipo, id);
}

/** Quanti eventi chiedere: intero positivo, con un default quando il chiamante non dice nulla. */
function _lotto(n) {
    if (n === undefined || n === null) return DEFAULT_BATCH;
    const numero = Number(n);
    if (!Number.isFinite(numero) || numero <= 0) return 0;
    return Math.floor(numero);
}

/**
 * Costruisce la coda su un client Redis. Di default usa il client condiviso dell'app
 * (`src/cache/redisClient`): nessuna nuova connessione, nessuna seconda fonte di verità.
 * Il parametro esiste solo per i test, che passano un Redis finto in memoria.
 */
function createCodaEventi(client = redisClient) {

    /** Ttiene vivo il TTL delle tre chiavi: si rinnova a ogni push, non a ogni lettura. */
    async function _rinfrescaTtl() {
        for (const chiaveRedis of CHIAVI_REDIS) {
            await _esegui(`TTL su ${chiaveRedis}`, () => client.expire(chiaveRedis, TTL_SECONDS));
        }
    }

    /** Toglie una voce dalla coda e ogni sua traccia dai contatori. */
    async function _rimuovi(chiave) {
        const rimossi = await _esegui(`rimozione di ${chiave}`, () => client.lrem(K_CODA, 0, chiave), 0);
        await _esegui(`cleanup di ${chiave}`, () => client.hdel(K_EVENTI, chiave));
        await _esegui(`cleanup tentativi di ${chiave}`, () => client.hdel(K_TENTATIVI, chiave));
        return rimossi;
    }

    /**
     * Mette un evento in coda.
     * @returns {Promise<boolean>} true se è stato accodato adesso, false se era già in attesa
     *          (o se l'evento è malformato, o se Redis non ha potuto scrivere).
     */
    async function push(evento) {
        const chiave = _chiaveDaEvento(evento);
        if (!chiave) return false;

        const daAccodare = {
            tipo: _pulito(evento.tipo),
            id: _pulito(evento.id),
            badge: evento.badge === undefined ? null : evento.badge
        };

        // `HSETNX` fa due cose in un colpo: conserva il payload e deduplica (0 = già in attesa).
        const nuovo = await _esegui(
            `push di ${chiave}`,
            () => client.hsetnx(K_EVENTI, chiave, JSON.stringify(daAccodare)),
            0
        );
        if (!nuovo) return false;

        const inCoda = await _esegui(
            `push di ${chiave}`,
            () => client.rpush(K_CODA, chiave),
            0
        );
        if (!inCoda) {
            // Redis è caduto a metà: senza questo rollback l'evento resterebbe "occupato"
            // (niente duplicati) ma invisibile a `take`, cioè swallowato per una settimana.
            await _esegui(`rollback di ${chiave}`, () => client.hdel(K_EVENTI, chiave));
            return false;
        }

        await _rinfrescaTtl();
        return true;
    }

    /**
     * Restituisce fino a `n` eventi **in attesa**, in ordine di arrivo, **senza toglierli**.
     * Chi chiama `take` e poi muore a metà non perde nulla: gli eventi restano in coda e
     * tornano al `take` successivo.
     * @returns {Promise<Array<{tipo: string, id: string, badge: *}>>} lista vuota se non
     *          c'è niente in coda, o se Redis non ha potuto rispondere.
     */
    async function take(n) {
        const lotto = _lotto(n);
        if (lotto <= 0) return [];

        const chiavi = await _esegui('take', () => client.lrange(K_CODA, 0, lotto - 1), []);
        if (!chiavi.length) return [];

        const grezzi = await _esegui('take', () => client.hmget(K_EVENTI, ...chiavi), []);

        const eventi = [];
        for (let i = 0; i < chiavi.length; i++) {
            if (!grezzi[i]) continue; // payload già sparito: la voce non è più servibile
            try {
                eventi.push(JSON.parse(grezzi[i]));
            } catch (err) {
                console.warn(`[CodaEventi] evento illeggibile in coda (${chiavi[i]}): ${err.message}`);
            }
        }
        return eventi;
    }

    /**
     * Segna l'evento come fatto: non tornerà più (fino a un eventuale nuovo `push`).
     * @returns {Promise<boolean>} true se c'era davvero qualcosa da chiudere.
     */
    async function done(evento) {
        const chiave = _chiaveDaEvento(evento);
        if (!chiave) return false;
        const rimossi = await _rimuovi(chiave);
        return rimossi > 0;
    }

    /**
     * Segna un tentativo fallito: l'evento **resta in coda** e verrà ritentato.
     * Dopo `MAX_TENTATIVI` fallimenti viene scartato, così non blocca la testa della coda per sempre.
     * @returns {Promise<boolean>} true se l'evento è stato scartato, false se resta in coda.
     */
    async function fail(evento) {
        const chiave = _chiaveDaEvento(evento);
        if (!chiave) return false;

        // Solo gli eventi davvero in coda contano: un `fail` su qualcosa di già chiuso non deve
        // lasciare spazzatura nel contatore.
        const inCoda = await _esegui(`fail di ${chiave}`, () => client.hexists(K_EVENTI, chiave), 0);
        if (!inCoda) return false;

        const tentativi = await _esegui(`fail di ${chiave}`, () => client.hincrby(K_TENTATIVI, chiave, 1), 0);
        if (tentativi < MAX_TENTATIVI) return false; // resta in coda, verrà ritentato

        await _rimuovi(chiave);
        console.warn(`[CodaEventi] evento ${chiave} scartato dopo ${tentativi} tentativi`);
        return true;
    }

    return { push, take, done, fail };
}

// La coda dell'app: stesso client Redis di cache e admin, stesso processo.
const codaEventi = createCodaEventi(redisClient);

module.exports = {
    ...codaEventi,
    createCodaEventi,
    MAX_TENTATIVI,
    TTL_SECONDS,
    DEFAULT_BATCH
};