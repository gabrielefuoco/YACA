/**
 * Ticket 12 — i filtri a monte, non a valle.
 *
 * IL DIFETTO: la politica anime e il kids-mode si applicavano a valle, nel taglio delle card. Se i primi
 * venti titoli di una riga sono in gran parte non idonei, la riga serve una pagina monca (misurato nella
 * sonda: 0/20 idonei in pagina, con 165 idonei piu' sotto). Qui si prova che il pool manda la politica al
 * motore, che la applica ai candidati — prima del `[:cap]`.
 *
 * La maschera vera vive nel motore Python e la prova `scripts/qa/probe-ticket-12-filtri.py` (20/20).
 */
jest.mock('../src/anime', () => {
    const actual = jest.requireActual('../src/anime');
    return {
        ...actual,
        // 603 e' anime, 314 no: cosi' `only` e `exclude` hanno sempre almeno un seme e il grafo viene
        // chiamato in tutti e due i casi.
        isAnimeContent: jest.fn(({ tmdbId }) => Number(tmdbId) === 603)
    };
});

const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const cache = require('../src/cache');
const { HERO_STRATEGIES } = require('../src/pool');


function configCon() {
    return { activeProfileId: 'p1', profiles: [{ id: 'p1', raw_ui_state: { selectedPresets: [] } }] };
}

async function esegui({ kidsMode = false, typeSelectors = {} } = {}) {
    jest.clearAllMocks();
    jest.spyOn(cache, 'leggi').mockResolvedValue({ value: null, status: 'miss' });
    jest.spyOn(cache, 'scrivi').mockResolvedValue(undefined);
    jest.spyOn(library, 'semiDi').mockResolvedValue({
        seeds: new Map([[603, 5], [314, 4]]),
        counts: { loved: 1, liked: 0, watched: 0, library: 0 }
    });
    jest.spyOn(graphClient, 'getGraphHealthVersions').mockResolvedValue({ artefatto: 'a', ricetta: 'r' });
    jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
        contratto: 1,
        versioni: { artefatto: 'a', ricetta: 'r' },
        semi: { n: 1, da_catalogo: false },
        liste: [],
        motivi: []
    });
    const strategia = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
    await strategia.run(
        { userId: 'u1', context: 'p1', mediaType: 'movie', kidsMode, typeSelectors, userConfig: configCon() },
        { assigned: {}, rawTraktResult: { traktAvailable: false } }
    );
    return graphClient.raccomanda.mock.calls[0][0];
}

describe('Ticket 12: la politica viaggia fino al motore', () => {
    test('anime "only" e kids-mode arrivano come `filtri`', async () => {
        const chiamata = await esegui({ kidsMode: true, typeSelectors: { anime: 'only' } });
        expect(chiamata.opzioni.filtri).toEqual({ anime: 'only', kids: true });
    });

    test('anime "exclude" senza kids', async () => {
        const chiamata = await esegui({ typeSelectors: { anime: 'exclude' } });
        expect(chiamata.opzioni.filtri).toEqual({ anime: 'exclude', kids: false });
    });

    test('profilo neutro: nessun filtro (il motore non deve mascherare niente)', async () => {
        const chiamata = await esegui({ typeSelectors: { anime: 'neutral' } });
        expect(chiamata.opzioni).toBeUndefined();
    });
});
