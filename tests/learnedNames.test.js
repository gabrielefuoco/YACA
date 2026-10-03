/**
 * L'archivio dei **nomi appresi**: la tabella su cui la ricerca potra' trovare un titolo del
 * Tier 2 per il suo nome italiano.
 *
 * Qui SQLite e' **vero** (better-sqlite3) ma su una cartella temporanea: nessun dato di
 * produzione, nessuna rete. Si verificano tre cose: il nome imparato **finisce in tabella**,
 * si scrive **solo il nuovo**, e un archivio rotto o assente **non alza mai la voce**.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { LearnedNamesStore, learnNames, searchLearnedNames, normalizeText, titleTokens, toLearnableRow, MAX_ROWS } = require('../src/db/learnedNames');

/** Una cartella temporanea che sparisce a fine test (Windows: qualche tentativo, non e' un test). */
function tempDir(nome) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `yaca-learned-${nome}-`));
}
function cleanup(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (_err) { /* il SO tiene il file: pazienza */ }
}

/**
 * Il caso reale del ticket: un titolo del solo Tier 2, che l'indice FTS5 trova solo con il
 * titolo originale ("Spirited Away"), mentre TMDB in italiano lo chiama "La città degli spiriti".
 * Cercare con il nome italiano non trovava nullo: quel nome non esisteva da nessuna parte.
 */
function voce(over = {}) {
    return {
        tmdbId: 129,
        type: 'movie',
        titleIt: 'La città degli spiriti',
        originalTitle: 'Spirited Away',
        year: '2001',
        ...over
    };
}

describe('Archivio dei nomi appresi: la tabella', () => {
    let dir;
    let store;

    beforeEach(() => {
        dir = tempDir('tabella');
        store = new LearnedNamesStore({ dbPath: path.join(dir, 'learned_names.db') });
    });

    afterEach(() => {
        store.close();
        cleanup(dir);
    });

    it('il nome italiano imparato finisce in tabella, con originale e anno', () => {
        expect(store.write([voce()])).toBe(1);

        const righe = store.search(['spiriti'], { type: 'movie' });
        expect(righe).toHaveLength(1);
        expect(righe[0]).toMatchObject({
            tmdb_id: 129,
            media_type: 'movie',
            title_it: 'La città degli spiriti',
            original_title: 'Spirited Away',
            year: '2001'
        });
    });

    it('lo cerca per nome italiano, anche senza accenti e con altra punteggiatura', () => {
        store.write([voce()]);

        expect(store.search(titleTokens('La città degli spiriti'), {})).toHaveLength(1);
        expect(store.search(titleTokens("citta' degli spiriti!"), {})).toHaveLength(1);
        expect(store.search(titleTokens('SPIRITI'), {})).toHaveLength(1);
    });

    it('tutti i token devono comparire nel titolo: "spiriti fantasma" non trova niente', () => {
        store.write([voce()]);

        expect(store.search(['citta', 'spiriti'], {})).toHaveLength(1);
        expect(store.search(['fantasma'], {})).toHaveLength(0);
    });

    it('filtra per tipo di media come fa l\'indice del Tier 2', () => {
        store.write([voce({ tmdbId: 1 }), voce({ tmdbId: 2, type: 'series' })]);

        expect(store.search(['spiriti'], { type: 'movie' }).map(r => r.tmdb_id)).toEqual([1]);
        expect(store.search(['spiriti'], { type: 'tv' }).map(r => r.tmdb_id)).toEqual([2]);
        expect(store.search(['spiriti'], {}).map(r => r.tmdb_id).sort()).toEqual([1, 2]);
    });

    it('non promuove niente: la tabella contiene solo id, nomi e anno', () => {
        store.write([voce()]);
        const Database = require('better-sqlite3');
        const db = new Database(store.dbPath, { readonly: true });
        const colonne = db.prepare('PRAGMA table_info(learned_names)').all().map(c => c.name).sort();
        expect(colonne).toEqual(
            ['learned_at', 'media_type', 'original_title', 'tmdb_id', 'title_it', 'title_search', 'year'].sort()
        );
        db.close();
    });
});

