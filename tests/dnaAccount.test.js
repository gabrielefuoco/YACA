/**
 * DNA d'account (ticket 02). Il default è dry-run: questi test provano che il
 * calcolo non sovrascrive TasteProfile né AddonConfig se non richiesto.
 */

jest.mock('../src/configurazione', () => ({
    accountDi: jest.fn(),
    accountPerAddonUuid: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn()
}));

jest.mock('../src/library', () => ({
    storiaDi: jest.fn(),
    leggiLibreriaPerProfilo: jest.fn(),
    registraVisione: jest.fn(),
    backfillCronologia: jest.fn(),
    trovaCronologiaPerIds: jest.fn(),
    scriviBatchCronologia: jest.fn()
}));

const ProfileBuilder = require('../src/profile/ProfileBuilder');
const TasteProfile = require('../src/models/TasteProfile');
const AddonConfig = require('../src/models/AddonConfig');
const { accountDi, accountPerAddonUuid } = require('../src/configurazione');
const { storiaDi } = require('../src/library');
const { calcolaDnaAccount, dnaMapsDaVettore, unisciVettoriMassimo } = require('../src/profile/dnaAccount');

describe('dnaMapsDaVettore', () => {
    it('separa generi, keyword e network/origine nella forma storica del DNA', () => {
        const dna = dnaMapsDaVettore({
            'g:28': 40,
            'g:12': 10,
            'k:123': 25,
            'k:time travel': 5,
            'o:US': 7,
            'n:213': 3,
            'a:999': 100 // persone: non fanno parte del DNA
        });

        expect(dna).toEqual({
            genres: { '28': 40, '12': 10 },
            keywords: { '123': 25, 'time travel': 5 },
            networks: { US: 7, '213': 3 }
        });
    });
});

describe('unisciVettoriMassimo', () => {
    it('evita il doppio conteggio dei titoli fan-out prendendo il massimo per chiave', () => {
        expect(unisciVettoriMassimo([
            { 'g:28': 10, 'k:1': 5 },
            { 'g:28': 40, 'o:IT': 2 }
        ])).toEqual({ 'g:28': 40, 'k:1': 5, 'o:IT': 2 });
    });
});

describe('calcolaDnaAccount', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        accountDi.mockResolvedValue(null);
        accountPerAddonUuid.mockResolvedValue({ userId: 'u1' });
        storiaDi.mockResolvedValue([]);
        TasteProfile.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                compiledVectors: { V_active: {}, V_final: { 'g:28': 50 } },
                flatnessMetrics: null
            })
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function mockRecompute() {
        return jest.spyOn(ProfileBuilder, 'recomputeVectorsForUser').mockImplementation(async (_owner, context) => ({
            vFinal: context === 'global'
                ? { 'g:28': 40, 'k:123': 20 }
                : { 'g:28': 50, 'o:US': 10 }
        }));
    }

    it('per default è dry-run: calcola, restituisce, non scrive nulla', async () => {
        const recompute = mockRecompute();
        const updateSpy = jest.spyOn(AddonConfig, 'updateOne').mockResolvedValue({});
        const config = { uuid: 'addon-1', profiles: [{ id: 'global' }, { id: 'p1' }] };

        const dna = await calcolaDnaAccount(config);

        expect(dna).toEqual({
            genres: { '28': 50 },
            keywords: { '123': 20 },
            networks: { US: 10 }
        });
        expect(recompute).toHaveBeenCalledTimes(2);
        for (const call of recompute.mock.calls) {
            expect(call[2]).toEqual({ scrivi: false });
        }
        expect(config.dna).toBeUndefined();
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it('risolve l\'owner dall\'uuid dell\'AddonConfig', async () => {
        mockRecompute();
        await calcolaDnaAccount({ uuid: 'addon-1', profiles: [] });

        expect(accountPerAddonUuid).toHaveBeenCalledWith('addon-1');
    });

    it('con { scrivi: true } assegna il DNA e persiste solo il campo dna', async () => {
        mockRecompute();
        const updateSpy = jest.spyOn(AddonConfig, 'updateOne').mockResolvedValue({});
        const config = { uuid: 'addon-1', profiles: [{ id: 'global' }] };

        const dna = await calcolaDnaAccount(config, { scrivi: true, owner: 'u1' });

        expect(config.dna).toEqual(dna);
        expect(updateSpy).toHaveBeenCalledWith({ uuid: 'addon-1' }, { $set: { dna } });
    });
});

describe('ProfileBuilder.recomputeVectorsForUser in dry-run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        accountDi.mockResolvedValue(null);
        storiaDi.mockResolvedValue([]);
        TasteProfile.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                compiledVectors: { V_active: {}, V_final: { 'g:28': 50 } },
                flatnessMetrics: null
            })
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('restituisce i vettori senza aggiornare TasteProfile', async () => {
        const risultato = await ProfileBuilder.recomputeVectorsForUser('u1', 'global', { scrivi: false });

        expect(risultato).toMatchObject({
            vFinal: { 'g:28': 50 },
            scritto: false
        });
        expect(TasteProfile.updateOne).not.toHaveBeenCalled();
    });
});
