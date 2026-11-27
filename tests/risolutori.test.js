/**
 * I risolutori veri (fetta 3): lessico + grafo + people.db + FTS + provider.
 *
 * Tre strati di test, perché tre strati di dipendenza:
 *   - **puro**: fuzzy, scelta del titolo, scelta del provider — nessun file, nessun database;
 *   - **grafo**: l'espansione, che legge `hierarchical_graph.json` (sempre presente nel repo);
 *   - **integration**: sul dump vero, saltata se i parquet non ci sono.
 */

const fs = require('fs');
const path = require('path');

const {
    sogliaPer,
    migliorPerDistanza,
    scegliTitolo,
    numeroId,
    scegliProvider,
    espandiConcetto,
    ESPANSIONE_MAX
} = require('../src/ricerca/risolutori');

const DATA_DIR = process.env.TMDB_DUMP_DIR || path.resolve(__dirname, '../.cache/tmdb');
const HA_DUMP = fs.existsSync(path.join(DATA_DIR, 'movies.parquet'))
    && fs.existsSync(path.join(DATA_DIR, 'tv.parquet'));
const HA_PERSONE = fs.existsSync(path.join(DATA_DIR, 'people.db'));
const haDump = HA_DUMP ? describe : describe.skip;
const haPersone = HA_PERSONE ? describe : describe.skip;

describe('risolutori — le parti pure', () => {
    it('la soglia di refuso dipende dalla lunghezza: una lettera sotto le 5, due sopra', () => {
        expect(sogliaPer('nave')).toBe(1);
        expect(sogliaPer('natalizi')).toBe(2);
    });

    it('sceglie il candidato più vicino e ignora chi è troppo lontano', () => {
        const candidati = ['navi', 'natale', 'zombie'];
        expect(migliorPerDistanza('navvi', candidati)).toBe('navi');
        expect(migliorPerDistanza('natalee', candidati)).toBe('natale');
        expect(migliorPerDistanza('astronauta', candidati)).toBeNull();
    });

    describe('scegliTitolo', () => {
        const risultato = (id, nome, originale) => ({
            id: `tmdb:${id}`,
            _tmdbId: id,
            name: nome,
            rawTMDB: { title: nome, original_title: originale || nome }
        });

        it('prende il match esatto, anche se non è il primo', () => {
            const risultati = [risultato(11, 'Batman Begins'), risultato(272, 'Batman')];
            expect(scegliTitolo('batman', risultati)).toBe(272);
        });

        it('un prefisso unico e lungo basta («inter» → Interstellar)', () => {
            expect(scegliTitolo('interstellar', [risultato(157336, 'Interstellar')])).toBe(157336);
            expect(scegliTitolo('inter', [risultato(157336, 'Interstellar')])).toBe(157336);
        });

        it('un prefisso ambiguo non sceglie: un seme sbagliato produce vicini sbagliati', () => {
            const risultati = [risultato(11, 'Batman Begins'), risultato(272, 'Batman')];
            expect(scegliTitolo('batman', risultati)).toBe(272);   // esatto, vince lui
            const senzaEsatto = [risultato(11, 'Batman Begins'), risultato(364, 'Batman Returns')];
            expect(scegliTitolo('batman', senzaEsatto)).toBeNull();
        });

        it('un prefisso cortissimo non è un titolo', () => {
            expect(scegliTitolo('bat', [risultato(11, 'Batman Begins')])).toBeNull();
        });

        it('i titoli originali contano quanto quelli localizzati', () => {
            expect(scegliTitolo('spirited away', [risultato(129, 'La città incantata', 'Spirited Away')])).toBe(129);
        });

        it('lista vuota o input vuoto: niente', () => {
            expect(scegliTitolo('batman', [])).toBeNull();
            expect(scegliTitolo('', [risultato(1, 'Batman')])).toBeNull();
        });

        it('estrae l\'id numerico da tutte le forme', () => {
            expect(numeroId({ id: 'tmdb:272' })).toBe(272);
            expect(numeroId({ _tmdbId: '272' })).toBe(272);
            expect(numeroId({ id: 'non-un-id' })).toBeNull();
            expect(numeroId(null)).toBeNull();
        });
    });

    describe('scegliProvider', () => {
        const elenco = [
            { id: 8, nome: 'Netflix', normalizzato: 'netflix' },
            { id: 119, nome: 'Amazon Prime Video', normalizzato: 'amazon prime video' },
            { id: 2100, nome: 'Amazon Prime Video with Ads', normalizzato: 'amazon prime video with ads' },
            { id: 337, nome: 'Disney Plus', normalizzato: 'disney plus' },
            { id: 39, nome: 'Now TV', normalizzato: 'now tv' }
        ];

        it('nome identico vince', () => {
            expect(scegliProvider('netflix', elenco)).toEqual([8]);
        });

        it('«prime» trova Amazon anche se il nome non inizia con prime', () => {
            expect(scegliProvider('prime', elenco)).toEqual([119, 2100]);
        });

        it('un nome che inizia col testo batte uno che lo contiene', () => {
            expect(scegliProvider('now', elenco)).toEqual([39]);
            expect(scegliProvider('disney', elenco)).toEqual([337]);
        });

        it('niente corrispondenze: null', () => {
            expect(scegliProvider('piattaforma-inventata', elenco)).toBeNull();
        });
    });
});

