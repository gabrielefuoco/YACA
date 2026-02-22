jest.mock('../src/utils/database', () => ({
    getSupabase: jest.fn()
}));

const { getSupabase } = require('../src/utils/database');
const UserConfig = require('../src/models/UserConfig');

describe('UserConfig.saveConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('retries without configVersion when schema does not have the column', async () => {
        const upsertMock = jest.fn()
            .mockResolvedValueOnce({ data: null, error: { message: "Could not find the 'configVersion' column of 'user_configs' in the schema cache" } })
            .mockResolvedValueOnce({ data: [{ uuid: 'abc' }], error: null });
        getSupabase.mockReturnValue({
            from: jest.fn(() => ({ upsert: upsertMock }))
        });

        await expect(UserConfig.saveConfig({
            uuid: 'abc',
            apiKeys: {},
            catalogs: [],
            profiles: [],
            activeProfileId: null
        })).resolves.toEqual([{ uuid: 'abc' }]);

        expect(upsertMock).toHaveBeenCalledTimes(2);
        expect(upsertMock.mock.calls[0][0]).toHaveProperty('configVersion');
        expect(upsertMock.mock.calls[1][0]).not.toHaveProperty('configVersion');
    });
});
