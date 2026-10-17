/**
 * src/anime/index.js
 *
 * La porta unica del modulo Anime di YACA (Ticket 32).
 *
 * Espone tutti i verbi dei consumatori:
 * - Identità: chi è anime (isAnimeContent, isItemAnime, isAnimeTmdbId, isAnimeTmdbIdAny, statoAnime)
 * - Marcatori: normalizeAnimeMarker, extractAnimeTmdbId
 * - Alias di tipo: normalizeTipoAnime
 * - Politica: ANIME_POLICY_MODES, resolveAnimePolicy, getEffectiveTypeSelectors, computeAnimeScoreMultiplier
 * - I due snapshot: getAiringSnapshot, getMappingSnapshot
 * - Risoluzione identità e mapping: resolveKitsu, resolveKitsuMovie, resolveTmdbFromKitsu,
 *   resolveTmdbEntryFromKitsu, resolveMediaTypeFromKitsu, resolveMediaTypeDaTmdbId, resolveKitsuDaTmdbId
 * - I due store come oggetti di dominio: animeMappingStore, animeAiringState
 */

const identita = require('./identita');
const politica = require('./politica');
const animeMappingStore = require('./mapping');
const animeAiringState = require('./airing');

module.exports = {
    // ─── 1. Identità e Marcatori ─────────────────────────────────────────────
    isAnimeContent: identita.isAnimeContent,
    normalizeAnimeMarker: identita.normalizeAnimeMarker,
    extractAnimeTmdbId: identita.extractAnimeTmdbId,
    extractAnimeGenreIds: identita.extractAnimeGenreIds,
    normalizeTipoAnime: identita.normalizeTipoAnime,
    hasAnimeKeyword: identita.hasAnimeKeyword,
    isAnimeKeywordString: identita.isAnimeKeywordString,
    hasAnimationGenre: identita.hasAnimationGenre,
    ANIME_MARKER_DEFAULT: identita.ANIME_MARKER_DEFAULT,
    flusheLogCandidatiCertify: identita.flusheLogCandidatiCertify,
    getCandidatiCertify: identita.getCandidatiCertify,
    resetCandidatiCertifyForTests: identita.resetCandidatiCertifyForTests,

    // ─── 2. Politica Anime ───────────────────────────────────────────────────
    ANIME_POLICY_MODES: politica.ANIME_POLICY_MODES,
    resolveAnimePolicy: politica.resolveAnimePolicy,
    getEffectiveTypeSelectors: politica.getEffectiveTypeSelectors,
    isItemAnime: politica.isItemAnime,
    computeAnimeScoreMultiplier: politica.computeAnimeScoreMultiplier,
    getProfileAnimationQuota: politica.getProfileAnimationQuota,
    getPolicyFromQuota: politica.getPolicyFromQuota,

    // ─── 3. Verbi dello Store di Mapping ─────────────────────────────────────
    animeMappingStore,
    mappingStore: animeMappingStore,
    statoAnime: (id, tipo) => animeMappingStore.statoAnime(id, tipo),
    isAnimeTmdbId: (id, tipo) => animeMappingStore.isAnimeTmdbId(id, tipo),
    isAnimeTmdbIdAny: (id) => animeMappingStore.isAnimeTmdbIdAny(id),
    resolveKitsu: (...args) => animeMappingStore.resolveKitsu(...args),
    resolveKitsuMovie: (...args) => animeMappingStore.resolveKitsuMovie(...args),
    resolveTmdbFromKitsu: (...args) => animeMappingStore.resolveTmdbFromKitsu(...args),
    resolveTmdbEntryFromKitsu: (...args) => animeMappingStore.resolveTmdbEntryFromKitsu(...args),
    resolveMediaTypeFromKitsu: (...args) => animeMappingStore.resolveMediaTypeFromKitsu(...args),
    resolveMediaTypeDaTmdbId: (...args) => animeMappingStore.resolveMediaTypeDaTmdbId(...args),
    resolveTmdbFromMal: (...args) => animeMappingStore.resolveTmdbFromMal(...args),
    resolveKitsuFromMal: (...args) => animeMappingStore.resolveKitsuFromMal(...args),
    resolveKitsuDaTmdbId: (...args) => animeMappingStore.resolveKitsuDaTmdbId(...args),
    MOTIVI_RESOLVE_KITSU: animeMappingStore.motiviResolveKitsu,
    getMappingSnapshot: (options) => animeMappingStore.getSnapshot(options),

    // ─── 4. Verbi dello Store di Airing (Simulcast) ──────────────────────────
    animeAiringState,
    getAiringSnapshot: (options) => animeAiringState.getSnapshot(options),
    getNoveltyEntries: animeAiringState.getNoveltyEntries,
    getAiringEntries: animeAiringState.getAiringEntries,
    getCardInfo: animeAiringState.getCardInfo,
    getCardInfoForId: animeAiringState.getCardInfoForId,
    getWindowInfo: animeAiringState.getWindowInfo,
    getHomeInfo: animeAiringState.getHomeInfo,
    findDocument: animeAiringState.findDocument,
    getDubEpisode: animeAiringState.getDubEpisode,
    getDubEpisodeForId: animeAiringState.getDubEpisodeForId,
    isDubbedFilmDoc: animeAiringState.isDubbedFilmDoc,
    isDubbedFilmDocForCard: animeAiringState.isDubbedFilmDocForCard,
    resolveCardId: animeAiringState.resolveCardId,
    validateDocument: animeAiringState.validateDocument,
    buildSnapshot: animeAiringState.buildSnapshot,
    setDataSourceForTests: animeAiringState.setDataSourceForTests,
    resetForTests: animeAiringState.resetForTests,
    COLLECTION_NAME: animeAiringState.COLLECTION_NAME,
    SUPPORTED_SCHEMA_VERSION: animeAiringState.SUPPORTED_SCHEMA_VERSION
};
