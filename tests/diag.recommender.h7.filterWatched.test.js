/**
 * H7 — `hideWatched` è un no-op: il profilo non ha mai `processedTraktIds`/
 * `processedStremioIds` popolati.
 *
 * Evidenza: FilterWatched.js:21-22 legge profile.processedTraktIds/processedStremioIds;
 * il modello TasteProfile (src/models/TasteProfile.js:3-51) NON ha questi campi e nessun
 * file li scrive (grep: solo FilterWatched.js). ProfileBuilder scrive su WatchHistory.
 * → watchedIds è sempre vuoto, nessun item filtrato.
 *
 * Test (ROSSO-capace): con hideWatched attivo e un profilo reale (senza i due array),
 * l'item presente in WatchHistory DEVE essere filtrato. Oggi resta.
 */

const { filterWatchedItems } = require('../src/catalog/processors/FilterWatched');

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/models/WatchHistory', () => ({
    find: jest.fn()
}));

const TasteProfile = require('../src/models/TasteProfile');

describe('H7 — hideWatched è un no-op', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ROSSO: con hideWatched attivo, l\'item già visto (in WatchHistory) deve essere filtrato', async () => {
        // Profilo con la forma reale del modello TasteProfile: niente processed*Ids.
        TasteProfile.findOne.mockResolvedValue({
            owner: 'u1',
            context: 'global',
            compiledVectors: { V_static: {}, V_active: {}, V_final: {} },
            lastUpdated: new Date()
        });

        const metas = [
            { id: 'tmdb:123', name: 'Già visto' },
            { id: 'tmdb:456', name: 'Mai visto' }
        ];

        const result = await filterWatchedItems(metas, {
            userId: 'u1',
            config: { hideWatched: true }
        });

        const ids = result.map(m => String(m.id));
        expect(ids).toEqual(['tmdb:456']);
    });

    it('verde (documentazione): se il profilo avesse processedTraktIds (formato legacy), il filtro funzionerebbe', async () => {
        TasteProfile.findOne.mockResolvedValue({
            owner: 'u1',
            context: 'global',
            processedTraktIds: ['tmdb:123'],
            processedStremioIds: []
        });

        const result = await filterWatchedItems(
            [{ id: 'tmdb:123' }, { id: 'tmdb:456' }],
            { userId: 'u1', config: { hideWatched: true } }
        );

        expect(result.map(m => String(m.id))).toEqual(['tmdb:456']);
    });

    it('verde (documentazione): senza hideWatched non filtra nulla', async () => {
        TasteProfile.findOne.mockResolvedValue({
            owner: 'u1',
            context: 'global'
        });

        const result = await filterWatchedItems(
            [{ id: 'tmdb:123' }, { id: 'tmdb:456' }],
            { userId: 'u1', config: { hideWatched: false } }
        );

        expect(result).toHaveLength(2);
    });
});
