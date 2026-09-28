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
    // Compiled Vectors (pre-computed by frontend vectorEngine)
    compiledVectors: {
        V_static: { type: mongoose.Schema.Types.Mixed, default: {} },
        V_active: { type: mongoose.Schema.Types.Mixed, default: {} },
        V_final: { type: mongoose.Schema.Types.Mixed, default: {} },
        V_clusters: { type: mongoose.Schema.Types.Mixed, default: [] },
        clustersMeta: { type: mongoose.Schema.Types.Mixed, default: null },
        lastComputed: { type: Date }
    },
    // Metriche di Flatness del DNA calcolate a ogni sync/ricalcolo
    flatnessMetrics: {
        dimensions: { type: Number, default: 0 },
        sum: { type: Number, default: 0 },
        entropyBits: { type: Number, default: 0 },
        top10Share: { type: Number, default: 0 },
        lastCalculated: { type: Date }
    },
    // ID to human-readable Name mapping
    idNames: {
        type: Map,
        of: String,
        default: {}
    },
    // Sync & Onboarding
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

const TasteProfile = mongoose.models.TasteProfile || mongoose.model('TasteProfile', tasteProfileSchema);

module.exports = TasteProfile;
