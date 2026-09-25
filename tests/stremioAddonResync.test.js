/**
 * Regressione: l'aggiornamento della collezione Stremio NON deve dipendere dal download
 * del manifest dalla URL pubblica. Dentro il container quell'hostname non è risolvibile
 * (ENOTFOUND) e il resync falliva in silenzio: la URL installata restava vecchia e Stremio
 * continuava a mostrare il manifest in cache (cataloghi mancanti).
 */
jest.mock('../src/clients/stremio', () => ({
    stremioClient: { post: jest.fn(), get: jest.fn() },
    stremioLikesClient: { get: jest.fn() }
}));
jest.mock('../src/models/UserConfig', () => ({ resolveUserConfig: jest.fn() }));
jest.mock('../src/api/stremio', () => ({ buildManifest: jest.fn() }));

const { stremioClient } = require('../src/clients/stremio');
const UserConfig = require('../src/models/UserConfig');
const { buildManifest } = require('../src/api/stremio');
const { updateStremioAddonCollection } = require('../src/utils/stremioAddon');

const ADDON_ID = 'org.stremio.yaca.catalog';
const HOST = 'https://mate.example.ts.net';
const MANIFEST_URL = `${HOST}/REOUSER/sim-version/manifest.json`;

describe('Resync della collezione Stremio', () => {
    beforeAll(() => { process.env.HOST_URL = HOST; });
    beforeEach(() => { jest.clearAllMocks(); });

    test('costruisce il manifest in-process e non scarica la URL pubblica', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue({ configVersion: 'sim-version', profiles: [] });
        buildManifest.mockReturnValue({ id: ADDON_ID, version: '1.0.4+sim', catalogs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
        stremioClient.post
            .mockResolvedValueOnce({ data: { result: { addons: [{ manifest: { id: ADDON_ID }, transportUrl: 'https://vecchia/manifest.json' }] } } })
            .mockResolvedValueOnce({ data: { result: { success: true } } });

        const result = await updateStremioAddonCollection('auth-key', MANIFEST_URL);

        expect(result.success).toBe(true);
        expect(buildManifest).toHaveBeenCalledWith(expect.anything(), HOST, 'REOUSER');
        // Nessun download del manifest: era la causa del fallimento in produzione
        expect(stremioClient.get).not.toHaveBeenCalled();

        const setPayload = stremioClient.post.mock.calls[1][1];
        expect(setPayload.addons[0].transportUrl).toBe(MANIFEST_URL);
        expect(setPayload.addons[0].manifest.catalogs).toHaveLength(3);
    });

    test('aggiunge l\'addon quando non è ancora nella collezione', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue({ configVersion: 'sim-version', profiles: [] });
        buildManifest.mockReturnValue({ id: ADDON_ID, catalogs: [{ id: 'x' }] });
        stremioClient.post
            .mockResolvedValueOnce({ data: { result: { addons: [] } } })
            .mockResolvedValueOnce({ data: { result: { success: true } } });

        const result = await updateStremioAddonCollection('auth-key', MANIFEST_URL);

        expect(result.success).toBe(true);
        const setPayload = stremioClient.post.mock.calls[1][1];
        expect(setPayload.addons).toHaveLength(1);
        expect(setPayload.addons[0].transportUrl).toBe(MANIFEST_URL);
    });

    test('fallback: se la config non è risolvibile scarica il manifest (e non esplode)', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue(null);
        stremioClient.post
            .mockResolvedValueOnce({ data: { result: { addons: [{ manifest: { id: ADDON_ID }, transportUrl: 'vecchia' }] } } })
            .mockResolvedValueOnce({ data: { result: { success: true } } });
        stremioClient.get.mockResolvedValueOnce({ data: { id: ADDON_ID, catalogs: [{ id: 'k' }] } });

        const result = await updateStremioAddonCollection('auth-key', MANIFEST_URL);

        expect(result.success).toBe(true);
        expect(stremioClient.get).toHaveBeenCalledWith(MANIFEST_URL, expect.anything());
    });

    test('rifiuta URL fuori dall\'host configurato', async () => {
        const result = await updateStremioAddonCollection('auth-key', 'https://evil.example.com/x/manifest.json');
        expect(result).toEqual({ success: false, error: 'URL manifest non consentito' });
        expect(stremioClient.post).not.toHaveBeenCalled();
    });
});
