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
        lastComputed: { type: Date }
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
    // Cross-profile contamination control
    excludeFromGlobal: { 
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

const TasteProfile = mongoose.model('TasteProfile', tasteProfileSchema);

module.exports = TasteProfile;
