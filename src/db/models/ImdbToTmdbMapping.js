const mongoose = require('mongoose');

const imdbToTmdbMappingSchema = new mongoose.Schema({
    imdbId: {
        type: String, // e.g. "tt1234567"
        required: true,
        index: true,
        unique: true
    },
    tmdbId: {
        type: String, // e.g. "tmdb:12345"
        required: true
    },
    type: {
        type: String, // 'movie' or 'series'
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ImdbToTmdbMapping', imdbToTmdbMappingSchema);
