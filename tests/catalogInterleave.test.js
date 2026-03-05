jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_user_id')
}));

const { interleaveResults } = require('../src/handlers/catalogHandler');

describe('catalogHandler interleaveResults', () => {
    it('handles null source lists without throwing', () => {
        expect(interleaveResults(null, [{ id: 'b1' }], 0, 20)).toEqual([{ id: 'b1' }]);
        expect(interleaveResults([{ id: 'a1' }], null, 0, 20)).toEqual([{ id: 'a1' }]);
    });
});
