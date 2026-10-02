/**
 * tests/codaEventi.test.js
 *
 * La coda degli eventi: quando un titolo diventa doppiato o esce un episodio, il poster
 * composto va rifatto e serve dirlo da qualche parte. Qui non c'è un drenatore, solo la coda.
 *
 * I test girano su un **Redis finto in memoria** (niente connessioni, niente container): conta
 * solo che il modulo parli con `src/cache/redisClient` attraverso l'interfaccia Redis e che,
 * se quel client exploda, nessuno chiedente ci cada dentro.
 *
 * Il contratto verificato:
 * - push + take: l'evento esce con i suoi dati;
 * - stesso evento due volte: una sola voce in coda;
 * - take NON toglie: un secondo take lo restituisce ancora (il drenatore può morire a metà);
 * - done: non torna più; fail: torna al take dopo, e dopo 5 tentativi sparisce;
 * - take(n): mai più di n, e sempre in ordine di arrivo;
 * - Redis che lancia: `take` dà `[]`, `push`/`done`/`fail` degradano, nulla propaga.
 */

const codaEventi = require('../src/cache/codaEventi');
const { createCodaEventi, MAX_TENTATIVI, TTL_SECONDS } = codaEventi;

const EVENTO = { tipo: 'doppiato', id: 'kitsu:1234', badge: 'ITA' };
const ALTRO_EVENTO = { tipo: 'episodio', id: 'kitsu:1234', badge: null };

/**
 * Redis finto in memoria: solo i comandi che la coda usa davvero (liste e hash).
 * Non è un emulator: se il modulo usasse un comando "esotico", qui fallirebbe rumorosamente.
 */
function creaRedisFinto() {
    const liste = new Map();  // chiave -> array di valori (coda: le chiavi, in ordine di arrivo)
    const hash = new Map();   // chiave -> Map(campo -> valore)
    const ttl = new Map();    // chiave -> secondi di scadenza applicati

    const _lista = (chiave) => {
        if (!liste.has(chiave)) liste.set(chiave, []);
        return liste.get(chiave);
    };
    const _hash = (chiave) => {
        if (!hash.has(chiave)) hash.set(chiave, new Map());
        return hash.get(chiave);
    };

    return {
        ttl,
        async hsetnx(chiave, campo, valore) {
            const h = _hash(chiave);
            if (h.has(campo)) return 0;
            h.set(campo, String(valore));
            return 1;
        },
        async hmget(chiave, ...campi) {
            const h = _hash(chiave);
            return campi.map((campo) => (h.has(campo) ? h.get(campo) : null));
        },
        async hexists(chiave, campo) {
            return _hash(chiave).has(campo) ? 1 : 0;
        },
        async hdel(chiave, campo) {
            return _hash(chiave).delete(campo) ? 1 : 0;
        },
        async hincrby(chiave, campo, incremento) {
            const h = _hash(chiave);
            const valore = (Number(h.get(campo)) || 0) + incremento;
            h.set(campo, String(valore));
            return valore;
        },
        async rpush(chiave, ...valori) {
            const lista = _lista(chiave);
            lista.push(...valori);
            return lista.length;
        },
        async lrange(chiave, inizio, fine) {
            return _lista(chiave).slice(Math.max(0, inizio), fine + 1);
        },
        async lrem(chiave, _conta, valore) {
            const lista = _lista(chiave);
            let rimossi = 0;
            for (let i = lista.length - 1; i >= 0; i--) {
                if (lista[i] === valore) {
                    lista.splice(i, 1);
                    rimossi++;
                }
            }
            return rimossi;
        },
        async expire(chiave, secondi) {
            ttl.set(chiave, secondi);
            return 1;
        }
    };
}

/** Redis spento: ogni comando solleva, come quando il container non parte. */
function redisRotto(messaggio = 'Connection is closed.') {
    const rotto = async () => { throw new Error(messaggio); };
    return {
        hsetnx: rotto, hmget: rotto, hexists: rotto, hdel: rotto, hincrby: rotto,
        rpush: rotto, lrange: rotto, lrem: rotto, expire: rotto
    };
}

