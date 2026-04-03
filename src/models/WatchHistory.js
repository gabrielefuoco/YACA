const mongoose = require('mongoose');

/**
 * WatchHistory: Separate collection for raw viewing history.
 * Used for client-side Vector Space Model (VSM) computation.
 */
const watchHistorySchema = new mongoose.Schema({
    owner: { type: String, required: true, index: true },
    context: { type: String, required: true, index: true },  // profile id (e.g., 'global' or custom)
    tmdbId: { type: Number, required: true },
    type: { type: String, enum: ['movie', 'tv'], required: true },
    episodesWatched: { type: Number, default: 1 },
    lastWatchedAt: { type: Date, required: true },
    source: { type: String, enum: ['trakt', 'stremio', 'manual'], default: 'trakt' }
}, { timestamps: true });

// Compound index for efficient upserts (unique per user + profile + item)
watchHistorySchema.index({ owner: 1, context: 1, tmdbId: 1 }, { unique: true });

// Index for bulk queries by profile, ordered by recency
watchHistorySchema.index({ owner: 1, context: 1, lastWatchedAt: -1 });

module.exports = mongoose.models.WatchHistory || mongoose.model('WatchHistory', watchHistorySchema);
