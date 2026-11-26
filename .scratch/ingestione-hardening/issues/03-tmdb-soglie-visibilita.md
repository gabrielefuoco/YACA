Status: resolved
Type: task
Priorità: P2 (quarta onda: cambia il contenuto del catalogo)
Blocked by: 02 (stessi file), 00 (baseline dei volumi)

# 03 — TMDB: politica di visibilità (soglie per tipo + pavimento ITA)

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q3**, parte A6 (diagnosi punto 2, codice `tmdbIngestPolicy.js` con `loadItaDubbedIds`, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto

Due muri in serie decidono chi esiste nel catalogo locale:

1. **pre-fetch**: `tmdbDumpClient.downloadDailyExport` tiene solo `popularity >= 1.0` (e `adult !== true`).
   Chi sta sotto **non viene mai interrogato**: nessuna `vote_count` può salvarlo.
2. **post-fetch**: `shouldKeepTmdbRecord` scarta `vote_count < 10`, con l'unica eccezione degli id
   tracciati da `anime_airing_state`.

Effetto: un film italiano doppiato con 5 voti, o una serie TV italiana con `popularity` 0.7, sono
invisibili per sempre — proprio il pubblico dell'addon. È l'anomalia A6.

## Cosa fare (proposta del revisore, da tarare)

1. **Soglia export per tipo**: `popularity >= 0.6` per le serie TV, `1.0` per i film (le serie hanno
   distribuzioni di popolarità più basse).
2. **Includere sempre** nell'export gli id che compaiono in `ita_annotations.jsonl` come `ita: true`
   (`loadItaDubbedIds(mediaType)`), indipendentemente dalla popolarità.
3. **Pavimento voti ridotto** (`ITALIAN_VOTE_FLOOR = 3`) per i titoli con `original_language === 'it'`
   **o** presenti in `ita_annotations`; per tutti gli altri resta 10.
4. **Tracciare l'esito**: quante righe in più entrano per ciascuna delle tre cause (nuovo export,
   pavimento ITA, eccezione airing). Senza questo contatore non si può tarare nulla.

## Perché è `needs-info`

Le soglie sono **scelte di prodotto** e il revisore stesso non le ha potute misurare. Prima di
implementare serve una risposta a queste domande (basta un giro di `--dry-run`/query, nessun codice):

1. Quanti titoli in più entrano con `popularity >= 0.6` sulle serie? (stima: `wc -l` sull'export
   filtrato vs `master_tv.jsonl` attuale)
2. Quanti id di `ita_annotations.jsonl` **non** sono oggi nel catalogo? (≈ quanti doppiati italiani
   stiamo perdendo)
3. Quanto costa in chiamate TMDB il punto 2? (un id in meno di popolarità 1 = una `fetchTv` in più; se
   sono 3.000, il cold start cresce di ~3.000 chiamate una tantum e il daily sync di poche decine)
4. Accettiamo che il catalogo cresca di dimensione (parquet/DuckDB/RAM)? Il container app ha 1.5 GB e
   `catalog.duckdb` è già 161 MB.

Le misure vanno in `ricerche/03-misure-soglie.md`; la decisione (quali soglie) si prende **dopo**, e va
annotata in `map.md`.

## Cosa NON fare

- Non abbassare il `VOTE_FLOOR` globale: il pavimento ridotto vale **solo** per IT/doppiati.
- Non toccare la tabella `ita` (ticket 06) da qui: sono file diversi, si incontrano solo a runtime.
- Non usare `ita === true` come segnale per il tipo sbagliato: la chiave delle annotazioni è `(t, id)`,
  leggerla senza tipo produce falsi positivi (5.933 id vivono in entrambe le tabelle).

## Test

- `shouldKeepTmdbRecord`: `vote_count=5` + `originalLanguage:'it'` → `true`; `vote_count=5` + `itaDubbedIds`
  contenente l'id → `true`; `vote_count=5` + nessuna delle due → `false`; `vote_count=10` → `true` sempre.
- `loadItaDubbedIds('tv')` su una fixture ridotta: prende solo `t:'tv'` e `ita:true`, ignora i `null` e
  l'altro tipo, e non esplode se il file manca.
- Export: con una fixture di `movie_ids`/`tv_series_ids` costruita a mano, le soglie 1.0/0.6 e
  l'inclusione forzata degli id doppiati si vedono sul numero di id restituiti.

## Fatto quando

1. Test verdi e contatori in log alla fine di export e sync per causa.
2. `SELECT count(*) FROM tv` (DuckDB) cresce del numero atteso **misurato** nel ticket, non "più o meno".
3. Il tempo del giro cold/sync misurato non cresce oltre il 10% (o la crescita è accettata esplicitamente
   e scritta nel ticket).

## Rischi e rollback

- **Rischio**: catalogo più grande = più RAM in DuckDB e parquet più grandi; il cold start diventa più
  lungo una tantum.
- **Rollback**: le soglie sono costanti in un file; tornare ai valori precedenti è un revert di due
  numeri. Gli id già entrati restano (non c'è prune) — se serve, va deciso prima.
