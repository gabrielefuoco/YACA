const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    toTier1Line,
    toTier1Json,
    hasTier1Id,
    promoteToTier1,
    MOVIE_FIELDS,
    TV_FIELDS
} = require('../src/db/tier1Promotion');

// Fixture: la forma di una riga del Tier 1 come sta davvero nel file (output di
// TmdbDumpClient.fetchMovie): i campi annidati sono stringhe JSON, l'id è numerico.
function movieDetails(overrides = {}) {
    return {
        cast: '[{"id":1136406,"name":"Tom Holland","character":"Peter Parker","order":0}]',
        keywords: '[{"id":9663,"name":"sequel"}]',
        trailer_key: 'W2OheZ8Pj74',
        logo_path: '/vbZcDHC5IFylYuRnp3eyOs5rTV1.png',
        recommendations: '[634649,102382]',
        watch_providers_it: '{"link":"https://www.themoviedb.org/movie/634649/watch?locale=IT"}',
        watch_providers_us: null,
        production_companies: '[{"id":420,"name":"Marvel Studios"}]',
        production_countries: '["US"]',
        spoken_languages: '["en"]',
        genres: '[{"id":28,"name":"Action"}]',
        id: 634649,
        imdb_id: 'tt10872600',
        title: 'Spider-Man: No Way Home',
        original_title: 'Spider-Man: No Way Home',
        original_language: 'en',
        overview: 'Peter Parker chiede a Tony Stark...',
        release_date: '2021-12-15',
        runtime: 148,
        vote_average: 8.0,
        vote_count: 17000,
        popularity: 350.5,
        status: 'Released',
        poster_path: '/1g0dhYtq4irTY1GPXvft6k4YL0.jpg',
        backdrop_path: null,
        directors: '[{"id":1234,"name":"Jon Watts"}]',
        writers: '[{"id":5678,"name":"Erik Sommers"}]',
        tagline: null,
        collection_id: 2344,
        collection_name: 'Spider-Man Collection',
        content_rating: null,
        adult: false,
        budget: 200000000,
        revenue: 1921000000,
        _fetched_at: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

function tvDetails(overrides = {}) {
    return {
        cast: '[{"id":1,"name":"Regina King","character":"Rita","order":0}]',
        keywords: '[]',
        trailer_key: null,
        logo_path: null,
        recommendations: '[]',
        watch_providers_it: null,
        production_companies: '[]',
        production_countries: '["US"]',
        spoken_languages: '["en"]',
        genres: '[{"id":18,"name":"Drama"}]',
        id: 1399,
        imdb_id: 'tt0903747',
        tvdb_id: 81189,
        name: 'Breaking Bad',
        original_name: 'Breaking Bad',
        original_language: 'en',
        overview: 'Un professore di chimica...',
        first_air_date: '2008-01-20',
        last_air_date: '2013-09-29',
        number_of_seasons: 5,
        number_of_episodes: 62,
        vote_average: 8.9,
        vote_count: 13000,
        popularity: 500.2,
        status: 'Ended',
        in_production: false,
        type: 'Scripted',
        poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
        backdrop_path: null,
        created_by: '[{"id":66633,"name":"Vince Gilligan"}]',
        networks: '[{"id":174,"name":"AMC"}]',
        tagline: null,
        content_rating: 'TV-14',
        adult: false,
        runtime: null,
        _fetched_at: '2026-01-01T00:00:00.000Z',
        watch_providers_us: null,
        ...overrides
    };
}

function writeLines(filePath, lines) {
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function readLinesOf(filePath) {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.length > 0);
}

describe('Promozione Tier 2 → Tier 1', () => {
    let dir;
    let moviesFile;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-tier1-promotion-'));
        moviesFile = path.join(dir, 'master_movies.jsonl');
    });

    afterEach(() => {
        fs.rmSync(dir, { force: true, recursive: true });
    });

    describe('toTier1Line', () => {
        test('produce una riga con le stesse chiavi e lo stesso ordine delle righe del file', () => {
            const line = toTier1Line(movieDetails(), 'movie');
            expect(Object.keys(line)).toEqual(MOVIE_FIELDS);

            const tvLine = toTier1Line(tvDetails(), 'tv');
            expect(Object.keys(tvLine)).toEqual(TV_FIELDS);
        });

        test('id numerico e _fetched_at = momento della promozione in ISO', () => {
            const prima = Date.now();
            const line = toTier1Line(movieDetails(), 'movie');
            const dopo = Date.now();

            expect(line.id).toBe(634649);
            expect(typeof line.id).toBe('number');
            expect(line._fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            const ts = Date.parse(line._fetched_at);
            expect(ts).toBeGreaterThanOrEqual(prima - 1000);
            expect(ts).toBeLessThanOrEqual(dopo + 1000);
            // L'_fetched_at che arriva dai dettagli è quello dello scaricamento: la promozione
            // rimette il suoo, perché è la data in cui il titolo è diventato cittadino del Tier 1.
            expect(line._fetched_at).not.toBe('2026-01-01T00:00:00.000Z');
        });

        test('accetta id come stringa e serializza gli array rimasti grezzi', () => {
            const line = toTier1Line(
                movieDetails({ id: '777', cast: [{ id: 1, name: 'X' }], recommendations: [1, 2, 3] }),
                'movie'
            );
            expect(line.id).toBe(777);
            expect(line.cast).toBe('[{"id":1,"name":"X"}]');
            expect(line.recommendations).toBe('[1,2,3]');
        });

        test('watch provider assente resta null (non diventa "[]"), le liste vuote diventano "[]"', () => {
            const senzaProvider = movieDetails({ watch_providers_it: undefined, watch_providers_us: null });
            delete senzaProvider.watch_providers_it;
            const line = toTier1Line(senzaProvider, 'movie');
            expect(line.watch_providers_it).toBeNull();
            expect(line.watch_providers_us).toBeNull();
            expect(line.genres).toBe('[{"id":28,"name":"Action"}]');

            const vuoto = toTier1Line(movieDetails({ genres: [], directors: null, overview: undefined }), 'movie');
            expect(vuoto.genres).toBe('[]');
            expect(vuoto.directors).toBe('[]');
            expect(vuoto.overview).toBe('');
        });

        test('senza id valido o con tipo sconosciuto dice che cosa manca', () => {
            expect(() => toTier1Line(movieDetails({ id: null }), 'movie')).toThrow(/id numerico valido/);
            expect(() => toTier1Line(movieDetails(), 'anime')).toThrow(/Tipo non riconosciuto/);
        });

        test('toTier1Json è la riga serializzata con lo stesso ordine di chiavi', () => {
            const json = toTier1Json(movieDetails({ id: 42 }), 'movie');
            const parsed = JSON.parse(json);
            expect(parsed.id).toBe(42);
            expect(Object.keys(parsed)).toEqual(MOVIE_FIELDS);
        });
    });

    describe('hasTier1Id', () => {
        test('trova l’id in un file normale e dice di no per un id assente', async () => {
            writeLines(moviesFile, [
                JSON.stringify(movieDetails({ id: 100 })),
                JSON.stringify(movieDetails({ id: 200 }))
            ]);

            await expect(hasTier1Id(moviesFile, 100)).resolves.toBe(true);
            await expect(hasTier1Id(moviesFile, 200)).resolves.toBe(true);
            await expect(hasTier1Id(moviesFile, 999)).resolves.toBe(false);
        });

        test('file inesistente: non è un errore, è semplicemente non presente', async () => {
            await expect(hasTier1Id(path.join(dir, 'non-esiste.jsonl'), 1)).resolves.toBe(false);
        });

        test('non si ferma all’id dentro una stringa annidata né alle righe rotte', async () => {
            // "id":777 dentro cast è un falso positivo: l'id del titolo è un altro.
            const falsoPositivo = JSON.stringify(movieDetails({ id: 500, cast: '[{"id":777,"name":"X"}]' }));
            writeLines(moviesFile, [
                falsoPositivo,
                '',
                '   ',
                '{riga rotta, non è JSON',
                'non è nemmeno un oggetto',
                JSON.stringify(movieDetails({ id: 777 }))
            ]);

            await expect(hasTier1Id(moviesFile, 777)).resolves.toBe(true);
            await expect(hasTier1Id(moviesFile, 500)).resolves.toBe(true);
            await expect(hasTier1Id(moviesFile, 123456)).resolves.toBe(false);
        });

        test('riga senza newline finale viene letta lo stesso', async () => {
            fs.writeFileSync(moviesFile, JSON.stringify(movieDetails({ id: 313 })), 'utf8');
            await expect(hasTier1Id(moviesFile, 313)).resolves.toBe(true);
        });
    });

    describe('promoteToTier1', () => {
        test('id già presente: non scrive e il file resta identico', async () => {
            const esistente = JSON.stringify(movieDetails({ id: 634649, _fetched_at: '2020-05-05T00:00:00.000Z' }));
            writeLines(moviesFile, [esistente]);
            const prima = fs.readFileSync(moviesFile, 'utf8');
            const statPrima = fs.statSync(moviesFile);

            const esito = await promoteToTier1(moviesFile, movieDetails({ id: 634649 }), 'movie');

            expect(esito.scritto).toBe(false);
            expect(esito.motivo).toMatch(/già presente/);
            expect(esito.id).toBe(634649);
            expect(esito.tipo).toBe('movie');
            const dopo = fs.readFileSync(moviesFile, 'utf8');
            expect(dopo).toBe(prima);
            expect(fs.statSync(moviesFile).size).toBe(statPrima.size);
        });

        test('id assente: scrive una riga sola, JSON valido, con id e _fetched_at', async () => {
            writeLines(moviesFile, [JSON.stringify(movieDetails({ id: 100 }))]);
            const prima = fs.readFileSync(moviesFile, 'utf8');

            const esito = await promoteToTier1(moviesFile, movieDetails({ id: 200 }), 'movie');
            expect(esito.scritto).toBe(true);
            expect(esito.motivo).toMatch(/promosso/);
            expect(esito.percorso).toBe(moviesFile);

            const contenuto = fs.readFileSync(moviesFile, 'utf8');
            expect(contenuto.startsWith(prima)).toBe(true);
            expect(contenuto.endsWith('\n')).toBe(true);

            const righe = readLinesOf(moviesFile);
            expect(righe).toHaveLength(2);
            const nuova = JSON.parse(righe[1]);
            expect(nuova.id).toBe(200);
            expect(nuova.title).toBe('Spider-Man: No Way Home');
            expect(Object.keys(nuova)).toEqual(MOVIE_FIELDS);
            expect(new Date(nuova._fetched_at).toISOString()).toBe(nuova._fetched_at);
            await expect(hasTier1Id(moviesFile, 200)).resolves.toBe(true);
        });

        test('id diverso: la riga nuova non tocca quelle esistenti', async () => {
            const righe = [
                JSON.stringify(movieDetails({ id: 100, title: 'Primo' })),
                JSON.stringify(movieDetails({ id: 300, title: 'Secondo' }))
            ];
            writeLines(moviesFile, righe);

            await promoteToTier1(moviesFile, movieDetails({ id: 200, title: 'Promosso' }), 'movie');

            const dopo = readLinesOf(moviesFile);
            expect(dopo).toHaveLength(3);
            expect(dopo[0]).toBe(righe[0]);
            expect(dopo[1]).toBe(righe[1]);
            expect(JSON.parse(dopo[2]).title).toBe('Promosso');
        });

        test('file inesistente: viene creato con la riga promossa', async () => {
            const nuovo = path.join(dir, 'master_tv.jsonl');
            expect(fs.existsSync(nuovo)).toBe(false);

            const esito = await promoteToTier1(nuovo, tvDetails(), 'tv');

            expect(esito.scritto).toBe(true);
            expect(esito.tipo).toBe('tv');
            expect(fs.existsSync(nuovo)).toBe(true);
            const righe = readLinesOf(nuovo);
            expect(righe).toHaveLength(1);
            const riga = JSON.parse(righe[0]);
            expect(riga.id).toBe(1399);
            expect(riga.name).toBe('Breaking Bad');
            expect(Object.keys(riga)).toEqual(TV_FIELDS);
        });

        test('su un file con spazzatura in mezzo la promozione scrive lo stesso', async () => {
            writeLines(moviesFile, [
                JSON.stringify(movieDetails({ id: 100 })),
                'riga spazzatura {{{',
                JSON.stringify(movieDetails({ id: 300 }))
            ]);
            const prima = readLinesOf(moviesFile);

            const esito = await promoteToTier1(moviesFile, movieDetails({ id: 200 }), 'movie');
            expect(esito.scritto).toBe(true);

            const dopo = readLinesOf(moviesFile);
            expect(dopo).toHaveLength(4);
            expect(dopo[0]).toBe(prima[0]);
            expect(dopo[1]).toBe(prima[1]);
            expect(dopo[2]).toBe(prima[2]);
            expect(JSON.parse(dopo[3]).id).toBe(200);
        });

        test('file senza newline finale: la riga promossa non si incolla a quella spezzata', async () => {
            fs.writeFileSync(moviesFile, JSON.stringify(movieDetails({ id: 100 })), 'utf8');

            const esito = await promoteToTier1(moviesFile, movieDetails({ id: 200 }), 'movie');
            expect(esito.scritto).toBe(true);

            const righe = readLinesOf(moviesFile);
            expect(righe).toHaveLength(2);
            expect(JSON.parse(righe[0]).id).toBe(100);
            expect(JSON.parse(righe[1]).id).toBe(200);
        });

        test('la stessa promozione due volte scrive una riga sola', async () => {
            await promoteToTier1(moviesFile, movieDetails({ id: 555 }), 'movie');
            const secondo = await promoteToTier1(moviesFile, movieDetails({ id: 555 }), 'movie');

            expect(secondo.scritto).toBe(false);
            expect(readLinesOf(moviesFile)).toHaveLength(1);
        });
    });
});