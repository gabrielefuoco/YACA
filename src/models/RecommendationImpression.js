const mongoose = require('mongoose');

const recommendationImpressionSchema = new mongoose.Schema({
    owner: {
        type: String,
        required: true,
        index: true
    },
    profileId: {
        type: String,
        required: true,
        index: true
    },
    catalogId: {
        type: String,
        required: true,
        index: true
    },
    tmdbId: {
        type: String,
        required: true,
        index: true
    },
    seenDates: [{
        type: String
    }]
}, { timestamps: true });

// Ensure we have a fast unique lookup for tracking impressions
recommendationImpressionSchema.index({ owner: 1, profileId: 1, catalogId: 1, tmdbId: 1 }, { unique: true });

module.exports = mongoose.models.RecommendationImpression || mongoose.model('RecommendationImpression', recommendationImpressionSchema);
