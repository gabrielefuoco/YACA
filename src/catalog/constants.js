const { FORCED_FAST_CATALOG_IDS, FORCED_FAST_PRESET_IDS, FORCED_SLOW_PRESET_IDS } = require('../../config');

const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };
const FORCED_FAST_CATALOGS = new Set(FORCED_FAST_CATALOG_IDS || []);
const FORCED_FAST_PRESETS = new Set(FORCED_FAST_PRESET_IDS || []);
const FORCED_SLOW_PRESETS = new Set(FORCED_SLOW_PRESET_IDS || []);
const MAX_BADGE_CACHE_HYDRATION_ITEMS = 60;
const MERGED_CATALOG_PAGE_SIZE = 20;

const EPISODE_CATALOG_IDS = new Set([
    'preset_new_series_eps',
    'preset_new_anime_eps',
    'yaca_anime_trending',
    'yaca_discover_series',
    'yaca_trakt_filtered_series'
]);

module.exports = {
    STREAMING_PROVIDERS,
    FORCED_FAST_CATALOGS,
    FORCED_FAST_PRESETS,
    FORCED_SLOW_PRESETS,
    MAX_BADGE_CACHE_HYDRATION_ITEMS,
    MERGED_CATALOG_PAGE_SIZE,
    EPISODE_CATALOG_IDS
};
