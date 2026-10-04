/**
 * tests/catalogCacheKeys.test.js
 *
 * Ticket 47 — le due chiavi della cache dei cataloghi.
 *
 * La chiave di oggi contiene tutto: contenuto e presentazione, utente compreso. Per
 * `preset_adult_animation` in produzione esistono **20 chiavi distinte** che contengono la stessa
 * lista di titoli, perché ogni profilo ne crea una sua.
 *
 * La separazione serve a questo:
 *  - `buildCatalogContentKey` → cosa entra nel catalogo. **Uguale** per profili diversi: è la chiave
 *    della selezione (livello 1), che si può condividere.
 *  - `buildCatalogCacheKey`  → contenuto + chi guarda e come. **Diversa** per profili diversi: è la
 *    chiave del formato (livello 2), che resta per profilo.
 *
 * Questi test difendono la proprietà, non l'implementazione: se qualcuno rimette `user` nel
 * contenuto, il primo test diventa rosso e spiega perché.
 */

const { buildCatalogCacheKey, buildCatalogContentKey } = require('../src/handlers/catalogHandler');

const CATALOGO = { id: 'preset_adult_animation', type: 'series' };
const DEFINIZIONE = { id: 'preset_adult_animation', type: 'series', name: 'Adult Animation' };

const utente = (userId, profileId, extra = {}) => ({
    userId,
    activeProfileId: profileId,
    ...extra
});

const chiavi = (userConfig, activeProfileSettings = {}) => ({
    content: buildCatalogContentKey({
        ...CATALOGO,
        catalogMeta: DEFINIZIONE,
        activeProfileSettings
    }),
    format: buildCatalogCacheKey({
        ...CATALOGO,
        catalogMeta: DEFINIZIONE,
        userConfig,
        activeProfileSettings
    })
});

describe('le due chiavi della cache dei cataloghi (ticket 47)', () => {
    test('il CONTENUTO e\' lo stesso per due profili diversi', () => {
        const a = chiavi(utente('REOZrGNRr3', 'global'));
        const b = chiavi(utente('ALTROUTENTE', 'cinema-autore'));
        expect(a.content).toBe(b.content);
    });

    test('il FORMATO e\' diverso per due profili diversi', () => {
        const a = chiavi(utente('REOZrGNRr3', 'global'));
        const b = chiavi(utente('ALTROUTENTE', 'cinema-autore'));
        expect(a.format).not.toBe(b.format);
    });

    test('il contenuto cambia quando cambia cosa entra nel catalogo', () => {
        const base = chiavi(utente('u', 'global'));
        const kids = chiavi(utente('u', 'global'), { kidsMode: true });
        const selectors = chiavi(utente('u', 'global'), { typeSelectors: { kind: 'series' } });
        expect(kids.content).not.toBe(base.content);
        expect(selectors.content).not.toBe(base.content);
    });

    test('la presentazione NON tocca il contenuto', () => {
        const base = chiavi(utente('u', 'global'));
        const landscape = chiavi(utente('u', 'global'), { isLandscapeEnabled: true });
        // Il poster orizzontale è presentazione: cambia il formato, non la selezione.
        expect(landscape.content).toBe(base.content);
        expect(landscape.format).not.toBe(base.format);
    });

    test('la versione dei badge NON tocca il contenuto', () => {
        const args = { ...CATALOGO, catalogMeta: DEFINIZIONE, userConfig: utente('u', 'global') };
        const v18 = buildCatalogCacheKey({ ...args, badgeVersion: 18 });
        const v19 = buildCatalogCacheKey({ ...args, badgeVersion: 19 });
        const content18 = buildCatalogContentKey({ ...args, badgeVersion: 18 });
        const content19 = buildCatalogContentKey({ ...args, badgeVersion: 19 });
        expect(v18).not.toBe(v19);            // il badge è presentazione: invalida il formato
        expect(content18).toBe(content19);    // la selezione non si tocca
    });

    test('la chiave del formato e\' quella di sempre: hash congelato', () => {
        // La separazione NON deve invalidare la cache esistente: il `formatKey` composto con gli
        // stessi ingredienti di prima deve produrre lo stesso hash di `main`. Questo valore è
        // stato calcolato su `main` il 04/10/2026, prima della separazione. Se cambia, la cache
        // di tutti i cataloghi si svuota — e nessuno se ne accorgerebbe guardando il codice.
        const format = chiavi(utente('REMO', 'global'), { kidsMode: true, typeSelectors: { kind: 'series' } });
        const conBadge19 = buildCatalogCacheKey({
            ...CATALOGO,
            catalogMeta: DEFINIZIONE,
            userConfig: { userId: 'REMO', activeProfileId: 'global' },
            activeProfileSettings: { kidsMode: true, typeSelectors: { kind: 'series' } },
            badgeVersion: 19
        });
        expect(conBadge19).toBe('cabf1514f87ca941c5ffc2822142b369c0c8088dbd13253e14d9c587e0ddcbd0');
        // `chiavi()` non passa badgeVersion: usa il default, che oggi è 19.
        expect(format.format).toBe(conBadge19);
    });
});