describe('risolutori — espansione dal grafo', () => {
    it('«ship» porta le sorelle del suo micro-cluster, con un tetto', () => {
        const espansione = espandiConcetto('ship');
        expect(espansione[0]).toBe('ship');
        expect(espansione.length).toBeGreaterThan(1);
        expect(espansione.length).toBeLessThanOrEqual(ESPANSIONE_MAX + 1);
        expect(espansione).toContain('sea voyage');
    });

    it('una keyword senza cluster resta da sola', () => {
        expect(espandiConcetto('parola che non esiste nel grafo')).toEqual(['parola che non esiste nel grafo']);
    });

    it('vuoto resta vuoto', () => {
        expect(espandiConcetto('')).toEqual([]);
    });
});

haDump('risolutori — sul dump vero', () => {
    beforeAll(async () => {
        const indice = require('../src/indice');
        await indice.init();
    }, 120000);

    afterAll(() => {
        const { chiudiPersone } = require('../src/ricerca/risolutori');
        chiudiPersone();
    });

    it('«navi» diventa la keyword ship, espansa col grafo', () => {
        const { risolviConcetto } = require('../src/ricerca/risolutori');
        const concetti = risolviConcetto('navi');
        expect(concetti[0]).toBe('ship');
        expect(concetti).toContain('sea voyage');
    });

    it('un nome inglese già canonico passa diretto', () => {
        const { risolviConcetto } = require('../src/ricerca/risolutori');
        expect(risolviConcetto('time travel')[0]).toBe('time travel');
        expect(risolviConcetto('zombie')[0]).toBe('zombie');
    });

    it('il lessico italiano vince sul nome di keyword che coincide per caso', () => {
        // TMDB ha una keyword che si chiama letteralmente «natale» (id 327871): col nome esatto
        // per primo, «tema natale» filtrava quella e restituiva zero risultati.
        const { risolviConcetto } = require('../src/ricerca/risolutori');
        expect(risolviConcetto('natale')[0]).toBe('christmas');
    });

    it('un refuso italiano trova la voce giusta', () => {
        const { risolviConcetto } = require('../src/ricerca/risolutori');
        expect(risolviConcetto('navvi')[0]).toBe('ship');
        expect(risolviConcetto('natalizzi')[0]).toBe('christmas');
    });

    it('un refuso inglese trova la keyword giusta', () => {
        const { risolviConcetto } = require('../src/ricerca/risolutori');
        expect(risolviConcetto('zombi')[0]).toBe('zombie');
    });

    it('una parola inventata non diventa un filtro', () => {
        const { risolviConcetto } = require('../src/ricerca/risolutori');
        expect(risolviConcetto('parola-inventata-xyz')).toBeNull();
    });

    it('il provider viene dai parquet, non da una tabella scritta a mano', () => {
        const { risolviProvider, azzeraProvider } = require('../src/ricerca/risolutori');
        azzeraProvider();
        return risolviProvider('netflix').then(ids => {
            expect(ids).toContain(8);
        });
    });

    it('il titolo si risolve sull\'indice locale', async () => {
        const { risolviTitolo } = require('../src/ricerca/risolutori');
        await expect(risolviTitolo('interstellar', { type: 'movie' })).resolves.toEqual([157336]);
    }, 60000);

    it('un titolo inesistente non produce un seme', async () => {
        const { risolviTitolo } = require('../src/ricerca/risolutori');
        await expect(risolviTitolo('titolo che non esiste xyzzy', { type: 'movie' })).resolves.toBeNull();
    }, 60000);
});

