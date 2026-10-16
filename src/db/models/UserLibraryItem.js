/**
 * Backward compatibility shim.
 * The canonical UserLibraryItem model moved to src/library/models/UserLibraryItem.js (Ticket 15).
 * Kept for callers transitioning to the library module and ingestion services (Ticket 16).
 */
module.exports = require('../../library/models/UserLibraryItem');
