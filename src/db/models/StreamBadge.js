const mongoose = require('mongoose');

const streamBadgeSchema = new mongoose.Schema({
    baseId: { type: String, required: true, index: true },
    stremioId: { type: String, required: true, unique: true, index: true },
    hasIta: { type: Boolean, required: true, default: false }
}, { timestamps: true });

module.exports = mongoose.models.StreamBadge || mongoose.model('StreamBadge', streamBadgeSchema);
