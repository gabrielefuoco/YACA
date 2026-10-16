/**
 * Backward compatibility shim.
 * The canonical WatchHistory model moved to src/library/models/WatchHistory.js (Ticket 15).
 * Kept for callers transitioning to the library module and ingestion services (Ticket 16).
 */
module.exports = require('../library/models/WatchHistory');
