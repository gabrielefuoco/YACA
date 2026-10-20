/**
 * Ticket 14 — il decadimento dentro la porta del pool.
 *
 * La regola del ticket: il decadimento si applica **dopo** la cache delle righe (una lettura per
 * richiesta), non dentro il grafo (che non si tocca) e non dentro la voce di cache (che non si avvelena).
 * Qui si prova l'integrazione: una riga servita, un titolo che scende, nessuno che sparisce, una sola
 * lettura di impressioni per richiesta.
 */

const impressioniLette = [];

jest.mock('../src/profile/impressions', () => {
    const actual = jest.requireActual('../src/profile/impressions');
    return {
        ...actual,
        leggiImpressioniRecenti: jest.fn(async (args) => {
            impressioniLette.push(args);
            return new Map([
                ['yaca_mondi_movies', new Map([['11', 6], ['12', 1]])]
            ]);
        })
    };
});

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

function titolo(tmdbId, punteggio) {
    return { tmdbId, medium: 'movie', punteggio };
}

describe('Ticket 14: le impressioni nel pool', () => {
    beforeEach(() => {
        impressioniLette.length = 0;
        jest.clearAllMocks();
        graphClient.resetHealthCache();
        jest.spyOn(cache, 'leggi').mockResolvedValue({ value: null, status: 'miss' });
        jest.spyOn(cache, 'scrivi').mockResolvedValue(undefined);
        jest.spyOn(library, 'semiDi').mockResolvedValue({
            seeds: new Map([[603, 5]]),
            counts: { loved: 1, liked: 0, watched: 0, library: 0 }
        });
        jest.spyOn(graphClient, 'getGraphHealthVersions').mockResolvedValue({ artefatto: 'a', ricetta: 'r' });
        jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
            contratto: 1,
            versioni: { artefatto: 'a', ricetta: 'r' },
            semi: { n: 1, da_catalogo: false },
            liste: [
                { ruolo: 'il_tuo_mondo', mondo: 1, titoli: [titolo(11, 1.0), titolo(12, 0.9), titolo(13, 0.5)] }
            ],
            motivi: []
        });
    });

    test('il titolo con 6 giorni in home scende, la riga resta intera, una sola lettura', async () => {
        const pool = await getHeroPool({ userId: 'u1', context: 'p1', mediaType: 'movie', userConfig: {} });
        const riga = pool['yaca_mondi_movies'];

        // 11 scende (0.85^6 = 0.377) sotto il 13 (0.5) e il 12 (0.9); 12 e' a 1 giorno: non si tocca.
        expect(riga.map((i) => i.tmdbId)).toEqual([12, 13, 11]);
        expect(riga.find((i) => i.tmdbId === 11).punteggio).toBeCloseTo(Math.pow(0.85, 6), 6);
        // niente cancellato
        expect(new Set(riga.map((i) => i.tmdbId))).toEqual(new Set([11, 12, 13]));
        // una lettura per richiesta, con lo user e il profilo giusti e i cataloghi come filtro
        expect(impressioniLette).toHaveLength(1);
        expect(impressioniLette[0].userId).toBe('u1');
        expect(impressioniLette[0].profileId).toBe('p1');
        expect(impressioniLette[0].catalogIds).toContain('yaca_mondi_movies');
    });

    test('un titolo che l utente conosce (seme) non scende', async () => {
        jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
            contratto: 1,
            versioni: { artefatto: 'a', ricetta: 'r' },
            semi: { n: 1, da_catalogo: false },
            liste: [
                { ruolo: 'il_tuo_mondo', mondo: 1, titoli: [titolo(11, 1.0), titolo(13, 0.5)] }
            ],
            motivi: []
        });
        // rendo il titolo 11 un SEME: e' gia' visto, quindi non decade
        jest.spyOn(library, 'semiDi').mockResolvedValue({
            seeds: new Map([[11, 5]]),
            counts: { loved: 1, liked: 0, watched: 0, library: 0 }
        });
        const pool = await getHeroPool({ userId: 'u1', context: 'p1', mediaType: 'movie', userConfig: {} });
        expect(pool['yaca_mondi_movies'].map((i) => i.tmdbId)).toEqual([11, 13]);
        expect(pool['yaca_mondi_movies'][0].punteggio).toBe(1.0);
    });

    test('una voce di cache con seedIds: il seme non scende anche leggendo dal disco', async () => {
        // Il bump a v17 esiste per questo: i seedIds viaggiano DENTRO la voce di cache e devono
        // sopravvivere al giro JSON, altrimenti i titoli visti tornano a decadere.
        const { HERO_CACHE_SCHEMA_VERSION, HERO_PRIORITY, getHeroCatalogId } = require('../src/pool');
        // Una voce di cache valida le ha TUTTE e dieci le righe (il validator rifiuta quelle incomplete):
        // qui le altre restano vuote, com'e' giusto in un fixture.
        const catalogs = {};
        for (const slug of HERO_PRIORITY) catalogs[getHeroCatalogId(slug, 'movie')] = [];
        catalogs['yaca_mondi_movies'] = [
            { id: 'tmdb:11', tmdbId: 11, type: 'movie', media_type: 'movie', punteggio: 1.0 },
            { id: 'tmdb:13', tmdbId: 13, type: 'movie', media_type: 'movie', punteggio: 0.5 }
        ];
        cache.leggi.mockResolvedValue({
            value: {
                schemaVersion: HERO_CACHE_SCHEMA_VERSION,
                mediaType: 'movie',
                seedIds: ['11'],
                catalogs
            },
            status: 'hit'
        });
        const pool = await getHeroPool({ userId: 'u1', context: 'p1', mediaType: 'movie', userConfig: {} });
        expect(pool['yaca_mondi_movies'].map((i) => i.tmdbId)).toEqual([11, 13]);
        expect(pool['yaca_mondi_movies'][0].punteggio).toBe(1.0);
    });
});
