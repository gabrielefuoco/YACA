const CacheManager = require('../cache/CacheManager');

// L2 TTL: 24 ore (86400000 ms) per i cataloghi TMDB
module.exports = new CacheManager('tmdb_catalog', {
    ramMax: 15,
    ramTtlMs: 300000,
    mongoTtlMs: 86400000
});