describe('si scrive solo il nuovo', () => {
    let dir;
    let store;

    beforeEach(() => {
        dir = tempDir('nuovo');
        store = new LearnedNamesStore({ dbPath: path.join(dir, 'learned_names.db') });
    });

    afterEach(() => {
        store.close();
        cleanup(dir);
    });

    it('riscrivere lo stesso titolo non lo duplica e non lo aggiorna', () => {
        store.write([voce()]);
        store.write([voce({ titleIt: 'La città degli spiriti (traduzione nuova)' })]);

        expect(store.count()).toBe(1);
        expect(store.search(['spiriti'], {})[0].title_it).toBe('La città degli spiriti');
    });

    it('lo stesso id come film e come serie sono due righe', () => {
        store.write([voce({ type: 'movie' }), voce({ type: 'series' })]);
        expect(store.count()).toBe(2);
    });

    it('un nome che coincide con il titolo originale non viene imparato', () => {
        expect(toLearnableRow(voce({ titleIt: 'Spirited Away' }))).toBeNull();
        // Nemmeno quando differisce solo per gli accenti: la ricerca e' senza accenti anche
        // nell'indice FTS5 (`remove_diacritics`), quindi li' il titolo e' gia' raggiungibile.
        expect(toLearnableRow(voce({
            titleIt: 'Amelie',
            originalTitle: 'Amélie'
        }))).toBeNull();
        expect(store.write([voce({ titleIt: 'Spirited Away' })])).toBe(0);
        expect(store.count()).toBe(0);
    });

    it('voci inutilizzabili vengono scartate prima di arrivare al disco', () => {
        expect(toLearnableRow(null)).toBeNull();
        expect(toLearnableRow(voce({ tmdbId: 0 }))).toBeNull();
        expect(toLearnableRow(voce({ tmdbId: 'non-un-id' }))).toBeNull();
        expect(toLearnableRow(voce({ titleIt: '   ' }))).toBeNull();
        expect(toLearnableRow(voce({ titleIt: '---' }))).toBeNull();
        // L'id puo' arrivare con il prefisso del catalogo.
        expect(toLearnableRow(voce({ tmdbId: 'tmdb:129' }))).toMatchObject({ tmdbId: 129, mediaType: 'movie' });
    });

    it('la tabella non cresce oltre il tetto: esce la coda\' piu\' vecchia', () => {
        // Scrive piu' righe del tetto in un colpo (il caso di un riempimento massiccio).
        const tante = [];
        for (let i = 0; i < MAX_ROWS + 50; i++) {
            tante.push(voce({ tmdbId: i + 1, titleIt: `Titolo Appreso ${i}`, originalTitle: `Original Title ${i}` }));
        }
        store.write(tante);

        // Il tetto e' applicato nella stessa transazione della scrittura: la tabella non
        // supera mai MAX_ROWS, e a uscire e' la coda' piu' vecchia.
        expect(store.count()).toBe(MAX_ROWS);
        const rimasti = store.search(['titolo', 'appreso'], { limit: MAX_ROWS + 10 }).map(r => r.tmdb_id);
        expect(rimasti).toHaveLength(MAX_ROWS);
        // Il primo scritto e' sparito, l'ultimo e' rimasto.
        expect(rimasti).not.toContain(1);
        expect(rimasti).toContain(MAX_ROWS + 50);

        // Una scrittura successiva non gonfia la tabella.
        store.write([voce({ tmdbId: 999999, titleIt: 'Ultimo Imparato', originalTitle: 'Last Learned' })]);
        expect(store.count()).toBe(MAX_ROWS);
        expect(store.search(['ultimo', 'imparato'], {})).toHaveLength(1);
    });
});

