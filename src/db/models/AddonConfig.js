const mongoose = require('mongoose');

/**
 * AddonConfig: The read-only, 100% anonymous profile for Stremio.
 * Exposes addon configuration to Stremio safely.
 * If this URL is shared, no sensitive data is compromised.
 *
 * IMPORTANT: This document is completely decoupled from user identity.
 * The relationship is strictly unidirectional:
 *   - UserAccount "knows" which UUID it owns (addonUuid).
 *   - AddonConfig only knows its own uuid.
 * When the backend needs to join, it queries:
 *   AddonConfig.findOne({ uuid: userAccount.addonUuid })
 *
 * Primary Key: uuid (corresponds to addonUuid in UserAccount).
 */
const addonConfigSchema = new mongoose.Schema({
    uuid: { type: String, required: true, unique: true, index: true },
    // REMOVED: userId — this document must remain 100% anonymous.
    // The join is done via UserAccount.addonUuid → AddonConfig.uuid.

    profiles: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        catalogs: [{ type: String }], // Array of catalog IDs (e.g. ["yaca_preset_horror"])
        settings: {
            language: String,
            includeAdult: Boolean,
            region: String,
            // Additional typed settings
            manualDNA: [mongoose.Schema.Types.Mixed],
            suggestedDNA: [mongoose.Schema.Types.Mixed]
        },
        raw_ui_state: mongoose.Schema.Types.Mixed, // Ok to leave Mixed for frontend UI state

        // DNA: Inferred taste traits from ProfileBuilder
        dna: {
            genres: mongoose.Schema.Types.Mixed,
            keywords: mongoose.Schema.Types.Mixed,
            networks: mongoose.Schema.Types.Mixed,
            companies: mongoose.Schema.Types.Mixed
        }
    }],
    config: {
        activeProfileId: String,
        configVersion: String
    },
    syncStatus: {
        isSyncing: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        current: { type: Number, default: 0 },
        lastSync: Date
    }
}, { timestamps: true });

module.exports = mongoose.models.AddonConfig || mongoose.model('AddonConfig', addonConfigSchema);
