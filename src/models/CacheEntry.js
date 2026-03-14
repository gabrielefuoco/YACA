const mongoose = require('mongoose');

const cacheEntrySchema = new mongoose.Schema({
    namespace: {
        type: String,
        required: true,
        index: true
    },
    key: {
        type: String,
        required: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // Documento scade esattamente alla data expiresAt
    }
}, {
    timestamps: true
});

// Indice composto per lookup rapidi
cacheEntrySchema.index({ namespace: 1, key: 1 }, { unique: true });

const CacheEntry = mongoose.model('CacheEntry', cacheEntrySchema);

module.exports = CacheEntry;
