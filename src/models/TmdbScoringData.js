const mongoose = require('mongoose');

/**
 * @deprecated DISMESSO: La cache TmdbScoringData su MongoDB Atlas è stata pensionata a favore del parquet DuckDB nativo.
 * Non ci sono più scritture (updateScoringCache rimosso da metaHandler) né letture in MetadataHydrator.
 * Il model è mantenuto unicamente per compatibilità contrattuale con i test esistenti
 * (ad es. tests/resilienceAuditFixes.test.js) e il fallback trasparente di ProfileBuilder.js.
 * La collection 'tmdbscoringdatas' su MongoDB Atlas può essere droppata manualmente dall'utente.
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

module.exports = mongoose.models.TmdbScoringData || mongoose.model('TmdbScoringData', tmdbScoringDataSchema);
