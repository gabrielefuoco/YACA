const test = require('node:test');
const assert = require('node:assert/strict');
const {
    matchCatalog,
    extractTokens,
    isStrictContainment
} = require('../src/match');
const { normBase } = require('../src/parse');

test('match.js - Percorso 1: Titolo unico -> true', () => {
    const catalog = [
        {
            id: 'tmdb:movie:101',
            type: 'movie',
            title: 'Titolo Unico Film',
            year: 2020,
            key: normBase('Titolo Unico Film'),
            toks: extractTokens(normBase('Titolo Unico Film'))
        }
    ];

    const agEntries = [
        {
            href: 'film1/solocandidato.htm',
            rawTitle: 'Titolo Unico Film',
            cleanTitle: 'Titolo Unico Film',
            key: normBase('Titolo Unico Film'),
            year: null,
            zone: 'film',
            type: 'movie'
        }
    ];

    const result = matchCatalog(catalog, agEntries);
    assert.equal(result.catalogStats.trueCount, 1);
    assert.equal(result.catalogStats.nullCount, 0);
    assert.equal(result.catalogStats.falseCount, 0);

    const annotated = result.annotations[0];
    assert.equal(annotated.id, 'tmdb:movie:101');
    assert.equal(annotated.ita, true);
});

test('match.js - Percorso 2: Anno esatto disambigua fra omonimi -> true', () => {
    const catalog = [
        {
            id: 'tmdb:movie:201',
            type: 'movie',
            title: 'Omonimo Test',
            year: 1995,
            key: normBase('Omonimo Test'),
            toks: extractTokens(normBase('Omonimo Test'))
        },
        {
            id: 'tmdb:movie:202',
            type: 'movie',
            title: 'Omonimo Test',
            year: 2015,
            key: normBase('Omonimo Test'),
            toks: extractTokens(normBase('Omonimo Test'))
        }
    ];

    const agEntries = [
        {
            href: 'film1/omonimo95.htm',
            rawTitle: 'Omonimo Test (1995)',
            cleanTitle: 'Omonimo Test',
            key: normBase('Omonimo Test'),
            year: 1995,
            zone: 'film',
            type: 'movie'
        }
    ];

    const result = matchCatalog(catalog, agEntries);
    assert.equal(result.catalogStats.trueCount, 1);
    assert.equal(result.catalogStats.falseCount, 1);

    const hit = result.annotations.find((r) => r.id === 'tmdb:movie:201');
    assert.equal(hit.ita, true, 'Il candidato 1995 deve essere true');

    const notHit = result.annotations.find((r) => r.id === 'tmdb:movie:202');
    assert.equal(notHit.ita, false, 'Il candidato 2015 non toccato deve essere false');
});

test('match.js - Percorso 3: Zona->Tipo disambigua omonimi (film vs serie) -> true', () => {
    const catalog = [
        {
            id: 'tmdb:movie:301',
            type: 'movie',
            title: 'Omonimo Per Tipo',
            year: 2010,
            key: normBase('Omonimo Per Tipo'),
            toks: extractTokens(normBase('Omonimo Per Tipo'))
        },
        {
            id: 'tmdb:tv:302',
            type: 'series',
            title: 'Omonimo Per Tipo',
            year: 2010,
            key: normBase('Omonimo Per Tipo'),
            toks: extractTokens(normBase('Omonimo Per Tipo'))
        }
    ];

    // AG da zona Cinema (film) senza anno
    const agEntries = [
        {
            href: 'film1/omonimotipo.htm',
            rawTitle: 'Omonimo Per Tipo',
            cleanTitle: 'Omonimo Per Tipo',
            key: normBase('Omonimo Per Tipo'),
            year: null,
            zone: 'film',
            type: 'movie'
        }
    ];

    const result = matchCatalog(catalog, agEntries);
    const movieHit = result.annotations.find((r) => r.id === 'tmdb:movie:301');
    assert.equal(movieHit.ita, true, 'La zona film deve risolvere il movie');

    const tvHit = result.annotations.find((r) => r.id === 'tmdb:tv:302');
    assert.equal(tvHit.ita, false, 'La serie tv non toccata deve rimanere false');
});

