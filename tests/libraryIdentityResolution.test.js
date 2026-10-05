/**
 * La risoluzione dell'identità: «da questo id di item, quale TMDB id?». È il
 * passo che il ciclo di conversione faceva inline, con una ricerca esterna e un
 * paio di `startsWith`. Qui è una funzione alimentata dalle sue dipendenze, quindi
 * i test coprono i casi senza rete e senza database: compresa la mappatura
 * Kitsu→TMDB condivisa, che qui è una finestra finta.
 */
const {
    RESOLUTION_REASONS,
    resolveTmdbIdentity
} = require('../src/services/libraryIdentityResolution');

/** Ricerca esterna finta: risponde solo di ciò che il test le ha insegnato. */
function fakeLookup(byImdbId = {}) {
    const calls = [];
    const lookup = async (imdbId) => {
        calls.push(imdbId);
        return byImdbId[imdbId] || null;
    };
    lookup.calls = calls;
    return lookup;
}

describe('resolveTmdbIdentity', () => {
    test('un id imdb è risolto con la ricerca esterna', async () => {
        const lookup = fakeLookup({ tt0111161: { id: 278, title: 'The Shawshank Redemption' } });
        const verdict = await resolveTmdbIdentity('tt0111161', { lookupImdbId: lookup });

        expect(verdict).toEqual({
            resolved: true,
            tmdbId: 278,
            tmdbData: { id: 278, title: 'The Shawshank Redemption' },
            reason: RESOLUTION_REASONS.FOUND_VIA_SEARCH
        });
        expect(lookup.calls).toEqual(['tt0111161']);
    });

    test('un id imdb che la ricerca non conosce non è risolto, ma non è «manca l\'id»', async () => {
        const verdict = await resolveTmdbIdentity('tt0000001', { lookupImdbId: fakeLookup() });

        expect(verdict.resolved).toBe(false);
        expect(verdict.tmdbId).toBeNull();
        expect(verdict.reason).toBe(RESOLUTION_REASONS.NOT_FOUND);
    });

    test('la ricerca esterna che fallisce non è un errore: l\'item resta non risolto', async () => {
        const verdict = await resolveTmdbIdentity('tt0111161', {
            lookupImdbId: async () => { throw new Error('tmdb 500'); }
        });

        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.NOT_FOUND);
    });

    test('un id tmdb: è preso diretto, senza toccare la ricerca esterna', async () => {
        const lookup = fakeLookup();
        const verdict = await resolveTmdbIdentity('tmdb:278', { lookupImdbId: lookup });

        expect(verdict).toEqual({
            resolved: true,
            tmdbId: '278',
            tmdbData: null,
            reason: RESOLUTION_REASONS.FROM_PREFIX
        });
        expect(lookup.calls).toEqual([]);
    });

    test('un id kitsu: senza mappatura fornita non è risolto', async () => {
        const lookup = fakeLookup();
        const verdict = await resolveTmdbIdentity('kitsu:7278', { lookupImdbId: lookup });

        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        expect(lookup.calls).toEqual([]);
    });

    test('un id kitsu: presente nella mappatura prende il suo TMDB id, senza rete', async () => {
        const lookup = fakeLookup();
        const lookupKitsuId = fakeLookup({ 142: 128, 10: 15373 });
        const verdict = await resolveTmdbIdentity('kitsu:142', { lookupImdbId: lookup, lookupKitsuId });

        expect(verdict).toEqual({
            resolved: true,
            tmdbId: 128,
            tmdbData: null,
            reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP
        });
        expect(lookupKitsuId.calls).toEqual(['142']);
        expect(lookup.calls).toEqual([]);
    });

    test('un id kitsu con tipo nella mappatura conserva il tipo (tv o movie)', async () => {
        const lookup = fakeLookup();
        const lookupKitsuId = fakeLookup({
            10: { tmdbId: '30981', type: 'tv' },
            142: { tmdbId: '128', type: 'movie' }
        });

        const v1 = await resolveTmdbIdentity('kitsu:10', { lookupImdbId: lookup, lookupKitsuId });
        expect(v1).toEqual({
            resolved: true,
            tmdbId: '30981',
            mediaType: 'tv',
            tmdbData: null,
            reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP
        });

        const v2 = await resolveTmdbIdentity('kitsu:142', { lookupImdbId: lookup, lookupKitsuId });
        expect(v2).toEqual({
            resolved: true,
            tmdbId: '128',
            mediaType: 'movie',
            tmdbData: null,
            reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP
        });
    });

    test('un id kitsu: assente dalla mappatura resta non risolto — non è «dato per convertito»', async () => {
        const lookup = fakeLookup();
        const lookupKitsuId = fakeLookup();
        const verdict = await resolveTmdbIdentity('kitsu:99999999', { lookupImdbId: lookup, lookupKitsuId });

        expect(verdict).toEqual({
            resolved: false,
            tmdbId: null,
            tmdbData: null,
            reason: RESOLUTION_REASONS.NOT_FOUND
        });
        expect(lookupKitsuId.calls).toEqual(['99999999']);
        expect(lookup.calls).toEqual([]);
    });

    test('la mappatura kitsu che fallisce non è un errore: l\'item resta non risolto', async () => {
        const verdict = await resolveTmdbIdentity('kitsu:142', {
            lookupKitsuId: () => { throw new Error('store non pronto'); }
        });

        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.NOT_FOUND);
    });

    test('un id kitsu: senza numero non viene risolto', async () => {
        const lookupKitsuId = fakeLookup();
        const verdict = await resolveTmdbIdentity('kitsu:', { lookupKitsuId });

        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        expect(lookupKitsuId.calls).toEqual([]);
    });

    test('un id che non si riconosce non è risolto', async () => {
        const verdict = await resolveTmdbIdentity('anilist:12345', { lookupImdbId: fakeLookup() });
        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
    });

    test('id assente o vuoto non viene trattato come imdb', async () => {
        expect((await resolveTmdbIdentity('', {})).reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        expect((await resolveTmdbIdentity(null, {})).reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        expect((await resolveTmdbIdentity(undefined, {})).reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
    });

    test('senza ricerca esterna fornita, un id imdb non viene «risolto» a caso', async () => {
        const verdict = await resolveTmdbIdentity('tt0111161', {});
        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.NOT_FOUND);
    });
});
