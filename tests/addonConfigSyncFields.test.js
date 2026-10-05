const AddonConfig = require('../src/db/models/AddonConfig');

/**
 * `updateSyncTimestamp` (src/utils/stremioAddon.js) scrive tre percorsi che devono esistere anche
 * nello schema: se mancano, mongoose in strict mode li elimina dall'update, l'update resta vuoto e
 * MongoDB rifiuta l'arrayFilters di `profiles.$[elem]` con
 * "The array filter for identifier 'elem' was not used in the update" — facendo fallire l'intero
 * sync (`syncAllStremioData` risponde `success: false` e il timestamp non si scrive mai).
 */
describe('AddonConfig — bookkeeping del sync Stremio', () => {
    it('dichiara i percorsi che updateSyncTimestamp scrive', () => {
        expect(AddonConfig.schema.path('config.lastStremioSync')).toBeDefined();
        expect(AddonConfig.schema.path('config.nextSyncInterval')).toBeDefined();
        expect(AddonConfig.schema.path('profiles.settings.lastSync')).toBeDefined();
    });

    it('conserva i valori su un documento nuovo', () => {
        const quando = new Date('2026-10-05T12:00:00.000Z');
        const doc = new AddonConfig({
            uuid: 'test-uuid-sync',
            profiles: [{ id: 'p1', name: 'Profilo', settings: { lastSync: quando } }],
            config: { activeProfileId: 'p1', lastStremioSync: quando, nextSyncInterval: 28800000 }
        });

        const salvato = doc.toObject();
        expect(salvato.config.lastStremioSync).toEqual(quando);
        expect(salvato.config.nextSyncInterval).toBe(28800000);
        expect(salvato.profiles[0].settings.lastSync).toEqual(quando);
    });
});
