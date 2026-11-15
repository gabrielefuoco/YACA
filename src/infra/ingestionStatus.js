const fs = require('fs');
const TmdbDumpStore = require('../../services/tmdb-daemon/tmdbDumpStore');
const { animeAiringState, animeMappingStore } = require('../anime');
const itaAnnotations = require('../catalog/itaAnnotations');
const staticPosters = require('../api/staticPosters');

const MAPPING_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const ITA_MAX_AGE_MS = 36 * 60 * 60 * 1000;     // 36h (timer gira ogni 12h)

async function getIngestionStatus() {
    const checks = {};
    const reasons = [];

    // ponytail: ceiling — lightweight in-memory snapshot reads without forcing disk/network reloads;
    // accepts up to 60s snapshot cache lag to keep health aggregation strictly sub-millisecond.

    // 1. TMDB Daemon & Indici (Tier 1 + Tier 2)
    try {
        const store = new TmdbDumpStore();
        const tmdb = store.loadStatus();
        const hasDuck = Boolean(tmdb?.artifacts?.duckdb?.exists);
        const hasFts5 = Boolean(tmdb?.artifacts?.titlesFts5?.exists);
        let status = 'green';
        if (!hasDuck || tmdb?.phase === 'error') {
            status = 'red';
            reasons.push(`tmdb: ${tmdb?.staleReason || tmdb?.error || 'catalog.duckdb assente'}`);
        } else if (tmdb?.isStale || !hasFts5) {
            status = 'yellow';
            reasons.push(`tmdb: ${tmdb?.staleReason || 'titles_fts5.db assente'}`);
        }
        checks.tmdb = {
            status,
            phase: tmdb?.phase,
            isStale: tmdb?.isStale,
            lastSync: tmdb?.lastSync,
            artifacts: tmdb?.artifacts
        };
    } catch (err) {
        checks.tmdb = { status: 'red', error: err.message };
        reasons.push(`tmdb: ${err.message}`);
    }

    // 2. Anime Airing State & Simulcast Home
    try {
        const airingSnap = await animeAiringState.getSnapshot();
        const totalDocs = Array.isArray(airingSnap?.docs) ? airingSnap.docs.length : 0;
        let status = 'green';
        if (airingSnap?.degraded || totalDocs === 0) {
            status = 'red';
            reasons.push('anime_airing: snapshot degradato o vuoto');
        } else if (airingSnap?.homeInWindow === 0 || (airingSnap?.homeStale && airingSnap.homeStale > 0)) {
            status = 'yellow';
            reasons.push(`anime_airing: homeInWindow=${airingSnap?.homeInWindow}, homeStale=${airingSnap?.homeStale}`);
        }
        checks.animeAiring = {
            status,
            degraded: Boolean(airingSnap?.degraded),
            totalDocs,
            homeInWindow: airingSnap?.homeInWindow ?? 0,
            homeStale: airingSnap?.homeStale ?? 0
        };
    } catch (err) {
        checks.animeAiring = { status: 'red', error: err.message };
        reasons.push(`anime_airing: ${err.message}`);
    }

    // 3. Anime Mapping Store
    try {
        const mapSnap = await animeMappingStore.getSnapshot();
        const ids = typeof animeMappingStore?.idsByType === 'function'
            ? animeMappingStore.idsByType()
            : { movie: [], tv: [] };
        const movieCount = ids?.movie ? ids.movie.length : 0;
        const showCount = ids?.tv ? ids.tv.length : 0;
        const totalIds = movieCount + showCount;
        const isReady = Boolean(animeMappingStore?.isReady);

        let generatedMs = 0;
        if (mapSnap && mapSnap.generatedAt) {
            const parsed = Date.parse(mapSnap.generatedAt);
            if (Number.isFinite(parsed)) generatedMs = parsed;
        }
        if (!generatedMs) {
            const filePath = mapSnap?.path || (typeof animeMappingStore?.mappingPath === 'function' ? animeMappingStore.mappingPath() : null);
            if (filePath) {
                try {
                    if (fs.existsSync(filePath)) {
                        generatedMs = fs.statSync(filePath).mtimeMs;
                    }
                } catch (_) {}
            }
        }
        const ageMs = generatedMs ? (Date.now() - generatedMs) : 0;

        let status = 'green';
        if (mapSnap?.degraded || !isReady || totalIds === 0) {
            status = 'red';
            reasons.push(`anime_mapping: ${mapSnap?.error || mapSnap?.lastError || (!isReady ? 'store non pronto' : 'store vuoto (statoAnime=non-lo-so)')}`);
        } else if (generatedMs && ageMs > MAPPING_MAX_AGE_MS) {
            status = 'yellow';
            reasons.push(`anime_mapping: artefatto più vecchio di 24h (${mapSnap?.generatedAt || new Date(generatedMs).toISOString()})`);
        }
        checks.animeMapping = {
            status,
            degraded: Boolean(mapSnap?.degraded),
            isReady,
            generatedAt: mapSnap?.generatedAt || (generatedMs ? new Date(generatedMs).toISOString() : null),
            movieCount,
            showCount
        };
    } catch (err) {
        checks.animeMapping = { status: 'red', error: err.message };
        reasons.push(`anime_mapping: ${err.message}`);
    }

    // 4. Doppiaggi ITA (file vs Parquet)
    try {
        const itaSnap = await itaAnnotations.getSnapshot();
        let fileMtimeMs = 0;
        try {
            const filePath = itaSnap?.path || (typeof itaAnnotations?.annotationsPath === 'function' ? itaAnnotations.annotationsPath() : null);
            if (filePath && fs.existsSync(filePath)) {
                fileMtimeMs = fs.statSync(filePath).mtimeMs;
            }
        } catch (_) {}
        const ageMs = fileMtimeMs ? (Date.now() - fileMtimeMs) : 0;
        let status = 'green';
        if (itaSnap?.error || !itaSnap?.trueCount || itaSnap.trueCount === 0) {
            status = 'red';
            reasons.push(`ita_annotations: ${itaSnap?.error || '0 titoli doppiati in RAM (badge spenti)'}`);
        } else if (fileMtimeMs && ageMs > ITA_MAX_AGE_MS) {
            status = 'yellow';
            reasons.push('ita_annotations: file non aggiornato da oltre 36h');
        }
        checks.itaAnnotations = {
            status,
            error: itaSnap?.error || null,
            trueCount: itaSnap?.trueCount ?? 0,
            nullCount: itaSnap?.nullCount ?? 0,
            mtime: fileMtimeMs ? new Date(fileMtimeMs).toISOString() : null
        };
    } catch (err) {
        checks.itaAnnotations = { status: 'red', error: err.message };
        reasons.push(`ita_annotations: ${err.message}`);
    }

    // 5. Volume Poster ERDB
    try {
        const cacheDir = typeof staticPosters.getCacheDir === 'function' ? staticPosters.getCacheDir() : '/data/erdb-cache';
        const vol = typeof staticPosters.getStatoVolume === 'function' ? staticPosters.getStatoVolume(cacheDir) : { ok: false };
        const status = vol?.ok ? 'green' : 'yellow';
        if (!vol?.ok) reasons.push(`posters: ${vol?.volume?.motivo || 'volume non allineato'}`);
        checks.posters = {
            status,
            ok: Boolean(vol?.ok),
            motivo: vol?.volume?.motivo || null,
            statistiche: vol?.statistiche || null
        };
    } catch (err) {
        checks.posters = { status: 'yellow', error: err.message };
        reasons.push(`posters: ${err.message}`);
    }

    const allStatuses = Object.values(checks).map((c) => c.status);
    const overall = allStatuses.includes('red')
        ? 'red'
        : (allStatuses.includes('yellow') ? 'yellow' : 'green');

    return {
        overall,
        timestamp: new Date().toISOString(),
        reasons,
        checks
    };
}

module.exports = { getIngestionStatus };
