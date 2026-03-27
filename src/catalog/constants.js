
const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };
const MAX_BADGE_CACHE_HYDRATION_ITEMS = 60;

const EPISODE_CATALOG_IDS = new Set([
    'preset_new_series_eps',
    'preset_new_anime_eps',
    'yaca_anime_trending',
    'yaca_discover_series',
    'yaca_trakt_filtered_series'
]);

module.exports = {
    STREAMING_PROVIDERS,
    MAX_BADGE_CACHE_HYDRATION_ITEMS,
    EPISODE_CATALOG_IDS
};
