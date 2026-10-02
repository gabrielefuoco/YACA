const fs = require('fs');
const os = require('os');
const path = require('path');

const builder = require('../scripts/erdb-builder/build');

/**
 * Doppione di rete: risponde con un JPEG finto (magic bytes FF D8 FF) e conta le chiamate,
 * cosi' possiamo verificare che i file gia' presenti non vengano riscaricati.
 */
function createFakeFetch({ failOn = new Set() } = {}) {
    const calls = [];
    const fakeFetch = async (url) => {
        calls.push(url);
        const key = calls.length; // 1-based
        if (failOn.has(key)) {
            return {
                ok: false,
                status: 404,
                headers: { get: () => 'text/html' },
                arrayBuffer: async () => Buffer.from('<html>errore</html>')
            };
        }
        const payload = Buffer.concat([
            Buffer.from([0xff, 0xd8, 0xff]),
            Buffer.from(`payload-${key}`)
        ]);
        return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
            arrayBuffer: async () => payload
        };
    };
    return { fakeFetch, calls };
}

async function makeTmpDir() {
    return fs.promises.mkdtemp(path.join(os.tmpdir(), 'erdb-builder-'));
}

describe('posterFileName (funzione pura)', () => {
    test('produce il nome documentato: movie_27205_ITA.jpg', () => {
        expect(builder.posterFileName({ type: 'movie', id: 27205, badge: 'ITA' }))
            .toBe('movie_27205_ITA.jpg');
    });

    test('accetta id numerici o stringhe indistintamente', () => {
        expect(builder.posterFileName({ type: 'series', id: 1399, badge: 'ENG' }))
            .toBe('series_1399_ENG.jpg');
        expect(builder.posterFileName({ type: 'series', id: '1399', badge: 'ENG' }))
            .toBe('series_1399_ENG.jpg');
    });

    test('senza badge il nome resta deterministico e senza doppio underscore', () => {
        expect(builder.posterFileName({ type: 'anime', id: 1535, badge: '' }))
            .toBe('anime_1535.jpg');
        expect(builder.posterFileName({ type: 'anime', id: 1535 }))
            .toBe('anime_1535.jpg');
    });

    test('ripulisce i caratteri non sicuri per il filesystem', () => {
        expect(builder.posterFileName({ type: 'tv show', id: '../../etc', badge: 'ITA/2' }))
            .toBe('tv_show_.._.._etc_ITA_2.jpg');
    });

    test('e\' deterministica: stesse voci -> stesso nome', () => {
        const entry = { type: 'movie', id: 27205, badge: 'ITA' };
        expect(builder.posterFileName(entry)).toBe(builder.posterFileName(entry));
    });

    test('rifiuta voci senza type o id', () => {
        expect(() => builder.posterFileName({ id: 1 })).toThrow(/type/);
        expect(() => builder.posterFileName({ type: 'movie' })).toThrow(/id/);
    });
});

describe('posterUrl (funzione pura)', () => {
    test('costruisce {base}/poster/{type}:{id}.jpg?badge={badge}', () => {
        expect(builder.posterUrl('https://easyratingsdb.com/CHIAVE', { type: 'movie', id: 27205, badge: 'ITA' }))
            .toBe('https://easyratingsdb.com/CHIAVE/poster/movie:27205.jpg?badge=ITA');
    });

    test('toglie lo slash finale della base e omette badge se assente', () => {
        expect(builder.posterUrl('https://easyratingsdb.com/CHIAVE/', { type: 'series', id: 1399 }))
            .toBe('https://easyratingsdb.com/CHIAVE/poster/series:1399.jpg');
    });
});

describe('isReusable (logica di ripresa)', () => {
    test('file esistente e non vuoto -> riusabile (si salta)', () => {
        expect(builder.isReusable({ isFile: () => true, size: 2048 })).toBe(true);
    });

    test('file vuoto (0 byte) -> non riusabile (si rifa)', () => {
        expect(builder.isReusable({ isFile: () => true, size: 0 })).toBe(false);
    });

    test('file assente -> non riusabile', () => {
        expect(builder.isReusable(null)).toBe(false);
    });

    test('una directory non e\' un poster riusabile', () => {
        expect(builder.isReusable({ isFile: () => false, size: 4096 })).toBe(false);
    });
});

describe('parseJsonl', () => {
    test('legge una riga per titolo e ignora righe vuote o commenti', () => {
        const { entries, errors } = builder.parseJsonl([
            '{"type":"movie","id":27205,"badge":"ITA"}',
            '',
            '# un commento',
            '{"type":"series","id":1399}'
        ].join('\n'));

        expect(entries).toEqual([
            { type: 'movie', id: '27205', badge: 'ITA' },
            { type: 'series', id: '1399', badge: '' }
        ]);
        expect(errors).toEqual([]);
    });

    test('le righe rotte finiscono in errors con il numero di riga', () => {
        const { entries, errors } = builder.parseJsonl([
            '{"type":"movie","id":1}',
            '{rotta',
            '{"badge":"ITA"}'
        ].join('\n'));

        expect(entries).toHaveLength(1);
        expect(errors).toHaveLength(2);
        expect(errors[0].line).toBe(2);
        expect(errors[1].line).toBe(3);
    });
});