haPersone('risolutori — persone da people.db', () => {
    afterAll(() => {
        const { chiudiPersone } = require('../src/ricerca/risolutori');
        chiudiPersone();
    });

    it('un nome completo trova una persona sola', () => {
        const { risolviPersona } = require('../src/ricerca/risolutori');
        expect(risolviPersona('leonardo dicaprio')).toEqual(['6193']);
    });

    it('un cognome da solo restituisce UNA persona: la più popolare', () => {
        // Due candidati in OR mettevano nella pagina SpongeBob (Nolan North, doppiatore):
        // l'ordinamento per popolarità sceglie Christopher Nolan, e per l'omonimo si scrive il nome.
        const { risolviPersona } = require('../src/ricerca/risolutori');
        expect(risolviPersona('nolan')).toEqual(['525']);
    });

    it('una persona inesistente non si inventa', () => {
        const { risolviPersona } = require('../src/ricerca/risolutori');
        expect(risolviPersona('persona che non esiste xyzzy')).toBeNull();
    });
});

haDump('risolutori — il parser con i risolutori veri', () => {
    beforeAll(async () => {
        const indice = require('../src/indice');
        await indice.init();
    }, 120000);

    afterAll(() => {
        const { chiudiPersone } = require('../src/ricerca/risolutori');
        chiudiPersone();
    });

    it('la frase della spec produce un intento completo', async () => {
        const { pianifica } = require('../src/ricerca/pianificatore');
        const { creaRisolutori } = require('../src/ricerca/risolutori');

        const { intenti, motivi } = await pianifica(
            'tema horror, navi anno 1980-1989',
            { risolutori: creaRisolutori({ type: 'movie' }) }
        );

        expect(motivi).toEqual([]);
        expect(intenti[0].generi).toEqual([27]);
        expect(intenti[0].anno).toEqual([1980, 1989]);
        expect(intenti[0].concetti[0]).toBe('ship');
    }, 60000);

    it('attore + genere insieme, come chiesto', async () => {
        const { pianifica } = require('../src/ricerca/pianificatore');
        const { creaRisolutori } = require('../src/ricerca/risolutori');

        const { intenti } = await pianifica(
            'cast leonardo dicaprio tema horror',
            { risolutori: creaRisolutori({ type: 'movie' }) }
        );

        expect(intenti[0].persone).toEqual(['6193']);
        expect(intenti[0].generi).toEqual([27]);
    }, 60000);

    it('due concetti nella stessa intenzione: natale e romanticismo', async () => {
        const { pianifica } = require('../src/ricerca/pianificatore');
        const { creaRisolutori } = require('../src/ricerca/risolutori');

        const { intenti } = await pianifica(
            'tema natalizi, romantici',
            { risolutori: creaRisolutori({ type: 'movie' }) }
        );

        expect(intenti[0].generi).toContain(10749); // Romantico è un genere TMDB
        expect(intenti[0].concetti[0]).toBe('christmas');
    }, 60000);
});
