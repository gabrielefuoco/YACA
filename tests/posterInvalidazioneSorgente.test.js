/**
 * tests/posterInvalidazioneSorgente.test.js — Ticket 08
 * "Poster: la versione del file deve dipendere anche dall'immagine sorgente"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    calcolaVersionePoster,
    estraiTokenSorgente
} = require('../src/stremio/formatters/posterBadgeVersion');
const {
    leggiMappa,
    leggiToken,
    scriviToken,
    scriviMappa,
    resetCache,
    SORGENTI_FILE_NAME
} = require('../src/posters/sorgenti');
const { posterFileName } = require('../src/posters/erdb/build');
const { nomeFileDaEvento } = require('../src/posters/posterDaEvento');
const { drena } = require('../src/posters/drenaPoster');

describe('Ticket 08: calcolaVersionePoster e estraiTokenSorgente', () => {
    // Golden hash calcolato sul payload legacy `${BADGE_IMG_VERSION}|tmdb-movie-27205|ITA`
    const GOLDEN_LEGACY_HASH = '460b8042';

    test('calcolaVersionePoster senza source è byte-identico a oggi (golden assertion)', () => {
        const vSenzaSource = calcolaVersionePoster({ erdbId: 'tmdb-movie-27205', badge: 'ITA' });
        expect(vSenzaSource).toBe(GOLDEN_LEGACY_HASH);

        const vConSourceNull = calcolaVersionePoster({ erdbId: 'tmdb-movie-27205', badge: 'ITA', source: null });
        expect(vConSourceNull).toBe(GOLDEN_LEGACY_HASH);

        const vConSourceVuota = calcolaVersionePoster({ erdbId: 'tmdb-movie-27205', badge: 'ITA', source: '' });
        expect(vConSourceVuota).toBe(GOLDEN_LEGACY_HASH);

        const vConSourceInvalida = calcolaVersionePoster({ erdbId: 'tmdb-movie-27205', badge: 'ITA', source: 'up' });
        expect(vConSourceInvalida).toBe(GOLDEN_LEGACY_HASH);
    });

    test('calcolaVersionePoster con source cambia hash', () => {
        const vConSource = calcolaVersionePoster({
            erdbId: 'tmdb-movie-27205',
            badge: 'ITA',
            source: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'
        });
        expect(vConSource).not.toBe(GOLDEN_LEGACY_HASH);
        expect(vConSource).toMatch(/^[0-9a-f]{8}$/);
    });

    test('calcolaVersionePoster con due host CDN diversi ma stesso basename produce lo stesso hash', () => {
        const vCdn1 = calcolaVersionePoster({
            erdbId: 'tmdb-movie-27205',
            badge: 'ITA',
            source: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'
        });
        const vCdn2 = calcolaVersionePoster({
            erdbId: 'tmdb-movie-27205',
            badge: 'ITA',
            source: 'https://othercdn.example.com/resize/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg?v=2'
        });
        expect(vCdn1).toBe(vCdn2);
    });

    test('estraiTokenSorgente estrae il token canonico o ritorna stringa vuota', () => {
        const expectedToken = 'abc123';
        expect(estraiTokenSorgente('https://image.tmdb.org/t/p/w500/abc123.jpg')).toBe(expectedToken);
        expect(estraiTokenSorgente('https://image.tmdb.org/t/p/w342/abc123.jpg?x=1')).toBe(expectedToken);
        expect(estraiTokenSorgente('abc123')).toBe(expectedToken);
        expect(estraiTokenSorgente('/abc123.webp')).toBe(expectedToken);

        expect(estraiTokenSorgente('')).toBe('');
        expect(estraiTokenSorgente(null)).toBe('');
        expect(estraiTokenSorgente(undefined)).toBe('');
        expect(estraiTokenSorgente('up')).toBe('');
    });
});

describe('Ticket 08: mappa sorgenti.json nel volume & cache in RAM', () => {
    let tmpDir;

    beforeEach(() => {
        resetCache();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-sorgenti-test-'));
    });

    afterEach(() => {
        resetCache();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('roundtrip scrittura e lettura mappa', () => {
        const erdbId = 'tmdb:movie:27205';
        const source = 'https://image.tmdb.org/t/p/w500/abc123def456.jpg';

        expect(leggiToken(erdbId, tmpDir)).toBe('');
        expect(leggiMappa(tmpDir)).toEqual({});

        scriviToken(erdbId, source, { cacheDir: tmpDir });

        expect(leggiToken(erdbId, tmpDir)).toBe('abc123def456');
        expect(leggiMappa(tmpDir)).toEqual({ [erdbId]: 'abc123def456' });
    });

    test('scrittura atomica senza file temporanei orfani', () => {
        const erdbId = 'tmdb:movie:101';
        const source = '/poster_xyz789.jpg';

        scriviToken(erdbId, source, { cacheDir: tmpDir });

        const targetFile = path.join(tmpDir, SORGENTI_FILE_NAME);
        expect(fs.existsSync(targetFile)).toBe(true);

        const files = fs.readdirSync(tmpDir);
        const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
        expect(tmpFiles).toEqual([]);
    });

    test('reset a {} al superamento del tetto (simulato con opzione maxKeys)', () => {
        const options = { cacheDir: tmpDir, maxKeys: 3 };

        scriviToken('tmdb:movie:1', 'poster_aaa111.jpg', options);
        scriviToken('tmdb:movie:2', 'poster_bbb222.jpg', options);
        scriviToken('tmdb:movie:3', 'poster_ccc333.jpg', options);

        let map = leggiMappa(tmpDir);
        expect(Object.keys(map).length).toBe(3);
        expect(map['tmdb:movie:1']).toBe('poster_aaa111');

        // Scrivendo la quarta chiave oltre il tetto di 3, la mappa viene azzerata
        scriviToken('tmdb:movie:4', 'poster_ddd444.jpg', options);

        map = leggiMappa(tmpDir);
        expect(Object.keys(map).length).toBe(1);
        expect(map).toEqual({ 'tmdb:movie:4': 'poster_ddd444' });
    });

    test('cache in RAM: 1.000 letture chiamano fs.readFileSync una sola volta entro il TTL', () => {
        const erdbId = 'tmdb:movie:27205';
        const source = 'https://image.tmdb.org/t/p/w500/abc123def456.jpg';
        scriviToken(erdbId, source, { cacheDir: tmpDir });
        resetCache(); // Inizia a freddo

        let readCount = 0;
        const origReadFileSync = fs.readFileSync;
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
            const filePath = String(args[0]);
            if (filePath.endsWith(SORGENTI_FILE_NAME)) {
                readCount++;
            }
            return origReadFileSync(...args);
        });

        try {
            for (let i = 0; i < 1000; i++) {
                const token = leggiToken(erdbId, tmpDir);
                expect(token).toBe('abc123def456');
            }
            // Su 1.000 letture, esattamente UNA sola lettura su filesystem
            expect(readCount).toBe(1);
        } finally {
            spy.mockRestore();
        }
    });

    test('cache in RAM: dopo TTL controlla mtime e non rilegge se il file non è cambiato', () => {
        const erdbId = 'tmdb:movie:27205';
        scriviToken(erdbId, 'poster_v1_abc123.jpg', { cacheDir: tmpDir });
        resetCache();

        let readCount = 0;
        const origReadFileSync = fs.readFileSync;
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
            const filePath = String(args[0]);
            if (filePath.endsWith(SORGENTI_FILE_NAME)) {
                readCount++;
            }
            return origReadFileSync(...args);
        });

        try {
            // 1. Prima lettura a freddo
            expect(leggiToken(erdbId, tmpDir)).toBe('poster_v1_abc123');
            expect(readCount).toBe(1);

            // 2. Lettura con ttlMs: 0 per forzare controllo mtime su statSync
            expect(leggiToken(erdbId, tmpDir, { ttlMs: 0 })).toBe('poster_v1_abc123');
            // mtime non è cambiato: readFileSync NON viene richiamato
            expect(readCount).toBe(1);
        } finally {
            spy.mockRestore();
        }
    });
});

describe('Ticket 08: End-to-end concordanza nome drainer e formatter dalla mappa', () => {
    let tmpDir;

    beforeEach(() => {
        resetCache();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-e2e-poster-'));
    });

    afterEach(() => {
        resetCache();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('posterFileName con source produce un nome che il drenatore riproduce dalla sola mappa', () => {
        const erdbId = 'tmdb:movie:27205';
        const badge = 'ITA';
        const source = 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg';

        // 1. Il formatter/builder produce il nome conoscendo la source
        const expectedName = posterFileName({ erdbId, badge, source });

        // 2. Il prefill offline scrive il token nella mappa del volume
        scriviToken(erdbId, source, { cacheDir: tmpDir });

        // 3. L'evento in coda non ha la source: porta solo {tipo, id, badge}
        const eventoDallaCoda = { tipo: 'movie', id: 27205, badge: 'ITA' };

        // 4. Il drenatore ricostruisce il nome dalla mappa del volume
        const drainerName = nomeFileDaEvento(eventoDallaCoda, { cacheDir: tmpDir });

        expect(drainerName).toBe(expectedName);
    });

    test('se la mappa non ha voce per il titolo, il drenatore produce il nome legacy identico a oggi', () => {
        const eventoDallaCoda = { tipo: 'movie', id: 27205, badge: 'ITA' };
        const drainerName = nomeFileDaEvento(eventoDallaCoda, { cacheDir: tmpDir });

        expect(drainerName).toBe('tmdb-movie-27205-460b8042_ITA.jpg');
    });

    test('drenaPoster scrive su disco il file con il nome riprodotto dalla mappa', async () => {
        const erdbId = 'tmdb:movie:27205';
        const badge = 'ITA';
        const source = 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg';

        // Scriviamo nella mappa la sorgente
        scriviToken(erdbId, source, { cacheDir: tmpDir });

        const expectedName = posterFileName({ erdbId, badge, source });

        const evento = { tipo: 'movie', id: 27205, badge: 'ITA' };
        let doneChiamato = false;

        // Mock fake JPEG (magic ff d8)
        const fakeJpeg = new Uint8Array([0xff, 0xd8, 0x00, 0x00]);
        const fetchImpl = async () => ({
            ok: true,
            status: 200,
            headers: { get: () => 'image/jpeg' },
            arrayBuffer: async () => fakeJpeg.buffer
        });

        const report = await drena({
            take: async () => [evento],
            done: async () => { doneChiamato = true; },
            fail: async () => {},
            base: 'https://easyratingsdb.test',
            outDir: tmpDir,
            fetchImpl
        });

        expect(report.resi).toBe(1);
        expect(report.falliti).toBe(0);
        expect(doneChiamato).toBe(true);

        // Verifica che su disco ci sia il file col nome nuovo contenente il token
        const fileScritto = path.join(tmpDir, expectedName);
        expect(fs.existsSync(fileScritto)).toBe(true);
    });

    test('erdb/build.js run (prefill offline) scrive sorgenti.json alla fine del giro', async () => {
        const listFile = path.join(tmpDir, 'titoli.jsonl');
        const riga = JSON.stringify({
            erdbId: 'tmdb:movie:550',
            badge: 'ITA',
            source: 'https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg'
        });
        fs.writeFileSync(listFile, `${riga}\n`, 'utf8');

        const outDir = path.join(tmpDir, 'out');
        const fakeJpeg = new Uint8Array([0xff, 0xd8, 0x00, 0x00]);
        const fetchImpl = async () => ({
            ok: true,
            status: 200,
            headers: { get: () => 'image/jpeg' },
            arrayBuffer: async () => fakeJpeg.buffer
        });

        const { run } = require('../src/posters/erdb/build');
        await run({
            list: listFile,
            base: 'https://easyratingsdb.test',
            out: outDir,
            fetchImpl
        });

        expect(fs.existsSync(path.join(outDir, SORGENTI_FILE_NAME))).toBe(true);
        expect(leggiToken('tmdb:movie:550', outDir)).toBe('bptfVGEQuv6vDTIMVCHjJ9Dz8PX');
    });
});
