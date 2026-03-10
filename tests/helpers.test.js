const { parseExtra, getProfileDnaFilters } = require('../src/utils/helpers');

describe('parseExtra', () => {
    it('should return empty object for falsy input', () => {
        expect(parseExtra(null)).toEqual({});
        expect(parseExtra(undefined)).toEqual({});
        expect(parseExtra('')).toEqual({});
    });

    it('should parse single parameter', () => {
        expect(parseExtra('search=avengers')).toEqual({ search: 'avengers' });
    });

    it('should parse multiple parameters', () => {
        expect(parseExtra('search=avengers&skip=20')).toEqual({ search: 'avengers', skip: '20' });
    });

    it('should decode URI components', () => {
        expect(parseExtra('search=hello%20world')).toEqual({ search: 'hello world' });
        expect(parseExtra('search=film%20d%27azione')).toEqual({ search: "film d'azione" });
    });

    it('should skip entries without value', () => {
        expect(parseExtra('search=test&empty=')).toEqual({ search: 'test' });
        expect(parseExtra('novalue&search=test')).toEqual({ search: 'test' });
    });
});

describe('getProfileDnaFilters', () => {
    it('should merge manualDNA and suggestedDNA for the selected profile', () => {
        const filters = getProfileDnaFilters({
            profiles: [
                {
                    id: 'kids',
                    settings: {
                        manualDNA: [{ type: 'genre', id: '16' }],
                        suggestedDNA: [{ type: 'keyword', id: 'robot' }]
                    }
                }
            ]
        }, 'kids');

        expect(filters).toEqual([
            { type: 'genre', id: '16' },
            { type: 'keyword', id: 'robot' }
        ]);
    });

    it('should return an empty array when the profile does not exist', () => {
        expect(getProfileDnaFilters({ profiles: [] }, 'missing')).toEqual([]);
    });
});
