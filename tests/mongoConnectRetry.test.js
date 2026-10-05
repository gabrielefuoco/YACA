/**
 * Il giro da timer deve arrivare in fondo quando la rete fa un singhiozzo:
 * qui si simula esattamente quello (primo tentativo fallito per DNS, secondo buono)
 * e si verifica che una riga di log lo dichiari.
 */

const { connectMongo } = require('../src/utils/mongoConnect');
const { RetryLimitError } = require('../src/utils/retry');

function mongoFinto(comportamento) {
    const stato = { tentativi: 0 };
    return {
        stato,
        connect: jest.fn(async () => {
            stato.tentativi += 1;
            return comportamento(stato.tentativi);
        })
    };
}

function erroreDns() {
    const err = new Error('querySrv ENOTFOUND _mongodb._tcp.shard-3.acme.mongodb.net');
    err.code = 'ENOTFOUND';
    return err;
}

function loggerFinto() {
    const righe = { warn: [], log: [] };
    return {
        righe,
        warn: (msg) => righe.warn.push(msg),
        log: (msg) => righe.log.push(msg)
    };
}

describe('connectMongo: il giro completa al secondo tentativo', () => {
    it('ritenta un errore DNS transitorio e completa il giro', async () => {
        const mongo = mongoFinto((n) => {
            if (n === 1) throw erroreDns();
            return { pronto: true };
        });
        const logger = loggerFinto();

        const conn = await connectMongo('mongodb://atlas.example', {
            mongoose: mongo,
            logger,
            delayMs: 1
        });

        expect(conn).toEqual({ pronto: true });
        expect(mongo.connect).toHaveBeenCalledTimes(2);
        expect(logger.righe.warn).toHaveLength(1);
        // la riga dichiara il prossimo tentativo (2/3) e quanto si aspetta
        expect(logger.righe.warn[0]).toMatch(/ritento fra 1ms \(tentativo 2\/3\)/);
        expect(logger.righe.warn[0]).toMatch(/ENOTFOUND/);
    });

    it('passa le opzioni di connessione a mongoose e usa l URI ricevuto', async () => {
        const mongo = mongoFinto(() => ({ pronto: true }));
        await connectMongo('mongodb://atlas.example/db', {
            mongoose: mongo,
            logger: loggerFinto(),
            connectOptions: { serverSelectionTimeoutMS: 15000 }
        });
        expect(mongo.connect).toHaveBeenCalledWith('mongodb://atlas.example/db', { serverSelectionTimeoutMS: 15000 });
    });

    it('chiama il driver una sola volta se va tutto bene al primo tentativo', async () => {
        const mongo = mongoFinto(() => ({ pronto: true }));
        const logger = loggerFinto();
        await connectMongo('mongodb://atlas.example', { mongoose: mongo, logger, delayMs: 1 });
        expect(mongo.connect).toHaveBeenCalledTimes(1);
        expect(logger.righe.warn).toHaveLength(0);
    });

    it('non spara log quando non c è nulla da ritentare', async () => {
        const mongo = mongoFinto(() => ({ pronto: true }));
        const logger = loggerFinto();
        await connectMongo('mongodb://x', { mongoose: mongo, logger });
        expect(logger.righe.warn).toEqual([]);
    });
});

describe('connectMongo: gli errori che non sono transitori', () => {
    it('non ritenta autenticazione esclusa e passa l errore originale', async () => {
        const originale = new Error('bad auth: authentication failed');
        const mongo = mongoFinto(() => { throw originale; });
        const logger = loggerFinto();

        await expect(connectMongo('mongodb://atlas.example', { mongoose: mongo, logger, delayMs: 1 }))
            .rejects.toBe(originale);
        expect(mongo.connect).toHaveBeenCalledTimes(1);
        expect(logger.righe.warn).toHaveLength(0);
    });

    it('non ritenta un URI malformato', async () => {
        const originale = new Error('Invalid scheme, expected connection string to start with "mongodb://"');
        const mongo = mongoFinto(() => { throw originale; });
        await expect(connectMongo('sbagliato', { mongoose: mongo, logger: loggerFinto(), delayMs: 1 }))
            .rejects.toBe(originale);
        expect(mongo.connect).toHaveBeenCalledTimes(1);
    });
});

describe('connectMongo: quando il tetto si esaurisce', () => {
    it('chiude con RetryLimitError che dice i tentativi fatti', async () => {
        const mongo = mongoFinto(() => { throw erroreDns(); });
        const logger = loggerFinto();

        let errore = null;
        try {
            await connectMongo('mongodb://atlas.example', { mongoose: mongo, logger, maxAttempts: 2, delayMs: 1 });
        } catch (e) {
            errore = e;
        }

        expect(errore).toBeInstanceOf(RetryLimitError);
        expect(errore.attempts).toBe(2);
        expect(errore.cause.message).toMatch(/ENOTFOUND/);
        expect(mongo.connect).toHaveBeenCalledTimes(2);
        expect(logger.righe.warn).toHaveLength(1);
    });
});