/**
 * Cablaggio delle modalità nel pool (ticket 01/02), dietro `MODI_ABILITATI`.
 *
 * Prova ciò che il pool manda davvero al grafo: le leve vengono da
 * `derivaLeve(modo)` e i cursori dall'account (`leggiSliders`), non dalle
 * impostazioni del profilo né dai parametri della richiesta.
 */

jest.mock('../src/profile', () => {
    const actual = jest.requireActual('../src/profile');
    return {
        ...actual,
        fetchProfileContext: jest.fn().mockResolvedValue({ profile: {}, user: {} })
    };
});

const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const cache = require('../src/cache');
const { getHeroPool } = require('../src/pool');
const { materializzaModi } = require('../src/profile/modo');

function configConModi({ attivo = 'film', sliders = { tonalita: 0.4, notorieta: -0.3 } } = {}) {
    const profili = materializzaModi({ profiles: [] }).profiles;
    return {
        activeProfileId: `modo_${attivo}`,
        activeModo: attivo,
        config: {
            activeProfileId: `modo_${attivo}`,
            activeModo: attivo,
            sliders,
            cataloghi: { generale: [], film: [], serie: [], anime: [], bambini: [] }
        },
        profiles: profili,
        customCatalogs: []
    };
}

const scaffali = () => graphClient.scaffali.mock.calls[0][1];

beforeEach(() => {
    process.env.MODI_ABILITATI = '1';
    jest.restoreAllMocks();
    jest.spyOn(cache, 'leggi').mockResolvedValue({ value: null, status: 'miss' });
    jest.spyOn(cache, 'scrivi').mockResolvedValue(undefined);
    jest.spyOn(library, 'semiDi').mockResolvedValue({
        seeds: new Map([[603, 5]]),
        counts: { loved: 1, liked: 0, watched: 0, library: 0 }
    });
    jest.spyOn(graphClient, 'getGraphHealthVersions').mockResolvedValue({ artefatto: 'a', ricetta: 'r' });
    jest.spyOn(graphClient, 'getGraphHealthVersionsCached').mockReturnValue({ artefatto: 'a', ricetta: 'r' });
    jest.spyOn(graphClient, 'scaffali').mockResolvedValue({
        scaffali: [{ catalog_id: 'yaca_mondi_movies', nome: 'I tuoi mondi', medium: 'movie', titoli: [{ tmdbId: 11, key: 'movie:11', medium: 'movie', punteggio: 1 }] }]
    });
});

afterAll(() => {
    delete process.env.MODI_ABILITATI;
});

describe('pool con il flag acceso', () => {
    it('le leve della modalità vincono sui parametri della richiesta', async () => {
        await getHeroPool({
            userId: 'u1',
            context: 'modo_film',
            mediaType: 'movie',
            userConfig: configConModi({ attivo: 'film' }),
            // Parametri volutamente contraddittori: la modalità è l'unica fonte.
            kidsMode: true,
            typeSelectors: { anime: 'only' }
        });

        expect(scaffali().opzioni.filtri).toEqual({ anime: 'exclude', kids: false });
        expect(scaffali().opzioni.kids).toBeUndefined();
        expect(scaffali().medium).toBe('movie');
    });

    it('in modalità Bambini il pool manda kids:true al grafo', async () => {
        await getHeroPool({
            userId: 'u1',
            context: 'modo_bambini',
            mediaType: 'movie',
            userConfig: configConModi({ attivo: 'bambini' })
        });

        expect(scaffali().opzioni.filtri).toEqual({ anime: null, kids: true });
        expect(scaffali().opzioni.kids).toBe(true);
    });

    it('i cursori arrivano dall\'account, con le chiavi che il grafo legge oggi', async () => {
        // Cursori diversi dagli altri test: la chiave degli scaffali non è condivisa.
        await getHeroPool({
            userId: 'u1',
            context: 'modo_film',
            mediaType: 'movie',
            userConfig: configConModi({ attivo: 'film', sliders: { tonalita: -0.7, notorieta: 0.6 } })
        });

        expect(scaffali().opzioni.cozy).toBe(-0.7);
        expect(scaffali().opzioni.canone).toBe(0.6);
    });

    it('un valore esplicito (anteprima) resta sovrano sui cursori d\'account', async () => {
        await getHeroPool({
            userId: 'u1',
            context: 'modo_film',
            mediaType: 'movie',
            userConfig: configConModi({ attivo: 'film' }),
            sliders: { cozy: -1, canone: 1 }
        });

        expect(scaffali().opzioni.cozy).toBe(-1);
        expect(scaffali().opzioni.canone).toBe(1);
    });
});

describe('pool con il flag spento', () => {
    it('torna ai selettori del profilo e non aggiunge la modalità alla chiave', async () => {
        delete process.env.MODI_ABILITATI;

        await getHeroPool({
            userId: 'u1',
            context: 'p1',
            mediaType: 'movie',
            userConfig: { profiles: [], config: {}, activeProfileId: 'p1' },
            kidsMode: true,
            typeSelectors: { anime: 'only' }
        });

        expect(scaffali().opzioni.filtri).toEqual({ anime: 'only', kids: true });
        expect(scaffali().opzioni.kids).toBe(true);
    });
});
