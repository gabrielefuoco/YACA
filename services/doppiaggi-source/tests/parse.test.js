const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    stripTags,
    normBase,
    normalizeAgTitle,
    parseIndexPage,
    zoneToType
} = require('../src/parse');

test('parse.js - Regola (a): rimozione tag SENZA spazi', () => {
    // <b>A</b>capulco Bay deve diventare Acapulco Bay (NON A capulco Bay)
    const raw = '<b>A</b>capulco Bay';
    const stripped = stripTags(raw);
    assert.equal(stripped, 'Acapulco Bay');

    const multiTag = '<font color=red><b>Z</b>orro</font> (1975)';
    assert.equal(stripTags(multiTag), 'Zorro (1975)');
});

test('parse.js - Regola (b): inversione articolo italiano e inglese', () => {
    // Italiano
    const itResult = normalizeAgTitle('Titolo (Il)');
    assert.equal(itResult.cleanTitle, 'Il Titolo');
    assert.equal(itResult.key, 'il titolo');

    const itLa = normalizeAgTitle('Famiglia (La)');
    assert.equal(itLa.cleanTitle, 'La Famiglia');
    assert.equal(itLa.key, 'la famiglia');

    const itApos = normalizeAgTitle("Ispettore Gadget (L')");
    assert.equal(itApos.cleanTitle, "L' Ispettore Gadget");
    assert.equal(itApos.key, 'l ispettore gadget');

    // Inglese (1.209 titoli misurati)
    const enResult = normalizeAgTitle('Old Guard 2 (The)');
    assert.equal(enResult.cleanTitle, 'The Old Guard 2');
    assert.equal(enResult.key, 'the old guard 2');

    const enA = normalizeAgTitle('Beautiful Mind (A)');
    assert.equal(enA.cleanTitle, 'A Beautiful Mind');
    assert.equal(enA.key, 'a beautiful mind');

    const enAn = normalizeAgTitle('American Werewolf (An)');
    assert.equal(enAn.cleanTitle, 'An American Werewolf');
    assert.equal(enAn.key, 'an american werewolf');
});

test('parse.js - Regola (c): anno di disambiguazione finale estratto esatto', () => {
    const res = normalizeAgTitle('Ispettore Gadget (L\') (1983)');
    assert.equal(res.year, 1983);
    assert.equal(res.cleanTitle, "L' Ispettore Gadget");
    assert.equal(res.key, 'l ispettore gadget');

    const res2 = normalizeAgTitle('Old Guard 2 (The) (2024)');
    assert.equal(res2.year, 2024);
    assert.equal(res2.cleanTitle, 'The Old Guard 2');
    assert.equal(res2.key, 'the old guard 2');

    const noYear = normalizeAgTitle('Titanic');
    assert.equal(noYear.year, null);
    assert.equal(noYear.cleanTitle, 'Titanic');
    assert.equal(noYear.key, 'titanic');
});

test('parse.js - Estrazione da fixture HTML e filtro cartelle escluse', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures', 'fixture-film.htm');
    const html = fs.readFileSync(fixturePath, 'latin1');
    const entries = parseIndexPage(html, 'film');

    // Verifica che gli speciali/ siano esclusi
    const hasSpeciali = entries.some((e) => e.href.startsWith('speciali/'));
    assert.equal(hasSpeciali, false, 'Le cartelle speciali non devono produrre schede');

    // Verifica Acapulco Bay
    const acapulco = entries.find((e) => e.href === 'film1/acapulco.htm');
    assert.ok(acapulco, 'Acapulco Bay deve essere presente');
    assert.equal(acapulco.cleanTitle, 'Acapulco Bay');
    assert.equal(acapulco.type, 'movie');

    // Verifica Old Guard 2 (The) (2024)
    const oldGuard = entries.find((e) => e.href === 'film1/oldguard2.htm');
    assert.ok(oldGuard);
    assert.equal(oldGuard.cleanTitle, 'The Old Guard 2');
    assert.equal(oldGuard.year, 2024);
    assert.equal(oldGuard.type, 'movie');
});

test('parse.js - Mappatura zone -> tipo', () => {
    assert.equal(zoneToType('film'), 'movie');
    assert.equal(zoneToType('film-1'), 'movie');
    assert.equal(zoneToType('telefilm'), 'series');
    assert.equal(zoneToType('anim'), 'series');
    assert.equal(zoneToType('soap'), 'series');
});