describe('Coda degli eventi di ricomposizione dei poster', () => {
    let redis;
    let coda;
    let warn;

    beforeEach(() => {
        redis = creaRedisFinto();
        coda = createCodaEventi(redis);
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    test('il modulo espone l\'API richiesta e le costanti', () => {
        expect(typeof codaEventi.push).toBe('function');
        expect(typeof codaEventi.take).toBe('function');
        expect(typeof codaEventi.done).toBe('function');
        expect(typeof codaEventi.fail).toBe('function');
        expect(MAX_TENTATIVI).toBe(5);
        // Un evento non deve scadere prima di essere servito: giorni, non minuti.
        expect(TTL_SECONDS).toBeGreaterThanOrEqual(2 * 24 * 60 * 60);
    });

    test('la coda parte vuota', async () => {
        expect(await coda.take(10)).toEqual([]);
    });

    test('push + take: l\'evento esce con tipo, id e badge', async () => {
        expect(await coda.push(EVENTO)).toBe(true);

        expect(await coda.take(10)).toEqual([{ tipo: 'doppiato', id: 'kitsu:1234', badge: 'ITA' }]);
    });

    test('push senza badge: il campo resta null invece di sparire', async () => {
        await coda.push({ tipo: 'episodio', id: 'anime:999' });

        expect(await coda.take(1)).toEqual([{ tipo: 'episodio', id: 'anime:999', badge: null }]);
    });

    test('lo stesso evento due volte lascia una sola voce in coda', async () => {
        expect(await coda.push(EVENTO)).toBe(true);
        expect(await coda.push({ ...EVENTO })).toBe(false); // già in attesa
        expect(await coda.push(EVENTO)).toBe(false);

        expect(await coda.take(10)).toHaveLength(1);
    });

    test('lo stesso id con tipo diverso è un evento diverso', async () => {
        await coda.push(EVENTO);
        await coda.push(ALTRO_EVENTO);

        const eventi = await coda.take(10);
        expect(eventi.map((e) => e.tipo)).toEqual(['doppiato', 'episodio']);
    });

    test('take NON toglie: un secondo take restituisce ancora l\'evento', async () => {
        await coda.push(EVENTO);

        expect(await coda.take(10)).toHaveLength(1);
        expect(await coda.take(10)).toHaveLength(1);
        expect(await coda.take(10)).toHaveLength(1);
    });

    test('done: l\'evento non torna più', async () => {
        await coda.push(EVENTO);

        expect(await coda.done(EVENTO)).toBe(true);
        expect(await coda.take(10)).toEqual([]);
        expect(await coda.done(EVENTO)).toBe(false); // idempotente
    });

    test('done chiude solo l\'evento indicato', async () => {
        await coda.push(EVENTO);
        await coda.push(ALTRO_EVENTO);

        await coda.done(EVENTO);

        expect(await coda.take(10)).toEqual([ALTRO_EVENTO]);
    });

    test('fail: l\'evento resta in coda e viene ritentato al take dopo', async () => {
        await coda.push(EVENTO);

        expect(await coda.fail(EVENTO)).toBe(false); // non ancora scartato
        expect(await coda.take(10)).toEqual([{ tipo: 'doppiato', id: 'kitsu:1234', badge: 'ITA' }]);
    });

    test(`dopo ${MAX_TENTATIVI} fallimenti l'evento viene scartato e non blocca la coda`, async () => {
        await coda.push(EVENTO);          // evento velenoso: in testa alla coda
        await coda.push(ALTRO_EVENTO);    // evento buono: deve comunque arrivare

        for (let tentativo = 1; tentativo < MAX_TENTATIVI; tentativo++) {
            expect(await coda.fail(EVENTO)).toBe(false);
            expect(await coda.take(10)).toHaveLength(2); // ancora in coda, ancora ritentabile
        }

        expect(await coda.fail(EVENTO)).toBe(true); // scartato

        expect(await coda.take(10)).toEqual([ALTRO_EVENTO]);
        expect(await coda.fail(EVENTO)).toBe(false); // niente più da contare
    });

    test('take(n) non restituisce più di n e rispetta l\'ordine di arrivo', async () => {
        for (let i = 1; i <= 5; i++) {
            await coda.push({ tipo: 'episodio', id: `anime:${i}` });
        }

        expect((await coda.take(2)).map((e) => e.id)).toEqual(['anime:1', 'anime:2']);
        // Niente è stato tolto: il lotto successivo riparte dall'inizio e si ferma a 10.
        expect((await coda.take(10)).map((e) => e.id))
            .toEqual(['anime:1', 'anime:2', 'anime:3', 'anime:4', 'anime:5']);
        expect(await coda.take(0)).toEqual([]);

        // Chiusi i primi due, la coda riparte dal terzo.
        await coda.done({ tipo: 'episodio', id: 'anime:1' });
        await coda.done({ tipo: 'episodio', id: 'anime:2' });
        expect((await coda.take(10)).map((e) => e.id)).toEqual(['anime:3', 'anime:4', 'anime:5']);
    });

    test('un id numerico viene trattato come stringa, quindi deduplica lo stesso', async () => {
        expect(await coda.push({ tipo: 'doppiato', id: 1234 })).toBe(true);
        expect(await coda.push({ tipo: 'doppiato', id: '1234' })).toBe(false);

        expect(await coda.take(10)).toEqual([{ tipo: 'doppiato', id: '1234', badge: null }]);
    });

    test('un evento senza tipo o senza id viene rifiutato e non lascia spazzature', async () => {
        expect(await coda.push({ id: 'kitsu:1234' })).toBe(false);
        expect(await coda.push({ tipo: 'doppiato' })).toBe(false);
        expect(await coda.push({ tipo: '  ', id: 'kitsu:1234' })).toBe(false);
        expect(await coda.push()).toBe(false);

        expect(await coda.take(10)).toEqual([]);
    });

    test('il TTL lungo viene applicato a tutte le chiavi della coda', async () => {
        await coda.push(EVENTO);

        expect(redis.ttl.get('event_queue:in_attesa')).toBe(TTL_SECONDS);
        expect(redis.ttl.get('event_queue:eventi')).toBe(TTL_SECONDS);
        expect(redis.ttl.get('event_queue:tentativi')).toBe(TTL_SECONDS);
    });

    test('se la scrittura in coda fallisce, l\'evento resta ripubblicabile', async () => {
        const rpushSano = redis.rpush;
        redis.rpush = async () => { throw new Error('READONLY Redis giù'); };

        expect(await coda.push(EVENTO)).toBe(false);

        redis.rpush = rpushSano;
        expect(await coda.push(EVENTO)).toBe(true); // non è rimasto "occupato" per sempre
        expect(await coda.take(10)).toHaveLength(1);
    });

    describe('con Redis giù', () => {
        beforeEach(() => {
            coda = createCodaEventi(redisRotto());
        });

        test('take restituisce [] e non propaga l\'eccezione', async () => {
            await expect(coda.take(10)).resolves.toEqual([]);
        });

        test('push, done e fail degradano: nessuno dei chiamanti cade', async () => {
            await expect(coda.push(EVENTO)).resolves.toBe(false);
            await expect(coda.done(EVENTO)).resolves.toBe(false);
            await expect(coda.fail(EVENTO)).resolves.toBe(false);
            expect(warn).toHaveBeenCalled();
        });

        test('un take su un client a metà non rimescola gli eventi', async () => {
            redis.lrange = async () => { throw new Error('timeout'); };
            coda = createCodaEventi(redis);

            await expect(coda.take(10)).resolves.toEqual([]);
        });
    });
});