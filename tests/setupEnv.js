/**
 * tests/setupEnv.js
 *
 * Configurazione dell'ambiente di test (Ticket 29).
 *
 * Isolamento DuckDB e prevenzione dei lock di file (Windows):
 * Durante l'esecuzione parallela di Jest con più worker, l'accesso concorrente a
 * `.cache/tmdb/catalog.duckdb` genera collisioni I/O ed errori `EPERM` durante il
 * rebuild o il locking esclusivo del file DuckDB su Windows.
 *
 * Impostando `DUCKDB_PATH = ':memory:'`, ogni worker o processo di test opera su un'istanza
 * DuckDB isolata in memoria che legge i parquet direttamente in RAM, garantendo totale ermeticità,
 * assenza di lock contention e parallelismo completo senza dover limitare la suite a un solo worker.
 */

if (!process.env.DUCKDB_PATH) {
    process.env.DUCKDB_PATH = ':memory:';
}
