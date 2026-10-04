/**
 * tests/catalogCacheKeys.test.js
 *
 * Ticket 47 — le due chiavi della cache dei cataloghi, e chi le condivide.
 *
 * Oggi la chiave contiene tutto: contenuto e presentazione, utente compreso. Per
 * `preset_adult_animation` in produzione esistono **20 chiavi distinte** che contengono la stessa
 * lista di titoli, perché ogni profilo ne crea una sua.
 *
 * La regola, verificata il 04/10/2026 leggendo chi produce i campi:
 *  - i **preset** non portano niente dell'utente → la loro chiave non contiene `user`/`profile`;
 *  - **watchlist** (libreria personale), **hero** (DNA e `_yacaMatch`), **custom** e **merged**
 *    (che possono avere come sorgente una watchlist, `CatalogRouter.js:101-103`) restano per profilo.
 *
 * Questi test difendono la proprietà, non l'implementazione: se qualcuno rimette `user` nella
 * chiave di un preset, il secondo test diventa rosso; se lo toglie da una watchlist, il terzo.
 */

const {
    buildCatalogCacheKey,
    buildCatalogContentKey
} = require('../src/handlers/catalogHandler');

const utente = (userId, profileId) => ({ userId, activeProfileId: profileId });

const chiavi = (id, baseId, userConfig, activeProfileSettings = {}) => ({
    content: buildCatalogContentKey({
        id,
        baseId,
        type: 'series',
        catalogMeta: { id: baseId, type: 'series', name: baseId },
        userConfig,
        activeProfileSettings
    }),
    format: buildCatalogCacheKey({
        id,
        baseId,
        type: 'series',
        catalogMeta: { id: baseId, type: 'series', name: baseId },
        userConfig,
        activeProfileSettings
    })
});

// Un preset vero (sta in `getPresets()`), e tre cataloghi che non lo sono.
const PRESET = ['yaca_preset_preset_adult_animation', 'preset_adult_animation'];
const WATCHLIST = ['yaca_watchlist_series', 'yaca_watchlist_series'];
const HERO = ['yaca_true_blend_movies', 'yaca_true_blend_movies'];
const MERGED = ['yaca_merged_qualcosa', 'merged_qualcosa'];

describe('le due chiavi della cache dei cataloghi (ticket 47)', () => {
    test('un PRESET: contenuto e formato identici per due profili diversi', () => {
        const a = chiavi(...PRESET, utente('REOZrGNRr3', 'global'));
        const b = chiavi(...PRESET, utente('ALTROUTENTE', 'cinema-autore'));
        expect(a.content).toBe(b.content);
        // È il guadagno: le 20 chiavi di adult_animation diventano 1.
        expect(a.format).toBe(b.format);
    });

    test('una WATCHLIST resta per profilo', () => {
        const a = chiavi(...WATCHLIST, utente('REOZrGNRr3', 'global'));
        const b = chiavi(...WATCHLIST, utente('ALTROUTENTE', 'cinema-autore'));
        expect(a.format).not.toBe(b.format);
        expect(a.content).not.toBe(b.content);
    });

    test('un HERO resta per profilo (DNA e _yacaMatch)', () => {
        const a = chiavi(...HERO, utente('REOZrGNRr3', 'global'));
        const b = chiavi(...HERO, utente('ALTROUTENTE', 'cinema-autore'));
        expect(a.format).not.toBe(b.format);
    });

    test('un MERGED resta per profilo (può avere una watchlist come sorgente)', () => {
        const a = chiavi(...MERGED, utente('REOZrGNRr3', 'global'));
        const b = chiavi(...MERGED, utente('ALTROUTENTE', 'cinema-autore'));
        expect(a.format).not.toBe(b.format);
    });

    test('il contenuto cambia quando cambia cosa entra nel catalogo', () => {
        const base = chiavi(...PRESET, utente('u', 'global'));
        const kids = chiavi(...PRESET, utente('u', 'global'), { kidsMode: true });
        const selectors = chiavi(...PRESET, utente('u', 'global'), { typeSelectors: { kind: 'series' } });
        expect(kids.content).not.toBe(base.content);
        expect(selectors.content).not.toBe(base.content);
    });

    test('la presentazione NON tocca il contenuto', () => {
        const base = chiavi(...PRESET, utente('u', 'global'));
        const landscape = chiavi(...PRESET, utente('u', 'global'), { isLandscapeEnabled: true });
        expect(landscape.content).toBe(base.content);
        expect(landscape.format).not.toBe(base.format);
    });

    test('la versione dei badge NON tocca il contenuto', () => {
        const args = {
            id: PRESET[0], baseId: PRESET[1], type: 'series',
            catalogMeta: { id: PRESET[1], type: 'series' },
            userConfig: utente('u', 'global')
        };
        expect(buildCatalogCacheKey({ ...args, badgeVersion: 18 }))
            .not.toBe(buildCatalogCacheKey({ ...args, badgeVersion: 19 }));
        expect(buildCatalogContentKey({ ...args, badgeVersion: 18 }))
            .toBe(buildCatalogContentKey({ ...args, badgeVersion: 19 }));
    });

    test('per un catalogo NON condiviso la chiave è quella di sempre: hash congelato', () => {
        // Guardia: togliere `user`/`profile` dai preset è voluto, toglierli altrove no. Questo hash
        // è stato calcolato **su `main`** il 04/10/2026, prima di ogni modifica, per una watchlist.
        // Verificato identico sul ramo: per i cataloghi non condivisi la chiave non è cambiata di un
        // byte, quindi la loro cache non si svuota. Se questo test diventa rosso, si svuota — e dal
        // codice non si vedrebbe.
        const format = chiavi(...WATCHLIST, utente('REMO', 'global'), {
            kidsMode: true,
            typeSelectors: { kind: 'series' }
        }).format;
        expect(format).toBe('7eca66a53c7781eb065017a74046c4e1091b8481977c5fa0656462233c2e7cd0');
    });
});
