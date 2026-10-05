const {
    PROFILE_SYNC_INTERVAL_MS,
    isProfileSyncDue,
    STREMMIO_SYNC_INTERVAL_MS,
    isStremioSyncDue
} = require('../src/engines/profileStaleness');

describe('isProfileSyncDue', () => {
    const NOW = new Date('2026-10-05T12:00:00.000Z').getTime();
    const H = 60 * 60 * 1000;

    it('mai aggiornato: il sync è dovuto subito', () => {
        expect(isProfileSyncDue(null, NOW)).toBe(true);
        expect(isProfileSyncDue(undefined, NOW)).toBe(true);
        expect(isProfileSyncDue('', NOW)).toBe(true);
    });

    it('appena aggiornato: non è dovuto', () => {
        expect(isProfileSyncDue(new Date(NOW - 60 * 1000), NOW)).toBe(false);
        expect(isProfileSyncDue(new Date(NOW - (PROFILE_SYNC_INTERVAL_MS - H)), NOW)).toBe(false);
    });

    it('esattamente al confine: NON ancora dovuto (>)', () => {
        expect(isProfileSyncDue(new Date(NOW - PROFILE_SYNC_INTERVAL_MS), NOW)).toBe(false);
    });

    it('ben oltre il confine: dovuto', () => {
        expect(isProfileSyncDue(new Date(NOW - (PROFILE_SYNC_INTERVAL_MS + 1)), NOW)).toBe(true);
        expect(isProfileSyncDue(new Date(NOW - (30 * 24 * H)), NOW)).toBe(true);
    });

    it('accetta stringhe, numeri e un intervallo passato esplicitamente', () => {
        expect(isProfileSyncDue('2026-10-05T11:00:00.000Z', '2026-10-05T12:00:00.000Z')).toBe(false);
        expect(isProfileSyncDue(NOW - 1000, NOW, 500)).toBe(true);
    });

    it('la soglia di default resta 12 ore', () => {
        expect(PROFILE_SYNC_INTERVAL_MS).toBe(12 * 60 * 60 * 1000);
    });
});

describe('isStremioSyncDue', () => {
    const NOW = new Date('2026-10-05T12:00:00.000Z').getTime();
    const H = 60 * 60 * 1000;

    it('mai sincronizzato: il sync Stremio è dovuto subito', () => {
        expect(isStremioSyncDue(null, NOW)).toBe(true);
        expect(isStremioSyncDue(undefined, NOW)).toBe(true);
        expect(isStremioSyncDue('', NOW)).toBe(true);
        expect(isStremioSyncDue('non-una-data', NOW)).toBe(true);
    });

    it('appena sincronizzato: NON è dovuto (la prova del ticket)', () => {
        expect(isStremioSyncDue(new Date(NOW - 60 * 1000), NOW, 8 * H)).toBe(false);
    });

    it('esattamente al confine: NON ancora dovuto (>)', () => {
        expect(isStremioSyncDue(new Date(NOW - 8 * H), NOW, 8 * H)).toBe(false);
    });

    it('oltre l\'intervallo dichiarato: dovuto', () => {
        expect(isStremioSyncDue(new Date(NOW - 8 * H - 1), NOW, 8 * H)).toBe(true);
    });

    it('segue l\'intervallo dichiarato, non le 12 ore del profilo', () => {
        const last = new Date(NOW - 10 * H);
        // 10h fa + intervallo dichiarato di 9h: dovuto, anche se le 12 ore non sono passate
        expect(isStremioSyncDue(last, NOW, 9 * H)).toBe(true);
        // 10h fa + intervallo dichiarato di 11h: non dovuto (le 12 ore del profilo non c'entrano)
        expect(isStremioSyncDue(last, NOW, 11 * H)).toBe(false);
    });

    it('intervallo assente: ricade sul default di 8 ore', () => {
        expect(STREMMIO_SYNC_INTERVAL_MS).toBe(8 * H);
        expect(isStremioSyncDue(new Date(NOW - 7 * H), NOW)).toBe(false);
        expect(isStremioSyncDue(new Date(NOW - 9 * H), NOW)).toBe(true);
    });

    it('intervallo assurdo o non numerico: torna al default, non rende il sync dovuto per sempre', () => {
        expect(isStremioSyncDue(new Date(NOW - 9 * H), NOW, 0)).toBe(true);
        expect(isStremioSyncDue(new Date(NOW - 9 * H), NOW, -5 * H)).toBe(true);
        // 'spazzatura' non è un numero: vale il default di 8 ore, non "sempre dovuto"
        expect(isStremioSyncDue(new Date(NOW - 7 * H), NOW, 'spazzatura')).toBe(false);
        expect(isStremioSyncDue(new Date(NOW - 7 * H), NOW, NaN)).toBe(false);
    });

    it('accetta stringhe e numeri, e con un now non valido non è dovuto', () => {
        expect(isStremioSyncDue('2026-10-05T11:00:00.000Z', '2026-10-05T12:00:00.000Z', 2 * H)).toBe(false);
        expect(isStremioSyncDue(NOW - 3 * H, NOW, H)).toBe(true);
        expect(isStremioSyncDue(new Date(NOW - 30 * H), 'non-una-data')).toBe(false);
    });
});