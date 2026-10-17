#!/usr/bin/env node
/**
 * scripts/migrate_trakt_credentials.js
 *
 * Migrazione una-tantum per unificare la credenziale Trakt in un unico blocco (Ticket 26, Decisione 5):
 * da: `UserAccount.apiKeys.trakt`, `apiKeys.traktRefreshToken`, `apiKeys.traktExpiresAt`, `UserAccount.traktStatus`
 * a:  `UserAccount.trakt: { accessToken, refreshToken, expiresAt, status: {...} }`
 *
 * Pattern libraryOrder:
 * Scrive il nuovo blocco unificato `trakt`, mantenendo il fallback di lettura
 * per le vecchie proprietà finché i dati non sono migrati.
 *
 * SICUREZZA:
 * - Di DEFAULT viene eseguito in modalità DRY-RUN (nessuna scrittura).
 * - Per applicare le modifiche su DB è necessario passare il flag esplicito:
 *     node scripts/migrate_trakt_credentials.js --apply
 * - Opzionale: filtrare per un singolo userId:
 *     node scripts/migrate_trakt_credentials.js --user=<userId>
 */

const path = require('path');
const fs = require('fs');

const envPath = fs.existsSync(path.resolve(__dirname, '../.env'))
    ? path.resolve(__dirname, '../.env')
    : path.resolve(__dirname, '../../YACA/.env');
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const { connectMongo } = require('../src/utils/mongoConnect');

async function migrateTraktCredentials(options = {}) {
    const isApply = Boolean(options.apply || process.argv.includes('--apply') || process.argv.includes('--execute'));
    const targetUserId = options.user || process.argv.find(arg => arg.startsWith('--user='))?.split('=')[1] || null;

    console.log('='.repeat(70));
    console.log('[MIGRAZIONE credenziali Trakt -> blocco unificato `trakt` (Ticket 26, Decisione 5)]');
    console.log(`MODALITÀ: ${isApply ? '⚠️  APPLICAZIONE REALE SUL DATABASE' : '🔍 DRY-RUN (Nessuna modifica verrà scritta)'}`);
    if (targetUserId) {
        console.log(`FILTRO USER: ${targetUserId}`);
    }
    console.log('='.repeat(70));

    const UserAccount = require('../src/models/UserAccount');

    const query = {
        $or: [
            { 'apiKeys.trakt': { $exists: true, $ne: null } },
            { traktStatus: { $exists: true, $ne: null } }
        ]
    };
    if (targetUserId) {
        query.userId = targetUserId;
    }

    const accounts = await UserAccount.find(query).lean();
    console.log(`Trovati ${accounts.length} account con dati Trakt legacy da analizzare.\n`);

    let accountsScanned = 0;
    let recordsMigrated = 0;

    for (const account of accounts) {
        accountsScanned++;
        const userId = account.userId;
        const legacyKeys = account.apiKeys || {};
        const legacyStatus = account.traktStatus || {};

        const existingTrakt = account.trakt || {};

        const accessToken = existingTrakt.accessToken || legacyKeys.trakt || null;
        const refreshToken = existingTrakt.refreshToken || legacyKeys.traktRefreshToken || null;
        const expiresAt = existingTrakt.expiresAt || legacyKeys.traktExpiresAt || null;

        const unifiedStatus = {
            status: existingTrakt.status?.status || legacyStatus.status || (accessToken ? 'ok' : 'not_configured'),
            lastChecked: existingTrakt.status?.lastChecked || legacyStatus.lastChecked || null,
            lastSuccess: existingTrakt.status?.lastSuccess || legacyStatus.lastSuccess || null,
            lastError: existingTrakt.status?.lastError || legacyStatus.lastError || null,
            lastErrorAt: existingTrakt.status?.lastErrorAt || legacyStatus.lastErrorAt || null,
            refreshInProgress: Boolean(existingTrakt.status?.refreshInProgress ?? legacyStatus.refreshInProgress),
            refreshLockedAt: existingTrakt.status?.refreshLockedAt || legacyStatus.refreshLockedAt || null
        };

        console.log(`  - Utente '${userId}': status=${unifiedStatus.status}, hasToken=${Boolean(accessToken)}`);

        if (isApply) {
            await UserAccount.updateOne(
                { userId },
                {
                    $set: {
                        'trakt.accessToken': accessToken,
                        'trakt.refreshToken': refreshToken,
                        'trakt.expiresAt': expiresAt ? new Date(expiresAt) : null,
                        'trakt.status': unifiedStatus
                    }
                }
            );
            recordsMigrated++;
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('RIASSUNTO MIGRAZIONE TRAKT:');
    console.log(`- Account con dati Trakt analizzati: ${accountsScanned}`);
    console.log(`- Record unificati in UserAccount:  ${isApply ? recordsMigrated : '0 (DRY-RUN)'}`);
    if (!isApply && accountsScanned > 0) {
        console.log('\nPer applicare la migrazione, riesegui con: node scripts/migrate_trakt_credentials.js --apply');
    }
    console.log('='.repeat(70));

    return { accountsScanned, recordsMigrated };
}

async function main() {
    let exitCode = 0;
    try {
        await connectMongo();
        await migrateTraktCredentials();
    } catch (err) {
        console.error('Errore critico durante la migrazione di Trakt:', err);
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
    migrateTraktCredentials
};
