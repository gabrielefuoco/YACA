// resolveUserConfig: le due query del ramo UUID partono INSIEME e il ramo si
// decide a valle. Prima erano due round trip serializzati (50-113 ms ciascuno
// verso Atlas, misurati il 04/10/2026 su una richiesta reale).
//
// Qui non si misura il tempo: si verifica che (a) le due query partano insieme,
// cioe' prima che una delle due torni, e (b) che i tre rami e il degrado in caso
// di errore siano esattamente quelli di prima.
jest.mock('../src/db/models/AddonConfig', () => ({ findOne: jest.fn() }));
jest.mock('../src/db/models/UserAccount', () => ({ findOne: jest.fn() }));

const AddonConfig = require('../src/db/models/AddonConfig');
const UserAccount = require('../src/db/models/UserAccount');
const UserConfig = require('../src/models/UserConfig');

// Un findOne "manuale": restituisce una promise che il test scioglie quando vuole,
// cosi' si puo' osservare che cosa e' partito prima di che cosa e' tornato.
function deferredFindOne() {
    const calls = [];
    const findOne = jest.fn(filter => {
        let release;
        const promise = new Promise(resolve => { release = resolve; });
        const rec = { filter, release, finished: false };
        calls.push(rec);
        return { lean: () => promise.then(v => { rec.finished = true; return v; }) };
    });
    return { findOne, calls };
}

const addonDoc = { uuid: 'uuid-1', profiles: [{ id: 'p1' }], config: { configVersion: 'v1', activeProfileId: 'p1' } };
const accountDoc = { userId: 'u1', addonUuid: 'uuid-1', apiKeys: { tmdb: 'k' } };

// resetAllMocks e non clearAllMocks: ogni test riparte senza code di Once
// lasciate in coda dal test precedente, altrimenti una mock che non arriva
// a consumarle fa fallire il test successivo con un risultato inventato.
beforeEach(() => jest.resetAllMocks());

describe('UserConfig.resolveUserConfig', () => {
    it('ramo uuid: le due query partono insieme, prima che una delle due torni', async () => {
        const ac = deferredFindOne();
        const ua = deferredFindOne();
        AddonConfig.findOne.mockImplementation(ac.findOne);
        UserAccount.findOne.mockImplementation(ua.findOne);

        const pending = UserConfig.resolveUserConfig('uuid-1');

        // Nessuna delle due e' ancora tornata: se fossero in serie, la seconda
        // findOne non sarebbe stata chiamata.
        expect(AddonConfig.findOne).toHaveBeenCalledTimes(1);
        expect(UserAccount.findOne).toHaveBeenCalledTimes(1);
        expect(ac.calls[0].filter).toEqual({ uuid: 'uuid-1' });
        expect(ua.calls[0].filter).toEqual({ addonUuid: 'uuid-1' });

        // Arriva per ultima la query su UserAccount, e non cambia nulla.
        ua.calls[0].release(accountDoc);
        expect(AddonConfig.findOne).toHaveBeenCalledTimes(1);
        ac.calls[0].release(addonDoc);

        const out = await pending;
        expect(out).toMatchObject({
            userId: 'u1',
            addonUuid: 'uuid-1',
            profiles: [{ id: 'p1' }],
            activeProfileId: 'p1',
            configVersion: 'v1',
            apiKeys: { tmdb: 'k' }
        });
        // il ramo uuid risolve: la query su userId non viene ne' tentata
        expect(UserAccount.findOne).toHaveBeenCalledTimes(1);
    });

    it('ramo userId: parte solo se il ramo uuid non ha risolto', async () => {
        AddonConfig.findOne
            .mockReturnValueOnce({ lean: () => Promise.resolve(null) })                  // { uuid: handle } -> niente
            .mockReturnValueOnce({ lean: () => Promise.resolve(addonDoc) });             // { uuid: account.addonUuid }
        UserAccount.findOne
            .mockReturnValueOnce({ lean: () => Promise.resolve(null) })                 // { addonUuid } -> niente
            .mockReturnValueOnce({ lean: () => Promise.resolve({ userId: 'u1', addonUuid: 'uuid-1' }) });

        const out = await UserConfig.resolveUserConfig('u1');

        expect(AddonConfig.findOne.mock.calls.map(c => c[0])).toEqual([{ uuid: 'u1' }, { uuid: 'uuid-1' }]);
        expect(UserAccount.findOne.mock.calls.map(c => c[0])).toEqual([{ addonUuid: 'u1' }, { userId: 'u1' }]);
        expect(out).toMatchObject({ userId: 'u1', addonUuid: 'uuid-1', configVersion: 'v1' });
    });

    it('handle inesistente: nessun risultato -> null', async () => {
        AddonConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
        UserAccount.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

        await expect(UserConfig.resolveUserConfig('00000000-0000-0000-0000-000000000000')).resolves.toBeNull();
    });

    it('handle vuoto: non interroga niente', async () => {
        await expect(UserConfig.resolveUserConfig('')).resolves.toBeNull();
        await expect(UserConfig.resolveUserConfig(undefined)).resolves.toBeNull();
        expect(AddonConfig.findOne).not.toHaveBeenCalled();
        expect(UserAccount.findOne).not.toHaveBeenCalled();
    });

    it('errore su una query: degrado a "nessuna config", come prima', async () => {
        // la query su UserAccount fallisce: si degrada a null, la config c'e\' lo stesso
        AddonConfig.findOne.mockReturnValue({ lean: () => Promise.resolve(addonDoc) });
        UserAccount.findOne.mockReturnValue({ lean: () => Promise.reject(new Error('Atlas non raggiungibile')) });

        const out = await UserConfig.resolveUserConfig('uuid-1');
        expect(out).toMatchObject({ userId: null, addonUuid: 'uuid-1', configVersion: 'v1' });
    });

    it('errore su AddonConfig: il ramo uuid cade e si prova il ramo userId', async () => {
        AddonConfig.findOne.mockReturnValue({ lean: () => Promise.reject(new Error('timeout')) });
        UserAccount.findOne
            .mockReturnValueOnce({ lean: () => Promise.reject(new Error('timeout')) })
            .mockReturnValueOnce({ lean: () => Promise.resolve(null) });

        await expect(UserConfig.resolveUserConfig('uuid-1')).resolves.toBeNull();
    });
});