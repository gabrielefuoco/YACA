jest.mock('../src/utils/database', () => ({
    getSupabase: jest.fn()
}));

const { getSupabase } = require('../src/utils/database');
const UserConfig = require('../src/models/UserConfig');

describe('UserConfig.saveConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('saves config and returns data with configVersion', async () => {
        const savedRow = { uuid: 'abc', configVersion: 'test123' };
        const upsertMock = jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [savedRow], error: null })
        });
        getSupabase.mockReturnValue({
            from: jest.fn(() => ({ upsert: upsertMock }))
        });

        const result = await UserConfig.saveConfig({
            uuid: 'abc',
            apiKeys: {},
            catalogs: [],
            profiles: [],
            activeProfileId: null
        });

        expect(upsertMock).toHaveBeenCalledTimes(1);
        expect(upsertMock.mock.calls[0][0]).toHaveProperty('configVersion');
        expect(result).toEqual(savedRow);
    });

    it('throws when upsert fails', async () => {
        const upsertMock = jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: null, error: { message: 'db unavailable' } })
        });
        getSupabase.mockReturnValue({
            from: jest.fn(() => ({ upsert: upsertMock }))
        });

        await expect(UserConfig.saveConfig({
            uuid: 'abc',
            apiKeys: {},
            catalogs: [],
            profiles: [],
            activeProfileId: null
        })).rejects.toThrow('db unavailable');
    });

    it('returns row fallback when select returns empty data', async () => {
        const upsertMock = jest.fn().mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [], error: null })
        });
        getSupabase.mockReturnValue({
            from: jest.fn(() => ({ upsert: upsertMock }))
        });

        const result = await UserConfig.saveConfig({
            uuid: 'abc',
            apiKeys: {},
            catalogs: [],
            profiles: [],
            activeProfileId: null
        });

        expect(result).toHaveProperty('uuid', 'abc');
        expect(result).toHaveProperty('configVersion');
    });
});
