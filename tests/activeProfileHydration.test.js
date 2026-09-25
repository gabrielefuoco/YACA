/**
 * Regressione: dopo un refresh il dashboard tornava sempre sul profilo "Generale".
 *
 * Causa: l'effetto che sincronizza la configurazione del backend conservava il valore
 * precedente invece di applicare il profilo attivo salvato (arrivava dal backend ma
 * non veniva mai usato).
 *
 * Il modulo è TypeScript: viene traspilato al volo (stesso approccio di dnaChartGrouping).
 */
const fs = require('fs');
const path = require('path');

let ts;
try {
    ts = require('../frontend/node_modules/typescript');
} catch (e) {
    ts = require('typescript');
}

function loadUtils() {
    const source = fs.readFileSync(path.resolve(__dirname, '../frontend/src/lib/utils.ts'), 'utf8');
    const transpiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS }
    }).outputText;

    const moduleObj = { exports: {} };
    const customRequire = (id) => {
        try {
            return require(id);
        } catch (err) {
            return require(path.resolve(__dirname, '../frontend/node_modules', id));
        }
    };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', transpiled)(moduleObj, moduleObj.exports, customRequire);
    return moduleObj.exports;
}

const profiles = [{ id: 'global' }, { id: 'otaku111' }, { id: 'serie222' }];

describe('Profilo attivo dopo il caricamento dal backend', () => {
    let resolveHydratedActiveProfile;

    beforeAll(() => {
        const utils = loadUtils();
        expect(typeof utils.resolveHydratedActiveProfile).toBe('function');
        resolveHydratedActiveProfile = utils.resolveHydratedActiveProfile;
    });

    test('applica il profilo attivo salvato invece del default globale', () => {
        const { activeId, appliedIncoming } = resolveHydratedActiveProfile({
            incomingActiveId: 'otaku111',
            profiles,
            previousActiveId: 'global',
        });

        expect(activeId).toBe('otaku111');
        expect(appliedIncoming).toBe(true);
    });

    test('non sovrascrive la scelta dell utente se il valore è già stato applicato', () => {
        const { activeId, appliedIncoming } = resolveHydratedActiveProfile({
            incomingActiveId: 'otaku111',
            profiles,
            previousActiveId: 'serie222', // l'utente ha appena cambiato profilo
            alreadyAppliedIncomingId: 'otaku111',
        });

        expect(activeId).toBe('serie222');
        expect(appliedIncoming).toBe(false);
    });

    test('se il profilo salvato non esiste più resta il precedente valido', () => {
        const { activeId } = resolveHydratedActiveProfile({
            incomingActiveId: 'rimosso999',
            profiles,
            previousActiveId: 'global',
        });

        expect(activeId).toBe('global');
    });

    test('se né il profilo salvato né il precedente esistono usa il primo disponibile', () => {
        const { activeId } = resolveHydratedActiveProfile({
            incomingActiveId: 'rimosso999',
            profiles,
            previousActiveId: 'rimosso888',
        });

        expect(activeId).toBe('global');
    });

    test('senza profili non lancia e restituisce null', () => {
        expect(resolveHydratedActiveProfile({ profiles: [], previousActiveId: 'global' }).activeId).toBeNull();
        expect(resolveHydratedActiveProfile({}).activeId).toBeNull();
    });
});
