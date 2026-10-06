const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const router = require('../src/api/profiles');

jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');
jest.mock('../src/db/models/UserLibraryItem');
jest.mock('../src/clients/stremio', () => ({
    stremioClient: {
        post: jest.fn().mockResolvedValue({ data: {} })
    }
}));

describe('PUT /api/profiles/:id/library/reorder', () => {
    let reorderHandler;

    beforeAll(() => {
        const routeLayer = router.stack.find(
            s => s.route && s.route.path === '/:id/library/reorder' && s.route.methods.put
        );
        expect(routeLayer).toBeDefined();
        reorderHandler = routeLayer.route.stack[0].handle;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects invalid payload', async () => {
        const req = { params: { id: 'prof-1' }, body: {} };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await reorderHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 if user not found', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(null)
        });
        const req = { params: { id: 'prof-1' }, body: { userId: 'u1', itemIds: ['tt1', 'tt2'] } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await reorderHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 404 if profile not found in AddonConfig', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
        });
        AddonConfig.findOne.mockResolvedValue({
            uuid: 'uuid-1',
            profiles: [{ id: 'prof-other', raw_ui_state: {} }]
        });
        const req = { params: { id: 'prof-1' }, body: { userId: 'u1', itemIds: ['tt1', 'tt2'] } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await reorderHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Profile not found' });
    });

    it('persists libraryOrder into AddonConfig profile raw_ui_state without touching _ctime/_mtime or pushing to Stremio', async () => {
        const { stremioClient } = require('../src/clients/stremio');
        const UserLibraryItem = require('../src/db/models/UserLibraryItem');
        UserLibraryItem.findOneAndUpdate = jest.fn();

        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                userId: 'u1',
                addonUuid: 'uuid-1',
                apiKeys: { stremio: 'stremio-key' }
            })
        });
        AddonConfig.findOne.mockResolvedValue({
            uuid: 'uuid-1',
            profiles: [{ id: 'prof-1', raw_ui_state: {} }]
        });
        AddonConfig.updateOne.mockResolvedValue({ modifiedCount: 1 });

        const req = {
            params: { id: 'prof-1' },
            body: { userId: 'u1', itemIds: ['tt1', 'tt2', 'tt1'] }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await reorderHandler(req, res);

        // Expect AddonConfig update with deduplicated IDs
        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { uuid: 'uuid-1', 'profiles.id': 'prof-1' },
            { $set: { 'profiles.$.raw_ui_state.libraryOrder': ['tt1', 'tt2'] } }
        );

        // MUST NOT touch UserLibraryItem _ctime / _mtime
        expect(UserLibraryItem.findOneAndUpdate).not.toHaveBeenCalled();

        // MUST NOT push datastorePut to Stremio
        expect(stremioClient.post).not.toHaveBeenCalled();

        expect(res.json).toHaveBeenCalledWith({
            success: true,
            libraryOrder: ['tt1', 'tt2']
        });
    });
});
