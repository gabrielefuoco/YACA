/**
 * tests/pushDiffInCoda.test.js
 *
 * Il ponte fra il diff del servizio doppiaggi e la coda degli eventi dell'app:
 * `ita_annotations.diff.json` -> `push({tipo, id, badge})`.
 *
 * Qui conta il contratto che un timer pretende:
 * - un artefatto di N cambiamenti mette in coda N eventi, col badge giusto (`null` vuol dire
 *   "togli il badge", non "non so");
 * - **rilanciarlo sullo stesso file non aggiunge nulla**: la deduplica è della coda, non dello
 *   script (qui non c'è memo né stato, e non deve esserci);
 * - file assente, illeggibile o malformato: esce pulito e dice perché. Un errore qui sveglierebbe
 *   qualcuno per un file che non è ancora arrivato.
 *
 * E, dal 04/10/2026, i due difetti che hanno perso un evento in produzione:
 * - **la corsa**: il client Redis è pigro, la prima `push` partiva prima del socket e moriva con
 *   "Stream isn't writeable and enableOfflineQueue options is false". Il diff è un delta, quindi
 *   quell'evento era perso per sempre (fino a 200 giorni di TTL del suo poster);
 * - **l'esito non distinguiibile**: `push` risponde `false` sia per "era già in coda" sia per
 *   "non sono riuscito", e il passo 8 del timer leggeva un 0 in entrambi i casi stampando
 *   "i poster cambiati sono in coda". Qui i due casi hanno numeri diversi e codici diversi.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createCodaEventi } = require('../src/cache/codaEventi');
const {
    FILE_NAME,
    DEFAULT_ATTESA_REDIS_MS,
    percorsoDiffDefault,
    parseArgs,
    leggiArtefatto,
    aspettaRedis,
    pushDiffInCoda,
    main
} = require('../scripts/push-diff-in-coda');
// Il produttore dell'artefatto, dalla parte di `services/doppiaggi-source`: senza dipendenze
// (fs/path/readline), quindi si può richiamare qui. Serve per il test di bordo più importante,
// quello in cui il giro è stato bloccato dalla guardia.
const { scriviConDiff } = require('../services/doppiaggi-source/src/giro');

/**
 * Redis finto in memoria: solo i comandi che la coda usa davvero.
 * Copia deliberata di quello di `tests/codaEventi.test.js` (i due file di test non si importano:
 * richiederne uno eseguirebbe anche i suoi test).
 */
function creaRedisFinto() {
    const liste = new Map();
    const hash = new Map();
    const _lista = (k) => { if (!liste.has(k)) liste.set(k, []); return liste.get(k); };
    const _hash = (k) => { if (!hash.has(k)) hash.set(k, new Map()); return hash.get(k); };

    return {
        async hsetnx(k, campo, valore) { const h = _hash(k); if (h.has(campo)) return 0; h.set(campo, String(valore)); return 1; },
        async hmget(k, ...campi) { const h = _hash(k); return campi.map((c) => (h.has(c) ? h.get(c) : null)); },
        async hexists(k, campo) { return _hash(k).has(campo) ? 1 : 0; },
        async hdel(k, campo) { return _hash(k).delete(campo) ? 1 : 0; },
        async hincrby(k, campo, incremento) { const h = _hash(k); const v = (Number(h.get(campo)) || 0) + incremento; h.set(campo, String(v)); return v; },
        async rpush(k, ...valori) { const l = _lista(k); l.push(...valori); return l.length; },
        async lrange(k, inizio, fine) { return _lista(k).slice(Math.max(0, inizio), fine + 1); },
        async lrem(k, _n, valore) { const l = _lista(k); let rimossi = 0; for (let i = l.length - 1; i >= 0; i--) { if (l[i] === valore) { l.splice(i, 1); rimossi++; } } return rimossi; },
        async expire() { return 1; }
    };
}

