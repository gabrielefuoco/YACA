const mongoose = require('mongoose');

const userListSchema = new mongoose.Schema({
    owner: {
        type: String,
        required: true,
        index: true
    },
    listId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['movie', 'series'],
        default: 'movie'
    },
    sourceType: {
        type: String,
        enum: ['ai_prompt', 'manual_filter', 'manual_items', 'merged'],
        required: true
    },
    // Filtri TMDB per liste dinamiche (AI o Filtri Manuali)
    filters: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Eseguito per liste "manual_items" (singoli titoli aggiunti a mano)
    items: [{
        tmdbId: Number,
        imdbId: String,
        type: { type: String, enum: ['movie', 'series'] }
    }],
    // Per liste "merged" (unione di altre liste)
    mergedFrom: [String], // Array di listId
    // Prompt originale per liste AI
    rawPrompt: String
}, {
    timestamps: true
});

const UserList = mongoose.model('UserList', userListSchema);

module.exports = UserList;
