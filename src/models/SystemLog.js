const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
    context: {
        type: String,
        required: true,
        index: true
    },
    message: {
        type: String,
        required: true
    },
    level: {
        type: String,
        enum: ['info', 'warning', 'error'],
        default: 'error',
        index: true
    },
    meta: {
        type: mongoose.Schema.Types.Mixed
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // Documento scade esattamente alla data expiresAt
    }
}, {
    timestamps: true
});

const SystemLog = mongoose.model('SystemLog', systemLogSchema);

module.exports = SystemLog;
