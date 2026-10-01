const animeAiringState = require('../data/animeAiringState');

/**
 * tmdbIngestPolicy.js
 *
 * Helper condiviso per la politica di conservazione dei record durante l'ingestione TMDB.
 * Regola fondamentale (Ticket 31):
 * I titoli con vote_count < 10 vengono normalmente scartati e non inclusi nel DB locale.
 * ECCEZIONE: i titoli tracciati da `anime_airing_state` (simulcast / novità anime)
 * devono essere tenuti anche se hanno vote_count < 10, e non devono essere cancellati
 * durante il daily sync.
 */

const VOTE_FLOOR = 10;

/**
 * Carica il set di TMDB ID tracciati dallo snapshot di anime_airing_state.
 * Ritorna un Set di Number per lookup O(1).
 * In caso di fallimento o DB offline, ritorna un Set vuoto senza lanciare eccezioni.
 *
 * @returns {Promise<Set<number>>}
 */
async function loadTrackedAiringIds() {
    try {
        const snapshot = await animeAiringState.getSnapshot();
        const tracked = new Set();
        if (snapshot && snapshot.byTmdbId) {
            for (const key of snapshot.byTmdbId.keys()) {
                const num = Number(key);
                if (Number.isFinite(num) && num > 0) {
                    tracked.add(num);
                }
            }
        }
        return tracked;
    } catch (_err) {
        return new Set();
    }
}

/**
 * Verifica se un TMDB ID è tracciato da anime_airing_state.
 *
 * @param {number|string} id
 * @param {Set<number>|null} trackedIdsSet
 * @returns {boolean}
 */
function isTrackedAiringId(id, trackedIdsSet = null) {
    if (!id) return false;
    const num = Number(id);
    if (!Number.isFinite(num) || num <= 0) return false;

    if (trackedIdsSet instanceof Set) {
        return trackedIdsSet.has(num);
    }

    return false;
}

/**
 * Determina se un record TMDB deve essere tenuto in base a vote_count,
 * policy di tracciamento anime_airing_state o flag di bypass esplicito.
 *
 * @param {number|string} id
 * @param {number} voteCount
 * @param {object} options
 * @param {boolean} [options.bypassVoteFloor] Se true, ignora il vincolo di vote_count (usato per backfill mirati)
 * @param {Set<number>} [options.trackedIds] Set pre-caricato di ID tracciati da anime_airing_state
 * @returns {Promise<boolean>}
 */
async function shouldKeepTmdbRecord(id, voteCount, options = {}) {
    const count = Number(voteCount) || 0;
    if (count >= VOTE_FLOOR) {
        return true;
    }

    if (options && options.bypassVoteFloor === true) {
        return true;
    }

    if (options && options.trackedIds instanceof Set) {
        return isTrackedAiringId(id, options.trackedIds);
    }

    // Fallback: se non è stato passato trackedIds, prova a risolvere tramite lo snapshot
    const trackedSet = await loadTrackedAiringIds();
    return isTrackedAiringId(id, trackedSet);
}

module.exports = {
    VOTE_FLOOR,
    loadTrackedAiringIds,
    isTrackedAiringId,
    shouldKeepTmdbRecord
};
