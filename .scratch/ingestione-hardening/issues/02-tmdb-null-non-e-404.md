Status: ready-for-agent
Type: task
Priorità: P1 (prima onda: ferma le cancellazioni spurie)
Blocked by: 00 (punto 2: estrazione `buildMovieRow`/`buildTvRow`)

# 02 — TMDB: un `null` non è un 404

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q3**, parte A7 (diagnosi punto 1, codice `fetchWithRetryOutcome` / `fetchMovieOutcome` / `fetchTvOutcome` / blocco `dailySync`, test, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto (il bug)

In `services/tmdb-daemon/tmdbDumpClient.js`, `fetchWithRetry` restituisce `null` per **tre cause
diverse**: HTTP 404, budget TMDB esaurito (`tmdbBudget.checkBudget` nega la chiamata), retry esauriti su
5xx/429/rete. `fetchMovie`/`fetchTv` aggiungono un quarto `null`: record scartato da
`shouldKeepTmdbRecord` (sotto `vote_count` 10).

In `services/tmdb-daemon/tmdbDumpDaemon.js` (`dailySync`, il ramo `else if (localIds.has(id))`) **qualsiasi**
`null` su un id presente localmente finisce in `toDelete` e sparisce da `master_*.jsonl`. Quindi un cap di
budget raggiunto — o un picco di 5xx di TMDB — **cancella titoli veri** dal catalogo. Al giro dopo
rientrano solo se sono ancora popolari. È l'anomalia A7 dell'handoff.

## Cosa fare

1. **Tipizzare l'esito** in `TmdbDumpClient`: `fetchWithRetryOutcome(url, params, retries)` che ritorna
   `{status, data}` con `status ∈ {'ok','not_found','skipped_budget','transient_error'}`.
2. **Estrarre la costruzione della riga** in due funzioni pure `buildMovieRow(data)` e `buildTvRow(data)`
   (oggi è inline in `fetchMovie`/`fetchTv`) e usarla da `fetchMovieOutcome`/`fetchTvOutcome`, che
   ritornano `{status, row}` con `status ∈ {'ok','not_found','skipped_budget','transient_error','adult_filtered','filtered_vote_floor'}`.
3. **`fetchMovie`/`fetchTv` restano** con la stessa firma e lo stesso output (backfill e
   `tier1LazyPromotion` li usano): diventano un wrapper sottile su `*Outcome` che ritorna `row` o `null`.
   **Nessun cambio al formato della riga** del JSONL.
4. **`dailySync`**: cancellare **solo** su `not_found` o `adult_filtered`, e comunque mai se l'id è in
   `trackedIds`; su `skipped_budget`/`transient_error`/`filtered_vote_floor` non toccare nulla (il record
   esistente resta com'è). Contare gli esiti e loggarli in coda al giro:
   `Disk Apply: X upserts, Y deletes, skipped(budget)=N, transient=N, filtered_vote_floor=N`.
5. Il **cold start** non cambia comportamento (`shouldKeepTmdbRecord` continua a decidere chi entra), ma
   deve usare gli stessi `*Outcome` per loggare i motivi di scarto.

## Adattamenti necessari (verificati sul codice)

- **`_buildMovieRow`/`_buildTvRow` non esistono**: vanno creati (punto 2). Se il revisore dava per
  scontato che esistessero, il suo snippet non è incollabile così com'è.
- `shouldKeepTmdbRecord` oggi accetta `{bypassVoteFloor, trackedIds}`: gli `*Outcome` devono propagare
  `options` **e** aggiungere `originalLanguage` (serve al ticket 03).
- Il ramo di cancellazione deve restare **dentro** il `try/catch` per id, e `isTrackedAiringId` va
  controllato **dopo** aver deciso lo status (mai fidarsi dell'ordine).

## Test

In `tests/tmdbDaemonOutcome.test.js` (node:test, non jest: sono servizi con `node --test`):

- budget esaurito (`tmdbBudget.configureCap({enabled:true, limit:1})` + una `recordCall`) →
  `fetchWithRetryOutcome` ritorna `skipped_budget`, **non** `not_found`;
- 404 simulato → `not_found`;
- 500 ripetuto oltre i retry → `transient_error`;
- `dailySync` con `toDelete`: un id locale con `skipped_budget` **non** viene cancellato; con `not_found`
  sì; con `not_found` ma tracciato airing **no**;
- `fetchMovie` continua a ritornare la stessa riga (golden test su una fixture di payload TMDB già
  presente o da aggiungere): confronto campo per campo con l'output pre-refactor.

## Fatto quando

1. Test verdi.
2. Su `docker logs yaca-tmdb-daemon`, dopo un giro con `TMDB_CAP_LIMIT=10` (forzato in locale, non in
   produzione): la riga `Disk Apply` mostra `deletes` a 0 o quasi, e i contatori `skipped(budget)`
   spiegano la differenza.
3. `master_movies.jsonl` non perde righe in un giro con cap artificialmente basso (confronto conteggio
   prima/dopo).

## Rischi e rollback

- Rischio **zero sullo schema**: il formato della riga non cambia e i file esistenti restano validi.
- Rischio residuo: una `vote_count` che scende sotto soglia non cancella più il titolo (resta
  `filtered_vote_floor`). È voluto: il catalogo non deve perdere un titolo per un'oscillazione di voti;
  se in futuro serve un prune, va fatto da un job esplicito, non dal sync.
- **Rollback**: immagine precedente. Nessun dato da migrare.
