#!/usr/bin/env node
/**
 * scripts/migrate_user_credentials.js
 *
 * Migrazione una-tantum per estrarre la password da UserAccount (Ticket 26, Decisione 1):
 * da: `UserAccount.passwordHash`
 * a:  `UserCredentials` (`{ userId, passwordHash }`) nel dominio auth.
 *
 * Pattern libraryOrder:
 * Scrive il nuovo posto, auth mantiene il fallback di lettura sul vecchio posto
 * finché i dati non sono completamente migrati.
 *
 * SICUREZZA:
 * - Di DEFAULT viene eseguito in modalità DRY-RUN (nessuna scrittura).
 * - Per applicare le modifiche su DB è necessario passare il flag esplicito:
 *     node scripts/migrate_user_credentials.js --apply
 * - Opzionale: filtrare per un singolo userId:
 *     node scripts/migrate_user_credentials.js --user=<userId>
 */

const path = require('path');
const fs = require('fs');

const envPath = fs.existsSync(path.resolve(__dirname, '../.env'))
    ? path.resolve(__dirname, '../.env')
    : path.resolve(__dirname, '../../YACA/.env');
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const { connectMongo } = require('../src/utils/mongoConnect');

async function migrateUserCredentials(options = {}) {
    const isApply = Boolean(options.apply || process.argv.includes('--apply') || process.argv.includes('--execute'));
    const targetUserId = options.user || process.argv.find(arg => arg.startsWith('--user='))?.split('=')[1] || null;

    console.log('='.repeat(70));
    console.log('[MIGRAZIONE passwordHash -> UserCredentials (Ticket 26, Decisione 1)]');
    console.log(`MODALITÀ: ${isApply ? '⚠️  APPLICAZIONE REALE SUL DATABASE' : '🔍 DRY-RUN (Nessuna modifica verrà scritta)'}`);
    if (targetUserId) {
        console.log(`FILTRO USER: ${targetUserId}`);
    }
    console.log('='.repeat(70));

    const UserAccount = require('../src/models/UserAccount');
    const UserCredentials = require('../src/models/UserCredentials');

    const query = { passwordHash: { $exists: true, $ne: null } };
    if (targetUserId) {
        query.userId = targetUserId;
    }

    const accounts = await UserAccount.find(query).lean();
    console.log(`Trovati ${accounts.length} account con passwordHash da analizzare.\n`);

    let accountsScanned = 0;
    let recordsMigrated = 0;

    for (const account of accounts) {
        accountsScanned++;
        const { userId, passwordHash } = account;
        if (!userId || !passwordHash) continue;

        console.log(`  - Utente '${userId}': passwordHash presente (lunghezza ${passwordHash.length})`);

        if (isApply) {
            await UserCredentials.updateOne(
                { userId },
                { $set: { passwordHash } },
                { upsert: true }
            );
            recordsMigrated++;
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('RIASSUNTO MIGRAZIONE CREDENZIALI:');
    console.log(`- Account con passwordHash esaminati: ${accountsScanned}`);
    console.log(`- Record scritti in UserCredentials:   ${isApply ? recordsMigrated : '0 (DRY-RUN)'}`);
    if (!isApply && accountsScanned > 0) {
        console.log('\nPer applicare la migrazione, riesegui con: node scripts/migrate_user_credentials.js --apply');
    }
    console.log('='.repeat(70));

    return { accountsScanned, recordsMigrated };
}

async function main() {
    let exitCode = 0;
    try {
        await connectMongo();
        await migrateUserCredentials();
    } catch (err) {
        console.error('Errore critico durante la migrazione delle credenziali:', err);
        exitCode = 1;
    } finally {
        try {
            await mongoose.disconnect();
        } catch (_e) {}
        process.exit(exitCode);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    migrateUserCredentials
};
