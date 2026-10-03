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

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

/** Lo script vero, per il test del codice di uscita (è un processo nuovo: niente mock). */
const SCRIPT = path.join(__dirname, '..', 'scripts', 'seed_learned_names.js');

/**
 * Percorso dell'archivio finto: il file **non** viene mai aperto (il negozio è finto), ma lo
 * script chiede `fs.existsSync` prima di contare le righe, quindi il test lo crea davvero.
 */
const mockPercorso = path.join(os.tmpdir(), 'seed-learned-names-test.db');

/**
 * Quante righe il finto archivio dichiara di avere, e se il file esiste: `_righeInTabella`
 * chiede il conto **al momento**, e non lo deduce dai candidati.
 */
const mockRigheTabella = { n: 0, esiste: false };

jest.mock('../src/db/learnedNames', () => ({
    learnNames: jest.fn(async () => 0),
    searchLearnedNames: jest.fn(async () => []),
    learnedNamesPath: () => mockPercorso,
    closeLearnedNames: jest.fn(),
    // Stessa regola di `toLearnableRow`: il nome vale solo se c'è ed è diverso dall'originale.
    toLearnableRow: jest.fn((entry) => {
        if (!entry || !entry.titleIt || !entry.originalTitle) return null;
        if (entry.titleIt.trim() === entry.originalTitle.trim()) return null;
        return { tmdbId: entry.tmdbId, mediaType: entry.type, titleIt: entry.titleIt };
    }),
    // Il conteggio delle righe davvero in tabella, letto ora: `esiste: false` = archivio assente.
    LearnedNamesStore: jest.fn(function LearnedNamesStoreFinta() {
        this.count = jest.fn(() => (mockRigheTabella.esiste ? mockRigheTabella.n : 0));
        this.close = jest.fn();
    })
}));

const archivio = require('../src/db/learnedNames');
const {
    main,
    codiceUscita,
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
    archivio.toLearnableRow.mockClear();
    mockRigheTabella.n = 0;
    mockRigheTabella.esiste = false;
    try { fs.rmSync(mockPercorso, { force: true }); } catch (_err) { /* non c'era */ }
});

afterAll(() => {
    try { fs.rmSync(mockPercorso, { force: true }); } catch (_err) { /* non c'era */ }
});

