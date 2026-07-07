const mongoose = require('mongoose');

const tmdbToKitsuMappingSchema = new mongoose.Schema({
    tmdbId: {
        type: String,
        required: true,
        index: true,
        unique: true
    },
    kitsuId: {
        type: String, // "12345"
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('TmdbToKitsuMapping', tmdbToKitsuMappingSchema);
