/**
 * tests/gcPosterCache.test.js
 *
 * Collaudo del Garbage Collector della cache poster (Ticket 09).
 * Verifica le regole e i vincoli:
 * (a) .tmp di 30 min rimosso, .tmp di 5 min tenuto
 * (b) file 90 giorni fa rimosso, 10 giorni fa tenuto
 * (c) file scritto 10 min fa sempre tenuto (barriera 60 minuti)
 * (d) file vecchio con nome non interpretabile da erdbIdDaNomeFile tenuto
 * (e) dryRun:true conta ma non cancella
 * (f) maxDelete:1 con 3 candidati ne rimuove esattamente uno
 * (g) skip esplicito di versioni.json, report.json, sorgenti.json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    gcPosterCache,
    DEFAULT_MAX_DELETE,
    DEFAULT_TTL_DAYS,
    WRITER_GRACE_MS,
    TMP_ORPHAN_MS,
    parseCliArgs
} = require('../src/posters/gcPosterCache');
const { erdbIdDaNomeFile } = require('../src/posters/posterDaEvento');

describe('Garbage Collector volume poster (gcPosterCache)', () => {
    let tmpDir;
    const now = Date.parse('2026-11-15T12:00:00Z');
    const DAY_MS = 24 * 60 * 60 * 1000;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-gc-test-'));
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    const writeWithAge = (name, ageMs, content = 'jpeg-mock-bytes') => {
        const p = path.join(tmpDir, name);
        fs.writeFileSync(p, content);
        const mtime = new Date(now - ageMs);
        fs.utimesSync(p, mtime, mtime);
        return p;
    };

    test('(a) .tmp di 30 min rimosso, .tmp di 5 min tenuto', async () => {
        const pOldTmp = writeWithAge('tmdb-tv-123.jpg.1-1.tmp', 30 * 60 * 1000);
        const pNewTmp = writeWithAge('tmdb-tv-123.jpg.1-2.tmp', 5 * 60 * 1000);

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: false, now });

        expect(report.cancellati).toBe(1);
        expect(report.perMotivo.tmp_orfano).toBe(1);
        expect(report.fileRimossi).toContain('tmdb-tv-123.jpg.1-1.tmp');
        expect(fs.existsSync(pOldTmp)).toBe(false);
        expect(fs.existsSync(pNewTmp)).toBe(true);
    });

    test('(b) file 90 giorni fa rimosso, 10 giorni fa tenuto', async () => {
        const pOld = writeWithAge('tmdb-movie-100_ITA.jpg', 90 * DAY_MS);
        const pRecent = writeWithAge('tmdb-movie-200_ITA.jpg', 10 * DAY_MS);

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: false, ttlDays: 60, now });

        expect(report.cancellati).toBe(1);
        expect(report.perMotivo.scaduto_ttl).toBe(1);
        expect(report.fileRimossi).toContain('tmdb-movie-100_ITA.jpg');
        expect(fs.existsSync(pOld)).toBe(false);
        expect(fs.existsSync(pRecent)).toBe(true);
    });

    test('(c) file scritto 10 min fa sempre tenuto anche con ttlDays=0 (barriera 60 minuti)', async () => {
        const pVeryRecent = writeWithAge('tmdb-movie-300_ITA.jpg', 10 * 60 * 1000);

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: false, ttlDays: 0, now });

        expect(report.cancellati).toBe(0);
        expect(fs.existsSync(pVeryRecent)).toBe(true);
    });

    test('(d) file vecchio con nome non interpretabile da erdbIdDaNomeFile tenuto', async () => {
        const unparseableName = 'file-strano-non-interpretabile.jpg';
        expect(erdbIdDaNomeFile(unparseableName)).toBeNull();

        const pUnparseable = writeWithAge(unparseableName, 90 * DAY_MS);
        const pTar = writeWithAge('backup.tar.gz', 90 * DAY_MS);

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: false, ttlDays: 60, now });

        expect(report.cancellati).toBe(0);
        expect(fs.existsSync(pUnparseable)).toBe(true);
        expect(fs.existsSync(pTar)).toBe(true);
    });

    test('(e) dryRun:true conta ma non cancella nulla su disco', async () => {
        const pOld = writeWithAge('tmdb-movie-500_ITA.jpg', 90 * DAY_MS, '123456');
        const pTmp = writeWithAge('tmdb-tv-500.jpg.tmp', 30 * 60 * 1000, '1234');

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: true, now });

        expect(report.dryRun).toBe(true);
        expect(report.cancellati).toBe(2);
        expect(report.perMotivo.tmp_orfano).toBe(1);
        expect(report.perMotivo.scaduto_ttl).toBe(1);
        expect(report.bytesLiberati).toBe(10);
        expect(report.fileRimossi).toEqual(
            expect.arrayContaining(['tmdb-movie-500_ITA.jpg', 'tmdb-tv-500.jpg.tmp'])
        );
        // Entrambi i file devono esistere ancora
        expect(fs.existsSync(pOld)).toBe(true);
        expect(fs.existsSync(pTmp)).toBe(true);
    });

    test('(f) maxDelete:1 con 3 candidati ne rimuove esattamente uno', async () => {
        const p1 = writeWithAge('tmdb-tv-901_EP_1.jpg.tmp', 40 * 60 * 1000);
        const p2 = writeWithAge('tmdb-movie-902_ITA.jpg', 120 * DAY_MS);
        const p3 = writeWithAge('tmdb-movie-903_ITA.jpg', 100 * DAY_MS);

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: false, maxDelete: 1, now });

        expect(report.cancellati).toBe(1);
        expect(report.fileRimossi.length).toBe(1);

        const existsCount = [p1, p2, p3].filter((p) => fs.existsSync(p)).length;
        expect(existsCount).toBe(2);
    });

    test('(g) salta sempre versioni.json, report.json e sorgenti.json anche se vecchi', async () => {
        const pVer = writeWithAge('versioni.json', 90 * DAY_MS, '{}');
        const pRep = writeWithAge('report.json', 90 * DAY_MS, '{}');
        const pSorg = writeWithAge('sorgenti.json', 90 * DAY_MS, '{}');

        const report = await gcPosterCache({ cacheDir: tmpDir, dryRun: false, ttlDays: 60, now });

        expect(report.cancellati).toBe(0);
        expect(report.esaminati).toBe(0);
        expect(fs.existsSync(pVer)).toBe(true);
        expect(fs.existsSync(pRep)).toBe(true);
        expect(fs.existsSync(pSorg)).toBe(true);
    });

    test('parseCliArgs interpreta correttamente gli argomenti CLI', () => {
        const parsed = parseCliArgs([
            '--dry-run',
            '--max-delete', '250',
            '--ttl-days', '45',
            '--cache-dir', '/custom/cache'
        ]);

        expect(parsed.dryRun).toBe(true);
        expect(parsed.maxDelete).toBe(250);
        expect(parsed.ttlDays).toBe(45);
        expect(parsed.cacheDir).toBe('/custom/cache');
    });

    test('ritorna report vuoto se cartella assente o nulla', async () => {
        const report = await gcPosterCache({ cacheDir: '/path/non/esistente/xyz', dryRun: true });
        expect(report.esaminati).toBe(0);
        expect(report.cancellati).toBe(0);
        expect(report.bytesTotali).toBe(0);
    });
});
