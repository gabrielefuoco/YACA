#!/usr/bin/env node
/**
 * Migration Script: Encrypt plaintext API keys in MongoDB using AES-256-GCM.
 * 
 * Usage:
 *   MASTER_ENCRYPTION_KEY=<base64-32bytes> MONGODB_URI=<uri> node scripts/migrate-encrypt-keys.js
 * 
 * This script:
 * 1. Connects to MongoDB
 * 2. Iterates all UserConfig documents
 * 3. Checks each sensitive field — if plaintext (not in IV:Tag:CipherText format), encrypts it
 * 4. Updates the document in-place
 * 
 * Safe to run multiple times (idempotent) — already-encrypted values are skipped.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { encryptIfNeeded, isEncrypted, getMasterKey } = require('../src/utils/encryption');

const SENSITIVE_FIELDS = [
    'apiKeys.tmdb',
    'apiKeys.trakt',
    'apiKeys.traktRefreshToken',
    'apiKeys.mistral',
    'apiKeys.mdblist',
    'apiKeys.stremio',
    'apiKeys.stremioPass'
];

async function migrate() {
    // Validate encryption key
    const key = getMasterKey();
    if (!key) {
        console.error('❌ MASTER_ENCRYPTION_KEY non configurata o non valida (deve essere 32 byte in base64).');
        process.exit(1);
    }

    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI non configurata. Imposta la variabile d\'ambiente.');
        process.exit(1);
    }

    console.log('🔗 Connessione a MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Connesso a MongoDB.');

    const User = mongoose.connection.collection('users');
    const cursor = User.find({});

    let total = 0;
    let updated = 0;
    let skipped = 0;

    console.log('🔄 Inizio migrazione crittografia...');

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        total++;

        const updates = {};
        let needsUpdate = false;

        for (const fieldPath of SENSITIVE_FIELDS) {
            const parts = fieldPath.split('.');
            let value = doc;
            for (const part of parts) {
                value = value?.[part];
            }

            if (value && typeof value === 'string' && value.length > 0) {
                if (!isEncrypted(value)) {
                    const encrypted = encryptIfNeeded(value);
                    updates[fieldPath] = encrypted;
                    needsUpdate = true;
                }
            }
        }

        if (needsUpdate) {
            await User.updateOne({ _id: doc._id }, { $set: updates });
            updated++;
            console.log(`  🔒 Crittografati campi per utente: ${doc.userId}`);
        } else {
            skipped++;
        }
    }

    console.log(`\n📊 Risultati migrazione:`);
    console.log(`   Totale documenti: ${total}`);
    console.log(`   Aggiornati:       ${updated}`);
    console.log(`   Già crittografati/vuoti: ${skipped}`);

    await mongoose.disconnect();
    console.log('✅ Migrazione completata.');
}

migrate().catch(err => {
    console.error('❌ Errore durante la migrazione:', err);
    process.exit(1);
});