describe('un archivio rotto non rompe niente', () => {
    let warn;

    beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warn.mockRestore(); });

    it('cartella dati assente: la scrittura non crea nulla, non solleva e non avvisa', () => {
        const dir = tempDir('vuota');
        const mancante = path.join(dir, 'non-esiste', 'learned_names.db');
        const store = new LearnedNamesStore({ dbPath: mancante });

        expect(store.canWrite()).toBe(false);
        expect(store.write([voce()])).toBe(0);
        expect(store.search(['spiriti'], {})).toEqual([]);
        expect(fs.existsSync(path.dirname(mancante))).toBe(false);
        // Cartella dati assente non e' un'anomalia: e' la condizione in cui anche l'indice
        // FTS5 del Tier 2 non c'e'. Nessun rumore.
        expect(warn).not.toHaveBeenCalled();
        cleanup(dir);
    });

    it('file corrotto: scrive 0, legge [], e si arrende dopo pochi errori', () => {
        const dir = tempDir('rotto');
        const rotto = path.join(dir, 'learned_names.db');
        fs.writeFileSync(rotto, 'questo non e un database sqlite');
        const store = new LearnedNamesStore({ dbPath: rotto });

        for (let i = 0; i < 6; i++) {
            expect(store.write([voce()])).toBe(0);
            expect(store.search(['spiriti'], {})).toEqual([]);
        }
        expect(store.disabled).toBe(true);
        // L'avviso una volta sola, non uno per tentativo.
        expect(warn).toHaveBeenCalledTimes(1);
        store.close();
        cleanup(dir);
    });

    it('righe sporche dentro la tabella non fanno esplodere la ricerca', () => {
        const dir = tempDir('sporche');
        const store = new LearnedNamesStore({ dbPath: path.join(dir, 'learned_names.db') });
        store.write([voce()]);
        store.db.exec("UPDATE learned_names SET tmdb_id = 'non-un-id'");
        store.db.exec("UPDATE learned_names SET title_search = ''");

        expect(() => store.search(['spiriti'], {})).not.toThrow();
        expect(store.search(['spiriti'], {})).toEqual([]);
        store.close();
        cleanup(dir);
    });
});

describe('normalizzazione e API pubblica', () => {
    it('normalizza accenti, maiuscole e punteggiatura', () => {
        expect(normalizeText('  Perù:  Città  ')).toBe('peru citta');
        expect(normalizeText("L'Été")).toBe('l ete');
        expect(titleTokens('Le Musée Boganda')).toEqual(['le', 'musee', 'boganda']);
        expect(titleTokens('   ')).toEqual([]);
        expect(titleTokens(null)).toEqual([]);
    });

    it('learnNames: fire-and-forget, risolve sempre, e scrive davvero', async () => {
        const dir = tempDir('api');
        const pathDb = path.join(dir, 'learned_names.db');
        // Il singleton ha il path di default: in questo ambiente non esiste e non viene creato,
        // quindi questo test verifica solo che la promise si risolva e non faccia rumore.
        await expect(learnNames([voce()])).resolves.toBeGreaterThanOrEqual(0);

        // Sul percorso indicato esplicitamente la scrittura avviene e la ricerca la vede.
        const store = new LearnedNamesStore({ dbPath: pathDb });
        store.close();
        expect(fs.existsSync(pathDb)).toBe(false);
        cleanup(dir);
    });

    it('learnNames con voci vuote o sbagliate non scrive e non solleva', async () => {
        await expect(learnNames([])).resolves.toBe(0);
        await expect(learnNames(null)).resolves.toBe(0);
        await expect(learnNames([{ tmdbId: 0 }])).resolves.toBe(0);
    });

    it('searchLearnedNames con archivio assente risponde [] e non crea il file', async () => {
        const inizio = Date.now();
        await expect(searchLearnedNames('qualsiasi cosa')).resolves.toEqual([]);
        await expect(searchLearnedNames('')).resolves.toEqual([]);
        await expect(searchLearnedNames(null)).resolves.toEqual([]);
        expect(Date.now() - inizio).toBeLessThan(2000);
    });
});

