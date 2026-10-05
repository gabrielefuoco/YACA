const mongoose = require('mongoose');

const userLibraryItemSchema = new mongoose.Schema({
    addonUuid: { type: String, required: true, index: true }, // Links to AddonConfig.uuid
    itemId: { type: String, required: true }, // The stremio _id (e.g., tt1234567, kitsu:123)
    type: { type: String, required: true }, // movie, series, anime, etc.
    name: { type: String },
    poster: { type: String },
    posterShape: { type: String },
    background: { type: String },
    logo: { type: String },
    year: { type: String },
    removed: { type: Boolean, default: false },
    temp: { type: Boolean, default: false },
    _ctime: { type: Date },
    _mtime: { type: Date },
    state: { type: mongoose.Schema.Types.Mixed }, // stremio state (lastWatched, timeWatched, season, episode, etc.)
    // YACA specific mapped data (populated later or during sync)
    tmdbId: { type: Number, index: true },
    mapped: { type: Boolean, default: false },
    // Stesso titolo presente con id diversi (tt… / tmdb:… / kitsu:…): il documento
    // secondario punta al primario e viene nascosto da dashboard e cataloghi.
    duplicateOf: { type: String, default: null },
    // Tetto ai tentativi di conversione (src/services/libraryConversionRetry.js):
    // quanti giri ha fallito questo item e, se sono finiti, quando e perché è stato
    // parcheggiato. Sono dati: rimetterlo in giro è azzerarli, nessun codice da toccare.
    // `parkedAt` è il campo che distingue «parcheggiato» da «ancora in coda»
    // (entrambi hanno mapped: false), e «parcheggiato» da «convertito» (mapped: true).
    conversionAttempts: { type: Number, default: 0 },
    parkedAt: { type: Date, default: null },
    parkedReason: { type: String, default: null }
}, { 
    timestamps: true 
});

userLibraryItemSchema.index({ addonUuid: 1, type: 1, removed: 1, _mtime: -1 });
userLibraryItemSchema.index({ addonUuid: 1, duplicateOf: 1 });
userLibraryItemSchema.index({ addonUuid: 1, itemId: 1 }, { unique: true });

const UserLibraryItem = mongoose.models.UserLibraryItem || mongoose.model('UserLibraryItem', userLibraryItemSchema);

/**
 * Garanzia programmatica di verifica e creazione dell'indice all'avvio.
 * Se la collection ha duplicati legacy in produzione, intercetta l'errore senza crashare
 * e segnala la necessità di deduplica all'orchestratore.
 */
UserLibraryItem.ensureIndexesSafe = async function() {
    try {
        await UserLibraryItem.init();
    } catch (err) {
        console.warn('[UserLibraryItem] Notice on index initialization:', err.message);
    }
};

module.exports = UserLibraryItem;
