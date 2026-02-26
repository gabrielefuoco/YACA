const { getSupabase } = require('../utils/database');
const { CACHE_TTL_MS } = require('../config');

/**
 * Model per la tabella `tmdb_request_cache` su Supabase.
 * Funge da livello di intermezzo tra l'addon e le API TMDB.
 */
const TmdbRequestCache = {
    /**
     * Legge una riga dalla cache. Aggiorna `last_accessed` in fire-and-forget.
     * @param {string} requestHash - Hash SHA-256 della richiesta
     * @returns {Promise<{stremioData: Array, isStale: boolean}|null>}
     */
    async get(requestHash, ttlMs = CACHE_TTL_MS) {
        const supabase = getSupabase();
        if (!supabase) return null;

        const { data, error } = await supabase
            .from('tmdb_request_cache')
            .select('stremio_data, updated_at')
            .eq('request_hash', requestHash)
            .single();

        if (error || !data) return null;

        // Aggiorna last_accessed in background (fire-and-forget)
        supabase
            .from('tmdb_request_cache')
            .update({ last_accessed: new Date().toISOString() })
            .eq('request_hash', requestHash)
            .then(() => {})
            .catch(() => {});

        const age = Date.now() - new Date(data.updated_at).getTime();
        const isStale = age > ttlMs;

        return {
            stremioData: data.stremio_data,
            isStale
        };
    },

    /**
     * Salva o aggiorna una riga nella cache.
     * @param {string} requestHash - Hash SHA-256 della richiesta
     * @param {string} endpoint    - Endpoint TMDB (solo per debug)
     * @param {Array}  stremioData - Array di meta già formattati per Stremio
     */
    async set(requestHash, endpoint, stremioData) {
        const supabase = getSupabase();
        if (!supabase) return;

        const now = new Date().toISOString();

        const { error } = await supabase
            .from('tmdb_request_cache')
            .upsert({
                request_hash: requestHash,
                endpoint,
                stremio_data: stremioData,
                updated_at: now,
                last_accessed: now
            }, { onConflict: 'request_hash' });

        if (error) {
            console.error('Errore salvataggio tmdb_request_cache:', error.message);
        }
    }
};

module.exports = TmdbRequestCache;