test('match.js - Percorso 4: Fuzzy stretto per contenimento di token', () => {
    // 007 - Thunderball, operazione tuono ↔ Agente 007 - Thunderball - Operazione tuono
    const catalog = [
        {
            id: 'tmdb:movie:007',
            type: 'movie',
            title: 'Agente 007 - Thunderball - Operazione tuono',
            year: 1965,
            key: normBase('Agente 007 - Thunderball - Operazione tuono'),
            toks: extractTokens(normBase('Agente 007 - Thunderball - Operazione tuono'))
        }
    ];

    const agEntries = [
        {
            href: 'film1/thunderball.htm',
            rawTitle: '007 - Thunderball, operazione tuono',
            cleanTitle: '007 - Thunderball, operazione tuono',
            key: normBase('007 - Thunderball, operazione tuono'),
            year: null,
            zone: 'film',
            type: 'movie'
        }
    ];

    const result = matchCatalog(catalog, agEntries);
    assert.equal(result.catalogStats.trueCount, 1);
    const hit = result.annotations[0];
    assert.equal(hit.id, 'tmdb:movie:007');
    assert.equal(hit.ita, true);
});

test('match.js - Fuzzy stretto rifiuta token singolo comune (df > 3) come rumore: 6 Teen vs Teen Wolf', () => {
    // Popoliamo un catalogo con più titoli aventi "teen" per simulare df > 3
    const catalog = [
        { id: '1', type: 'movie', title: 'Teen Wolf', key: normBase('Teen Wolf'), toks: extractTokens(normBase('Teen Wolf')) },
        { id: '2', type: 'movie', title: 'Teen Titans', key: normBase('Teen Titans'), toks: extractTokens(normBase('Teen Titans')) },
        { id: '3', type: 'movie', title: 'Teen Beach', key: normBase('Teen Beach'), toks: extractTokens(normBase('Teen Beach')) },
        { id: '4', type: 'movie', title: 'Teen Spirit', key: normBase('Teen Spirit'), toks: extractTokens(normBase('Teen Spirit')) }
    ];

    // Voce AG: "6 Teen" -> token ['teen'] (poiché 6 ha lunghezza 1 o viene rimosso)
    const agEntries = [
        {
            href: 'film1/teen.htm',
            rawTitle: '6 Teen',
            cleanTitle: '6 Teen',
            key: normBase('6 Teen'),
            year: null,
            zone: 'film',
            type: 'movie'
        }
    ];

    const result = matchCatalog(catalog, agEntries);
    // Non deve fare match falso positivo su Teen Wolf!
    const hitWolf = result.annotations.find((r) => r.title === 'Teen Wolf');
    assert.equal(hitWolf.ita, false);
    assert.equal(result.catalogStats.trueCount, 0);
});

test('match.js - Caso indecidibile (omonimia senza anno e stesso tipo) -> null su tutti i candidati', () => {
    const catalog = [
        {
            id: 'tmdb:movie:501',
            type: 'movie',
            title: 'Omonimo Irrisolto',
            year: 1980,
            key: normBase('Omonimo Irrisolto'),
            toks: extractTokens(normBase('Omonimo Irrisolto'))
        },
        {
            id: 'tmdb:movie:502',
            type: 'movie',
            title: 'Omonimo Irrisolto',
            year: 2010,
            key: normBase('Omonimo Irrisolto'),
            toks: extractTokens(normBase('Omonimo Irrisolto'))
        }
    ];

    // AG senza anno: non può decidere quale dei due film sia
    const agEntries = [
        {
            href: 'film1/ambiguo.htm',
            rawTitle: 'Omonimo Irrisolto',
            cleanTitle: 'Omonimo Irrisolto',
            key: normBase('Omonimo Irrisolto'),
            year: null,
            zone: 'film',
            type: 'movie'
        }
    ];

    const result = matchCatalog(catalog, agEntries);
    assert.equal(result.catalogStats.trueCount, 0);
    assert.equal(result.catalogStats.nullCount, 2, 'Tutti i candidati devono ricevere null');
    assert.equal(result.catalogStats.falseCount, 0);

    assert.equal(result.annotations[0].ita, null);
    assert.equal(result.annotations[1].ita, null);
});

test('match.js - Titoli catalogo non toccati da AG restano false', () => {
    const catalog = [
        {
            id: 'tmdb:movie:999',
            type: 'movie',
            title: 'Titolo Totalmente Sconosciuto Ad AG',
            year: 2023,
            key: normBase('Titolo Totalmente Sconosciuto Ad AG'),
            toks: extractTokens(normBase('Titolo Totalmente Sconosciuto Ad AG'))
        }
    ];

    const agEntries = [];
    const result = matchCatalog(catalog, agEntries);
    assert.equal(result.catalogStats.falseCount, 1);
    assert.equal(result.annotations[0].ita, false);
});
