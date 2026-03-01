// src/utils/releaseFilter.js

const RELEASE_KEY_PREFIX = 'tmdb-addon|release';
// In-memory cache fallback if we don't have Redis
const localCache = new Map();
const RELEASE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Lazy import to avoid circular dependency with tmdb.js (deferred until first use)
let _createTmdbClient;
function getCreateTmdbClient() {
    if (!_createTmdbClient) {
        _createTmdbClient = require("../clients/tmdb").createTmdbClient;
    }
    return _createTmdbClient;
}

async function getReleaseDates(movieId, apiKey) {
    const createTmdbClient = getCreateTmdbClient();
    const cacheKey = `${RELEASE_KEY_PREFIX}:${movieId}`;

    if (localCache.has(cacheKey)) {
        const cached = localCache.get(cacheKey);
        if (Date.now() < cached.expiry) return cached.data;
        localCache.delete(cacheKey);
    }

    try {
        const client = createTmdbClient(apiKey);
        const res = await client.get(`/movie/${movieId}/release_dates`);
        const releaseDates = res.data;

        if (releaseDates) {
            localCache.set(cacheKey, { data: releaseDates, expiry: Date.now() + RELEASE_TTL_MS });
        }
        return releaseDates;
    } catch (error) {
        console.error(`Error fetching release dates for movie ${movieId}:`, error.message);
        return null;
    }
}

async function isMovieReleasedInRegion(movieId, region, apiKey) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const releaseDates = await getReleaseDates(movieId, apiKey);

        if (!releaseDates || !releaseDates.results) return true;

        const regionRelease = releaseDates.results.find(r => r.iso_3166_1 === region);

        if (!regionRelease || !regionRelease.release_dates) return false;

        const validReleaseTypes = [3, 4, 5, 6]; // Theatrical, Digital, Physical, TV - no Premiere (1)
        return regionRelease.release_dates.some(rd => {
            const releaseDate = rd.release_date ? rd.release_date.split('T')[0] : null;
            if (!releaseDate) return false;
            return releaseDate <= today && validReleaseTypes.includes(rd.type);
        });
    } catch (error) {
        console.error(`Error checking release dates for movie ${movieId}:`, error.message);
        return true;
    }
}

async function isMovieReleasedDigitally(movieId, apiKey) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const releaseDates = await getReleaseDates(movieId, apiKey);

        if (!releaseDates || !releaseDates.results) return true;

        const digitalReleaseTypes = [4, 5, 6]; // Digital, Physical, TV

        for (const regionData of releaseDates.results) {
            if (!regionData.release_dates) continue;
            const hasDigitalRelease = regionData.release_dates.some(rd => {
                const releaseDate = rd.release_date ? rd.release_date.split('T')[0] : null;
                if (!releaseDate) return false;
                return releaseDate <= today && digitalReleaseTypes.includes(rd.type);
            });
            if (hasDigitalRelease) return true;
        }

        return false;
    } catch (error) {
        console.error(`Error checking digital release for movie ${movieId}:`, error.message);
        return true;
    }
}

module.exports = { isMovieReleasedInRegion, isMovieReleasedDigitally };
