const AddonConfig = require('../src/db/models/AddonConfig');
const UserAccount = require('../src/db/models/UserAccount');
const { updateStremioAddonCollection } = require('../src/utils/stremioAddon');
const { reconcileManifests } = require('../src/utils/manifestReconciler');
const {
    buildManifestFingerprint,
    buildManifestDefinitionsSignature,
    setHeroCatalogs
} = require('../src/utils/manifestFingerprint');

jest.mock('../src/db/models/AddonConfig');
jest.mock('../src/db/models/UserAccount');
jest.mock('../src/utils/stremioAddon');
jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'new-nanoid-ver')
}));

describe('manifestReconciler', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        process.env.HOST_URL = 'https://yaca.example.com';
        delete process.env.DISABLE_MANIFEST_RECONCILE;
        setHeroCatalogs(null);
    });

    afterAll(() => {
        process.env = originalEnv;
        setHeroCatalogs(null);
    });

    test('(a) impronta diversa -> versione aggiornata + resync chiamato con la URL giusta + flag azzerato', async () => {
        const mockConfig = {
            _id: 'db-id-1',
            uuid: 'uuid-1',
            profiles: [
                { id: 'profile-1', name: 'Profile 1', catalogs: [] }
            ],
            customCatalogs: [],
            config: {
                activeProfileId: 'profile-1',
                configVersion: 'old-version',
                manifestFingerprint: 'outdated-fingerprint-hex',
                pendingStremioResync: false
            }
        };

        AddonConfig.find.mockResolvedValue([mockConfig]);
        AddonConfig.updateOne.mockResolvedValue({ acknowledged: true });

        UserAccount.findOne.mockResolvedValue({
            userId: 'user-alpha',
            addonUuid: 'uuid-1',
            apiKeys: {
                stremio: 'stremio-auth-token-123'
            }
        });

        updateStremioAddonCollection.mockResolvedValue({ success: true });

        const summary = await reconcileManifests();

        expect(summary.examined).toBe(1);
        expect(summary.updated).toBe(1);
        expect(summary.resyncOk).toBe(1);
        expect(summary.resyncFailed).toBe(0);

        // 1. Deve aggiornare configVersion, fingerprint e impostare pendingStremioResync = true
        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { _id: 'db-id-1' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    'config.configVersion': 'new-nanoid-ver',
                    'config.pendingStremioResync': true
                })
            })
        );

        // 2. Deve chiamare updateStremioAddonCollection con la URL aggiornata
        expect(updateStremioAddonCollection).toHaveBeenCalledWith(
            'stremio-auth-token-123',
            'https://yaca.example.com/user-alpha/new-nanoid-ver/manifest.json'
        );

        // 3. Su successo deve azzerare pendingStremioResync
        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { _id: 'db-id-1' },
            {
                $set: {
                    'config.pendingStremioResync': false
                }
            }
        );
    });

    test('(b) impronta uguale -> nessuna scrittura', async () => {
        const configData = {
            activeProfileId: 'profile-stable',
            profiles: [
                { id: 'profile-stable', name: 'Profile Stable', catalogs: [] }
            ],
            customCatalogs: []
        };
        const currentFingerprint = buildManifestFingerprint(configData);

        const mockConfig = {
            _id: 'db-id-2',
            uuid: 'uuid-2',
            profiles: configData.profiles,
            customCatalogs: configData.customCatalogs,
            config: {
                activeProfileId: 'profile-stable',
                configVersion: 'current-valid-version',
                manifestFingerprint: currentFingerprint,
                pendingStremioResync: false
            }
        };

        AddonConfig.find.mockResolvedValue([mockConfig]);

        const summary = await reconcileManifests();

        expect(summary.examined).toBe(1);
        expect(summary.updated).toBe(0);
        expect(summary.resyncOk).toBe(0);
        expect(summary.resyncFailed).toBe(0);

        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
        expect(updateStremioAddonCollection).not.toHaveBeenCalled();
    });

    test('(c) resync fallito -> flag conservato', async () => {
        const mockConfig = {
            _id: 'db-id-3',
            uuid: 'uuid-3',
            profiles: [
                { id: 'profile-3', name: 'Profile 3', catalogs: [] }
            ],
            customCatalogs: [],
            config: {
                activeProfileId: 'profile-3',
                configVersion: 'old-version',
                manifestFingerprint: 'outdated-fingerprint-hex',
                pendingStremioResync: false
            }
        };

        AddonConfig.find.mockResolvedValue([mockConfig]);
        AddonConfig.updateOne.mockResolvedValue({ acknowledged: true });

        UserAccount.findOne.mockResolvedValue({
            userId: 'user-beta',
            addonUuid: 'uuid-3',
            apiKeys: {
                stremio: 'stremio-auth-token-456'
            }
        });

        // Simula fallimento API Stremio
        updateStremioAddonCollection.mockResolvedValue({
            success: false,
            error: 'AddonCollectionSet timed out'
        });

        const summary = await reconcileManifests();

        expect(summary.examined).toBe(1);
        expect(summary.updated).toBe(1);
        expect(summary.resyncOk).toBe(0);
        expect(summary.resyncFailed).toBe(1);

        // Version bump e flag impostato a true
        expect(AddonConfig.updateOne).toHaveBeenCalledTimes(1);
        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { _id: 'db-id-3' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    'config.configVersion': 'new-nanoid-ver',
                    'config.pendingStremioResync': true
                })
            })
        );

        // NON deve essere chiamato l'azzeramento del flag
        expect(AddonConfig.updateOne).not.toHaveBeenCalledWith(
            { _id: 'db-id-3' },
            {
                $set: {
                    'config.pendingStremioResync': false
                }
            }
        );
    });

    test('(d) config senza chiave Stremio -> versione aggiornata, nessun resync, nessuna eccezione', async () => {
        const mockConfig = {
            _id: 'db-id-4',
            uuid: 'uuid-4',
            profiles: [
                { id: 'profile-4', name: 'Profile 4', catalogs: [] }
            ],
            customCatalogs: [],
            config: {
                activeProfileId: 'profile-4',
                configVersion: 'old-version',
                manifestFingerprint: 'outdated-fingerprint-hex',
                pendingStremioResync: false
            }
        };

        AddonConfig.find.mockResolvedValue([mockConfig]);
        AddonConfig.updateOne.mockResolvedValue({ acknowledged: true });

        // Utente senza chiave Stremio
        UserAccount.findOne.mockResolvedValue({
            userId: 'user-gamma',
            addonUuid: 'uuid-4',
            apiKeys: {}
        });

        const summary = await reconcileManifests();

        expect(summary.examined).toBe(1);
        expect(summary.updated).toBe(1);
        expect(summary.resyncOk).toBe(0);
        expect(summary.resyncFailed).toBe(0);

        // Versione aggiornata
        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { _id: 'db-id-4' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    'config.configVersion': 'new-nanoid-ver',
                    'config.pendingStremioResync': true
                })
            })
        );

        // Nessun resync chiamato
        expect(updateStremioAddonCollection).not.toHaveBeenCalled();
    });

    test('(e) la firma di build influenza la fingerprint (cambiando la lista dei cataloghi hero cambia il valore calcolato)', () => {
        const sampleConfig = {
            activeProfileId: 'profile-hero-test',
            profiles: [
                { id: 'profile-hero-test', name: 'Test', catalogs: [] }
            ],
            customCatalogs: []
        };

        const defaultFingerprint = buildManifestFingerprint(sampleConfig);
        const defaultSignature = buildManifestDefinitionsSignature();

        const customHeroList = [
            { id: 'yaca_new_hero_catalog', type: 'movie', name: 'Catalogo Eroe Novità' }
        ];

        // 1. Tramite opzioni in buildManifestFingerprint
        const overriddenFingerprint = buildManifestFingerprint(sampleConfig, {
            heroCatalogs: customHeroList
        });
        expect(overriddenFingerprint).not.toBe(defaultFingerprint);

        // 2. Tramite setter globale setHeroCatalogs
        setHeroCatalogs(customHeroList);
        const setterFingerprint = buildManifestFingerprint(sampleConfig);
        expect(setterFingerprint).not.toBe(defaultFingerprint);
        expect(setterFingerprint).toBe(overriddenFingerprint);

        // 3. Verifica firma definizioni diretta
        const customSignature = buildManifestDefinitionsSignature(customHeroList);
        expect(customSignature).not.toBe(defaultSignature);

        // Reset
        setHeroCatalogs(null);
        expect(buildManifestFingerprint(sampleConfig)).toBe(defaultFingerprint);
    });

    test('ritenta resync pendente al successivo avvio anche se la fingerprint non e cambiata', async () => {
        const configData = {
            activeProfileId: 'profile-retry',
            profiles: [{ id: 'profile-retry', name: 'Profile Retry', catalogs: [] }],
            customCatalogs: []
        };
        const currentFingerprint = buildManifestFingerprint(configData);

        const mockConfig = {
            _id: 'db-id-retry',
            uuid: 'uuid-retry',
            profiles: configData.profiles,
            customCatalogs: configData.customCatalogs,
            config: {
                activeProfileId: 'profile-retry',
                configVersion: 'existing-version',
                manifestFingerprint: currentFingerprint,
                pendingStremioResync: true // Flag da precedente fallimento
            }
        };

        AddonConfig.find.mockResolvedValue([mockConfig]);
        AddonConfig.updateOne.mockResolvedValue({ acknowledged: true });

        UserAccount.findOne.mockResolvedValue({
            userId: 'user-retry',
            addonUuid: 'uuid-retry',
            apiKeys: { stremio: 'stremio-key-retry' }
        });

        updateStremioAddonCollection.mockResolvedValue({ success: true });

        const summary = await reconcileManifests();

        expect(summary.examined).toBe(1);
        expect(summary.updated).toBe(0); // Nessun bump di versione
        expect(summary.resyncOk).toBe(1); // Resync eseguito con successo
        expect(summary.resyncFailed).toBe(0);

        // updateStremioAddonCollection chiamato con la versione esistente
        expect(updateStremioAddonCollection).toHaveBeenCalledWith(
            'stremio-key-retry',
            'https://yaca.example.com/user-retry/existing-version/manifest.json'
        );

        // Flag azzerato su successo
        expect(AddonConfig.updateOne).toHaveBeenCalledWith(
            { _id: 'db-id-retry' },
            {
                $set: {
                    'config.pendingStremioResync': false
                }
            }
        );
    });

    test('gestisce eccezione lanciata durante resync conservando il flag e senza crashare', async () => {
        const mockConfig = {
            _id: 'db-id-exc',
            uuid: 'uuid-exc',
            profiles: [{ id: 'p1', name: 'P1', catalogs: [] }],
            customCatalogs: [],
            config: {
                activeProfileId: 'p1',
                configVersion: 'old-ver',
                manifestFingerprint: 'outdated',
                pendingStremioResync: false
            }
        };

        AddonConfig.find.mockResolvedValue([mockConfig]);
        AddonConfig.updateOne.mockResolvedValue({ acknowledged: true });

        UserAccount.findOne.mockResolvedValue({
            userId: 'user-exc',
            addonUuid: 'uuid-exc',
            apiKeys: { stremio: 'stremio-key-exc' }
        });

        updateStremioAddonCollection.mockRejectedValue(new Error('Network connection aborted'));

        const summary = await reconcileManifests();

        expect(summary.examined).toBe(1);
        expect(summary.updated).toBe(1);
        expect(summary.resyncOk).toBe(0);
        expect(summary.resyncFailed).toBe(1);

        // Il flag NON deve essere azzerato
        expect(AddonConfig.updateOne).not.toHaveBeenCalledWith(
            { _id: 'db-id-exc' },
            {
                $set: {
                    'config.pendingStremioResync': false
                }
            }
        );
    });
});
