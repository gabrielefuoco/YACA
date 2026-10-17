const mongoose = require('mongoose');

/**
 * UserLibraryOrder: Collezione per l'ordinamento manuale dei titoli della libreria (Ticket 21).
 *
 * Sposta `libraryOrder` fuori da `AddonConfig.profiles.$.raw_ui_state` nel dominio libreria.
 * La chiave è `{ addonUuid, profileId }`.
 */
const userLibraryOrderSchema = new mongoose.Schema({
    addonUuid: { type: String, required: true, index: true },
    profileId: { type: String, required: true, default: 'global' },
    itemIds: { type: [String], default: [] }
}, {
    timestamps: true
});

userLibraryOrderSchema.index({ addonUuid: 1, profileId: 1 }, { unique: true });

const UserLibraryOrder = mongoose.models.UserLibraryOrder || mongoose.model('UserLibraryOrder', userLibraryOrderSchema);
module.exports = UserLibraryOrder;
