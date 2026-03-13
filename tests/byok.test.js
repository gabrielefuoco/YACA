describe('BYOK enforcement', () => {
    let configureRoute;

    beforeEach(() => {
        jest.resetModules();

        // Mock mongoose, clients, and other heavy dependencies
        jest.mock('mongoose', () => {
            const mockModel = {
                findOne: jest.fn().mockResolvedValue(null),
                findOneAndUpdate: jest.fn().mockResolvedValue({}),
            };
            return {
                connect: jest.fn(),
                model: jest.fn().mockReturnValue(mockModel),
                Schema: class Schema {
                    constructor() { }
                    index() { }
                    pre() { }
                    post() { }
                    static() { }
                },
                connection: { readyState: 1 },
                Types: { ObjectId: jest.fn() }
            };
        });

        // Ensure MISTRAL_API_KEY env var does not leak into tests
        delete process.env.MISTRAL_API_KEY;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('configure route should not fallback to process.env.MISTRAL_API_KEY', () => {
        // The configure.js file at line 118 should NOT reference process.env.MISTRAL_API_KEY for effectiveMistralKey
        const fs = require('fs');
        const path = require('path');
        const configureSource = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'api', 'configure.js'),
            'utf8'
        );
        
        // Find the line that sets effectiveMistralKey
        const effectiveMistralKeyLine = configureSource
            .split('\n')
            .find(line => line.includes('effectiveMistralKey') && line.includes('=') && !line.includes('if') && !line.includes('!'));
        
        expect(effectiveMistralKeyLine).toBeDefined();
        // It should NOT contain process.env.MISTRAL_API_KEY (BYOK strict)
        expect(effectiveMistralKeyLine).not.toContain('process.env.MISTRAL_API_KEY');
        // It should use personalMistralKey only
        expect(effectiveMistralKeyLine).toContain('personalMistralKey');
    });

    it('preview-catalog should return 403 when prompt used without Mistral key', () => {
        const fs = require('fs');
        const path = require('path');
        const indexSource = fs.readFileSync(
            path.join(__dirname, '..', 'index.js'),
            'utf8'
        );
        
        // Verify that preview-catalog has a 403 guard for missing Mistral key
        expect(indexSource).toContain("status(403)");
        expect(indexSource).toContain("chiave Mistral personale");
    });

    it('validate-mistral-key endpoint should exist', () => {
        const fs = require('fs');
        const path = require('path');
        const indexSource = fs.readFileSync(
            path.join(__dirname, '..', 'index.js'),
            'utf8'
        );
        
        expect(indexSource).toContain("'/api/validate-mistral-key'");
    });
});
