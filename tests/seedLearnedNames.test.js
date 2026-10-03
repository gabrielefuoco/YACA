/**
 * Il seed dei **nomi appresi** (`scripts/seed_learned_names.js`), una tantum.
 *
 * Due cose si provano, ed entrambe erano il guasto:
 *  - **la corsa all'avvio**: `redisClient` si connette da solo e in modo asincrono, quindi il
 *    primo `isAvailable === false` in un `docker exec` non vuol dire "Redis giù". Qui un client
 *    che diventa pronto dopo N interrogazioni viene **aspettato**, e uno che non diventa mai fa
 *    scadere il tetto con un messaggio che nomina Redis (non "archivio vuoto"): stesso contratto
 *    di `aspettaRedis` in `scripts/drena-coda-poster.js`, stesse chiavi di lettura delle chiavi;
 *  - **le due famiglie di chiavi**: `tmdb_details_raw:full:v2:*` e `tmdb_details_raw:v2:*`
 *    contengono entrambe il nome italiano, e lo script deve leggerle entrambe.
 *
 * SQLite non serve qui: l'archivio è finto e si guarda **cosa ci arriva**, non come viene salvato
 * (quello è `tests/learnedNames.test.js`). Nessuna rete: il client Redis è finto.
 */

jest.mock('../src/db/learnedNames', () => ({
    learnNames: jest.fn(async () => 0),
    searchLearnedNames: jest.fn(async () => []),
    learnedNamesPath: () => '/tmp/learned_names.db',
    closeLearnedNames: jest.fn()
}));

const archivio = require('../src/db/learnedNames');
const {
    main,
    parseKey,
    toEntry,
    aspettaRedis,
    KEY_PATTERNS,
    DEFAULT_ATTESA_REDIS_MS
} = require('../scripts/seed_learned_names');

/** Logger finto: le tre sacchi, come in `tests/drenaCodaPoster.test.js`. */
function creaLog() {
    const linee = { log: [], warn: [], error: [] };
    return {
        linee,
        log: (...a) => linee.log.push(a.join(' ')),
        warn: (...a) => linee.warn.push(a.join(' ')),
        error: (...a) => linee.error.push(a.join(' '))
    };
}

/**
 * Client finto: `isAvailable` è una **getter** (come quella vera: non c'è nessun evento da
 * ascoltare, si può solo chiedere), e diventa vera alla N-esima lettura. `chiavi` è la mappa
 * `[chiave, valore grezzo]` di quello che "c'è in Redis"; `keys` risponde al pattern, come fa
 * il vero, così il test vede davvero le due famiglie e non una lista preconfezionata.
 */
function clientCheProntoDopo(n, chiavi = []) {
    const finto = { lette: 0, chiesti: [], valori: new Map(chiavi) };
    Object.defineProperty(finto, 'isAvailable', {
        get() { finto.lette += 1; return finto.lette >= n; }
    });
    finto.keys = jest.fn(async (pattern) => {
        finto.chiesti.push(pattern);
        const radice = pattern.slice(0, -1);
        return [...finto.valori.keys()].filter(k => k.startsWith(radice));
    });
    finto.get = jest.fn(async (k) => finto.valori.get(k) || null);
    return finto;
}

/** La busta di CacheManager è `{ v, t }`: dentro c'è il dettaglio grezzo. */
const busta = (details) => JSON.stringify({ v: details, t: Date.now() });

let log;
beforeEach(() => {
    log = creaLog();
    archivio.learnNames.mockClear().mockResolvedValue(0);
    archivio.searchLearnedNames.mockClear().mockResolvedValue([]);
    archivio.closeLearnedNames.mockClear();
});

describe('parseKey: le due famiglie di chiavi', () => {
    test('accetta la chiave col segmento `full` (202 chiavi in produzione)', () => {
        expect(parseKey('tmdb_details_raw:full:v2:movie:950387')).toEqual({ mediaType: 'movie', tmdbId: 950387 });
    });

    test('accetta la chiave SENZA `full` (245 chiavi in produzione)', () => {
        expect(parseKey('tmdb_details_raw:v2:movie:49051')).toEqual({ mediaType: 'movie', tmdbId: 49051 });
    });

    test('`tv` resta `tv`, e le serie di tmdb.js sono `tv`', () => {
        expect(parseKey('tmdb_details_raw:full:v2:tv:1396')).toEqual({ mediaType: 'tv', tmdbId: 1396 });
        expect(parseKey('tmdb_details_raw:v2:tv:1396')).toEqual({ mediaType: 'tv', tmdbId: 1396 });
        // `series` non è il tipo di tmdb.js, ma se arrivasse non deve diventare `movie`.
        expect(parseKey('tmdb_details_raw:v2:series:1396')).toEqual({ mediaType: 'movie', tmdbId: 1396 });
    });

    test('il resto è rumore: fuori forma, altro namespace, prefix, chiave senza id', () => {
        expect(parseKey('tmdb_details_raw:full:v2:movie:abc')).toBeNull();
        expect(parseKey('tmdb_details_raw:v3:movie:1')).toBeNull();
        expect(parseKey('altro:v2:movie:1')).toBeNull();
        expect(parseKey('x:tmdb_details_raw:v2:movie:1')).toBeNull();   // solo prefisso: non va bene
        expect(parseKey('tmdb_details_raw:v2:movie:1:extra')).toBeNull();
        expect(parseKey(undefined)).toBeNull();
    });
});

