const mongoose = require('mongoose');

const userLibraryItemSchema = new mongoose.Schema({
    addonUuid: { type: String, required: true, index: true }, // Links to AddonConfig.uuid
    _id: { type: String, required: true }, // The stremio _id (e.g., tt1234567, kitsu:123)
    type: { type: String, required: true }, // movie, series, anime, etc.
    name: { type: String },
    poster: { type: String },
    posterShape: { type: String },
    background: { type: String },
    logo: { type: String },
    year: { type: String },
    removed: { type: Boolean, default: false },
    temp: { type: Boolean, default: false },
    _ctime: { type: Date },
    _mtime: { type: Date },
    state: { type: mongoose.Schema.Types.Mixed }, // stremio state (lastWatched, timeWatched, season, episode, etc.)
    // YACA specific mapped data (populated later or during sync)
    tmdbId: { type: Number, index: true },
    mapped: { type: Boolean, default: false }
}, { 
    timestamps: true 
});

// Compound index to quickly find user's library items by type and UUID
userLibraryItemSchema.index({ addonUuid: 1, type: 1, removed: 1, _mtime: -1 });
userLibraryItemSchema.index({ addonUuid: 1, _id: 1 }, { unique: true });

module.exports = mongoose.models.UserLibraryItem || mongoose.model('UserLibraryItem', userLibraryItemSchema);
