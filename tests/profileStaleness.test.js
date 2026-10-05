const { PROFILE_SYNC_INTERVAL_MS, isProfileSyncDue } = require('../src/engines/profileStaleness');

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