describe('toEntry: il dettaglio di TMDB, busta o busta niente', () => {
    test('nome italiano, originale e anno dalla busta `{ v, t }`', () => {
        const entry = toEntry('tmdb_details_raw:full:v2:movie:129', {
            v: { title: 'La città degli spiriti', original_title: 'Spirited Away', release_date: '2001-07-20' },
            t: 1700000000000
        });
        expect(entry).toEqual({
            tmdbId: 129, type: 'movie', titleIt: 'La città degli spiriti',
            originalTitle: 'Spirited Away', year: '2001'
        });
    });

    test('anche senza busta, e con `name`/`first_air_date` per le serie', () => {
        expect(toEntry('tmdb_details_raw:v2:tv:1396', {
            name: 'Il trono di spade', original_name: 'Game of Thrones', first_air_date: '2011-04-17'
        })).toMatchObject({ type: 'tv', tmdbId: 1396, titleIt: 'Il trono di spade', year: '2011' });
    });

    test('senza originale la voce è inutilizzabile: meglio non scriverla', () => {
        expect(toEntry('tmdb_details_raw:v2:movie:1', busta({ title: 'Solo' }))).toBeNull();
        expect(toEntry('tmdb_details_raw:v2:movie:1', busta({ original_title: 'Solo' }))).toBeNull();
        expect(toEntry('tmdb_details_raw:v2:movie:1', null)).toBeNull();
    });
});

