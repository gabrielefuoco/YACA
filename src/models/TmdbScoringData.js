const mongoose = require('mongoose');

/**
 * Scoring Cache Perenne (CQRS Pattern)
 * Memorizza solo lo scheletro dei metadati necessari all'algoritmo matematico.
 * Nessuna scadenza TTL: generi e keyword non cambiano; solo i voti vengono aggiornati silenziosamente.
 */
const tmdbScoringDataSchema = new mongoose.Schema({
    tmdbId: { type: Number, required: true },
    imdbId: { type: String, default: null },
    type: { type: String, enum: ['movie', 'tv'], required: true },
    vote_average: { type: Number, default: 0 },
    vote_count: { type: Number, default: 0 },
    genre_ids: { type: [Number], default: [] },
    keyword_ids: { type: [Number], default: [] },
    director_ids: { type: [Number], default: [] },
    cast_ids: { type: [Number], default: [] },
    logo_path: { type: String, default: null },
    needsEnrichment: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null }
}, { timestamps: true });

// Indici per query rapide
tmdbScoringDataSchema.index({ tmdbId: 1, type: 1 }, { unique: true });
tmdbScoringDataSchema.index({ imdbId: 1 });
tmdbScoringDataSchema.index({ needsEnrichment: 1, lockedUntil: 1 });

module.exports = mongoose.model('TmdbScoringData', tmdbScoringDataSchema);
