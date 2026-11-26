Status: resolved
Type: task
Priorità: P4 (quinta onda)
Blocked by: nessuno (usa API già esistenti; adattare al loro vero shape)

# 10 — Un semaforo unico per i quattro degradi silenziosi

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q8** (diagnosi delle quattro sonde, modulo `src/infra/ingestionStatus.js`, rotta admin, test, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto

Quattro flussi degradano **senza errori** (è voluto: i percorsi caldi Stremio non devono mai fallire):

| Flusso | Come degrada | Chi lo sa oggi |
|---|---|---|
| TMDB | daemon stale (>36 h), `catalog.duckdb` o `titles_fts5.db` assenti | `TmdbDumpStore.loadStatus()` — nessuno lo legge |
| Anime airing | `checkedAt` > 3 giorni ⇒ i simulcast spariscono | `airing.getSnapshot()` (`homeInWindow`, `homeStale`, `degraded`) |
| Anime mapping | artefatto assente/non pronto ⇒ `statoAnime = non-lo-so` per tutto | `mapping.isReady`, `mapping.getSnapshot()` |
| Doppiaggi + poster | snapshot vuoto ⇒ badge spenti; `versioni.json` disallineato ⇒ health 503 | `itaAnnotations.getSnapshot()`, `getStatoVolume()` |

Nessuno dei quattro è visibile da fuori: il catalogo "sembra funzionare". È l'anomalia A4/3.6.

## Cosa fare

1. **`src/infra/ingestionStatus.js`**: `getIngestionStatus()` legge le quattro sonde **già esistenti**,
   calcola un semaforo per check (`green|yellow|red`) e un `overall`, e **non lancia mai** (ogni check è in
   try/catch e un errore diventa `red` con `error`).
2. Soglie: TMDB stale o FTS5 assente → yellow; duckdb assente o `phase==='error'` → red. Airing:
   snapshot vuoto/degradato → red; `homeInWindow===0` o `homeStale>0` → yellow. Mapping: store vuoto o
   `!isReady` → red; artefatto più vecchio di 24 h → yellow. ITA: file assente o `trueCount===0` → red;
   mtime più vecchio di 36 h → yellow. Poster: volume non allineato → yellow.
3. **`src/api/admin.js`**: `router.get('/ingestion-status')` che ritorna `{success:true, overall, reasons, checks}`.
   Il router ha già `adminAuth` applicato (`router.use(adminAuth)`), e il middleware legge
   **`x-admin-pass`** — **non** `x-admin-token` come nello snippet del revisore.
4. Esporre lo stesso oggetto anche nel payload di `/health`? **No**: `/health` è il probe Docker e deve
   restare economico. Se serve, un campo `ingestion: overall` (stringa) senza i dettagli.

## Adattamenti necessari (verificati sul codice)

- `animeAiringState.getSnapshot()` ha davvero `docs`, `homeInWindow`, `homeStale`, `degraded` ✓.
- `animeMappingStore.getSnapshot()` **non** ritorna `{movieCount, showCount, generatedAt}`: delega a
  `snapshotDaArtefatto`, che ritorna l'artefatto o `{}`. Usare `animeMappingStore.isReady` +
  `idsByType().movie.length`/`.tv.length` per il check "store vuoto", e leggere `generatedAt` **dall'artefatto**
  se c'è (verificare il campo reale: `mappingIndex` produce un timestamp? se non c'è, usare l'mtime del
  file). Non inventare campi.
- `itaAnnotations.getSnapshot()` ritorna `{byKey, count, trueCount, nullCount, generatedAt, loadedAt, path, error}` ✓.
- `getStatoVolume`/`getCacheDir` sono esportati da `src/api/staticPosters.js` ✓ (`getStatoVolume` arriva da
  `volumeContract`).
- `TmdbDumpStore.loadStatus()` ritorna `{phase, isStale, staleReason, lastSync, stats, error, artifacts:{…}}` ✓
  (`artifacts.duckdb.exists`, `artifacts.titlesFts5.exists` — verificare i nomi esatti delle chiavi).

## Test

- `tests/ingestionStatus.test.js`: non lancia mai, `overall` è uno dei tre valori, e contiene tutte e
  cinque le chiavi. Con moduli mockati: `itaAnnotations` in errore → `checks.itaAnnotations.status==='red'`
  e `overall==='red'`; tutti verdi → `green`.
- La rotta: 401 senza header, 200 con `x-admin-pass` corretto (riusare il pattern dei test admin esistenti).

## Fatto quando

1. Test verdi.
2. `curl -s -H "x-admin-pass: $ADMIN_PASS" http://127.0.0.1:7860/api/admin/ingestion-status | jq '{overall, reasons, checks}'`
   restituisce `green` su un sistema sano, e `red`/`yellow` con la causa esplicita se si simula un degrado
   (es. rinominare `ita_annotations.jsonl` per 60 s: `trueCount===0` ⇒ red).
3. Nessun impatto sui tempi delle risposte Stremio (endpoint separato, sola lettura di snapshot in RAM).

## Rischi e rollback

- **Rischio**: la sonda di mapping potrebbe essere costosa se forza un reload dell'artefatto: usare
  `getSnapshot()` **senza** `{force:true}` (TTL 60 s già in memoria).
- **Rollback**: rimuovere la rotta; il modulo resta inerte.
