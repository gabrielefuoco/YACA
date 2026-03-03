const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    // Tipo di attività (es. 'search', 'preset_view')
    type: {
        type: String,
        enum: ['search', 'preset_view'],
        required: true
    },
    // Il prompt o l'ID del preset
    value: {
        type: String,
        required: true
    },
    // Metadati opzionali (es. filtri generati)
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indice per query veloci sulla cronologia recente
userActivitySchema.index({ userId: 1, type: 1, timestamp: -1 });

const UserActivity = mongoose.model('UserActivity', userActivitySchema);

module.exports = UserActivity;
