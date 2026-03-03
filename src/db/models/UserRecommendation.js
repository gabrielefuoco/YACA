const mongoose = require('mongoose');

const userRecommendationSchema = new mongoose.Schema({
    owner: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['movie', 'series'],
        required: true
    },
    // ID degli ultimi contenuti visti (Trakt Ids o TMDB Ids) usati per generare raccomandazioni
    historyIds: [{
        type: String
    }],
    // Elenco degli ID raccomandati (TMDB IDs)
    recommendationIds: [{
        type: String
    }],
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indice unico Composto per utente + tipo
userRecommendationSchema.index({ owner: 1, type: 1 }, { unique: true });

const UserRecommendation = mongoose.model('UserRecommendation', userRecommendationSchema);

module.exports = UserRecommendation;
