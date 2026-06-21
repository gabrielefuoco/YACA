const mongoose = require('mongoose');

const pendingScanSchema = new mongoose.Schema({
    baseId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true }, // 'movie' or 'series'
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending', index: true }
}, { timestamps: true });

module.exports = mongoose.models.PendingScan || mongoose.model('PendingScan', pendingScanSchema);