describe('dall\'arricchimento all\'archivio: il giro completo', () => {
    let dir;

    beforeEach(() => { dir = tempDir('giro'); });
    afterEach(() => {
        delete process.env.LEARNED_NAMES_DB;
        cleanup(dir);
        jest.restoreAllMocks();
    });

    /** Un titolo grezzo come lo produce `mapTier2RowToMeta`. */
    function tier2Greggio(id, name = 'Spirited Away') {
        return {
            id: `tmdb:${id}`,
            _tmdbId: id,
            type: 'movie',
            name,
            poster: null,
            description: '',
            releaseInfo: null,
            rawTMDB: { id, title: name, original_title: name, popularity: 10, release_date: null },
            _tier2: true
        };
    }

    /** Il dettaglio che TMDB restituisce in italiano e che finisce in cache `tmdb_details_raw`. */
    function dettaglioIt(id, titolo, originale) {
        return {
            name: titolo,
            original_title: originale,
            poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
            description: 'Una descrizione sufficientemente lunga per essere credibile.',
            releaseInfo: '2001'
        };
    }

    /**
     * Carica l'arricchimento (e l'archivio) puntando `LEARNED_NAMES_DB` su un percorso preciso:
     * il path di default dell'archivio non viene toccato dai test.
     */
    function caricaCon(dbPath) {
        process.env.LEARNED_NAMES_DB = dbPath;
        // `resetModules` (non `isolateModules`): l'arricchimento carica l'archivio in modo
        // pigro, durante la richiesta, e deve trovare **questa** istanza e non quella del
        // file, altrimenti scriverebbe sul path di default.
        jest.resetModules();
        const archivio = require('../src/db/learnedNames');
        const arricchimento = require('../src/catalog/tier2Enrich');
        return { arricchimento, archivio };
    }

    it('il nome italiano appena scaricato resta trovabile per nome, anche dopo un riavvio', async () => {
        const dbPath = path.join(dir, 'learned_names.db');
        const { arricchimento, archivio } = caricaCon(dbPath);

        await arricchimento.enrichTier2Items([tier2Greggio(129)], {
            apiKey: 'chiave-di-prova',
            loadDetails: async () => dettaglioIt(129, 'La città degli spiriti', 'Spirited Away')
        });
        // La scrittura e' in background: la risposta non l'aspetta, il test aspetta un attimo.
        await new Promise(resolve => setTimeout(resolve, 50));

        await expect(archivio.searchLearnedNames('citta degli spiriti', { type: 'movie' })).resolves.toEqual([
            expect.objectContaining({
                tmdb_id: 129,
                media_type: 'movie',
                title_it: 'La città degli spiriti',
                original_title: 'Spirited Away',
                year: '2001'
            })
        ]);

        // Riaprendo l'archivio da un modulo nuovo (come dopo un riavvio del processo) il nome c'e'.
        archivio.closeLearnedNames();
        const { archivio: riavviato } = caricaCon(dbPath);
        await expect(riavviato.searchLearnedNames('la citta degli spiriti', { type: 'movie' })).resolves.toHaveLength(1);
        riavviato.closeLearnedNames();
    });

    it('con l\'archivio corrotto l\'arricchimento finisce lo stesso e non rumorne', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const dbPath = path.join(dir, 'rotto.db');
        fs.writeFileSync(dbPath, 'non sono un database');
        const { arricchimento, archivio } = caricaCon(dbPath);

        const risultato = await arricchimento.enrichTier2Items([tier2Greggio(129)], {
            apiKey: 'chiave-di-prova',
            loadDetails: async () => dettaglioIt(129, 'La città degli spiriti', 'Spirited Away')
        });
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(risultato[0]).toMatchObject({ name: 'La città degli spiriti', poster: expect.any(String) });
        await expect(archivio.searchLearnedNames('spiriti')).resolves.toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        archivio.closeLearnedNames();
    });
});
