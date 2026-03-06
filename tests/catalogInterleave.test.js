jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_user_id')
}));

const { interleaveResults } = require('../src/handlers/catalogHandler');

describe('catalogHandler interleaveResults', () => {
    it('handles null source lists without throwing', () => {
        expect(interleaveResults(null, [{ id: 'b1' }], 0, 20)).toEqual([{ id: 'b1' }]);
        expect(interleaveResults([{ id: 'a1' }], null, 0, 20)).toEqual([{ id: 'a1' }]);
    });

    it('does not collapse items that have no id', () => {
        const merged = interleaveResults([{ name: 'a' }], [{ name: 'b' }], 0, 20);
        expect(merged).toEqual([{ name: 'a' }, { name: 'b' }]);
    });

    it('deduplicates ids even when one is prefixed with tmdb:', () => {
        const merged = interleaveResults(
            [{ id: 12345, name: 'A' }],
            [{ id: 'tmdb:12345', name: 'B' }],
            0,
            20
        );
        expect(merged).toEqual([{ id: 12345, name: 'A' }]);
    });
});
