const mongoose = require('mongoose');

/**
 * AddonConfig: The read-only profile for Stremio.
 * Exposes addon configuration to Stremio safely.
 * If this URL is shared, no sensitive data is compromised.
 *
 * Primary Key: uuid (corresponds to addonUuid in UserAccount).
 */
const addonConfigSchema = new mongoose.Schema({
    uuid: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
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
    },
    syncStatus: {
        isSyncing: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        current: { type: Number, default: 0 },
        lastSync: Date
    }
}, { timestamps: true });

module.exports = mongoose.models.AddonConfig || mongoose.model('AddonConfig', addonConfigSchema);
