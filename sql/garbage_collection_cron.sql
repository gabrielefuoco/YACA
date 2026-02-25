-- ============================================================
-- Fase 5: Garbage Collection - Pulizia automatica della cache
-- ============================================================
-- Utilizza pg_cron (gratuito su Supabase) per eliminare le righe
-- non accedute da più di 7 giorni. Eseguito ogni domenica alle 03:00 UTC.
--
-- Le liste popolari (accedute frequentemente) vengono rinnovate in
-- continuazione e non verranno mai eliminate. Solo le query AI
-- iper-specifiche usate una volta sola verranno rimosse.

-- Attiva l'estensione pg_cron (se non già attiva)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Crea il cron job settimanale
SELECT cron.schedule(
    'cleanup-tmdb-request-cache',   -- Nome del job
    '0 3 * * 0',                    -- Ogni domenica alle 03:00 UTC
    $$DELETE FROM tmdb_request_cache WHERE last_accessed < now() - INTERVAL '7 days'$$
);
