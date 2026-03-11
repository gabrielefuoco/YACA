const mongoose = require('mongoose');
const crypto = require('crypto');
const { fieldEncryption } = require('mongoose-field-encryption');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        sparse: true,
        index: true
    },
    // Hash SHA-256 dell'authKey Stremio per lookup sicuro (il valore originale è crittografato)
    stremioAuthHash: {
        type: String,
        sparse: true,
        index: true
    },
    // Chiavi API salvate — crittografate a riposo via mongoose-field-encryption
    apiKeys: {
        tmdb: String,
        trakt: String, // Access Token
        traktRefreshToken: String,
        mistral: String,
        mdblist: String,
        stremio: String,
        stremioPass: String
    },
    // Configurazioni globali dell'Addon
    config: {
        activeProfileId: String,
        hideWatched: { type: Boolean, default: false },
        configVersion: { type: String, default: '1.0.0' },
        lastStremioSync: { type: Date },
        nextSyncInterval: { type: Number, default: 8 * 60 * 60 * 1000 } // Default 8h
    },
    // Profili disponibili (UI Dashboard)
    profiles: [{
        id: String,
        name: String,
        settings: {
            minVoteAverage: { type: Number, default: 0 },
            minVoteCount: { type: Number, default: 0 },
            fastPresetRefresh: { type: Boolean, default: false },
            manualDNA: [{
                type: { type: String, enum: ['genre', 'keyword', 'country'] },
                id: String,
                name: String
            }],
            suggestedDNA: [{
                type: { type: String, enum: ['genre', 'keyword', 'country'] },
                id: String,
                name: String
            }],
            pendingDNASuggestions: [{
                type: { type: String, enum: ['genre', 'keyword', 'country'] },
                id: String,
                name: String
            }]
        },
        catalogs: [{
            id: String, // Riferimento a UserList.listId o yaca_preset_*
            name: String,
            type: { type: String, enum: ['movie', 'series'] }
        }],
        raw_ui_state: { type: mongoose.Schema.Types.Mixed }
    }]
}, {
    timestamps: true
});

// Crittografia a riposo: tutti i campi sensibili in apiKeys vengono crittografati prima del salvataggio su DB
const encryptionKey = process.env.DATABASE_ENCRYPTION_KEY;
if (encryptionKey) {
    userSchema.plugin(fieldEncryption, {
        fields: [
            'apiKeys.stremio',
            'apiKeys.stremioPass',
            'apiKeys.tmdb',
            'apiKeys.trakt',
            'apiKeys.traktRefreshToken',
            'apiKeys.mistral',
            'apiKeys.mdblist'
        ],
        secret: encryptionKey,
        saltGenerator: () => crypto.randomBytes(16).toString('hex')
    });
}

// Indice per lookup sicuro via hash dell'authKey Stremio
userSchema.index({ stremioAuthHash: 1 }, { unique: true, sparse: true });

/**
 * Genera un hash SHA-256 deterministico di un valore.
 * Usato per creare stremioAuthHash a partire dall'authKey Stremio.
 */
function hashValue(value) {
    if (!value || typeof value !== 'string') return null;
    return crypto.createHash('sha256').update(value).digest('hex');
}

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.hashValue = hashValue;
