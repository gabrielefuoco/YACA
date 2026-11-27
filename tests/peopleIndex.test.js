/**
 * L'indice delle persone (`people.db`): fetta 1 della ricerca a sintassi esplicita.
 *
 * Contratti difesi qui:
 *   1. i nomi si trovano per prefisso, per cognome e anche con un refuso (Levenshtein ≤ 2);
 *   2. una persona è una sola, con tutti i suoi ruoli (`actor`, `director`, `writer`, `creator`);
 *   3. i titoli per adulti non contano: chi compare solo in quelli non affiora;
 *   4. indice assente o illeggibile ⇒ `[]`, senza eccezioni — la ricerca continua.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const duckdb = require('duckdb');

const {
    buildPeopleIndex,
    PeopleSearchClient,
    getPeopleStats,
    normalizzaNome,
    sanitizePeopleQuery,
    distanza,
    defaultPeopleDbPath
} = require('../src/indice/people');

function run(con, sql) {
    return new Promise((resolve, reject) => con.run(sql, (err) => (err ? reject(err) : resolve())));
}

/** JSON di una persona, come lo scrive il dump. */
function persona(id, name) {
    return JSON.stringify({ id, name });
}

describe('people.db — la lingua che serve al parser', () => {
    let tempDir;

    beforeAll(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-people-test-'));

        const ddb = new duckdb.Database(':memory:');
        const con = ddb.connect();
        const moviesPath = path.join(tempDir, 'movies.parquet').replace(/\\/g, '/');
        const tvPath = path.join(tempDir, 'tv.parquet').replace(/\\/g, '/');

        const film = [
            { id: 1, cast: `[${persona(6193, 'Leonardo DiCaprio')}]`, directors: '[]', writers: '[]', adult: false, popularity: 100 },
            {
                id: 2,
                cast: `[${persona(6193, 'Leonardo DiCaprio')},${persona(525, 'Christopher Nolan')}]`,
                directors: `[${persona(525, 'Christopher Nolan')}]`,
                writers: `[${persona(6193, 'Leonardo DiCaprio')}]`,
                adult: false,
                popularity: 500
            },
            { id: 3, cast: `[${persona(999001, 'Solo Adulto')}]`, directors: '[]', writers: '[]', adult: true, popularity: 900 },
            { id: 4, cast: `[${persona(5001, 'Paolo Caratterista')}]`, directors: '[]', writers: '[]', adult: false, popularity: 5 }
        ];
        const serie = [
            { id: 10, cast: `[${persona(6193, 'Leonardo DiCaprio')}]`, created_by: `[${persona(488, 'Steven Spielberg')}]`, adult: false, popularity: 300 }
        ];

        const valoriFilm = film.map(f =>
            `(${f.id}, '${f.cast}', '${f.directors}', '${f.writers}', ${f.adult}, ${f.popularity})`
        ).join(',\n');
        await run(con, `
            CREATE TABLE src_movies AS
            SELECT * FROM (VALUES ${valoriFilm}) AS t(id, "cast", directors, writers, adult, popularity);
            COPY src_movies TO '${moviesPath}' (FORMAT PARQUET);
        `);

        const valoriSerie = serie.map(s =>
            `(${s.id}, '${s.cast}', '${s.created_by}', ${s.adult}, ${s.popularity})`
        ).join(',\n');
        await run(con, `
            CREATE TABLE src_tv AS
            SELECT * FROM (VALUES ${valoriSerie}) AS t(id, "cast", created_by, adult, popularity);
            COPY src_tv TO '${tvPath}' (FORMAT PARQUET);
        `);

        await new Promise(r => con.close(() => ddb.close(() => r())));
    });

    afterAll(() => {
        if (tempDir && fs.existsSync(tempDir)) {
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* niente */ }
        }
    });

    describe('normalizzazione e query', () => {
        it('normalizza accenti, maiuscole e punteggiatura allo stesso modo in scrittura e lettura', () => {
            expect(normalizzaNome('  Penélope   Cruz! ')).toBe('penelope cruz');
            expect(normalizzaNome('LEONARDO DI CAPRIO')).toBe('leonardo di caprio');
        });

        it('ogni token della query è un prefisso, in AND', () => {
            expect(sanitizePeopleQuery('Leonardo DiCaprio')).toBe('"leonardo"* "dicaprio"*');
            expect(sanitizePeopleQuery('   ')).toBe('');
        });

        it('la distanza è bounded: oltre il tetto non si calcola', () => {
            expect(distanza('dicaprio', 'dicaprio')).toBe(0);
            expect(distanza('dicapio', 'dicaprio')).toBe(1);
            expect(distanza('dicaprio', 'un nome completamente diverso')).toBeGreaterThan(2);
            expect(distanza('', 'abc')).toBe(3);
        });
    });

    describe('costruzione', () => {
        it('scrive il file dai parquet e conta per ruolo', async () => {
            const esito = await buildPeopleIndex({ dataDir: tempDir });

            expect(esito.success).toBe(true);
            expect(fs.existsSync(esito.dbFile)).toBe(true);
            // cast: 6193 (due film + una serie, in UN ruolo) + 525 + 5001 = 3 righe da attore;
            // directors: 525; writers: 6193; creator: 488. Totale 6.
            expect(esito.perRuolo.actor).toBe(3);
            expect(esito.perRuolo.director).toBe(1);
            expect(esito.perRuolo.writer).toBe(1);
            expect(esito.perRuolo.creator).toBe(1);
            expect(esito.count).toBe(6);

            const stats = getPeopleStats({ dataDir: tempDir });
            expect(stats.exists).toBe(true);
            expect(stats.rows).toBe(6);
        });

        it('i titoli per adulti non entrano nei conteggi', async () => {
            const client = new PeopleSearchClient({ dbPath: path.join(tempDir, 'people.db') });

            expect(client.search('solo adulto')).toEqual([]);
            client.close();
        });
    });

    describe('ricerca', () => {
        let client;

        beforeAll(async () => {
            await buildPeopleIndex({ dataDir: tempDir });
            client = new PeopleSearchClient({ dbPath: path.join(tempDir, 'people.db') });
        });

        afterAll(() => client.close());

        it('trova per nome completo e per solo cognome', () => {
            const completo = client.search('Leonardo DiCaprio');
            expect(completo[0]).toMatchObject({ tmdbId: '6193', name: 'Leonardo DiCaprio', ruoli: ['actor', 'writer'] });
            expect(completo[0].titoli).toBe(4); // 3 da attore + 1 da sceneggiatore

            const cognome = client.search('dicaprio');
            expect(cognome[0].tmdbId).toBe('6193');
            // Il totale non dipende da come si scrive la query: i ruoli si fondono prima del taglio.
            expect(cognome[0].titoli).toBe(completo[0].titoli);
        });

        it('accetta il prefisso parziale', () => {
            expect(client.search('leonar dicap')[0].tmdbId).toBe('6193');
        });

        it('un refuso non perde la persona (Levenshtein ≤ 2)', () => {
            expect(client.search('leonardo dicapio')[0].tmdbId).toBe('6193');
            expect(client.search('cristopher nolan')[0].tmdbId).toBe('525');
        });

        it('una persona è una sola, con tutti i ruoli', () => {
            const [nolan] = client.search('christopher nolan');
            expect(nolan.ruoli.sort()).toEqual(['actor', 'director']);
            expect(nolan.titoli).toBe(2);
        });

        it('il ruolo filtra senza perdere la persona', () => {
            const [regista] = client.search('christopher nolan', { ruolo: 'director' });
            expect(regista).toMatchObject({ tmdbId: '525', ruoli: ['director'], titoli: 1 });
        });

        it('il creatore di una serie si trova', () => {
            expect(client.search('spielberg')[0]).toMatchObject({ tmdbId: '488', ruoli: ['creator'] });
        });

        it('una persona sconosciuta non inventa risultati', () => {
            expect(client.search('nome che non esiste')).toEqual([]);
        });

        it('una query vuota non interroga niente', () => {
            expect(client.search('')).toEqual([]);
            expect(client.search(null)).toEqual([]);
        });
    });

    describe('degrado morbido', () => {
        it('indice assente: nessuna eccezione, lista vuota', () => {
            const client = new PeopleSearchClient({ dbPath: path.join(tempDir, 'non-esiste.db') });
            expect(client.search('leonardo dicaprio')).toEqual([]);
            client.close();
        });

        it('file illeggibile: nessuna eccezione, lista vuota', () => {
            const rotto = path.join(tempDir, 'rotto.db');
            fs.writeFileSync(rotto, 'non sono un database');
            const client = new PeopleSearchClient({ dbPath: rotto });
            expect(client.search('leonardo dicaprio')).toEqual([]);
            client.close();
            fs.unlinkSync(rotto);
        });

        it('il percorso di default segue la cartella del dump', () => {
            const atteso = process.env.TMDB_DUMP_DIR
                ? path.resolve(process.env.TMDB_DUMP_DIR, 'people.db')
                : null;
            if (atteso) expect(defaultPeopleDbPath()).toBe(atteso);
            else expect(defaultPeopleDbPath()).toMatch(/people\.db$/);
        });
    });
});
