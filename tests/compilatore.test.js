/**
 * Il compilatore intenti → filtri (fetta 4).
 *
 * Contratti difesi:
 *   1. ogni campo dell'intento diventa la chiave giusta della DSL (e nessun'altra);
 *   2. più valori sono OR (`|`), tranne l'anno che è un intervallo;
 *   3. un concetto senza id non diventa un filtro: resta un motivo;
 *   4. `testo` da solo è una modalità (FTS + Tier 2); insieme ad altri filtri è una discovery;
 *   5. `simili` è la modalità `semi`: una query per seme, poi consensus;
 *   6. `eseguiPiano` non solleva mai.
 */

const fs = require('fs');
const path = require('path');

const { compilaIntento, eseguiPiano } = require('../src/ricerca/compilatore');

const DATA_DIR = process.env.TMDB_DUMP_DIR || path.resolve(__dirname, '../.cache/tmdb');
const HA_DUMP = fs.existsSync(path.join(DATA_DIR, 'movies.parquet'))
    && fs.existsSync(path.join(DATA_DIR, 'tv.parquet'));
const haDump = HA_DUMP ? describe : describe.skip;

const KEYWORD = { ship: '3799', 'sea voyage': '4662', christmas: '207317' };
const risolviKeyword = (nome) => KEYWORD[nome] || null;

describe('compilaIntento — la traduzione', () => {
    it('il testo da solo è una modalità a sé', () => {
        const piano = compilaIntento({ testo: 'batman' }, { risolviKeyword });
        expect(piano.modo).toBe('testo');
        expect(piano.filtri).toEqual({ text_search: 'batman' });
    });

    it('testo e filtri insieme sono una discovery', () => {
        const piano = compilaIntento({ testo: 'batman', generi: [28] }, { risolviKeyword });
        expect(piano.modo).toBe('filtri');
        expect(piano.filtri).toEqual({ text_search: 'batman', with_genres: '28' });
    });

    it('più generi sono OR', () => {
        expect(compilaIntento({ generi: [27, 35] }, { risolviKeyword }).filtri.with_genres).toBe('27|35');
    });

    it('i concetti diventano id di keyword, in OR', () => {
        const piano = compilaIntento({ concetti: ['ship', 'christmas'] }, { risolviKeyword });
        expect(piano.filtri.with_keywords).toBe('3799|207317');
        expect(piano.motivi).toEqual([]);
    });

    it('un concetto senza id non diventa un filtro: è un motivo', () => {
        const piano = compilaIntento({ concetti: ['ship', 'parola-inventata'], generi: [27] }, { risolviKeyword });
        expect(piano.filtri.with_keywords).toBe('3799');
        expect(piano.motivi).toContain('concetto_senza_id: parola-inventata');
    });

    it('le persone sono OR su with_cast', () => {
        expect(compilaIntento({ persone: ['6193', '525'] }, { risolviKeyword }).filtri.with_cast).toBe('6193|525');
    });

    it('l\'anno è un intervallo, e cambia colonna per le serie', () => {
        const film = compilaIntento({ anno: [1980, 1989] }, { risolviKeyword }).filtri;
        expect(film['primary_release_date.gte']).toBe('1980-01-01');
        expect(film['primary_release_date.lte']).toBe('1989-12-31');

        const serie = compilaIntento({ anno: [1980, 1989] }, { type: 'series', risolviKeyword }).filtri;
        expect(serie['first_air_date.gte']).toBe('1980-01-01');
        expect(serie['first_air_date.lte']).toBe('1989-12-31');
    });

    it('il provider porta con sé la regione del catalogo', () => {
        const filtri = compilaIntento({ provider: [8, 119] }, { risolviKeyword }).filtri;
        expect(filtri.with_watch_providers).toBe('8|119');
        expect(filtri.watch_region).toBe('IT');
    });

    it('lingua, paese e anime hanno ognuno la sua chiave', () => {
        const filtri = compilaIntento({ lingua: 'ja', paese: 'JP', anime: true }, { risolviKeyword }).filtri;
        expect(filtri.with_original_language).toBe('ja');
        expect(filtri.with_origin_country).toBe('JP');
        expect(filtri.isAnime).toBe(true);
    });

    it('regista diventa with_crew sui film e with_created_by sulle serie', () => {
        expect(compilaIntento({ crew: ['525'] }, { risolviKeyword }).filtri.with_crew).toBe('525');
        const serie = compilaIntento({ crew: ['525'] }, { type: 'series', risolviKeyword }).filtri;
        expect(serie.with_created_by).toBe('525');
        expect(serie.with_crew).toBeUndefined();
    });

    it('voto, durata, eta, esclusi e ordinamento hanno le chiavi della DSL', () => {
        const filtri = compilaIntento({
            voto: [7, 9], durata: [90, 150], eta: 'PG-13',
            senzaGeneri: [27, 53], senzaConcetti: [], ordina: 'vote_average.desc'
        }, { risolviKeyword }).filtri;
        expect(filtri).toEqual({
            'vote_average.gte': 7, 'vote_average.lte': 9,
            'with_runtime.gte': 90, 'with_runtime.lte': 150,
            'certification.lte': 'PG-13',
            without_genres: '27,53',
            sort_by: 'vote_average.desc'
        });
    });

    it('gli esclusi diventano without_* con gli id', () => {
        const filtri = compilaIntento({ senzaGeneri: [], senzaConcetti: ['ship'] }, { risolviKeyword }).filtri;
        expect(filtri.without_keywords).toBe('3799');
    });

    it('ordinare per data sceglie la colonna del tipo', () => {
        const serie = compilaIntento({ ordina: 'primary_release_date.desc' }, { type: 'series', risolviKeyword }).filtri;
        expect(serie.sort_by).toBe('first_air_date.desc');
    });

    it('simili è la modalità semi, e gli altri filtri restano dentro', () => {
        const piano = compilaIntento({ simile_a: [157336], anno: [2010, 2015] }, { risolviKeyword });
        expect(piano.modo).toBe('semi');
        expect(piano.semi).toEqual([157336]);
        expect(piano.filtri['primary_release_date.gte']).toBe('2010-01-01');
    });

    it('un intento vuoto si dichiara', () => {
        const piano = compilaIntento({}, { risolviKeyword });
        expect(piano.modo).toBe('nessuno');
        expect(piano.motivi).toContain('nessuna_condizione');
    });

    it('niente intento, niente piano', () => {
        expect(compilaIntento(null, { risolviKeyword }).modo).toBe('nessuno');
        expect(compilaIntento(undefined, { risolviKeyword }).motivi).toContain('intento_assente');
    });

    it('nessun filtro implicito: il compilatore non aggiunge vote_count né lingue', () => {
        const filtri = compilaIntento({ generi: [27] }, { risolviKeyword }).filtri;
        expect(filtri['vote_count.gte']).toBeUndefined();
        expect(filtri.with_original_language).toBeUndefined();
        expect(Object.keys(filtri)).toEqual(['with_genres']);
    });
});

