jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn(),
    resolveUserConfig: jest.fn().mockResolvedValue(null)
}));

jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated_id')
}));

jest.mock('../src/ricerca/router', () => ({
    generateTmdbFiltersFromPrompt: jest.fn()
}));


// La generazione del DNA salva i vettori in background: senza questi mock la suite
// resterebbe appesa in attesa di MongoDB (motivo per cui era disattivata).
jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    updateOne: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/library/models/WatchHistory', () => ({
    countDocuments: jest.fn().mockResolvedValue(0)
}));



jest.mock('../src/catalog/presets', () => ({
    getPresets: () => [
        { id: 'preset_thriller', where: ['{"id": 111, "type": "keywords"}', '{"id": 53, "type": "genres"}'] },
        { id: 'preset_docs', where: ['{"id": 222, "type": "keywords"}', '{"id": 99, "type": "genres"}'] },
        { id: 'preset_mix', where: ['{"id": 111, "type": "keywords"}', '{"id": 333, "type": "keywords"}', '{"id": 53, "type": "genres"}', '{"id": 18, "type": "genres"}'] },
        { id: 'preset_anime_ai', where: ['{"id": 16, "type": "genres"}', '{"id": 28, "type": "genres"}', '{"id": "zombie", "type": "keywords"}', '{"id": "samurai", "type": "keywords"}'] },
        { id: 'preset_ai_romance', where: ['{"id": 10749, "type": "genres"}', '{"id": "love", "type": "keywords"}'] }
    ]
}));

const configureRoute = require('../src/api/configure');
const UserConfig = require('../src/models/UserConfig');

describe('configure route global profile safeguards', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv, TMDB_API_KEY: 'tmdb_key' };
        UserConfig.saveUser.mockResolvedValue({ userId: 'u1' });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('rifiuta un catalogo dell\'utente con una definizione non valida (400)', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                customCatalogs: [{ id: 'bad id with spaces!', name: 'Test', mediaSet: ['film'] }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(UserConfig.saveUser).not.toHaveBeenCalled();
        // e l'errore dice QUALE catalogo e PERCHE': e' tutto il punto di collegare il validatore
        expect(JSON.stringify(res.json.mock.calls[0][0])).toContain('bad id with spaces!');
    });

    it('accetta un catalogo dell\'utente valido (la validazione non blocca il caso normale)', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                customCatalogs: [{ id: 'mio_catalogo', name: 'Il mio', mediaSet: ['film'], queries: [{ sort_by: 'popularity.desc' }] }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(UserConfig.saveUser).toHaveBeenCalled();
    });

    it('injects immutable global profile when missing', async () => {
        const req = {
            protocol: 'http',
            get: jest.fn(() => 'localhost:7000'),
            user: { userId: 'u1', email: 'user@example.com' },
            body: {
                activeProfileId: 'p1',
                profiles: [{
                    id: 'p1',
                    name: 'Niche',
                    catalogs: [],
                    existingCatalogs: [],
                    newPrompts: [],
                    settings: { manualDNA: [{ id: '1', type: 'genre', name: 'Action' }] }
                }]
            }
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await configureRoute(req, res);

        const payload = UserConfig.saveUser.mock.calls[0][0];
        const globalProfile = payload.profiles.find((p) => p.id === 'global');
        expect(globalProfile).toBeDefined();
        expect(globalProfile.name).toBe('Generale');
    });
});
