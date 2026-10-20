/**
 * tests/proprietaDocumenti.test.js
 *
 * TEST DI PROPRIETÀ DEI DOCUMENTI (Ticket 26, Decisione 6).
 * "Un confine dichiarato non è un confine imposto" — questo test legge il codice sorgente
 * per difendere i confini di proprietà definiti nel grilling:
 *
 * 1. Proprietà di UserAccount:
 *    Il modello UserAccount appartiene IN ESCLUSIVA al modulo configurazione (`src/configurazione/`).
 *    Nessun file al di fuori del modulo può importare direttamente UserAccount.
 *
 * 2. Proprietà di AddonConfig.profiles[]:
 *    L'anagrafica dei profili appartiene al modulo Profilo (`src/profile/`).
 *    Eventuali file esterni che leggono o scrivono `profiles` devono essere esplicitamente
 *    dichiarati nell'allowlist motivata.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

function getAllJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getAllJsFiles(fullPath, fileList);
        } else if (file.endsWith('.js')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

describe('Test di Proprietà dei Documenti (Ticket 26, Decisione 6)', () => {
    const allFiles = getAllJsFiles(SRC_DIR);

    describe('1. Confine UserAccount (Modulo Configurazione)', () => {
        /**
         * Allowlist rigorosa: solo il modulo configurazione e la definizione stessa del modello
         * possono importare UserAccount.
         */
        const ALLOWED_USER_ACCOUNT_IMPORTERS = new Set([
            'src/models/UserAccount.js',
            'src/configurazione/door.js'
        ]);

        test('nessun file fuori dal modulo configurazione importa UserAccount', () => {
            const infringements = [];

            for (const file of allFiles) {
                const relativePath = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
                if (ALLOWED_USER_ACCOUNT_IMPORTERS.has(relativePath)) {
                    continue;
                }

                const content = fs.readFileSync(file, 'utf8');
                // Cerca importazioni di UserAccount (require(.../UserAccount...))
                const importsUserAccount = /require\(['"][^'"]*models\/UserAccount['"]\)/.test(content);

                if (importsUserAccount) {
                    infringements.push(relativePath);
                }
            }

            expect(infringements).toEqual([]);
        });
    });

    describe('2. Confine Profiles[] (Modulo Profilo)', () => {
        /**
         * Allowlist esplicita e motivata per l'accesso a `profiles`:
         * Qualsiasi file esterno deve essere formalmente dichiarato qui con il suo motivo.
         */
        const ALLOWED_PROFILES_TOUCHERS = new Set([
            // Owner del dominio profili
            'src/profile/door.js',
            'src/profile/index.js',
            'src/profile/context.js',
            'src/profile/ProfileBuilder.js',
            'src/profile/ProfileScorer.js',
            'src/profile/models/ProfileUiState.js',

            // Definizione del modello schema AddonConfig
            'src/models/AddonConfig.js',
            'src/models/UserConfig.js',

            // Rotte dedicate all'anagrafica profili e configurazione
            'src/api/profiles.js',
            'src/api/profilo.js',
            'src/api/configure/index.js',
            'src/api/configure/profileProcessor.js',
            'src/api/configure/validators.js',

            // Auth: proietta i profili dell'utente sulla sessione/login
            'src/api/auth/index.js',

            // Stremio Manifest & Reconciler: legge i profili per comporre il manifest attivo
            'src/api/stremio.js',
            'src/stremio/manifest.js',
            'src/stremio/fingerprint.js',
            'src/stremio/reconciler.js',

            // Motori e cataloghi: lettura del contesto profilo attivo (activeProfileId)
            'src/stremio/catalogHandler.js',
            'src/infra/helpers.js',

            // Modello libreria per il ripiego transizionale
            'src/library/models/UserLibraryOrder.js',
            'src/library/reader.js',

            // Ticket 22: la guardia del waterfall legge `selectedPresets` del profilo attivo (quali righe
            // hero sono accese) per dire al motore fra quali deduplicare. E' la stessa lettura che fa
            // `src/stremio/manifest.js`, non una scrittura di configurazione.
            'src/pool/index.js'
        ]);

        test('i file che accedono ad AddonConfig.profiles[] appartengono all allowlist motivata', () => {
            const infringements = [];

            for (const file of allFiles) {
                const relativePath = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
                if (ALLOWED_PROFILES_TOUCHERS.has(relativePath)) {
                    continue;
                }

                const content = fs.readFileSync(file, 'utf8');
                // Cerca accessi espliciti a .profiles su oggetti di configurazione
                const touchesProfiles = /\b(addonConfig|configDoc|userConfig|existingConfig|updateData)\.profiles\b/.test(content) ||
                                       /\$set\s*:\s*\{[^}]*profiles/s.test(content);

                if (touchesProfiles) {
                    infringements.push(relativePath);
                }
            }

            expect(infringements).toEqual([]);
        });
    });

    describe('3. Confine Chiavi API da process.env (Grep a zero fuori dal modulo configurazione)', () => {
        test('nessun file fuori da src/configurazione legge direttamente process.env.*_API_KEY', () => {
            const infringements = [];

            for (const file of allFiles) {
                const relativePath = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');
                if (relativePath.startsWith('src/configurazione/')) {
                    continue;
                }

                const content = fs.readFileSync(file, 'utf8');
                // Regex per process.env.<NOME>_API_KEY
                const readsApiKey = /process\.env\.[A-Za-z0-9_]*API_KEY\b/.test(content);

                if (readsApiKey) {
                    infringements.push(relativePath);
                }
            }

            expect(infringements).toEqual([]);
        });
    });
});