describe('eseguiPiano — l\'esecuzione', () => {
    const chiamate = [];
    const cercaFinto = (risposte) => async (filtri, type, skip, limit) => {
        chiamate.push({ filtri, type, skip, limit });
        return risposte(filtri) || [];
    };

    beforeEach(() => { chiamate.length = 0; });

    const item = (id, popularity = 0) => ({ id: `tmdb:${id}`, _tmdbId: id, popularity });

    it('una discovery è una chiamata sola, con i filtri compilati', async () => {
        const cerca = cercaFinto(() => [item(1), item(2)]);
        const piano = compilaIntento({ generi: [27], anno: [1980, 1989] }, { risolviKeyword });

        const { items } = await eseguiPiano(piano, { type: 'movie', skip: 20, cap: 20, cerca });

        expect(items.map(i => i._tmdbId)).toEqual([1, 2]);
        expect(chiamate).toEqual([{
            filtri: { with_genres: '27', 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31' },
            type: 'movie',
            skip: 20,
            limit: 20
        }]);
    });

    it('un seme è una chiamata con similar_to quando il grafo non risponde', async () => {
        const cerca = cercaFinto(() => [item(10), item(11)]);
        const piano = compilaIntento({ simile_a: [157336] }, { risolviKeyword });
        const giu = async () => { throw new Error('servizio giù'); };

        const { items, motivi } = await eseguiPiano(piano, { cerca, vicini: giu });

        expect(items.map(i => i._tmdbId)).toEqual([10, 11]);
        expect(chiamate[0].filtri.similar_to).toBe(157336);
        expect(motivi).toContain('simile:colonna');
    });

    it('il grafo risponde: i vicini si idratano nell\'ordine del grafo, non in quello della query', async () => {
        // Il grafo restituisce id e punteggio, in ordine di diffusione.
        const raccomanda = jest.fn(async () => ({
            contratto: 2,
            vicini: [{ tmdbId: 300, medium: 'movie', punteggio: 9 }, { tmdbId: 100, medium: 'movie', punteggio: 7 }]
        }));
        // L'indice restituisce i meta in un ordine qualsiasi (è una IN list).
        const cerca = jest.fn(async () => [item(100), item(300)]);

        const piano = compilaIntento({ simile_a: [1, 2] }, { risolviKeyword });
        const { items, motivi } = await eseguiPiano(piano, { cerca, vicini: raccomanda });

        expect(raccomanda).toHaveBeenCalledTimes(1);
        expect(raccomanda.mock.calls[0][0].semi).toEqual([{ tmdbId: 1, medium: 'movie' }, { tmdbId: 2, medium: 'movie' }]);
        expect(items.map(i => i._tmdbId)).toEqual([300, 100]);   // ordine del grafo
        expect(motivi).toContain('simile:grafo');
    });

    it('il grafo risponde ma nessun vicino è nel nostro indice: si ripiega sulla colonna', async () => {
        const raccomanda = jest.fn(async () => ({
            vicini: [{ tmdbId: 999, medium: 'movie', punteggio: 9 }]
        }));
        const cerca = cercaFinto(() => [item(10)]);
        const piano = compilaIntento({ simile_a: [1] }, { risolviKeyword });

        const { items, motivi } = await eseguiPiano(piano, { cerca, vicini: raccomanda });

        expect(items.map(i => i._tmdbId)).toEqual([10]);
        expect(motivi).toContain('simile:colonna');
    });

    it('i vicini del grafo rispettano gli altri filtri dell\'intento', async () => {
        const raccomanda = jest.fn(async () => ({
            vicini: [{ tmdbId: 1, medium: 'movie', punteggio: 9 }]
        }));
        const cerca = jest.fn(async () => []);
        const piano = compilaIntento({ simile_a: [9], anno: [2010, 2015] }, { risolviKeyword });

        await eseguiPiano(piano, { cerca, vicini: raccomanda });

        expect(cerca.mock.calls[0][0]).toEqual(expect.objectContaining({
            'primary_release_date.gte': '2010-01-01',
            tmdbIds: [1]
        }));
    });

    it('due semi senza grafo: una chiamata ciascuno, e chi compare in entrambi sale', async () => {
        const cerca = cercaFinto((filtri) => (filtri.similar_to === 1
            ? [item(100, 5), item(200, 50)]
            : [item(200, 50), item(300, 1)]));
        const piano = compilaIntento({ simile_a: [1, 2] }, { risolviKeyword });
        const giu = async () => { throw new Error('servizio giù'); };

        const { items } = await eseguiPiano(piano, { cerca, vicini: giu });

        expect(chiamate).toHaveLength(2);
        expect(items[0]._tmdbId).toBe(200);   // presente in entrambe le liste
        expect(items.map(i => i._tmdbId).sort()).toEqual([100, 200, 300]);
    });

    it('nessuna condizione: nessuna chiamata', async () => {
        const cerca = cercaFinto(() => [item(1)]);
        const { items } = await eseguiPiano({ modo: 'nessuno', filtri: {}, semi: [] }, { cerca });
        expect(items).toEqual([]);
        expect(chiamate).toEqual([]);
    });

    it('un indice che esplode non fa esplodere la ricerca', async () => {
        const esplode = async () => { throw new Error('DuckDB giù'); };
        const piano = compilaIntento({ generi: [27] }, { risolviKeyword });
        await expect(eseguiPiano(piano, { cerca: esplode })).resolves.toEqual({ items: [], motivi: ['errore_indice'] });
    });
});

haDump('compilatore — sul dump vero', () => {
    beforeAll(async () => {
        const indice = require('../src/indice');
        await indice.init();
    }, 120000);

    afterAll(() => {
        const { chiudiPersone } = require('../src/ricerca/risolutori');
        chiudiPersone();
    });

    /** Il giro completo: frase → parser → risolutori → compilatore → indice. */
    async function cerca(query, { type = 'movie' } = {}) {
        const { pianifica } = require('../src/ricerca/pianificatore');
        const { creaRisolutori } = require('../src/ricerca/risolutori');
        const esito = await pianifica(query, { risolutori: creaRisolutori({ type }) });
        const piano = compilaIntento(esito.intenti[0], { type });
        const { items } = await eseguiPiano(piano, { type, cap: 20 });
        return { items, motivi: [...esito.motivi, ...piano.motivi], piano };
    }

    it('«tema horror anno 1980-1989» dà film horror degli anni 80', async () => {
        const { items } = await cerca('tema horror anno 1980-1989');
        expect(items.length).toBeGreaterThan(0);
        for (const film of items) {
            expect(String(film.releaseInfo)).toMatch(/^198\d/);
        }
    }, 60000);

    it('«cast leonardo dicaprio» dà film in cui compare', async () => {
        const { items } = await cerca('cast leonardo dicaprio');
        expect(items.length).toBeGreaterThan(0);
        for (const film of items) {
            // il meta leggero porta i crediti dentro rawTMDB.credits.cast
            const ids = ((film.rawTMDB && film.rawTMDB.credits && film.rawTMDB.credits.cast) || []).map(persona => String(persona.id));
            expect(ids).toContain('6193');
        }
    }, 60000);

    it('«simili interstellar» dà i vicini, non il film stesso', async () => {
        const { items } = await cerca('simili interstellar');
        expect(items.length).toBeGreaterThan(0);
        expect(items.map(film => film._tmdbId)).not.toContain(157336);
    }, 60000);

    it('«su netflix» filtra per provider', async () => {
        const { items, piano } = await cerca('su netflix');
        expect(piano.filtri.with_watch_providers).toBeDefined();
        expect(items.length).toBeGreaterThan(0);
    }, 60000);

    it('«anime tema isekai» chiede la partizione anime', async () => {
        const { piano } = await cerca('anime tema isekai', { type: 'series' });
        expect(piano.filtri.isAnime).toBe(true);
        expect(piano.filtri.with_keywords).toBeDefined();
    }, 60000);
});

/**
 * La riparazione del testo che non trova.
 *
 * La ricerca testuale cerca le parole **come sono scritte**: «spiderman» non trova *Spider-Man*,
 * «batmn» non trova *Batman*, «la citta incantata» non trova *La città incantata*. Su 181
 * richieste reali, 11 pagine vuote su 12 erano titoli scritti in un modo normalissimo.
 *
 * La regola: se il testo non trova niente (e siamo in prima pagina), si chiede il titolo
 * all'indice dei semi — lo stesso che risolve `simili` — e si ripesca per id. Quando la ricerca
 * normale trova, questo ramo non esiste. L'indice dei semi è finto: qui si prova il cablaggio.
 */
jest.mock('../src/ricerca/semiTitoli', () => ({
    risolviSeme: jest.fn(async () => [268]),
    risolviSemeDettagliato: jest.fn(async () => ({ id: 268, titolo: 'batman', voti: 100 }))
}));

describe('eseguiPiano — il testo che non trova viene riparato', () => {
    const { eseguiPiano } = require('../src/ricerca/compilatore');

    it('un refuso ricade sull\'id risolto, e il motivo lo dice', async () => {
        const chiamate = [];
        const cerca = jest.fn(async (filtri) => {
            chiamate.push(filtri);
            if (filtri && filtri.ids) return [{ id: 'tmdb:268', name: 'Batman' }];
            return [];
        });

        const esito = await eseguiPiano(
            { modo: 'testo', filtri: { text_search: 'batmn' } },
            { type: 'movie', cerca }
        );

        expect(esito.items).toHaveLength(1);
        expect(esito.items[0].name).toBe('Batman');
        expect(esito.motivi[0]).toBe('testo_riparato: batmn → batman');
        expect(cerca).toHaveBeenCalledTimes(2);
        expect(chiamate[1]).toEqual({ ids: [268] });
    });

    it('quando il testo trova, non si ripara niente', async () => {
        const cerca = jest.fn(async () => [{ id: 'tmdb:1', name: 'Batman' }]);
        const esito = await eseguiPiano(
            { modo: 'testo', filtri: { text_search: 'batman' } },
            { type: 'movie', cerca }
        );
        expect(cerca).toHaveBeenCalledTimes(1);
        expect(esito.motivi).toEqual([]);
    });

    it('in seconda pagina non si ripara (la pagina vuota è legittima)', async () => {
        const cerca = jest.fn(async () => []);
        const esito = await eseguiPiano(
            { modo: 'testo', filtri: { text_search: 'batmn' } },
            { type: 'movie', skip: 20, cerca }
        );
        expect(cerca).toHaveBeenCalledTimes(1);
        expect(esito.items).toEqual([]);
    });
});
