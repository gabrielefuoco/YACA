const mongoose = require('mongoose');

/**
 * ProfileUiState: Modello del modulo profilo per lo stato dell'interfaccia utente (Ticket 26, Decisione 2).
 * Sposta tutto `raw_ui_state` (`selectedPresets`, `catalogOrder`, `newPrompts`, `heroPresetsInitialized`)
 * fuori da `AddonConfig.profiles.$.raw_ui_state` nel dominio del profilo.
 *
 * Chiave composta univoca: { addonUuid, profileId }.
 */
const profileUiStateSchema = new mongoose.Schema({
    addonUuid: { type: String, required: true, index: true },
    profileId: { type: String, required: true, default: 'global' },
    selectedPresets: { type: [String], default: [] },
    catalogOrder: { type: [String], default: [] },
    newPrompts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    heroPresetsInitialized: { type: Boolean, default: false }
}, {
    timestamps: true
});

profileUiStateSchema.index({ addonUuid: 1, profileId: 1 }, { unique: true });

module.exports = mongoose.models.ProfileUiState || mongoose.model('ProfileUiState', profileUiStateSchema);
