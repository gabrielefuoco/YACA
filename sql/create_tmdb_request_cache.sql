-- ============================================================
-- Fase 1: Creazione tabella tmdb_request_cache su Supabase
-- ============================================================
-- Questa tabella funge da livello di cache tra l'addon e le API TMDB.
-- Ogni riga rappresenta una specifica richiesta TMDB con i dati
-- già formattati per Stremio, eliminando chiamate API ridondanti.

CREATE TABLE IF NOT EXISTS tmdb_request_cache (
    request_hash TEXT PRIMARY KEY,
    endpoint     TEXT NOT NULL,
    stremio_data JSONB NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice per velocizzare la pulizia (garbage collection) basata su last_accessed
CREATE INDEX IF NOT EXISTS idx_tmdb_cache_last_accessed
    ON tmdb_request_cache (last_accessed);

-- Abilita Row Level Security (opzionale ma consigliato in Supabase)
-- ALTER TABLE tmdb_request_cache ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for service role" ON tmdb_request_cache FOR ALL USING (true);
