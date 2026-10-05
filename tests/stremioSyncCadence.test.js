/**
 * Ticket 54 — la cadenza del sync Stremio la decide il SUO intervallo.
 *
 * Prima la parte likes/loved di Stremio veniva governata dalla staleness del profilo (12 ore),
 * cioè dalla stessa regola che muove il sync Trakt: `config.lastStremioSync` e
 * `config.nextSyncInterval` si scrivevano a ogni sync e nessuno li leggeva.
 *
 * Qui: dopo un sync, una seconda richiesta di catalogo NON ne innesca un altro.
 */

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn().mockResolvedValue({ lastUpdated: new Date(), dna: {} }),
    updateOne: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn().mockResolvedValue({ value: [], status: 'miss' }),
        set: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(null),
        clear: jest.fn().mockResolvedValue(null)
    }
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: { get: jest.fn().mockResolvedValue({ data: [] }) }
}));

jest.mock('../src/clients/tmdb', () => ({
    getTmdbMovieDetails: jest.fn(),
    getTmdbMetaDetails: jest.fn(),
    createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
    prioritizeLocalizedImages: jest.fn(x => x)
}));

jest.mock('../src/utils/stremioAddon', () => ({
    syncAllStremioData: jest.fn().mockResolvedValue({ success: true })
}));

const { syncIncrementalRecommendations, isStremioSyncDueForUser } = require('../src/engines/hybridRecommendations');
const { syncAllStremioData } = require('../src/utils/stremioAddon');

const H = 60 * 60 * 1000;

/** Configurazione come la risolve UserConfig: porta il bookkeeping del sync Stremio. */
function userConfigDa({ lastStremioSync = null, nextSyncInterval = null } = {}) {
    return { apiKeys: { stremio: 'chiave-stremio', trakt: 'token-trakt' }, lastStremioSync, nextSyncInterval };
}

describe('la cadenza del sync Stremio', () => {
    beforeEach(() => jest.clearAllMocks());

    it('PROVA OSSERVABILE: dopo un sync la seconda richiesta non ne innesca un altro', async () => {
        const config = userConfigDa(); // mai sincronizzato: il primo sync parte

        await syncIncrementalRecommendations('u1', 'movie', 'token-trakt', 'tmdb-key', 'global', config);
        expect(syncAllStremioData).toHaveBeenCalledTimes(1);

        // updateSyncTimestamp ha appena scritto i due campi sulla configurazione
        config.lastStremioSync = new Date();
        config.nextSyncInterval = 8 * H;

        await syncIncrementalRecommendations('u1', 'movie', 'token-trakt', 'tmdb-key', 'global', config);
        expect(syncAllStremioData).toHaveBeenCalledTimes(1); // ← non riparte
    });

    it('la parte Trakt resta governata dalla regola delle 12 ore', async () => {
        // Il profilo non è scaduto: getHybridCatalog non chiama neppure il sync.
        // Qui si verifica il confine: con lastUpdated vecchio di 13 ore il sync parte.
        const TasteProfile = require('../src/models/TasteProfile');
        TasteProfile.findOne.mockResolvedValueOnce({ lastUpdated: new Date(Date.now() - 13 * H), dna: {} });
        TasteProfile.updateOne.mockClear();

        await syncIncrementalRecommendations('u2', 'movie', 'token-trakt', 'tmdb-key', 'global', userConfigDa());
        expect(TasteProfile.updateOne).toHaveBeenCalled();
    });

    it('intervallo assente: il default di 8 ore tiene (dopo 7 ore niente, dopo 9 sì)', () => {
        const now = Date.now();
        expect(isStremioSyncDueForUser(userConfigDa({ lastStremioSync: new Date(now - 7 * H) }))).toBe(false);
        expect(isStremioSyncDueForUser(userConfigDa({ lastStremioSync: new Date(now - 9 * H) }))).toBe(true);
    });

    it('segue l\'intervallo dichiarato, non le 12 ore del profilo', () => {
        const now = Date.now();
        // 10h fa, intervallo dichiarato 11h: non dovuto
        expect(isStremioSyncDueForUser(userConfigDa({
            lastStremioSync: new Date(now - 10 * H), nextSyncInterval: 11 * H
        }))).toBe(false);
        // 10h fa, intervallo dichiarato 9h: dovuto
        expect(isStremioSyncDueForUser(userConfigDa({
            lastStremioSync: new Date(now - 10 * H), nextSyncInterval: 9 * H
        }))).toBe(true);
    });

    it('accetta sia il percorso piatto sia la config annidata', () => {
        const now = Date.now();
        expect(isStremioSyncDueForUser({
            config: { lastStremioSync: new Date(now - 1 * H), nextSyncInterval: 8 * H }
        })).toBe(false);
        expect(isStremioSyncDueForUser(null)).toBe(true);
    });
});
