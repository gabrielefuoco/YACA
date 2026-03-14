const mongoose = require('mongoose');
const { encryptIfNeeded, decryptSafe, getMasterKey } = require('../../utils/encryption');

/**
 * Creates a Mongoose schema type descriptor with transparent AES-256-GCM encryption.
 * The `set` function encrypts on write; the `get` function decrypts on read.
 */
function encryptedString() {
    return {
        type: String,
        set: function (val) {
            if (!val || typeof val !== 'string' || val.length === 0) return val;
            getMasterKey();
            return encryptIfNeeded(val);
        },
        get: function (val) {
            if (!val || typeof val !== 'string' || val.length === 0) return val;
            getMasterKey();
            return decryptSafe(val);
        }
    };
}

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
    // Chiavi API crittografate con AES-256-GCM (trasparente via getter/setter)
    apiKeys: {
        tmdb: encryptedString(),
        trakt: encryptedString(), // Access Token
        traktRefreshToken: encryptedString(),
        mistral: encryptedString(),
        mdblist: encryptedString(),
        stremio: encryptedString()
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
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

userSchema.index({ 'apiKeys.stremio': 1 }, { unique: true, sparse: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