/**
 * Il client Redis della produzione, con la sua caratteristica che ha fatto perdere l'evento:
 * si connette in modo asincrono e `enableOfflineQueue: false`, quindi **ogni comando su un
 * socket non ancora pronto muore** con "Stream isn't writeable and enableOfflineQueue options is
 * false" — e `codaEventi`, che non lancia mai, degrada a `push -> false`. Il collegamento
 * arriva dopo `dopoMs`, come nel log del 04/10 (la connessione riusciva una riga dopo il fallimento).
 *
 * `scritte` conta i tentativi fatti **prima** che il collegamento arrivasse: se lo script
 * aspetta, quel numero è 0, e quello è il fatto che il test verifica.
 */
function creaRedisPigro({ dopoMs = 25 } = {}) {
    const dentro = creaRedisFinto();
    const stato = { colto: false, scritte: 0, tentativi: 0 };
    const timer = setTimeout(() => { stato.colto = true; }, dopoMs);

    const client = {
        get isAvailable() { return stato.colto; },
        chiudi() { clearTimeout(timer); }
    };
    for (const comando of ['hsetnx', 'rpush', 'expire', 'hmget', 'hexists', 'hdel', 'lrange', 'lrem', 'hincrby']) {
        client[comando] = async (...args) => {
            stato.tentativi += 1;
            if (!stato.colto) {
                stato.scritte += 1;   // la corsa: ha provato a scrivere senza socket
                throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
            }
            return dentro[comando](...args);
        };
    }
    return { client, stato };
}

const ARTEFATTO = {
    schemaVersion: 1,
    generato: '2026-10-02T04:00:00.000Z',
    file: FILE_NAME,
    primoGiro: false,
    cap: 5000,
    oltreSoglia: false,
    cambiati: 3,
    diventatiDoppiati: 2,
    nonPiuDoppiati: 1,
    changes: [
        { tipo: 'movie', id: 5, badge: 'ITA' },      // è diventato doppiato: badge da mettere
        { tipo: 'tv', id: 1399, badge: 'ITA' },      // id numerico o stringa: stessa cosa in coda
        { tipo: 'movie', id: 7, badge: null }        // non è più doppiato: badge da togliere
    ]
};