describe('parseKey: le due famiglie di chiavi', () => {
    test('accetta la chiave col segmento `full` (202 chiavi in produzione)', () => {
        expect(parseKey('tmdb_details_raw:full:v2:movie:950387')).toEqual({ mediaType: 'movie', tmdbId: 950387 });
    });

    test('accetta la chiave SENZA `full` (245 chiavi in produzione)', () => {
        expect(parseKey('tmdb_details_raw:v2:movie:49051')).toEqual({ mediaType: 'movie', tmdbId: 49051 });
    });

    test('`series` resta una serie: `tv` e `series` sono la STESSA cosa per la tabella', () => {
        // La chiave `full:v2:*` nasce da `getTmdbMetaDetails`, che riceve il tipo Stremio
        // ('series', cfr. `metaHandler` e `loadDetailsFromTmdb`); quella `v2:*` da
        // `getTmdbMovieDetails`, che riceve gia' 'tv'. Vanno entrambe lette come `tv`.
        expect(parseKey('tmdb_details_raw:full:v2:series:1421')).toEqual({ mediaType: 'tv', tmdbId: 1421 });
        expect(parseKey('tmdb_details_raw:v2:series:1421')).toEqual({ mediaType: 'tv', tmdbId: 1421 });
        // Il punto del guasto: `series` finiva a `movie`, quindi ogni serie imparata finiva
        // con l'etichetta sbagliata e non la trovava più nessuna ricerca di serie.
        expect(parseKey('tmdb_details_raw:v2:series:1421').mediaType).not.toBe('movie');
        expect(parseKey('tmdb_details_raw:v2:tv:1396')).toEqual({ mediaType: 'tv', tmdbId: 1396 });
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

/*
 * T37-c: le tre cose che la riga finale e il codice di uscita sbagliavano.
 */

describe('le serie vengono scritte come serie, non come film', () => {
    test('`parseKey` sulle due famiglie di una serie dà `tv` (non `movie`)', () => {
        // Le due forme vere: `full:v2:series` (getTmdbMetaDetails, tipo Stremio) e
        // `v2:tv` (getTmdbMovieDetails, tipo già normalizzato).
        expect(parseKey('tmdb_details_raw:full:v2:series:1421')).toEqual({ mediaType: 'tv', tmdbId: 1421 });
        expect(parseKey('tmdb_details_raw:v2:series:1421')).toEqual({ mediaType: 'tv', tmdbId: 1421 });
        expect(parseKey('tmdb_details_raw:v2:movie:1421')).toEqual({ mediaType: 'movie', tmdbId: 1421 });
    });

    test('dal seed end-to-end: una voce di `...:series:<id>` arriva a `learnNames` come `tv`', async () => {
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:full:v2:series:1421', busta({ name: 'Sherlock', original_name: 'Sherlock' })],
            ['tmdb_details_raw:v2:tv:1396', busta({ name: 'Il trono di spade', original_name: 'Game of Thrones' })]
        ]);
        archivio.learnNames.mockResolvedValue(2);

        const esito = await main({ redis: finto, log });

        expect(esito).toEqual({ scanned: 2, written: 2 });
        const voci = archivio.learnNames.mock.calls[0][0];
        // `media_type` della tabella è 'movie'|'tv' (cfr. `toLearnableRow`): una serie scritta
        // come film non la trova più nessuna ricerca di serie.
        expect(voci).toEqual(expect.arrayContaining([
            expect.objectContaining({ tmdbId: 1421, type: 'tv', titleIt: 'Sherlock' }),
            expect.objectContaining({ tmdbId: 1396, type: 'tv' })
        ]));
        expect(voci.every(v => v.type !== 'movie')).toBe(true);
    });
});

describe('la riga finale: ogni numero dice la sua cosa', () => {
    test('i candidati letti non si chiamano più "tabella", e il totale viene letto davvero', async () => {
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:full:v2:movie:129', busta({ title: 'La città degli spiriti', original_title: 'Spirited Away' })]
        ]);
        archivio.learnNames.mockResolvedValue(1);
        mockRigheTabella.n = 168;              // le 168 righe già in tabella
        mockRigheTabella.esiste = true;
        fs.writeFileSync(mockPercorso, '');     // il file c'è: il conteggio si può fare

        await main({ redis: finto, log });

        const riepilogo = log.linee.log.filter(l => l.includes('Candidati letti')).join('\n');
        // Il numero dei candidati letti da Redis non è il contenuto della tabella: non lo si
        // chiama più "tabella", e il conteggio delle righe lo si chiede all'archivio.
        expect(riepilogo).not.toMatch(/tabella: \d+ voci/);
        expect(riepilogo).toMatch(/Candidati letti: 1/);
        expect(riepilogo).toMatch(/righe scritte: 1/);
        expect(riepilogo).toMatch(/righe in tabella: 168/);
    });

    test('archivio assente: il totale è dichiarato non leggibile, non ZERO righe', async () => {
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:v2:movie:1', busta({ title: 'Ok', original_title: 'No' })]
        ]);
        archivio.learnNames.mockResolvedValue(1);
        mockRigheTabella.esiste = false;

        await main({ redis: finto, log });

        const riepilogo = log.linee.log.join('\n');
        expect(riepilogo).toMatch(/righe in tabella: non leggibile/);
    });

    test('la verifica cerca un nome davvero scritto, non il primo candidato letto', async () => {
        const finto = clientCheProntoDopo(1, [
            // Il primo candidato è uno SCARTATO da `toLearnableRow` (nome = originale):
            // è il caso che faceva stampare "0 risultati" anche con il seed riuscito.
            ['tmdb_details_raw:v2:movie:49051', busta({ title: 'Blade Runner', original_title: 'Blade Runner' })],
            ['tmdb_details_raw:v2:movie:129', busta({ title: 'La città degli spiriti', original_title: 'Spirited Away' })]
        ]);
        archivio.learnNames.mockResolvedValue(1);
        archivio.searchLearnedNames.mockResolvedValue([{ tmdb_id: 129, media_type: 'movie' }]);

        await main({ redis: finto, log });

        const riepilogo = log.linee.log.join('\n');
        expect(riepilogo).toMatch(/verifica ricerca: 1 risultato\/i per "La città degli spiriti" \(movie\)/);
        // Non si è verificato il primo candidato, che non è finito in tabella.
        expect(riepilogo).not.toMatch(/Blade Runner/);
        // E la verifica usa il filtro di tipo con cui l'app cerca (`media_type = ?`).
        expect(archivio.searchLearnedNames).toHaveBeenCalledWith('La città degli spiriti', { type: 'movie', limit: 1 });
    });

    test('nessun candidato scrivibile: la verifica è dichiarata saltata, non un "0 risultati"', async () => {
        const finto = clientCheProntoDopo(1, [
            ['tmdb_details_raw:v2:movie:49051', busta({ title: 'Blade Runner', original_title: 'Blade Runner' })]
        ]);
        archivio.learnNames.mockResolvedValue(0);

        await main({ redis: finto, log });

        expect(archivio.searchLearnedNames).not.toHaveBeenCalled();
        const riepilogo = log.linee.log.join('\n');
        expect(riepilogo).toMatch(/verifica ricerca: saltata/);
        expect(riepilogo).not.toMatch(/0 risultati/);
    });
});

describe('il codice di uscita: "non è successo niente" non è "fatto"', () => {
    test('attesa scaduta (Redis non connesso): codice diverso da zero', () => {
        expect(codiceUscita({ scanned: 0, written: 0 }, { dryRun: false })).toBe(1);
    });

    test('il comando vero, con Redis che non si connette, esce non-zero', () => {
        // `NODE_ENV=test` fa di `redisClient` lo stub di test: `isAvailable` resta sempre falso,
        // quindi l'attesa scade deterministicamente, senza rete e senza toccare SQLite.
        const esito = spawnSync(process.execPath, [SCRIPT, '--attesa-redis', '60'], {
            encoding: 'utf8',
            timeout: 30000,
            env: { ...process.env, NODE_ENV: 'test', LEARNED_NAMES_DB: path.join(__dirname, 'tmp-non-esiste', 'x.db') }
        });
        expect(esito.signal).toBeNull();
        expect(esito.status).not.toBe(0);
        expect(esito.stderr).toMatch(/Redis NON connesso/);
    });

    test('dry-run: 0 anche senza scrivere (non si scrive per scelta, non per guasto)', () => {
        expect(codiceUscita({ scanned: 12, written: 0 }, { dryRun: true })).toBe(0);
    });

    test('seed avvenuto: 0', () => {
        expect(codiceUscita({ scanned: 447, written: 300 }, { dryRun: false })).toBe(0);
        expect(codiceUscita(null, { dryRun: false })).toBe(1);
    });

    test('e `main` con l\'attesa scaduta non scrive niente (la decisione la prende il codice)', async () => {
        const finto = clientCheProntoDopo(999);
        const esito = await main({ redis: finto, log, attesaRedisMs: 60 });
        expect(esito).toEqual({ scanned: 0, written: 0 });
        expect(codiceUscita(esito, { dryRun: false })).toBe(1);
    });
});
