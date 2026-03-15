const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * UserAccount: The "Vault" of secrets.
 * Manages human authentication and stores API keys securely.
 * This collection must NEVER be queried directly by public Stremio routes.
 *
 * Primary Key: userId (internal, for backward compatibility).
 * Lookup Key: addonUuid (UUID v4, used to join with AddonConfig).
 */
const userAccountSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true, index: true },
    addonUuid: {
        type: String,
        unique: true,
        index: true,
        default: () => crypto.randomUUID()
    },
    apiKeys: {
        stremio: String,
        tmdb: String,
        mistral: String,
        trakt: String,
        traktRefreshToken: String,
        mdblist: String
    }
}, { timestamps: true });

module.exports = mongoose.models.UserAccount || mongoose.model('UserAccount', userAccountSchema);