describe('push del diff dei doppiaggi nella coda degli eventi', () => {
    let dir;
    let file;
    let redis;
    let coda;
    let log;
    let pronto;

    const scriviArtefatto = (contenuto) => {
        fs.writeFileSync(file, typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto, null, 1), 'utf8');
        return file;
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-diff-'));
        file = path.join(dir, FILE_NAME);
        redis = creaRedisFinto();
        coda = createCodaEventi(redis);
        log = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
        // Il client di `redisClient` è collegato: qui non si sta provando la corsa.
        pronto = { isAvailable: true };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('il percorso si prende da --file, dall\'ambiente o dal default', () => {
        expect(path.basename(parseArgs(['--file', 'qualche/cartella/x.json'], {}).filePath)).toBe('x.json');
        expect(path.basename(parseArgs(['--file=qualche/cartella/y.json'], {}).filePath)).toBe('y.json');
        expect(path.basename(parseArgs([], { ITA_DIFF_PATH: '/data/tmdb/x.json' }).filePath)).toBe('x.json');
        expect(path.basename(percorsoDiffDefault({ TMDB_DUMP_DIR: '/data/tmdb' }))).toBe(FILE_NAME);
        expect(path.isAbsolute(parseArgs([], {}).filePath)).toBe(true); // mai relativo: gira da cron
        expect(parseArgs(['--dry-run']).dryRun).toBe(true);
        expect(() => parseArgs(['--file'])).toThrow(/richiede un percorso/);
    });

    test('l\'attesa di Redis ha un tetto e si può regolare da riga di comando', () => {
        expect(parseArgs([]).attesaRedisMs).toBe(DEFAULT_ATTESA_REDIS_MS);
        expect(parseArgs(['--attesa-redis', '25000']).attesaRedisMs).toBe(25000);
        expect(parseArgs(['--attesa-redis=25000']).attesaRedisMs).toBe(25000);
        expect(() => parseArgs(['--attesa-redis', 'mai'])).toThrow(/numero positivo/);
        expect(() => parseArgs(['--attesa-redis', '0'])).toThrow(/numero positivo/);
    });

    test('un artefatto di 3 cambiamenti spinge 3 eventi, col badge giusto', async () => {
        scriviArtefatto(ARTEFATTO);

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.eventi).toBe(3);
        expect(esito.spinte).toBe(3);
        expect(esito.giaInCoda).toBe(0);

        const inCoda = await coda.take(10);
        expect(inCoda).toEqual([
            { tipo: 'movie', id: '5', badge: 'ITA' },
            { tipo: 'tv', id: '1399', badge: 'ITA' },
            { tipo: 'movie', id: '7', badge: null } // badge null = toglierlo, non "non so"
        ]);
    });

    test('rilanciato sullo stesso artefatto non aggiunge nulla (deduplica della coda)', async () => {
        scriviArtefatto(ARTEFATTO);

        const prima = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });
        const seconda = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });
        const terza = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(prima.spinte).toBe(3);
        expect(seconda.spinte).toBe(0);
        expect(seconda.giaInCoda).toBe(3);
        expect(terza.spinte).toBe(0);
        expect(await coda.take(10)).toHaveLength(3); // tre giri, tre eventi: non uno di più
    });

    test('movie:5 e tv:5 sono due eventi diversi (stesso id, tipo diverso)', async () => {
        scriviArtefatto({
            ...ARTEFATTO,
            cambiati: 2,
            changes: [
                { tipo: 'movie', id: 5, badge: 'ITA' },
                { tipo: 'tv', id: 5, badge: 'ITA' }
            ]
        });

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.spinte).toBe(2);
        expect((await coda.take(10)).map((e) => e.tipo)).toEqual(['movie', 'tv']);
    });

    test('file assente: esce pulito e dice perché', async () => {
        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.spinte).toBe(0);
        expect(esito.motivo).toMatch(/file assente/);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('nessun evento da spingere'));
        await expect(coda.take(10)).resolves.toEqual([]);
    });

    test('artefatto malformato: JSON rotto, oggetto senza changes, lista: esce pulito', async () => {
        const casi = [
            ['{ "changes": [ ', /JSON malformato/],
            ['[1, 2, 3]', /non contiene un oggetto JSON/],
            ['{ "cambiati": 2 }', /non ha una lista `changes`/]
        ];

        for (const [contenuto, motivo] of casi) {
            scriviArtefatto(contenuto);
            const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

            expect(esito.spinte).toBe(0);
            expect(esito.motivo).toMatch(motivo);
        }
        await expect(coda.take(10)).resolves.toEqual([]);
    });

    test('un file illeggibile (una cartella) non è un errore', () => {
        const cartella = path.join(dir, 'una-cartella.diff.json');
        fs.mkdirSync(cartella);

        const lettura = leggiArtefatto(cartella);

        expect(lettura.ok).toBe(false);
        expect(lettura.motivo).toMatch(/illeggibile/);
    });

    test('cambi malformati dentro un artefatto valido: spinge i buoni e conta gli scarti', async () => {
        scriviArtefatto({
            ...ARTEFATTO,
            changes: [
                { tipo: 'movie', id: 5, badge: 'ITA' },
                { tipo: 'tv' },            // senza id
                { id: 99 },               // senza tipo
                null                      // riga spazzatura
            ]
        });

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.eventi).toBe(1);
        expect(esito.scartati).toBe(3);
        expect(esito.spinte).toBe(1);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('3 cambi senza tipo/id'));
        expect(await coda.take(10)).toEqual([{ tipo: 'movie', id: '5', badge: 'ITA' }]);
    });

    test('artefatto di primo giro: nessun evento (per contratto)', async () => {        scriviArtefatto({ ...ARTEFATTO, primoGiro: true, cambiati: 0, changes: [] });

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.primoGiro).toBe(true);
        expect(esito.spinte).toBe(0);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('primo giro'));
    });

    test('un artefatto vero di un giro BLOCCATO dalla guardia non ripubblica niente', async () => {
        // Giro vero, lato servizio: 20 doppiati, poi un giro che ne lascia uno solo → la guardia
        // (−2% sui `true`) blocca la scrittura.
        const out = path.join(dir, 'ita_annotations.jsonl');
        const silenzio = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
        await scriviConDiff(
            Array.from({ length: 20 }, (_, i) => ({ t: 'movie', id: i + 1, ita: true })),
            { outputPath: out, log: silenzio }
        );
        const bloccato = await scriviConDiff([{ t: 'movie', id: 1, ita: true }], { outputPath: out, log: silenzio });

        expect(bloccato.reason).toBe('guard');
        expect(fs.existsSync(file)).toBe(true); // l'artefatto c'è, ed è quello del giro bloccato

        // Il giorno dopo il timer lo rilegge: deve spingere ZERO eventi, non quelli del giro
        // precedente (che la coda non ricorda di aver già servito).
        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.eventi).toBe(0);
        expect(esito.spinte).toBe(0);
        await expect(coda.take(10)).resolves.toEqual([]);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('bloccato dalla guardia'));

        // E i 19 titoli che sarebbero spariti restano nell'artefatto, dichiarati e non accodati.
        const artefatto = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(artefatto.guardia).toBe(true);
        expect(artefatto.conteggioNonApplicati).toBe(19);
    });

    test('un artefatto di guardia scritto a mano: 0 eventi, e lo dice', async () => {
        scriviArtefatto({
            schemaVersion: 1,
            generato: '2026-10-02T16:00:00.000Z',
            file: FILE_NAME,
            primoGiro: false,
            cap: 5000,
            oltreSoglia: false,
            cambiati: 0,
            diventatiDoppiati: 0,
            nonPiuDoppiati: 0,
            guardia: true,
            motivo: 'il giro non ha scritto (i true calano oltre la soglia): nessun doppiaggio è cambiato',
            cambiNonApplicati: [{ tipo: 'movie', id: 7, badge: null }],
            conteggioNonApplicati: 1,
            changes: []
        });

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.spinte).toBe(0);
        await expect(coda.take(10)).resolves.toEqual([]);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('1 cambi non applicati'));
    });

    test('dry-run: legge e conta, non accoda', async () => {
        scriviArtefatto(ARTEFATTO);

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log, dryRun: true });

        expect(esito.eventi).toBe(3);
        expect(esito.spinte).toBe(0);
        await expect(coda.take(10)).resolves.toEqual([]);
    });

    test('oltre il tetto dei 5.000: avvisa e spinge lo stesso (il numero vero è nell\'artefatto)', async () => {
        scriviArtefatto({ ...ARTEFATTO, oltreSoglia: true, cambiati: 9000, avviso: 'ATTENZIONE: ...' });

        const esito = await pushDiffInCoda({ filePath: file, coda, redis: pronto, log });

        expect(esito.spinte).toBe(3);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('oltre il tetto'));
    });

    test('una coda che non risponde: sono GUASTI, non "già in coda" (il 04/10 li contava come idem)', async () => {
        // Il caso del log di produzione: ogni comando muore con l'errore della connessione
        // pigra. Il vecchio script diceva "3 non spinte (già in attesa, oppure coda non
        // raggiungibile)" e usciva 0: il passo 8 del timer stampava "i poster sono in coda".
        scriviArtefatto(ARTEFATTO);
        const codaMorta = createCodaEventi(new Proxy({}, {
            get: () => async () => { throw new Error("Stream isn't writeable and enableOfflineQueue options is false"); }
        }));
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const esito = await pushDiffInCoda({ filePath: file, coda: codaMorta, redis: pronto, log });

        expect(esito.spinte).toBe(0);
        expect(esito.giaInCoda).toBe(0);   // niente è "già in coda": non si è scritto niente
        expect(esito.falliti).toBe(3);
        expect(esito.perduti).toEqual(['movie|5', 'tv|1399', 'movie|7']);
        // E la riga finale porta i tre numeri, senza la parola "oppure".
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('0 spinte adesso, 0 già in coda, 3 falliti'));
        expect(log.log).not.toHaveBeenCalledWith(expect.stringContaining('oppure'));
    });

    // ------------------------------------------------------------------------------------------
    // Difetto 1, la corsa (misurata in produzione il 04/10/2026: `push di tv|324326 fallito:
    // Stream isn't writeable and enableOfflineQueue options is false`, e la connessione riuscita
    // una riga dopo. Il diff è un delta: quell'evento non tornava più).
    // ------------------------------------------------------------------------------------------

    test('la corsa all\'avvio: aspetta la connessione, poi spinge tutto (prima l\'evento era perso)', async () => {
        scriviArtefatto(ARTEFATTO);
        const pigro = creaRedisPigro({ dopoMs: 25 });
        const codaPigra = createCodaEventi(pigro.client);
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const esito = await pushDiffInCoda({
            filePath: file,
            coda: codaPigra,
            redis: pigro.client,
            log,
            attesaRedisMs: 2000,
            attesaRedisIntervalloMs: 5
        });
        pigro.client.chiudi();

        // Il fatto che conta: nessuna scrittura è mai partita su un socket non pronto.
        expect(pigro.stato.scritte).toBe(0);
        expect(esito.spinte).toBe(3);
        expect(esito.giaInCoda).toBe(0);
        expect(esito.falliti).toBe(0);
        expect(await codaPigra.take(10)).toHaveLength(3);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('Redis connesso dopo'));
    });

    test('Redis che non si collega mai: non si spinge nulla, tutti falliti, e si dice il perché', async () => {
        scriviArtefatto(ARTEFATTO);
        const pigro = creaRedisPigro({ dopoMs: 600000 }); // non arriva, per il test
        const codaPigra = createCodaEventi(pigro.client);
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const esito = await pushDiffInCoda({
            filePath: file,
            coda: codaPigra,
            redis: pigro.client,
            log,
            attesaRedisMs: 40,
            attesaRedisIntervalloMs: 5
        });
        pigro.client.chiudi();

        expect(esito.saltato).toMatch(/Redis NON pronto dopo 40 ms/);
        expect(esito.spinte).toBe(0);
        expect(esito.falliti).toBe(3);
        expect(esito.perduti).toEqual(['movie|5', 'tv|1399', 'movie|7']);
        expect(pigro.stato.scritte).toBe(0); // scrive a un socket morto non serve a nulla
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Redis NON pronto'));
    });

    test('aspettaRedis: già pronto non aspetta, senza proprietà non inventa attese, tetto 0 = no', async () => {
        await expect(aspettaRedis({ isAvailable: true }, { log })).resolves.toMatchObject({ pronto: true, interrogazioni: 1, attesaMs: 0 });
        await expect(aspettaRedis({}, { log })).resolves.toMatchObject({ pronto: true, interrogazioni: 0 });
        await expect(aspettaRedis({ isAvailable: false }, { tettoMs: 0, log })).resolves.toMatchObject({ pronto: false, interrogazioni: 1 });
        // Un artefatto senza eventi non aspetta nessuno: niente da spingere, niente socket.
        scriviArtefatto({ ...ARTEFATTO, changes: [] });
        const mai = { get isAvailable() { throw new Error('non dovevi guardarmi'); } };
        await expect(pushDiffInCoda({ filePath: file, coda, redis: mai, log })).resolves.toMatchObject({ spinte: 0, falliti: 0 });
    });

    // ------------------------------------------------------------------------------------------
    // Difetto 2, l'esito: `ops/yaca-doppiaggi.sh` (passo 8) stampa "i poster cambiati sono in
    // coda" quando questo script esce 0. Quindi 0 e non-0 devono dire la verità.
    // ------------------------------------------------------------------------------------------

    describe('il codice di uscita è il contratto con il passo 8 del timer', () => {
        let prontoMain;

        beforeEach(() => {
            // `main` scrive qualcosa fuori dal logger (dotenv), quindi silenzio anche `console`.
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
            prontoMain = { isAvailable: true };
        });

        test('spinto adesso: 0', async () => {
            scriviArtefatto(ARTEFATTO);

            await expect(main(['--file', file], {}, { coda, redis: prontoMain, log })).resolves.toBe(0);
            expect(await coda.take(10)).toHaveLength(3);
        });

        test('già in coda: 0, e lo dice (idempotenza non è un guasto)', async () => {
            scriviArtefatto(ARTEFATTO);
            await coda.push({ tipo: 'movie', id: 5, badge: 'ITA' });

            await expect(main(['--file', file], {}, { coda, redis: prontoMain, log })).resolves.toBe(0);
            expect(log.log).toHaveBeenCalledWith(expect.stringContaining('2 spinte adesso, 1 già in coda, 0 falliti'));
        });

        test('guasto: codice diverso da 0, con i nomi degli eventi persi', async () => {
            scriviArtefatto(ARTEFATTO);
            const codaMorta = createCodaEventi(new Proxy({}, {
                get: () => async () => { throw new Error("Stream isn't writeable and enableOfflineQueue options is false"); }
            }));

            const codice = await main(['--file', file], {}, { coda: codaMorta, redis: prontoMain, log });

            expect(codice).not.toBe(0);
            expect(log.log).toHaveBeenCalledWith(expect.stringContaining('0 spinte adesso, 0 già in coda, 3 falliti'));
            expect(log.error).toHaveBeenCalledWith(expect.stringContaining('3 eventi NON sono in coda: movie|5, tv|1399, movie|7'));
            expect(log.error).toHaveBeenCalledWith(expect.stringContaining('il diff è un delta'));
        });

        test('Redis non pronto: codice diverso da 0 anche con la coda in piedi', async () => {
            scriviArtefatto(ARTEFATTO);
            const codice = await main(['--file', file, '--attesa-redis', '30'], {},
                { coda, redis: { isAvailable: false }, log });

            expect(codice).not.toBe(0);
            expect(log.error).toHaveBeenCalledWith(expect.stringContaining('3 eventi NON sono in coda'));
            await expect(coda.take(10)).resolves.toEqual([]);
        });

        test('file assente: 0 (non c\'è nessun evento da perdere)', async () => {
            await expect(main(['--file', file], {}, { coda, redis: prontoMain, log })).resolves.toBe(0);
        });
    });

    test('la riga di chiusura conta i tre esiti, e i perduti hanno nome', async () => {
        scriviArtefatto(ARTEFATTO);
        // movie|5 e tv|1399 sono già in coda (idempotenza); movie|7 la push mente.
        await coda.push({ tipo: 'movie', id: 5, badge: 'ITA' });
        await coda.push({ tipo: 'tv', id: 1399, badge: 'ITA' });
        const mentirosa = {
            push: async (e) => (e.tipo === 'movie' && String(e.id) === '7' ? false : coda.push(e)),
            take: coda.take
        };

        const esito = await pushDiffInCoda({ filePath: file, coda: mentirosa, redis: pronto, log });

        expect(esito.spinte).toBe(0);
        expect(esito.giaInCoda).toBe(2);
        expect(esito.falliti).toBe(1);
        expect(log.log).toHaveBeenCalledWith(expect.stringContaining('0 spinte adesso, 2 già in coda, 1 falliti'));
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('1 eventi NON sono in coda: movie|7'));
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('movie|7 NON è in coda'));
    });

    test('main() esce con 0 anche quando il file non c\'è (è una condizione attesa)', async () => {
        const suono = jest.spyOn(console, 'log').mockImplementation(() => {});
        const rumore = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(main(['--file', file], {})).resolves.toBe(0);
        await expect(main(['--help'], {})).resolves.toBe(0);
        await expect(main(['--file'], {})).resolves.toBe(1); // argomento sbagliato: questo è un errore vero

        suono.mockRestore();
        rumore.mockRestore();
    });
});
