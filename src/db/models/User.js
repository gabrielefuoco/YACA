const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        sparse: true
    },
    // Chiavi API salvate (non criptate per specifica semplificata)
    apiKeys: {
        tmdb: String,
        trakt: String, // Access Token
        traktRefreshToken: String,
        mistral: String,
        mdblist: String,
        stremio: String
    },
    // Configurazioni globali dell'Addon
    config: {
        activeProfileId: String,
        hideWatched: { type: Boolean, default: false },
        configVersion: { type: String, default: '1.0.0' }
    },
    // Profili disponibili (UI Dashboard)
    profiles: [{
        id: String,
        name: String,
        settings: {
            minVoteAverage: { type: Number, default: 0 },
            minVoteCount: { type: Number, default: 0 },
            fastPresetRefresh: { type: Boolean, default: false },
            manualPillars: [{
                type: { type: String, enum: ['genre', 'keyword', 'country'] },
                id: String,
                name: String
            }],
            suggestedPillars: [{
                type: { type: String, enum: ['genre', 'keyword', 'country'] },
                id: String,
                name: String
            }]
        },
        catalogs: [{
            id: String, // Riferimento a UserList.listId o yaca_preset_*
            name: String,
            type: { type: String, enum: ['movie', 'series'] }
        }]
    }]
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);

module.exports = User;
