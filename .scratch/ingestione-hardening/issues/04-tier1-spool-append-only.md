Status: ready-for-agent
Type: task
Priorità: P1 (seconda onda)
Blocked by: nessuno

# 04 — Tier 1: spool append-only `promoted_*.jsonl`

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q5** (diagnosi del lost-update, codice per `tier1Promotion.js` e `tmdbDumpStore.js`, test di concorrenza, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto (il bug)

Due container, un file:

- `yaca-tmdb-daemon` aggiorna `master_movies.jsonl` / `master_tv.jsonl` con
  `_processFileSafely`: legge il file, scrive `.tmp`, `rename` sopra l'originale.
- `yaca-app` (stesso volume `yaca_tmdb`) **appende** a `master_*.jsonl` quando promuove un titolo
  Tier 2 al primo click (`src/indice/tier1Promotion.js` → `promoteToTier1`, chiamato da
  `src/stremio/meta.js` via `schedulePromotion`).

Se l'append cade nella finestra fra la lettura e il `rename`, la riga finisce nell'inode vecchio e viene
**persa** quando il `rename` sostituisce il nome. Peggio: `tier1LazyPromotion` ha già messo l'esito
"scritto" nella sua `LRUCache`, quindi **non ci riprova**. Dettaglio verificato: l'append non ha lock,
il daemon non sa che l'app esiste, e `hasTier1Id` ri-scandisce centinaia di MB a ogni apertura.

## Cosa fare

Spool append-only, **un solo scrittore per file**:

1. **`src/indice/tier1Promotion.js`**
   - nuovo export `promotedFileFor(tipo, dataDir)` → `<dataDir>/promoted_movies.jsonl` | `promoted_tv.jsonl`;
   - `promoteToTier1(filePath, dettagli, tipo)`: se `filePath` punta a `master_*.jsonl` (produzione)
     **scrive nello spool** e riporta `percorso: <spool>`; per un percorso esplicito diverso (test, backfill)
     continua a scrivere lì;
   - `hasTier1Id(filePath, id)` controlla **prima** lo spool della stessa cartella (file piccolo) poi il
     master, fermandosi al primo hit;
   - `promoteOnOpen`/`schedulePromotion` non cambiano firma.
2. **`services/tmdb-daemon/tmdbDumpStore.js`** — due righe dentro `upsert`, niente macchina a stati:
   - legge lo spool (`promoted_<tipo>.jsonl`) se esiste, lo fonde con le righe da upsert in un'unica `Map`
     per `id`;
   - riscrive il master come già fa (`_processFileSafely`, `tmp` + `rename`), mettendo le righe nuove in coda;
   - **dopo** il rename, `fs.writeFileSync(spool, '')` (tronca).
   Se il processo muore fra merge e troncamento, il giro dopo rifonde le stesse righe: la dedupe per `id`
   rende l'operazione idempotente. **Nessun** `.draining`, nessun claim, nessun resume.
3. **`scripts/convert_to_parquet.js`** — `read_json_auto([master, spool])` quando lo spool esiste: così i
   titoli promossi entrano nei parquet **al giro successivo** senza aspettare il daemon (la dedupe per
   `id` con `_fetched_at` è già lì e sceglie la riga giusta).

> `ponytail:` merge + troncamento invece di rename + resume. Il ceiling è che un crash nel millisecondo
> fra rename e troncamento fa rifare il merge al giro dopo (costo: una `Map` di poche righe). Upgrade path
> se un giorno lo spool diventasse grande: renderlo un file a rotazione giornaliera.

## Perché non le alternative

- **Lock advisory**: cross-container, fragilità su volumi Docker, e un lock dimenticato congela il daemon.
- **Promuovere solo dal daemon** (coda su Redis): aggiunge Redis come dipendenza del daemon e una latenza
  che il "promuovi al click" non può permettersi.

## Test

`tests/tier1SpoolConcurrency.test.js` (lo snippet di Q5 §3 va adattato: `promoteToTier1` deve puntare allo
spool e `store.upsert` deve drenarlo):

- promozione concorrente a un `upsert` **non** perde la riga: dopo un secondo `upsert`, `loadIds` contiene
  l'id promosso;
- una seconda promozione dello stesso id **non** scrive due volte (`hasTier1Id` vede lo spool);
- **idempotenza senza `.draining`**: chiamare `upsert` due volte di fila con uno spool non troncato a mano
  produce lo stesso risultato (nessun duplicato nel master);
- `convert_to_parquet` con spool presente: la riga promossa **vince** su quella vecchia dello stesso id
  (grazie a `_fetched_at`).

## Fatto quando

1. Test verdi e `npm test` non ha regressioni su `tier1*`.
2. Sul server: `/data/tmdb/promoted_*.jsonl` cresce quando si aprono titoli Tier 2 e torna vuoto (o
   assente) dopo il giro orario del daemon; gli id sono dentro `master_*.jsonl`.
3. Apertura di un titolo già promosso: `hasTier1Id` non legge più il master per intero (misurare con
   `time` prima/dopo su un file di centinaia di MB: atteso < 2 ms).

## Rischi e rollback

- **Rischio**: se lo spool non viene drenato (daemon fermo), i titoli promossi non entrano nel Tier 1 ma
  **sono** serviti se `convert_to_parquet` legge anche lo spool. Senza il punto 3 restano invisibili fino
  al giro successivo (comportamento accettabile, non una regressione).
- **Rollback**: immagine precedente; i `promoted_*.jsonl` restano sul volume e vengono ignorati.
