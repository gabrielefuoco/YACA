// ============================================================================
// DEPRECATED — TO BE REMOVED AFTER MIGRATION
// This legacy model mixes credentials, API keys, and public config in a single
// document. It is being replaced by the Two-Table Split:
//   - UserAccount (src/db/models/UserAccount.js) — secrets vault
//   - AddonConfig (src/db/models/AddonConfig.js) — anonymous public config
// Once the migration script has converted all existing User documents into
// UserAccount + AddonConfig pairs, this file MUST be deleted from the codebase.
// ============================================================================
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String },
    apiKeys: {
        stremio: String,
        tmdb: String,
        mistral: String,
        trakt: String,
        traktRefreshToken: String,
        mdblist: String
    },
    profiles: [{
        id: String,
        name: String,
        catalogs: mongoose.Schema.Types.Mixed,
        raw_ui_state: mongoose.Schema.Types.Mixed,
        settings: mongoose.Schema.Types.Mixed
    }],
    config: {
        activeProfileId: String,
        configVersion: String
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
