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

// Explicit subdocument schema for catalog objects (created by profileProcessor).
const catalogSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: String,
    type: String,
    source: String,
    filters: mongoose.Schema.Types.Mixed,
    queries: [mongoose.Schema.Types.Mixed],
    presentation_strategy: { type: String, enum: ['popularity', 'interleave'] },
    raw_prompt: String,
    emoji: String,
    mergedFrom: [String]
}, { _id: false });

const addonConfigSchema = new mongoose.Schema({
    uuid: { type: String, required: true, unique: true, index: true },
    // REMOVED: userId — this document must remain 100% anonymous.
    // The join is done via UserAccount.addonUuid → AddonConfig.uuid.

    profiles: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        // Catalogs are objects created by profileProcessor: { id, name, type }
        catalogs: [catalogSchema],
        settings: {
            language: String,
            includeAdult: Boolean,
            kidsMode: Boolean,
            fastPresetRefresh: Boolean,
            region: String,
            tmdbKey: String,
            manualDNA: [mongoose.Schema.Types.Mixed],
            suggestedDNA: [mongoose.Schema.Types.Mixed]
        },
        raw_ui_state: mongoose.Schema.Types.Mixed, // Ok to leave Mixed for frontend UI state

        // DNA: Inferred taste traits from ProfileBuilder.
        // Uses Map<String, Number> so Mongoose validates that all scores are numeric.
        dna: {
            genres: { type: Map, of: Number },
            keywords: { type: Map, of: Number },
            networks: { type: Map, of: Number },
            companies: { type: Map, of: Number }
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
