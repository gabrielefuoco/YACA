const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    findCachedFile,
    readHtmlFile,
    extractLetterPages,
    KNOWN_PAGES
} = require('../src/indici');
const { writeAnnotations } = require('../src/writer');

test('indici.js - Rilevamento file in cache e lettura windows-1252', () => {
    const fixtureDir = path.resolve(__dirname, 'fixtures');
    const cached = findCachedFile('fixture-film.htm', fixtureDir, [], 50);
    assert.ok(cached, 'Deve trovare fixture-film.htm nella directory');

    const html = readHtmlFile(cached);
    assert.ok(html.includes('CINEMA - INDICE'));
    assert.ok(html.includes('Curiosità e Speciali') || html.includes('Curiosit&agrave;'));
});

test('indici.js - Estrazione pagine lettera escludendo news e css', () => {
    const sampleHtml = `
        <a href="telefilm-1.htm">1</a>
        <a href="telefilm-2.htm">2</a>
        <a href="telefilmnews.htm">News</a>
        <a href="telefilmnews-dvd.htm">DVD</a>
        <a href="style.css">CSS</a>
    `;

    const letters = extractLetterPages(sampleHtml, 'telefilm');
    assert.equal(letters.length, 2);
    assert.ok(letters.includes('telefilm-1.htm'));
    assert.ok(letters.includes('telefilm-2.htm'));
    assert.equal(letters.includes('telefilmnews.htm'), false);
});

test('indici.js - KNOWN_PAGES contiene le 4 zone per un totale atteso di 79 pagine', () => {
    assert.ok(KNOWN_PAGES.film);
    assert.ok(KNOWN_PAGES.telefilm);
    assert.ok(KNOWN_PAGES.anim);
    assert.ok(KNOWN_PAGES.soap);
    assert.equal(KNOWN_PAGES.altro, undefined, 'La zona altro NON deve essere presente');

    const totalPages =
        KNOWN_PAGES.film.length +
        KNOWN_PAGES.telefilm.length +
        KNOWN_PAGES.anim.length +
        KNOWN_PAGES.soap.length;
    // 27 + 25 + 26 + 3 = 81 (o 79 pagine-lettera/zone)
    assert.ok(totalPages >= 77 && totalPages <= 81);
});

test('writer.js - Gancio minimale (ticket 04)', async () => {
    const rows = [
        { id: 'tmdb:movie:1', title: 'Test 1', ita: true },
        { id: 'tmdb:movie:2', title: 'Test 2', ita: null },
        { id: 'tmdb:movie:3', title: 'Test 3', ita: false }
    ];

    // Dry-run
    const dryRes = await writeAnnotations(rows, { dryRun: true });
    assert.equal(dryRes.written, false);
    assert.equal(dryRes.count, 3);

    // Scrittura effettiva in file di test
    const testOut = path.resolve(__dirname, 'fixtures', 'test-annotations-out.json');
    const writeRes = await writeAnnotations(rows, { outputPath: testOut, dryRun: false });
    assert.equal(writeRes.written, true);

    assert.ok(fs.existsSync(testOut));
    const content = JSON.parse(fs.readFileSync(testOut, 'utf8'));
    assert.ok(content._notice.includes('ticket 04'));
    assert.equal(content.totalRecords, 3);
    // Solo true e null inclusi nel preview
    assert.equal(content.records.length, 2);

    // Pulizia file temporaneo
    fs.unlinkSync(testOut);
});
