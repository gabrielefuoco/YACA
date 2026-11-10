/**
 * tests/profileBuilder.test.js
 *
 * Il costruttore di profilo non scrive più cronologia: `appendToHistory` e
 * `registraVisione` sono state rimosse insieme al fan-out. La scrittura della
 * cronologia passa da `syncUserHistory` (Trakt) e `syncStremioData` (Stremio),
 * provate dai loro test. Qui resta il controllo che il modulo sia caricabile e
 * che non esponga più i vecchi ingressi.
 */

const ProfileBuilder = require('../src/profile/ProfileBuilder');

jest.mock('../src/models/TasteProfile');
jest.mock('../src/library/models/WatchHistory');

describe('ProfileBuilder', () => {
    it('non espone più appendToHistory', () => {
        expect(ProfileBuilder.appendToHistory).toBeUndefined();
    });

    it('non espone più il fan-out sui contesti', () => {
        expect(ProfileBuilder._resolveAllContexts).toBeUndefined();
    });

    it('legge i dati di visione da Stremio invece di inventarli', () => {
        const dati = ProfileBuilder.datiVisioneDaStremio({
            state: { lastWatched: '2026-05-29T19:51:21.453Z', timesWatched: 2 }
        });
        expect(dati.ultima.toISOString()).toBe('2026-05-29T19:51:21.453Z');
        expect(dati.conteggio).toBe(2);
    });
});
