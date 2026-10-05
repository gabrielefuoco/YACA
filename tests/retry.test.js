const { withRetry, isTransientError, RetryLimitError } = require('../src/utils/retry');

/** Errore finto con un `code` di sistema (stile DNS/rete di Node) */
function netError(code, message = code) {
    const err = new Error(message);
    err.code = code;
    return err;
}

/** Errore finto con uno status HTTP (stile axios/fetch) */
function httpError(status, message = `HTTP ${status}`) {
    const err = new Error(message);
    err.response = { status };
    return err;
}

function sleeper() {
    const calls = [];
    const sleep = (ms) => {
        calls.push(ms);
        return Promise.resolve();
    };
    sleep.calls = calls;
    return sleep;
}

describe('isTransientError', () => {
    it('tratta come transitori i codici DNS e rete che si risolvono da soli', () => {
        ['EAI_AGAIN', 'ESERVFAIL', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'EPIPE'].forEach((code) => {
            expect(isTransientError(netError(code))).toBe(true);
        });
    });

    it('tratta come transitori i messaggi di lookup non risolvibile', () => {
        expect(isTransientError(new Error('getaddrinfo ESERVFAIL shard-3.example.org'))).toBe(true);
        expect(isTransientError(new Error('querySrv ENOTFOUND _xmpp-client._tcp.example.org'))).toBe(true);
        expect(isTransientError(new Error('socket hang up'))).toBe(true);
    });

    it('tratta come transitori gli status di server e rate limit', () => {
        [408, 429, 500, 502, 503, 504].forEach((status) => {
            expect(isTransientError(httpError(status))).toBe(true);
        });
    });

    it('NON tratta come transitori autenticazione e dati non validi', () => {
        [400, 401, 403, 404, 409, 422].forEach((status) => {
            expect(isTransientError(httpError(status))).toBe(false);
        });
        expect(isTransientError(new Error('invalid credentials'))).toBe(false);
        expect(isTransientError(new Error('payload non valido'))).toBe(false);
    });

    it('NON tratta come transitori gli errori di logica (nessun codice, nessuno status)', () => {
        expect(isTransientError(new Error('il film non esiste'))).toBe(false);
        expect(isTransientError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    });

    it('rispetta un indicatore esplicito sull errore', () => {
        expect(isTransientError({ transient: true, message: 'qualsiasi' })).toBe(true);
        expect(isTransientError({ transient: false, code: 'EAI_AGAIN' })).toBe(false);
    });
});

describe('withRetry', () => {
    it('riesce al secondo tentativo quando il primo fallisce per un errore transitorio', async () => {
        const sleep = sleeper();
        let tentativi = 0;

        const risultato = await withRetry(async () => {
            tentativi += 1;
            if (tentativi === 1) throw netError('EAI_AGAIN');
            return 'ok';
        }, { sleep });

        expect(risultato).toBe('ok');
        expect(tentativi).toBe(2);
        expect(sleep.calls).toHaveLength(1);
    });

    it('non chiama l operazione quando il primo tentativo va bene', async () => {
        const sleep = sleeper();
        let tentativi = 0;

        const risultato = await withRetry(async () => {
            tentativi += 1;
            return 42;
        }, { sleep });

        expect(risultato).toBe(42);
        expect(tentativi).toBe(1);
        expect(sleep.calls).toHaveLength(0);
    });

    it('fallisce con un errore chiaro dopo il tetto, riportando ultimo errore e tentativi', async () => {
        const sleep = sleeper();
        let tentativi = 0;

        await expect(withRetry(async () => {
            tentativi += 1;
            throw netError('ESERVFAIL');
        }, { maxAttempts: 3, sleep })).rejects.toThrow(RetryLimitError);

        expect(tentativi).toBe(3);

        let errore = null;
        try {
            await withRetry(async () => { throw netError('ESERVFAIL'); }, { maxAttempts: 2, sleep });
        } catch (e) {
            errore = e;
        }
        expect(errore).toBeInstanceOf(RetryLimitError);
        expect(errore.attempts).toBe(2);
        expect(errore.cause.code).toBe('ESERVFAIL');
        expect(errore.message).toMatch(/2/);
    });

    it('non ritenta gli errori non transitori: un solo tentativo e l errore originale', async () => {
        const sleep = sleeper();

        for (const errore of [httpError(401), httpError(403), httpError(400), new Error('invalid credentials')]) {
            let tentativi = 0;
            await expect(withRetry(async () => {
                tentativi += 1;
                throw errore;
            }, { sleep })).rejects.toBe(errore);
            expect(tentativi).toBe(1);
        }
        expect(sleep.calls).toHaveLength(0);
    });

    it('aspetta un attesa breve e crescente fra i tentativi', async () => {
        const sleep = sleeper();

        await withRetry(async () => { throw netError('ECONNRESET'); }, {
            maxAttempts: 4,
            delayMs: 100,
            backoffFactor: 2,
            sleep,
            onRetry: () => {}
        }).catch(() => {});

        expect(sleep.calls).toEqual([100, 200, 400]);
    });

    it('notifica ogni ritentativo con numero del tentativo ed errore', async () => {
        const sleep = sleeper();
        const eventi = [];

        await withRetry(async () => {
            if (eventi.length < 2) throw netError('EAI_AGAIN');
            return 'ok';
        }, {
            sleep,
            onRetry: ({ attempt, error }) => eventi.push({ attempt, code: error.code }),
        });

        expect(eventi).toEqual([{ attempt: 1, code: 'EAI_AGAIN' }, { attempt: 2, code: 'EAI_AGAIN' }]);
    });

    it('propaga un errore non-Error senza degradarsi', async () => {
        const sleep = sleeper();
        let tentativi = 0;

        await expect(withRetry(async () => {
            tentativi += 1;
            throw 'boom';
        }, { sleep })).rejects.toBe('boom');
        expect(tentativi).toBe(1);
    });

    it('non aspetta davvero quando lo sleep non è iniettato ma il tetto è 1', async () => {
        await expect(withRetry(async () => { throw netError('EAI_AGAIN'); }, { maxAttempts: 1 }))
            .rejects.toThrow(RetryLimitError);
    });
});