describe('la corsa all’avvio: si ASPETTA Redis, non si si arrende', () => {
    test('diventa pronto dopo N interrogazioni: lo script legge e scrive (non si arrende)', async () => {
        const finto = clientCheProntoDopo(3, [
            ['tmdb_details_raw:full:v2:movie:129', busta({ title: 'La città degli spiriti', original_title: 'Spirited Away', release_date: '2001-07-20' })],
            ['tmdb_details_raw:v2:movie:49051', busta({ title: 'Blade Runner', original_title: 'Blade Runner', release_date: '1982-06-25' })]
        ]);
        archivio.learnNames.mockResolvedValue(2);

        const esito = await main({ redis: finto, log, attesaRedisMs: 2000 });

        // Il punto del guasto: senza l'attesa qui il seed sarebbe finito con "Redis non raggiungibile".
        expect(finto.lette).toBeGreaterThanOrEqual(3);
        expect(esito).toEqual({ scanned: 2, written: 2 });
        expect(archivio.learnNames).toHaveBeenCalledTimes(1);
        expect(archivio.learnNames.mock.calls[0][0]).toEqual(expect.arrayContaining([
            expect.objectContaining({ tmdbId: 129, titleIt: 'La città degli spiriti' }),
            expect.objectContaining({ tmdbId: 49051, titleIt: 'Blade Runner' })
        ]));
        expect(log.linee.error).toEqual([]);
        expect(archivio.closeLearnedNames).toHaveBeenCalledTimes(1);
    });

    test('non diventa MAI pronto: attesa che scade, nessuna lettura, nessuna scrittura, e la riga che lo dice', async () => {
        const finto = clientCheProntoDopo(999);   // isAvailable resta sempre false
        archivio.learnNames.mockResolvedValue(99);

        // Tetto corto: qui si testa la decisione, non la pazienza.
        const esito = await main({ redis: finto, log, attesaRedisMs: 250 });

        expect(esito).toEqual({ scanned: 0, written: 0 });
        expect(finto.keys).not.toHaveBeenCalled();   // l'archivio non è stato guardato: è il punto
        expect(archivio.learnNames).not.toHaveBeenCalled();
        expect(archivio.searchLearnedNames).not.toHaveBeenCalled();

        const detto = log.linee.error.join('\n');
        expect(detto).toMatch(/Redis NON connesso dopo 250 ms/);
        // "non è un archivio vuoto": le due cose diverse restano diverse.
        expect(detto).toMatch(/Non e' un archivio vuoto/);
        // E non si traveste da archivio letto e vuoto nella riga di riepilogo.
        expect(log.linee.log.join('\n')).not.toMatch(/Righe scritte/);
    });

    test('già pronto: una sola interrogazione, nessuna dormita, nessuna riga di attesa', async () => {
        const finto = clientCheProntoDopo(1, []);

        const inizio = Date.now();
        const esito = await main({ redis: finto, log });
        const durata = Date.now() - inizio;

        expect(esito).toEqual({ scanned: 0, written: 0 });
        expect(finto.lette).toBe(1);
        // Il passo è 100 ms: uno script che aspettasse si sentirebbe. Qui no.
        expect(durata).toBeLessThan(100);
        expect(log.linee.log.join('\n')).not.toMatch(/Redis non e' ancora connesso/);
        await expect(aspettaRedis(finto, { log })).resolves.toMatchObject({
            pronto: true, interrogazioni: 1, attesaMs: 0
        });
    });

    test('aspettaRedis: tetto 0 = nessuna attesa (la decisione la prende chi chiama)', async () => {
        const finto = clientCheProntoDopo(999);
        await expect(aspettaRedis(finto, { tettoMs: 0, log })).resolves.toMatchObject({ pronto: false, interrogazioni: 1 });
    });

    test('aspettaRedis: un client senza la proprietà non ha niente da aspettare', async () => {
        await expect(aspettaRedis({}, { log })).resolves.toMatchObject({ pronto: true, interrogazioni: 0, attesaMs: 0 });
        await expect(aspettaRedis(null, { log })).resolves.toMatchObject({ pronto: true, interrogazioni: 0 });
    });

    test('il tetto di default è quello del drenatore: 10 s, non un\'attesa infinita', () => {
        expect(DEFAULT_ATTESA_REDIS_MS).toBe(10000);
    });
});

describe('le due famiglie di chiavi vengono lette entrambe', () => {
    test('i due pattern sono interrogati, e non solo il primo', async () => {
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:full:v2:movie:129', busta({ title: 'La città degli spiriti', original_title: 'Spirited Away' })],
            ['tmdb_details_raw:v2:movie:49051', busta({ title: 'Blade Runner', original_title: 'Blade Runner' })],
            ['tmdb_details_raw:v2:tv:1396', busta({ name: 'Il trono di spade', original_name: 'Game of Thrones' })]
        ]);

        const esito = await main({ redis: finto, log, dryRun: true });

        expect(finto.chiesti).toEqual(['tmdb_details_raw:full:v2:*', 'tmdb_details_raw:v2:*']);
        expect(esito.scanned).toBe(3);
        // dry-run: si guarda e basta, niente scritture.
        expect(archivio.learnNames).not.toHaveBeenCalled();
        expect(archivio.closeLearnedNames).not.toHaveBeenCalled();
        expect(log.linee.log.join('\n')).toMatch(/Chiavi lette \(.*\): 3/);
    });

    test('un id presente nelle due famiglie vale una riga sola, e il doppio si dice', async () => {
        const dettaglio = busta({ title: 'Interstellar', original_title: 'Interstellar', release_date: '2014-11-05' });
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:full:v2:movie:157336', dettaglio],
            ['tmdb_details_raw:v2:movie:157336', dettaglio]
        ]);
        archivio.learnNames.mockResolvedValue(1);

        const esito = await main({ redis: finto, log });

        expect(esito).toEqual({ scanned: 2, written: 1 });
        expect(archivio.learnNames.mock.calls[0][0]).toHaveLength(1);
        expect(log.linee.log.join('\n')).toMatch(/1 chiavi doppie fra le due famiglie/);
    });

    test('rotta JSON e buchi: una chiave illeggibile salta, le altre entrano', async () => {
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:v2:movie:1', '{non-json'],
            ['tmdb_details_raw:v2:movie:2', busta({ title: 'Ok', original_title: 'Ok' })]
        ]);
        archivio.learnNames.mockResolvedValue(1);

        const esito = await main({ redis: finto, log });

        expect(esito.scanned).toBe(2);
        expect(archivio.learnNames.mock.calls[0][0]).toEqual([
            expect.objectContaining({ tmdbId: 2, titleIt: 'Ok' })
        ]);
    });

    test('i pattern sono le due famiglie vere, nessuna delle due si perde', () => {
        expect(KEY_PATTERNS).toEqual(['tmdb_details_raw:full:v2:*', 'tmdb_details_raw:v2:*']);
        // Ogni pattern deve essere coperto da `parseKey`: è il patto fra i due elenchi.
        KEY_PATTERNS.forEach(p => {
            const m = p.replace('*', 'movie:1');
            expect(parseKey(m)).not.toBeNull();
        });
    });
});
