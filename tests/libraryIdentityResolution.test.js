/**
 * La risoluzione dell'identità: «da questo id di item, quale TMDB id?». È il
 * passo che il ciclo di conversione faceva inline, con una ricerca esterna e un
 * paio di `startsWith`. Qui è una funzione alimentata dalle sue dipendenze, quindi
 * i test coprono i quattro casi senza rete e senza database.
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

    test('un id kitsu: oggi non è risolto — quel ramo non c\'è ancora', async () => {
        const lookup = fakeLookup();
        const verdict = await resolveTmdbIdentity('kitsu:7278', { lookupImdbId: lookup });

        expect(verdict.resolved).toBe(false);
        expect(verdict.reason).toBe(RESOLUTION_REASONS.UNSUPPORTED_SOURCE);
        expect(lookup.calls).toEqual([]);
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
