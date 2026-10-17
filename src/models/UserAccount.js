const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * UserAccount: Modello di configurazione utente (Ticket 26).
 * Posseduto dal modulo configurazione (`src/configurazione/`).
 * Custodisce l'identità dell'utente (`userId`, `addonUuid`), le chiavi API
 * e il blocco unico delle credenziali Trakt.
 *
 * La password esce da qui e vive in UserCredentials (auth).
 * Lo stato UI esce da qui e vive in ProfileUiState (profilo).
 *
 * Primary Key: userId (internal identifier).
 * Lookup Key: addonUuid (UUID v4, used to join with AddonConfig).
 */
const userAccountSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    // Fallback di lettura per la migrazione a UserCredentials (Ticket 26, Decisione 1)
    passwordHash: { type: String },
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
        traktExpiresAt: Date
    },
    // Blocco unico credenziali e salute Trakt (Ticket 26, Decisione 5)
    trakt: {
        accessToken: String,
        refreshToken: String,
        expiresAt: Date,
        status: {
            status: {
                type: String,
                enum: ['ok', 'degraded', 'requires_reauth', 'not_configured', 'unknown'],
                default: 'unknown'
            },
            lastChecked: Date,
            lastSuccess: Date,
            lastError: String,
            lastErrorAt: Date,
            refreshInProgress: Boolean,
            refreshLockedAt: Date
        }
    },
    // Fallback di lettura per la forma precedente di Trakt (Ticket 26, Decisione 5)
    traktStatus: {
        status: {
            type: String,
            enum: ['ok', 'degraded', 'requires_reauth', 'not_configured', 'unknown'],
            default: 'unknown'
        },
        lastChecked: Date,
        lastSuccess: Date,
        lastError: String,
        lastErrorAt: Date,
        refreshInProgress: Boolean,
        refreshLockedAt: Date
    }
}, { timestamps: true });

module.exports = mongoose.models.UserAccount || mongoose.model('UserAccount', userAccountSchema);
