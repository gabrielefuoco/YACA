/**
 * Regressione: un salvataggio con un `activeProfileId` non più esistente non deve
 * degradare silenziosamente a `global` (è quello che ha fatto sparire i cataloghi
 * a un utente reale: il profilo attivo tornò a "global", con un manifest di 22 cataloghi).
 */
const { resolveActiveProfileId } = require('../src/api/configure/index.js');

const profiles = [{ id: 'global' }, { id: 'aaa111' }, { id: 'bbb222' }];

describe('Scelta del profilo attivo al salvataggio', () => {
    test('usa il profilo richiesto quando esiste', () => {
        expect(resolveActiveProfileId({ requested: 'bbb222', profiles, previous: 'aaa111' })).toBe('bbb222');
    });

    test('se il profilo richiesto non esiste più conserva quello salvato (mai global di default)', () => {
        expect(resolveActiveProfileId({ requested: 'zzz999', profiles, previous: 'aaa111' })).toBe('aaa111');
    });

    test('se anche il profilo salvato non esiste usa il primo profilo disponibile', () => {
        expect(resolveActiveProfileId({ requested: 'zzz999', profiles, previous: 'yyy888' })).toBe('global');
        expect(resolveActiveProfileId({ requested: null, profiles: [{ id: 'x1' }, { id: 'x2' }] })).toBe('x1');
    });

    test('senza profili ricade su global senza lanciare', () => {
        expect(resolveActiveProfileId({})).toBe('global');
        expect(resolveActiveProfileId()).toBe('global');
    });
});
