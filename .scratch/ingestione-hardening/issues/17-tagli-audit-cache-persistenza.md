Status: resolved
Type: task
Priorità: P3 (igiene, non urgenza: nessun dato sbagliato in giro)
Blocked by: nessuno

# 17 — Tagli dall'audit di cache e persistenza

**Riferimento**: [`../ricerche/17-audit-cache-e-persistenza.md`](../ricerche/17-audit-cache-e-persistenza.md)
— audit completo, con verifiche, respinti e fonti di verità duplicate.

## Cosa è pronto da eseguire (verificato, ~420 righe)

1. **C1+C2 — lo SWR è morto.** `set()` scrive sempre `envelope.ttl`, la lettura calcola
   `envelope.ttl ? 0 : swrMs` → `effectiveSwr` è sempre 0 e `status` non è mai `stale`. Quindi: via `swrMs`
   dalle 5 istanze, i rami `stale` in `CacheManager` e le gestioni `stale` nei chiamanti (`meta.js` 25
   righe, `hybridServing`, `pool/index`, `tmdb.js`).
2. **C3/C5/C6/C7** — istanze morte (`catalogFallbackCache`, `simulcastDatesCache`), `finalMetaCache`
   duplicata (stesso namespace Redis!), `resolveCatalogTtl` con un chiamante, alias `invalida`/`mongoTtlMs`/
   `useRam` senza chiamanti.
3. **P1/P2/P4/P5** — `report.json` senza lettori, campi di sidecar mai letti, campi Mongo senza lettori,
   wrapper Mongoose inutili.
4. **P6** — un `writeAtomic` unico al posto di 10 copie di `.tmp`+`rename`.
5. **P8** — export morti di `snapshotDaArtefatto`.

## Cosa NON è in questo ticket (respinto, con motivo nella ricerca)

- Togliere `master_*.jsonl`/spool in favore di DuckDB: è ricostruire la pipeline.
- Inlinare la macchina a stati della libreria: `conversionStateMachine` è usata da `src/library/index.js`.
- Togliere `sorgenti.json`: serve al drenatore per ricostruire il nome del poster.
- Togliere la tabella `anime_mappings`.

## Decisione che vale più di tutti i tagli

Il fatto "doppiato ITA" vive in **quattro** posti (JSONL, colonna parquet, colonna DuckDB live, Map in RAM).
Il live sync in DuckDB compra **meno di un'ora** e ci è già costato il caso WAL/`CHECKPOINT`. Toglierlo
riduce le copie a due e semplifica il ticket 06 — ma è una decisione di prodotto/architettura, non un taglio.

## Definizione di fatto

Test verdi dopo ogni gruppo di tagli, `npm test` + `node --test services/*/tests/`, e un giro di verifica in
produzione sui cataloghi (i tagli C1-C2 toccano il percorso caldo della cache).
