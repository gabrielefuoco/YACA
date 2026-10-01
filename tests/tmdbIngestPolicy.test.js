const {
    VOTE_FLOOR,
    isTrackedAiringId,
    shouldKeepTmdbRecord,
    loadTrackedAiringIds
} = require('../src/utils/tmdbIngestPolicy');
const animeAiringState = require('../src/data/animeAiringState');

describe('TMDB Ingest Policy (Ticket 31)', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('la soglia di voto predefinita è 10', () => {
        expect(VOTE_FLOOR).toBe(10);
    });

    test('accetta sempre record con vote_count >= 10', async () => {
        const keepHigh = await shouldKeepTmdbRecord(12345, 10);
        expect(keepHigh).toBe(true);

        const keepVeryHigh = await shouldKeepTmdbRecord(12345, 500);
        expect(keepVeryHigh).toBe(true);
    });

    test('scarta record con vote_count < 10 se non tracciati e senza bypass', async () => {
        jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValue({
            byTmdbId: new Map([['999', { tmdbId: '999' }]])
        });

        const keep = await shouldKeepTmdbRecord(12345, 5);
        expect(keep).toBe(false);
    });

    test('accetta record con vote_count < 10 se bypassVoteFloor è true', async () => {
        const keep = await shouldKeepTmdbRecord(12345, 2, { bypassVoteFloor: true });
        expect(keep).toBe(true);
    });

    test('accetta record con vote_count < 10 se presente in trackedIds (Set)', async () => {
        const trackedSet = new Set([312507, 325052]);

        const keepTracked = await shouldKeepTmdbRecord(312507, 3, { trackedIds: trackedSet });
        expect(keepTracked).toBe(true);

        const keepUntracked = await shouldKeepTmdbRecord(999999, 3, { trackedIds: trackedSet });
        expect(keepUntracked).toBe(false);
    });

    test('accetta record con vote_count < 10 risolvendo lo snapshot se trackedIds non è fornito', async () => {
        jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValue({
            byTmdbId: new Map([
                ['312507', { tmdbId: '312507' }],
                ['306721', { tmdbId: '306721' }]
            ])
        });

        const keepTracked = await shouldKeepTmdbRecord('312507', 7);
        expect(keepTracked).toBe(true);

        const keepUntracked = await shouldKeepTmdbRecord('88888', 7);
        expect(keepUntracked).toBe(false);
    });

    test('isTrackedAiringId gestisce ID come numero e come stringa', () => {
        const trackedSet = new Set([100, 200]);
        expect(isTrackedAiringId(100, trackedSet)).toBe(true);
        expect(isTrackedAiringId('200', trackedSet)).toBe(true);
        expect(isTrackedAiringId(300, trackedSet)).toBe(false);
        expect(isTrackedAiringId(null, trackedSet)).toBe(false);
        expect(isTrackedAiringId(undefined, trackedSet)).toBe(false);
    });

    test('loadTrackedAiringIds recupera il Set numerico dallo snapshot', async () => {
        jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValue({
            byTmdbId: new Map([
                ['101', { tmdbId: '101' }],
                ['202', { tmdbId: '202' }]
            ])
        });

        const set = await loadTrackedAiringIds();
        expect(set.has(101)).toBe(true);
        expect(set.has(202)).toBe(true);
        expect(set.size).toBe(2);
    });

    test('loadTrackedAiringIds non lancia eccezioni su degrado/errore', async () => {
        jest.spyOn(animeAiringState, 'getSnapshot').mockRejectedValue(new Error('Mongo down'));

        const set = await loadTrackedAiringIds();
        expect(set).toBeInstanceOf(Set);
        expect(set.size).toBe(0);
    });
});
