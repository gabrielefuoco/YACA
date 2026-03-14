const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String },
    apiKeys: {
        stremio: String,
        tmdb: String,
        mistral: String,
        trakt: String,
        traktRefreshToken: String,
        mdblist: String
    },
    profiles: [{
        id: String,
        name: String,
        settings: mongoose.Schema.Types.Mixed
    }],
    config: {
        activeProfileId: String,
        configVersion: String
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
