# Mappa — Hardening dell'ingestione dati

**Origine**: revisione esterna dell'ingestione (TMDB, anime, doppiaggi ITA, poster) fatta sul digest di 146 file.
La risposta del revisore è versionata qui: [`risposta-senior.md`](risposta-senior.md) (originale in
`C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`, che è temporaneo e verrà cancellato).
L'handoff che ha prodotto la revisione resta in `%TEMP%\yaca-handoff-2026-11-15\yaca-handoff-ingestione.md`.

## Destination

Chiudere i modi in cui l'ingestione **perde dati o congela gli aggiornamenti in silenzio**, senza
introdurre servizi nuovi e senza migrazioni manuali (il rilascio è un'immagine nuova sostituita da
Watchtower: ogni patch deve auto-ripararsi al boot o restare retrocompatibile con i file esistenti).

## Decisioni prese

**Vincoli di stile (valgono su ogni ticket): ponytail/full — la soluzione più corta che funziona, un solo
scrittore per file, nessuna macchina a stati dove basta un `if`, nessuna race cross-container. Nessun kill
switch: si rollbacka con revert.**

- Il contratto del doppiaggio è **(a)**: `ita_annotations.jsonl` è l'unica verità, la colonna `ita`
  nei parquet è un indice derivato → ticket 06. Il live sync si fa (scelta esplicita, nonostante la
  divergenza reale sia ~1 ora perché il daemon ri-converte ogni giro), **con `CHECKPOINT` obbligatorio**
  dopo gli `UPDATE`: il WAL è legato al path, non all'inode, e senza checkpoint lo swap del daemon
  rigiocherebbe un WAL stantio contro il DB nuovo (corruzione). Test di swap obbligatorio.
- La concorrenza Tier 1 si risolve con **spool append-only** (`promoted_*.jsonl`): un solo scrittore per
  file, il daemon **fonde e tronca** (idempotente), niente `.draining`, niente resume → ticket 04.
- Il `null` di TMDB si tipizza in **tre** stati (`ok` / `not_found` / `errore`) e solo `not_found` (o
  `adult`) può cancellare → ticket 02.
- Freschezza indici doppiaggi: **TTL sull'mtime + rotazione di 21 pagine per giro**, non un sidecar con
  ETag/sha256 → ticket 01.
- Matching doppiaggi: **guardia di lunghezza** nel containment esistente + anno ±1 con margine, non uno
  score IDF-Dice → ticket 05, gated dal dry-run + campione di 20 casi.
- Poster: il token dell'immagine entra nell'hash, la mappa `sorgenti.json` serve al **drenatore** (che non
  ha `source` negli eventi), i nomi nuovi si generano col **prefill offline prima del deploy** → ticket 08.
- GC poster: solo `.tmp` orfani + TTL 60 giorni, timer giornaliero 05:00, nessuna quota e nessuna logica
  "episodio superato" → ticket 09.
- I tagli di over-engineering si fanno **dopo** i fix funzionali, uno per commit, con i test verdi → ticket 11.
- Rilascio: **3 onde** con misure fra una e l'altra (merge = deploy, Watchtower entro un'ora). Integrazione
  su un branch per onda, un commit per ticket, merge solo a misure verdi. Delega: un agy per ticket in
  parallelo sui ticket che non condividono file; review e merge in capo a me. Gate: metrica in locale
  pre-merge, stessa metrica sul server entro 24 h; se rossa, revert.
- Perimetro: **solo i 12 ticket**. Restano fuori e dichiarate: `docs/` obsoleta, ~10.264 titoli non latin
  non matchabili, `anime-source` che può morire senza che nessuno riavvii.

## Ordine di rilascio (dal parere del revisore)

| Onda | Ticket | Perché |
|---|---|---|
| 1 | 01, 02 | sbloccano la freschezza dei doppiaggi e fermano le cancellazioni spurie. Rischio basso, guadagno massimo |
| 2 | 04 | chiude il lost-update cross-container e toglie la scansione da centinaia di MB a ogni apertura |
| 3 | 06, 07 | attivano il filtro ITA e tolgono il degrado silenzioso degli anime |
| 4 | 03, 05 | cambiano il comportamento del catalogo (più titoli, più `true`): da rilasciare quando si può misurare |
| 5 | 08, 09, 10 | poster: invalidazione, GC, semaforo |
| 6 | 11 | tagli, a fix chiusi |

## Non ancora specificato

- Con quali numeri tarare le soglie nuove: `maxRefreshPerRun` si calcola (`ceil(pagine/4)`), la crescita
  del catalogo per il ticket 03 ha una barra (**< +15%** titoli, **< +10%** durata) che va confermata sui
  numeri del ticket 00, e il campione di 20 casi del ticket 05 va fatto prima del merge.
- Il **`errdb-build` notturno** del ticket 08 richiede che l'istanza ERDB sia raggiungibile da dove gira il
  prefill: verificare il comando esatto usato in passato.
- Quando dire "chiuso": ogni ticket ha la sua metrica, ma non c'è una data. Le onde procedono a misure
  verdi, non a calendario.

## Fuori ambito

- `docs/` (obsoleta: non è stata inclusa nel digest e non va usata come fonte).
- Traslitterazione dei ~10.264 titoli non latin (nessuna fonte oggi: richiede una decisione a parte).
- Watchdog di `anime-source` (Docker non riavvia un unhealthy; oggi il degrado è solo visibile col ticket 10).
- Servizio `graph`/`graph_dense`, frontend, Trakt, DNA/VSM.
- Riscritture dei moduli oltre a quanto elencato nel ticket 11.
