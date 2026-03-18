describe('preview-catalog manual filters keep strategy fields', () => {
    function findRouteHandler(router, method, routePath) {
        const layer = router.stack.find((entry) => entry.route?.path === routePath && entry.route.methods?.[method]);
        if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
        return layer.route.stack[0].handle;
    }

    function createMockRes() {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    }

    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('preserves manual strategy and text_search fields in multi_search previews', async () => {
        const mockTmdbGet = jest.fn().mockResolvedValue({ data: { results: [] } });

        jest.doMock('../src/handlers/catalogHandler', () => ({
            catalogHandler: jest.fn(),
            buildDiscoveryParams: jest.fn()
        }));
        jest.doMock('../src/ai/router', () => ({
            generateTmdbFiltersFromPrompt: jest.fn()
        }));
        jest.doMock('../src/data/presets', () => ({
            getPresets: jest.fn(() => [])
        }));
        jest.doMock('../src/utils/helpers', () => ({
            sanitizeString: (value) => String(value ?? '').trim(),
            resolveHostUrl: jest.fn(() => 'http://localhost')
        }));
        jest.doMock('../src/utils/httpClient', () => ({
            createAxiosInstance: jest.fn(() => ({ get: mockTmdbGet }))
        }));

        const router = require('../src/api/catalog');
        const previewHandler = findRouteHandler(router, 'post', '/preview-catalog');
        const req = {
            body: {
                tmdbKey: 'tmdb-key',
                type: 'movie',
                filters: {
                    strategy: 'multi_search',
                    text_search: 'The Matrix'
                }
            }
        };
        const res = createMockRes();

        await previewHandler(req, res);

        expect(mockTmdbGet).toHaveBeenCalledWith('/search/movie', expect.objectContaining({
            params: expect.objectContaining({
                query: 'The Matrix'
            })
        }));
        expect(res.json).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(500);
    });
});
