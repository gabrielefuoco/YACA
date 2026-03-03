const mongoose = require('mongoose');

const badgeImageSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    imageData: {
        type: Buffer,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }
    }
}, {
    timestamps: true
});

const BadgeImage = mongoose.model('BadgeImage', badgeImageSchema);

module.exports = BadgeImage;