describe('parseArgs', () => {
    test('legge le opzioni e applica i default', () => {
        const options = builder.parseArgs(['--list', 'a.jsonl', '--base', 'https://x/y', '--out', 'cache']);
        expect(options).toMatchObject({ list: 'a.jsonl', base: 'https://x/y', out: 'cache' });
        expect(options.delay).toBe(300);
        expect(options.concurrency).toBe(1);
    });

    test('accetta anche --flag=valore e delay/concurrency espliciti', () => {
        const options = builder.parseArgs(['--base=https://x/y', '--delay=750', '--concurrency=2']);
        expect(options.base).toBe('https://x/y');
        expect(options.delay).toBe(750);
        expect(options.concurrency).toBe(2);
    });

    test('rifiuta valori non numerici o sconosciuti', () => {
        expect(() => builder.parseArgs(['--delay=abc'])).toThrow(/--delay/);
        expect(() => builder.parseArgs(['--delay=0'])).toThrow(/--delay/);
        expect(() => builder.parseArgs(['--base'])).toThrow(/Manca il valore/);
        expect(() => builder.parseArgs(['--pippo'])).toThrow(/sconosciuto/);
    });
});

describe('run: ripresa su cartella reale', () => {
    let outDir;
    let listFile;

    const writeList = (rows) => {
        listFile = path.join(outDir, 'lista.jsonl');
        return fs.promises.writeFile(listFile, rows.map((r) => JSON.stringify(r)).join('\n'), 'utf8');
    };

    beforeEach(async () => {
        outDir = await makeTmpDir();
    });

    afterEach(async () => {
        await fs.promises.rm(outDir, { recursive: true, force: true });
    });

    test('scarica tutto al primo giro e scrive report.json', async () => {
        await writeList([
            { type: 'movie', id: 27205, badge: 'ITA' },
            { type: 'series', id: 1399, badge: 'ENG' }
        ]);
        const { fakeFetch, calls } = createFakeFetch();

        const report = await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: path.join(outDir, 'poster'),
            delay: 0,
            fetchImpl: fakeFetch
        });

        expect(report).toMatchObject({ totale: 2, resi: 2, saltati: 0, falliti: 0 });
        expect(calls).toEqual([
            'https://easyratingsdb.com/CHIAVE/poster/movie:27205.jpg?badge=ITA',
            'https://easyratingsdb.com/CHIAVE/poster/series:1399.jpg?badge=ENG'
        ]);

        const posterDir = path.join(outDir, 'poster');
        expect(await fs.promises.readdir(posterDir)).toEqual(
            expect.arrayContaining(['movie_27205_ITA.jpg', 'series_1399_ENG.jpg', 'report.json'])
        );
    });

    test('secondo giro sullo stesso out: salta tutto e non rifà richieste', async () => {
        await writeList([
            { type: 'movie', id: 27205, badge: 'ITA' },
            { type: 'series', id: 1399, badge: 'ENG' }
        ]);
        const posterDir = path.join(outDir, 'poster');

        await builder.run({ list: listFile, base: 'https://easyratingsdb.com/CHIAVE', out: posterDir, delay: 0, fetchImpl: createFakeFetch().fakeFetch });

        const { fakeFetch, calls } = createFakeFetch();
        const report = await builder.run({ list: listFile, base: 'https://easyratingsdb.com/CHIAVE', out: posterDir, delay: 0, fetchImpl: fakeFetch });

        expect(report).toMatchObject({ totale: 2, resi: 0, saltati: 2, falliti: 0 });
        expect(calls).toEqual([]); // nessuna richiesta: la ripresa funziona
    });

    test('file gia\' presente e NON vuoto -> saltato, anche senza rete disponibile', async () => {
        const posterDir = path.join(outDir, 'poster');
        await fs.promises.mkdir(posterDir, { recursive: true });
        await fs.promises.writeFile(path.join(posterDir, 'movie_27205_ITA.jpg'), 'poster gia\' scaricato');

        await writeList([{ type: 'movie', id: 27205, badge: 'ITA' }]);

        const fakeFetch = async () => { throw new Error('la rete non deve essere toccata'); };
        const report = await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: posterDir,
            delay: 0,
            fetchImpl: fakeFetch
        });

        expect(report).toMatchObject({ totale: 1, resi: 0, saltati: 1, falliti: 0 });
    });

    test('file presente ma VUOTO -> rifatto (download abortito non blocca)', async () => {
        const posterDir = path.join(outDir, 'poster');
        await fs.promises.mkdir(posterDir, { recursive: true });
        await fs.promises.writeFile(path.join(posterDir, 'movie_27205_ITA.jpg'), ''); // 0 byte

        await writeList([{ type: 'movie', id: 27205, badge: 'ITA' }]);

        const { fakeFetch, calls } = createFakeFetch();
        const report = await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: posterDir,
            delay: 0,
            fetchImpl: fakeFetch
        });

        expect(report).toMatchObject({ totale: 1, resi: 1, saltati: 0, falliti: 0 });
        expect(calls).toHaveLength(1);
        const stat = await fs.promises.stat(path.join(posterDir, 'movie_27205_ITA.jpg'));
        expect(stat.size).toBeGreaterThan(0);
    });

    test('misto: solo i file mancanti o vuoti vengono riscaricati', async () => {
        const posterDir = path.join(outDir, 'poster');
        await fs.promises.mkdir(posterDir, { recursive: true });
        await fs.promises.writeFile(path.join(posterDir, 'movie_27205_ITA.jpg'), 'gia fatto');
        await fs.promises.writeFile(path.join(posterDir, 'series_1399_ENG.jpg'), '');

        await writeList([
            { type: 'movie', id: 27205, badge: 'ITA' },   // salvato
            { type: 'series', id: 1399, badge: 'ENG' },   // vuoto -> rifatto
            { type: 'anime', id: 1535, badge: 'ITA' }    // mai visto -> rifatto
        ]);

        const { fakeFetch, calls } = createFakeFetch();
        const report = await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: posterDir,
            delay: 0,
            fetchImpl: fakeFetch
        });

        expect(report).toMatchObject({ totale: 3, resi: 2, saltati: 1, falliti: 0 });
        expect(calls).toEqual([
            'https://easyratingsdb.com/CHIAVE/poster/series:1399.jpg?badge=ENG',
            'https://easyratingsdb.com/CHIAVE/poster/anime:1535.jpg?badge=ITA'
        ]);
    });

    test('i fallimenti finiscono nel report con il motivo', async () => {
        // fallOn conta le richieste in ordine: la prima (id 1) risponde 404.
        await writeList([
            { type: 'movie', id: 1, badge: 'ITA' },
            { type: 'movie', id: 2, badge: 'ITA' }
        ]);
        const posterDir = path.join(outDir, 'poster');
        const { fakeFetch } = createFakeFetch({ failOn: new Set([1]) });

        const report = await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: posterDir,
            delay: 0,
            fetchImpl: fakeFetch
        });

        expect(report).toMatchObject({ resi: 1, falliti: 1 });
        expect(report.fallimenti).toHaveLength(1);
        expect(report.fallimenti[0]).toMatchObject({ type: 'movie', id: '1', motivo: 'HTTP 404' });
        // il fallito non lascia file sporchi in giro
        expect(fs.existsSync(path.join(posterDir, 'movie_1_ITA.jpg'))).toBe(false);
    });

    test('report.json su disco contiene resi, saltati, falliti e durata', async () => {
        await writeList([{ type: 'movie', id: 27205, badge: 'ITA' }]);
        const posterDir = path.join(outDir, 'poster');
        await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: posterDir,
            delay: 0,
            fetchImpl: createFakeFetch().fakeFetch
        });

        const report = JSON.parse(await fs.promises.readFile(path.join(posterDir, 'report.json'), 'utf8'));
        expect(report).toMatchObject({ totale: 1, resi: 1, saltati: 0, falliti: 0 });
        expect(typeof report.durataMs).toBe('number');
        expect(typeof report.durata).toBe('string');
        expect(Array.isArray(report.fallimenti)).toBe(true);
    });

    test('la pausa (--delay) viene applicata fra le richieste', async () => {
        const rows = [];
        for (let id = 1; id <= 3; id++) rows.push({ type: 'movie', id, badge: 'ITA' });
        await writeList(rows);

        const tempi = [];
        const fakeDelay = 40;
        const fakeFetch = async () => { tempi.push(Date.now()); return createFakeFetch().fakeFetch('x'); };

        const inizio = Date.now();
        await builder.run({
            list: listFile,
            base: 'https://easyratingsdb.com/CHIAVE',
            out: path.join(outDir, 'poster'),
            delay: fakeDelay,
            fetchImpl: fakeFetch
        });
        const durata = Date.now() - inizio;

        expect(tempi).toHaveLength(3);
        expect(fakeDelay).toBe(40);
        expect(durata).toBeGreaterThanOrEqual(fakeDelay * 2); // 2 pause per 3 richieste
    });

    test('isUsableImage riconosce i magic byte JPEG anche senza content-type', () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
        const html = Buffer.from('<html>non sono un poster</html>');
        expect(builder.isUsableImage(jpeg, null)).toBe(true);
        expect(builder.isUsableImage(html, 'text/html')).toBe(false);
        expect(builder.isUsableImage(html, 'image/jpeg')).toBe(true);
    });
});