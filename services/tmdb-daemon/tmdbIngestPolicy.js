const fs = require('fs');
const readline = require('readline');
const { animeAiringState } = require('../../src/anime');
const itaAnnotations = require('../../src/catalog/itaAnnotations');

/**
 * tmdbIngestPolicy.js
 *
 * Helper condiviso per la politica di conservazione dei record durante l'ingestione TMDB.
 * Regola fondamentale (Ticket 31 & Ticket 03):
 * I titoli con vote_count < 10 vengono normalmente scartati e non inclusi nel DB locale.
 * ECCEZIONI:
 * 1. Pavimento italiano ridotto (ITALIAN_VOTE_FLOOR = 3): titoli con original_language === 'it'
 *    oppure presenti in ita_annotations.jsonl come ita: true.
 * 2. Titoli tracciati da `anime_airing_state` (simulcast / novità anime) tenuti anche sotto pavimento.
 */

const VOTE_FLOOR = 10;
const ITALIAN_VOTE_FLOOR = 3;

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
 * Carica gli ID annotati come doppiati (ita: true) per tipo ('movie' | 'tv').
 * Ritorna un Set di Number per lookup O(1).
 * In caso di file assente o non valido, ritorna un Set vuoto senza mai lanciare eccezioni.
 *
 * @param {string} [mediaType='movie'] 'movie' | 'movies' | 'tv'
 * @param {object|string} [options={}] opzioni o percorso alternativo del file per test
 * @returns {Promise<Set<number>>}
 */
async function loadItaDubbedIds(mediaType = 'movie', options = {}) {
    const targetType = (mediaType === 'movies' || mediaType === 'movie') ? 'movie' : 'tv';
    const ids = new Set();
    try {
        const filePath = typeof options === 'string' ? options : (options?.filePath || itaAnnotations.annotationsPath());
        if (!filePath || !fs.existsSync(filePath)) return ids;
        const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
        for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const row = JSON.parse(trimmed);
                if (row && row.t === targetType && row.ita === true && row.id != null) {
                    const num = Number(row.id);
                    if (Number.isFinite(num) && num > 0) {
                        ids.add(num);
                    }
                }
            } catch (_) {}
        }
    } catch (_err) {}
    return ids;
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
 * policy di tracciamento anime_airing_state, lingua originale, annotazione doppiaggio ITA
 * o flag di bypass esplicito.
 *
 * @param {number|string} id
 * @param {number} voteCount
 * @param {object} options
 * @param {string} [options.originalLanguage] Lingua originale del titolo (es. 'it')
 * @param {Set<number>} [options.itaDubbedIds] Set di ID doppiati in italiano
 * @param {boolean} [options.bypassVoteFloor] Se true, ignora il vincolo di vote_count (usato per backfill mirati)
 * @param {Set<number>} [options.trackedIds] Set pre-caricato di ID tracciati da anime_airing_state
 * @returns {Promise<boolean>}
 */
async function shouldKeepTmdbRecord(id, voteCount, options = {}) {
    const count = Number(voteCount) || 0;
    if (count >= VOTE_FLOOR) {
        if (options && typeof options === 'object') options.keepReason = 'vote_floor';
        return true;
    }

    if (options && options.bypassVoteFloor === true) {
        if (options && typeof options === 'object') options.keepReason = 'bypass';
        return true;
    }

    const numId = Number(id);
    // Titoli italiani nativi o certificati doppiati in ITA hanno pavimento ridotto a 3 voti
    if (count >= ITALIAN_VOTE_FLOOR) {
        if (options?.originalLanguage === 'it') {
            if (options && typeof options === 'object') options.keepReason = 'italian_floor';
            return true;
        }
        if (options?.itaDubbedIds instanceof Set && (options.itaDubbedIds.has(numId) || options.itaDubbedIds.has(id))) {
            if (options && typeof options === 'object') options.keepReason = 'dubbed_floor';
            return true;
        }
    }

    const isTracked = (options && options.trackedIds instanceof Set)
        ? isTrackedAiringId(numId, options.trackedIds)
        : isTrackedAiringId(numId, await loadTrackedAiringIds());

    if (isTracked) {
        if (options && typeof options === 'object') options.keepReason = 'airing_exception';
        return true;
    }

    return false;
}

module.exports = {
    VOTE_FLOOR,
    ITALIAN_VOTE_FLOOR,
    loadTrackedAiringIds,
    loadItaDubbedIds,
    isTrackedAiringId,
    shouldKeepTmdbRecord
};
