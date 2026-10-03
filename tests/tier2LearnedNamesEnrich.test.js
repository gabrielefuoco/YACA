/**
 * L'arricchimento dei titoli del Tier 2 **impara** il nome italiano che ha appena scaricato.
 *
 * Il test piu' importante di questo file e' l'ultimo blocco: se l'archivio dei nomi appresi
 * e' rotto o assente, l'arricchimento deve **finire lo stesso** e la risposta di ricerca deve
 * essere identica. Il giro completo con l'archivio vero sta in `learnedNames.test.js`.
 */

/** L'archivio e' finto: qui si conta quanto e' stato scritto, non si tocca il disco. */
const mockLearnNames = jest.fn(async () => 1);
jest.mock('../src/db/learnedNames', () => ({
    learnNames: (...args) => mockLearnNames(...args),
    searchLearnedNames: jest.fn(async () => [])
}));

const API_KEY = 'chiave-di-prova';

/** Un titolo grezzo come lo produce `mapTier2RowToMeta`. */
function tier2Greggio(id, name = 'Spirited Away', type = 'movie') {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type,
        name,
        poster: null,
        description: '',
        releaseInfo: null,
        rawTMDB: { id, title: name, original_title: name, popularity: 10, release_date: null },
        _tier2: true
    };
}

/** Il dettaglio che TMDB restituisce in italiano (la cache `tmdb_details_raw` lo conserva gia'). */
function dettaglioIt(id, { titolo, originale, anno = '2001' }) {
    return {
        name: titolo,
        original_title: originale,
        poster: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
        description: 'Una descrizione sufficientemente lunga per essere credibile.',
        releaseInfo: anno
    };
}

function caricaArricchimento() {
    let mod;
    jest.isolateModules(() => { mod = require('../src/catalog/tier2Enrich'); });
    return mod;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('l\'arricchimento impara il nome italiano', () => {
    let arricchimento;

    beforeEach(() => { arricchimento = caricaArricchimento(); });

    it('scrive nome italiano, titolo originale e anno del titolo appena arricchito', async () => {
        const grezzo = tier2Greggio(129);
        await arricchimento.enrichTier2Items([grezzo], {
            apiKey: API_KEY,
            loadDetails: async () => dettaglioIt(129, { titolo: 'La città degli spiriti', originale: 'Spirited Away' })
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockLearnNames).toHaveBeenCalledTimes(1);
        expect(mockLearnNames.mock.calls[0][0]).toEqual([{
            tmdbId: 129,
            type: 'movie',
            titleIt: 'La città degli spiriti',
            originalTitle: 'Spirited Away',
            year: '2001'
        }]);
    });

    it('per una serie usa il tipo giusto e prende l\'anno dalla data di prima messa in onda', async () => {
        const serie = tier2Greggio(1396, 'Breaking Bad', 'series');
        await arricchimento.enrichTier2Items([serie], {
            apiKey: API_KEY,
            loadDetails: async () => ({
                ...dettaglioIt(1396, { titolo: 'Breaking Bad', originale: 'Breaking Bad' }),
                first_air_date: '2008-01-20'
            })
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockLearnNames.mock.calls[0][0][0]).toMatchObject({ tmdbId: 1396, type: 'series' });
    });

    it('non impara i titoli locali: sono gia\' ricercabili per nome', async () => {
        const locale = { id: 'tmdb:272', _tmdbId: 272, type: 'movie', name: 'Batman Begins', poster: 'p.jpg' };
        await arricchimento.enrichTier2Items([locale], {
            apiKey: API_KEY,
            loadDetails: async () => dettaglioIt(272, { titolo: 'Batman Begins', originale: 'Batman Begins' })
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockLearnNames).not.toHaveBeenCalled();
    });

    it('non impara un titolo che si e\' arricchito a meta\'', async () => {
        const grezzo = tier2Greggio(7);
        await arricchimento.enrichTier2Items([grezzo], {
            apiKey: API_KEY,
            loadDetails: async () => null
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockLearnNames).not.toHaveBeenCalled();
    });
});

describe('un archivio rotto NON rompe l\'arricchimento', () => {
    it('l\'archivio che solleva in sincrono: l\'arricchimento finisce e la risposta e\' intatta', async () => {
        mockLearnNames.mockImplementationOnce(() => { throw new Error('tabella non raggiungibile'); });
        const arricchimento = caricaArricchimento();

        const grezzo = tier2Greggio(129);
        const risultato = await arricchimento.enrichTier2Items([grezzo], {
            apiKey: API_KEY,
            loadDetails: async () => dettaglioIt(129, { titolo: 'La città degli spiriti', originale: 'Spirited Away' })
        });

        expect(risultato).toHaveLength(1);
        expect(risultato[0]).toMatchObject({ name: 'La città degli spiriti', poster: expect.any(String), releaseInfo: '2001' });
    });

    it('l\'archivio che respinge la promise: nessuna rejection scappa, nessun \'Cannot log\'', async () => {
        mockLearnNames.mockImplementationOnce(async () => { throw new Error('disco pieno'); });
        const arricchimento = caricaArricchimento();

        const risultato = await arricchimento.enrichTier2Items([tier2Greggio(129)], {
            apiKey: API_KEY,
            loadDetails: async () => dettaglioIt(129, { titolo: 'La città degli spiriti', originale: 'Spirited Away' })
        });
        await new Promise(resolve => setTimeout(resolve, 5));

        expect(risultato[0].name).toBe('La città degli spiriti');
    });

    it('l\'archivio che non esiste affatto: silenzio e risposta identica', async () => {
        const arricchimento = caricaArricchimento();
        const grezzi = [tier2Greggio(1), tier2Greggio(2)];
        const risultato = await arricchimento.enrichTier2Items(grezzi, {
            apiKey: API_KEY,
            loadDetails: async (_k, item) => dettaglioIt(item._tmdbId, { titolo: `Titolo ${item._tmdbId}`, originale: `Original ${item._tmdbId}` })
        });

        expect(risultato.map(r => r.name)).toEqual(['Titolo 1', 'Titolo 2']);
    });
});
