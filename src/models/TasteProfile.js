const mongoose = require('mongoose');

const tasteProfileSchema = new mongoose.Schema({
    owner: {
        type: String,
        required: true,
        index: true
    },
    // Contesto del profilo (es. 'global', o ID del preset)
    context: {
        type: String,
        default: 'global',
        required: true,
        index: true
    },
    // Influenza di Trakt (0-100) - Vecchio campo per compatibilità
    traktInfluence: {
        type: Number,
        default: 30,
        min: 0,
        max: 100
    },
    // Nuovi Pesi Granulari (Default 1.0)
    tmdbWeight: {
        type: Number,
        default: 1.0,
        min: 0
    },
    traktWeight: {
        type: Number,
        default: 1.0,
        min: 0
    },
    // Punteggi per asse (Map di ID/Nome -> Punteggio)
    genreScores: {
        type: Map,
        of: Number,
        default: {}
    },
    keywordScores: {
        type: Map,
        of: Number,
        default: {}
    },
    directorScores: {
        type: Map,
        of: Number,
        default: {}
    },
    actorScores: {
        type: Map,
        of: Number,
        default: {}
    },
    studioScores: {
        type: Map,
        of: Number,
        default: {}
    },
    eraScores: {
        type: Map,
        of: Number,
        default: {}
    },
    countryScores: {
        type: Map,
        of: Number,
        default: {}
    },
    runtimeScores: {
        type: Map,
        of: Number,
        default: {}
    },
    // ID to human-readable Name mapping
    idNames: {
        type: Map,
        of: String,
        default: {}
    },
    syncStatus: {
        isSyncing: { type: Boolean, default: false },
        total: { type: Number, default: 0 },
        current: { type: Number, default: 0 },
        lastSync: { type: Date }
    },
    onboardingCompleted: { 
        type: Boolean, 
        default: false 
    },
    // Elenco ID già processati per evitare ricalcoli
    processedTraktIds: [{
        type: String
    }],
    processedStremioIds: [{
        type: String
    }],
    signatureTitles: {
        core: { type: String, default: null },
        blend: { type: String, default: null },
        star: { type: String, default: null }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indice unico composto per utente + contesto
tasteProfileSchema.index({ owner: 1, context: 1 }, { unique: true });

const TasteProfile = mongoose.model('TasteProfile', tasteProfileSchema);

module.exports = TasteProfile;
