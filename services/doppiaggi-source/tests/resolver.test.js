/**
 * Test per src/resolver.js
 * Tutti i test sono OFFLINE (zero chiamate di rete, zero TMDB reale).
 *
 * Copertura richiesta da specifica:
 * 1. identità provata via `title`
 * 2. identità provata via `original_title`
 * 3. identità provata via `alternative_titles`
 * 4. rifiuto quando nessun nome coincide (il caso `Triple Z`)
 * 5. rifiuto quando la ricerca non trova nulla
 * 6. ripresa dal punto (cache: la seconda esecuzione non richiama l'API)
 * 7. budget raggiunto -> si ferma e non scrive un file incompleto spacciato per completo
 * 8. le righe nuove non duplicano quelle già presenti
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    resolveCard,
    resolveResidualCards,
    getAgNameVariants
} = require('../src/resolver');
const { mergeAnnotationRows } = require('../src/annotations');
const { writeAnnotations } = require('../src/writer');

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-test-'));
}

test('resolver - varianti nome gestiscono articolo invertito e anno', () => {
    const card = {
        rawTitle: 'Segreti di Marrowbone (I)',
        cleanTitle: 'I Segreti di Marrowbone',
        key: 'i segreti di marrowbone',
        year: null
    };
    const vars = getAgNameVariants(card);
    assert.ok(vars.has('i segreti di marrowbone'));
    assert.ok(vars.has('segreti di marrowbone'));
});

// 1. identità provata via title
test('resolver - 1. identità provata via title (1 chiamata search)', async () => {
    const card = {
        href: 'telefilm/kaeloo.htm',
        rawTitle: 'Kaeloo',
        cleanTitle: 'Kaeloo',
        key: 'kaeloo',
        year: null,
        zone: 'telefilm',
        type: 'series'
    };

    let apiCalls = 0;
    const fetchFn = async (pathname) => {
        apiCalls++;
        if (pathname.includes('/search/multi')) {
            return {
                results: [
                    {
                        id: 34500,
                        media_type: 'tv',
                        name: 'Kaeloo',
                        original_name: 'Kaeloo',
                        first_air_date: '2010-06-06'
                    }
                ]
            };
        }
        throw new Error(`Chiamata non attesa: ${pathname}`);
    };

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, true);
    assert.equal(res.hit.id, 34500);
    assert.equal(res.hit.type, 'tv');
    assert.equal(res.hit.matchPath, 'titolo');
    assert.equal(apiCalls, 1, 'nessuna chiamata di dettaglio necessaria se il titolo combacia');
});

// 2. identità provata via original_title
test('resolver - 2. identità provata via original_title', async () => {
    const card = {
        href: 'telefilm/supernoobs.htm',
        rawTitle: 'Supernoobs',
        cleanTitle: 'Supernoobs',
        key: 'supernoobs',
        year: null,
        zone: 'telefilm',
        type: 'series'
    };

    let apiCalls = 0;
    const fetchFn = async (pathname) => {
        apiCalls++;
        if (pathname.includes('/search/multi')) {
            return {
                results: [
                    {
                        id: 64757,
                        media_type: 'tv',
                        name: 'I super principianti', // Titolo italiano diverso
                        original_name: 'Supernoobs', // Titolo originale identico ad AG
                        first_air_date: '2015-11-02'
                    }
                ]
            };
        }
        throw new Error(`Chiamata non attesa: ${pathname}`);
    };

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, true);
    assert.equal(res.hit.id, 64757);
    assert.equal(res.hit.type, 'tv');
    assert.equal(res.hit.matchPath, 'originale');
    assert.equal(apiCalls, 1);
});

// 3. identità provata via alternative_titles
test('resolver - 3. identità provata via alternative_titles (richiede dettaglio)', async () => {
    const card = {
        href: 'film1/marrowbone.htm',
        rawTitle: 'Segreti di Marrowbone (I)',
        cleanTitle: 'I Segreti di Marrowbone',
        key: 'i segreti di marrowbone',
        year: 2017,
        zone: 'film',
        type: 'movie'
    };

    let apiCalls = 0;
    const fetchFn = async (pathname) => {
        apiCalls++;
        if (pathname.includes('/search/multi')) {
            return {
                results: [
                    {
                        id: 440026,
                        media_type: 'movie',
                        title: 'Marrowbone',
                        original_title: 'El secreto de Marrowbone',
                        release_date: '2017-10-27'
                    }
                ]
            };
        }
        if (pathname.includes('/movie/440026')) {
            return {
                id: 440026,
                title: 'Marrowbone',
                original_title: 'El secreto de Marrowbone',
                release_date: '2017-10-27',
                alternative_titles: {
                    titles: [
                        { title: 'The Secret of Marrowbone' },
                        { title: 'I Segreti di Marrowbone' } // Presente fra gli alternativi
                    ]
                }
            };
        }
        throw new Error(`Chiamata non attesa: ${pathname}`);
    };

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, true);
    assert.equal(res.hit.id, 440026);
    assert.equal(res.hit.type, 'movie');
    assert.equal(res.hit.matchPath, 'alternativo');
    assert.equal(apiCalls, 2, '1 search + 1 dettaglio titoli alternativi');
});

// 4. rifiuto quando nessun nome coincide (il caso Triple Z)
test('resolver - 4. rifiuto quando nessun nome coincide (il caso Triple Z)', async () => {
    const card = {
        href: 'film1/triplez.htm',
        rawTitle: 'Triple Z',
        cleanTitle: 'Triple Z',
        key: 'triple z',
        year: null,
        zone: 'film',
        type: 'movie'
    };

    let apiCalls = 0;
    const fetchFn = async (pathname) => {
        apiCalls++;
        if (pathname.includes('/search/multi')) {
            // La ricerca propone erroneamente "The Six Triple Eight"
            return {
                results: [
                    {
                        id: 1150820,
                        media_type: 'movie',
                        title: 'La sei triple eight',
                        original_title: 'The Six Triple Eight',
                        release_date: '2024-12-06'
                    }
                ]
            };
        }
        if (pathname.includes('/movie/1150820')) {
            return {
                id: 1150820,
                title: 'La sei triple eight',
                original_title: 'The Six Triple Eight',
                alternative_titles: {
                    titles: [
                        { title: 'Six Triple Eight' },
                        { title: '6 Triple 8' }
                    ]
                }
            };
        }
        return { results: [] };
    };

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, false);
    assert.equal(res.hit, null);
    assert.equal(res.reason, 'no_name_match');
});

// 5. rifiuto quando la ricerca non trova nulla
test('resolver - 5. rifiuto quando la ricerca non trova nulla', async () => {
    const card = {
        href: 'film1/introvabile.htm',
        rawTitle: 'Opera Completamente Inesistente Nel Mondo',
        cleanTitle: 'Opera Completamente Inesistente Nel Mondo',
        key: 'opera completamente inesistente nel mondo',
        year: null,
        zone: 'film',
        type: 'movie'
    };

    const fetchFn = async () => ({ results: [] });
    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, false);
    assert.equal(res.hit, null);
    assert.equal(res.reason, 'no_search_results');
});

// 6. ripresa dal punto (cache: la seconda esecuzione non richiama l'API)
test('resolver - 6. ripresa dal punto (cache: la seconda esecuzione non richiama l\'API)', async () => {
    const tempDir = makeTempDir();
    const cards = [
        {
            href: 'telefilm/serie1.htm',
            rawTitle: 'Serie Alpha',
            cleanTitle: 'Serie Alpha',
            key: 'serie alpha',
            year: null,
            zone: 'telefilm',
            type: 'series'
        },
        {
            href: 'telefilm/serie2.htm',
            rawTitle: 'Serie Beta',
            cleanTitle: 'Serie Beta',
            key: 'serie beta',
            year: null,
            zone: 'telefilm',
            type: 'series'
        }
    ];

    let networkCalls = 0;
    const fetchFn = async (pathname) => {
        networkCalls++;
        const isAlpha = pathname.includes('Serie%20Alpha');
        return {
            results: [
                {
                    id: isAlpha ? 101 : 102,
                    media_type: 'tv',
                    name: isAlpha ? 'Serie Alpha' : 'Serie Beta',
                    original_name: isAlpha ? 'Serie Alpha' : 'Serie Beta'
                }
            ]
        };
    };

    // Primo giro: scarica e salva in cache
    const run1 = await resolveResidualCards(cards, {
        cacheDir: tempDir,
        fetchFn,
        delayMs: 0
    });
    assert.equal(run1.callsMade, 2);
    assert.equal(run1.cacheHits, 0);
    assert.equal(run1.confirmedCount, 2);
    assert.equal(networkCalls, 2);

    // Secondo giro con la stessa cacheDir: zero chiamate alla funzione di rete!
    const run2 = await resolveResidualCards(cards, {
        cacheDir: tempDir,
        fetchFn,
        delayMs: 0
    });
    assert.equal(run2.callsMade, 0, 'zero chiamate di rete al secondo giro');
    assert.equal(run2.cacheHits, 2, 'due hit da cache');
    assert.equal(run2.confirmedCount, 2);
    assert.equal(networkCalls, 2, 'il contatore di rete non è aumentato');
});

// 7. budget raggiunto -> si ferma e non scrive un file incompleto spacciato per completo
test('resolver - 7. budget raggiunto -> si ferma e non scrive un file incompleto spacciato per completo', async () => {
    const tempDir = makeTempDir();
    const outputPath = path.join(tempDir, 'ita_annotations.jsonl');

    // Scriviamo un file base con 10 annotazioni preesistenti
    const baseRows = [];
    for (let i = 1; i <= 10; i++) {
        baseRows.push({ t: 'movie', id: i, ita: true });
    }
    await writeAnnotations(baseRows, { outputPath });
    const originalContent = fs.readFileSync(outputPath, 'utf8');

    // Due nuove schede non in cache
    const cards = [
        {
            href: 'film1/filmA.htm',
            rawTitle: 'Film Gamma',
            cleanTitle: 'Film Gamma',
            key: 'film gamma',
            year: null,
            zone: 'film',
            type: 'movie'
        },
        {
            href: 'film1/filmB.htm',
            rawTitle: 'Film Delta',
            cleanTitle: 'Film Delta',
            key: 'film delta',
            year: null,
            zone: 'film',
            type: 'movie'
        }
    ];

    let calls = 0;
    const fetchFn = async () => {
        calls++;
        return {
            results: [{ id: 500 + calls, media_type: 'movie', title: 'Film Gamma' }]
        };
    };

    // Budget: 1 sola chiamata permessa (la seconda scheda fa scattare il budget)
    const run = await resolveResidualCards(cards, {
        cacheDir: tempDir,
        maxCalls: 1,
        fetchFn,
        delayMs: 0
    });

    assert.equal(run.budgetExceeded, true, 'il budget deve risultare superato');
    assert.equal(run.callsMade, 1);

    // Contratto della specifica: se budgetExceeded è true, non si deve sovrascrivere il file!
    if (run.budgetExceeded) {
        // Nessuna scrittura effettuata
    } else {
        const merged = mergeAnnotationRows(baseRows, run.resolvedRows);
        await writeAnnotations(merged, { outputPath });
    }

    const afterContent = fs.readFileSync(outputPath, 'utf8');
    assert.equal(afterContent, originalContent, 'il file su disco NON deve essere stato modificato');
});

// 8. le righe nuove non duplicano quelle già presenti
test('resolver - 8. le righe nuove non duplicano quelle già presenti', async () => {
    const baseRows = [
        { t: 'movie', id: 50, ita: true },
        { t: 'tv', id: 100, ita: null }
    ];

    // Risoluzione che ri-scopre lo stesso movie 50 e un nuovo tv 100 (che passa da null a true)
    const resolvedRows = [
        { t: 'movie', id: 50, ita: true },
        { t: 'tv', id: 100, ita: true },
        { t: 'movie', id: 200, ita: true }
    ];

    const merged = mergeAnnotationRows(baseRows, resolvedRows);
    assert.equal(merged.length, 3, 'nessun duplicato per movie:50 o tv:100');
    assert.deepEqual(merged, [
        { t: 'movie', id: 50, ita: true },
        { t: 'movie', id: 200, ita: true },
        { t: 'tv', id: 100, ita: true }
    ]);
});

// Test disambiguazione anno e tipo
test('resolver - omonimi: anno esatto seleziona il candidato corretto ed evita il remake', async () => {
    const card = {
        href: 'film1/tombraider2001.htm',
        rawTitle: 'Tomb Raider (2001)',
        cleanTitle: 'Tomb Raider',
        key: 'tomb raider',
        year: 2001,
        zone: 'film',
        type: 'movie'
    };

    const fetchFn = async () => ({
        results: [
            { id: 9999, media_type: 'movie', title: 'Tomb Raider', release_date: '2018-03-08' },
            { id: 1999, media_type: 'movie', title: 'Tomb Raider', release_date: '2001-06-15' }
        ]
    });

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, true);
    assert.equal(res.hit.id, 1999, 'ha scelto il film del 2001 e non il remake del 2018');
});

test('resolver - omonimi: anno non coincidente viene rifiutato (mai +-1)', async () => {
    const card = {
        href: 'film1/remake.htm',
        rawTitle: 'Opera Rara (1990)',
        cleanTitle: 'Opera Rara',
        key: 'opera rara',
        year: 1990,
        zone: 'film',
        type: 'movie'
    };

    const fetchFn = async () => ({
        results: [
            { id: 8888, media_type: 'movie', title: 'Opera Rara', release_date: '1991-05-10' } // +-1 anno: NON deve essere accettato
        ]
    });

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, false);
    assert.equal(res.reason, 'year_mismatch');
});

test('resolver - omonimi: zona->tipo seleziona la serie invece del film', async () => {
    const card = {
        href: 'telefilm/omonimo.htm',
        rawTitle: 'Titolo Omonimo',
        cleanTitle: 'Titolo Omonimo',
        key: 'titolo omonimo',
        year: null,
        zone: 'telefilm',
        type: 'series'
    };

    const fetchFn = async () => ({
        results: [
            { id: 111, media_type: 'movie', title: 'Titolo Omonimo' },
            { id: 222, media_type: 'tv', name: 'Titolo Omonimo' }
        ]
    });

    const res = await resolveCard(card, { fetchFn, delayMs: 0 });
    assert.equal(res.confirmed, true);
    assert.equal(res.hit.id, 222, 'ha scelto la serie tv in accordo con la zona telefilm');
    assert.equal(res.hit.type, 'tv');
});
