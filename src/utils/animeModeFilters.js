/**
 * Anime Mode Filters
 * Automatically detects if a YACA profile is Anime-only.
 * If so, forces TMDB queries to return only Japanese Animation.
 */

function isAnimeProfile(user, context) {
    if (!user || !user.profiles) return false;
    const profileData = user.profiles.find(p => p.id === context);
    if (!profileData || !profileData.catalogs || profileData.catalogs.length === 0) return false;
    
    // 1. If the profile name explicitly contains 'anime', it's an anime profile.
    if (profileData.name && profileData.name.toLowerCase().includes('anime')) {
        return true;
    }

    // 2. Otherwise, check if all content catalogs (excluding suggestions) are anime catalogs.
    const hybridIds = ['yaca_true_blend', 'yaca_seed_network', 'yaca_hidden_gems', 'yaca_trakt_filtered'];
    const contentCatalogs = profileData.catalogs.filter(c => !hybridIds.some(hId => c.id && c.id.includes(hId)));
    
    if (contentCatalogs.length === 0) return false; // Only has suggestion catalogs, cannot determine.
    
    return contentCatalogs.every(c => c.id && (c.id.toLowerCase().includes('anime') || c.id.toLowerCase().includes('ghibli')));
}

function applyAnimeMode(params) {
    if (!params) return params;
    const safeParams = { ...params };
    
    // Force Japanese Language
    safeParams.with_original_language = 'ja';
    
    // Force Animation Genre (16)
    if (safeParams.with_genres) {
        if (!safeParams.with_genres.includes('16')) {
            safeParams.with_genres = `${safeParams.with_genres},16`;
        }
    } else {
        safeParams.with_genres = '16';
    }

    return safeParams;
}

module.exports = {
    isAnimeProfile,
    applyAnimeMode
};
