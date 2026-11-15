Status: ready-for-agent
Type: task
Priorità: P3 (terza onda)
Blocked by: nessuno (il test di swap è dentro il ticket)

# 06 — Doppiaggio: filtro `onlyIta` in SQL e allineamento a caldo della colonna `ita`

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q4 & Q9** (contratto (a), `F.onlyIta`, cablaggio in `duckDbProvider`, `syncItaAnnotationsLive` in `duckDbStore`, test, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto

Due problemi che si risolvono insieme:

1. **Il filtro "solo ITA" non esiste.** `scripts/convert_to_parquet.js` produce già la colonna `ita`
   (tre stati: `true` doppiato, `null` omonimia irrisolta, `false` non doppiato; riga assente = `false`)
   via `LEFT JOIN` con `ita_annotations.jsonl`, e `src/catalog/capabilities.js` dichiara `onlyIta` e
   `isDubbed`. Ma **nessuno** la espone in `src/indice/filters.js` né la collega in
   `src/indice/duckDbProvider.js`: le capability sono dichiarate e inerti.
2. **Due verità disallineate fino a 24 h.** I badge leggono `ita_annotations.jsonl` in RAM (TTL 60 s), il
   filtro leggerebbe il parquet, che si aggiorna **solo** quando gira `convert_to_parquet.js` (il timer
   doppiaggi non lo tocca). Quindi per un giorno il badge dice "doppiato" e il filtro dice il contrario.

Decisione (dal revisore, confermata): **il file è l'unica verità**, il parquet/DuckDB è un indice derivato.

## Cosa fare

1. **`src/indice/filters.js`** — aggiungere in `F`:
   ```js
   onlyIta: (strict = false) => (strict ? '"ita" IS TRUE' : '"ita" IS NOT FALSE'),
   ```
   `IS NOT FALSE` è la semantica giusta: include `true` **e** `null`, esclude solo `false`. Va scritto
   qui e **mai** `COALESCE(ita, false)` (appiattirebbe `null`, cioè mostrerebbe tutto come doppiato).
2. **`src/indice/duckDbProvider.js`** — in `buildPresetFromFilters`, se `q.onlyIta || q.isDubbed` (o
   `options.onlyIta`) pushare `F.onlyIta(strict)` dove `strict = q.strictIta === true`.
3. **`src/indice/duckDbStore.js`** — `syncItaAnnotationsLive(options)`:
   - legge `itaAnnotations.annotationsPath()`, `statSync().mtimeMs`, salta se invariato (`_lastItaMtimeMs`);
   - `ALTER TABLE movies ADD COLUMN IF NOT EXISTS ita BOOLEAN DEFAULT false` (e `tv`);
   - ricrea la tabella temporanea dal JSONL e fa `UPDATE … SET ita = false` + `UPDATE … FROM` per
     `t='movie'` e `t='tv'`;
   - chiamarlo in `init()` **e** in `ensureFreshHandle()` (dopo ogni refresh dell'handle), perché uno
     swap del daemon ricrea le tabelle dal parquet e azzera l'UPDATE;
   - chiudere con il decremento di `activeQueries` e il risveglio dei waiter, come fa il resto della
     classe (il pattern esiste già: `_zeroActiveQueriesWaiters`).
4. **Capability**: aggiornare `src/catalog/capabilities.js`/`previewContract.js` solo se serve
   pubblicizzare il filtro nell'anteprima; non cambiare la semantica dichiarata (`null` incluso).

## Adattamenti necessari (verificati)

- `this.con`, `this._exec`, `activeQueries`, `_zeroActiveQueriesWaiters` **esistono**. `_lastItaMtimeMs`
  **non** esiste: va aggiunto nel costruttore.
- Il codice del revisore fa `UPDATE movies …` su tutte le righe a ogni sync: su ~500k righe in DuckDB
  sono decine di ms, ma va misurato; se supera **500 ms** si passa a `UPDATE … WHERE id IN (…)` sui soli
  ~10k id presenti nel file.
- **`CHECKPOINT` obbligatorio dopo gli `UPDATE`** (una riga). `catalog.duckdb.wal` è legato al **path**, non
  all'inode: senza checkpoint, il daemon che fa `rename` del nuovo DB sopra quel path lascia accanto il WAL
  del DB **vecchio**, e al prossimo `OPEN` DuckDB lo rigioca contro il file nuovo → corruzione, non degrado.
  Con il `CHECKPOINT` il WAL è consumato e non c'è niente da rigiocare.
- **Attenzione all'ordine con il daemon**: l'UPDATE dell'app su un file che il daemon sostituisce viene
  perso: è accettabile perché `ensureFreshHandle` ri-sincronizza, ma è il motivo per cui la
  sincronizzazione deve stare **anche** lì e non solo in `init()`.
- Il test del revisore usa `node:test` e `buildPresetFromFilters({onlyIta:true},'movie')`: verificare la
  firma reale della funzione prima di scrivere l'assert.
- **Nota di merito, non un difetto**: la divergenza che il live sync chiude è di ~1 ora, perché il daemon
  ri-converte i parquet a ogni giro orario leggendo `ita_annotations.jsonl`. Si tiene il live sync per
  scelta (sub-hour), non perché la colonna sia ferma da un giorno.

## Test

- `tests/itaSqlFilter.test.js`: tabella con tre righe (`true`,`null`,`false`) → `F.onlyIta(false)` filtra
  `[1,2]`, `F.onlyIta(true)` filtra `[1]`, e il SQL generato **non contiene** `COALESCE`.
- `syncItaAnnotationsLive`: con un JSONL fixture e un DuckDB in memoria con tabella `movies` senza colonna
  `ita`, il metodo aggiunge la colonna, allinea i valori, e al secondo giro con mtime invariato ritorna
  `{synced:false, reason:'already_fresh'}`.
- **Test di swap (il più importante)**: DB su file, `UPDATE` + `CHECKPOINT`, poi simulare il daemon che
  rinomina un nuovo DB sopra il path; riaprire la connessione e verificare che (a) non ci sia replay di WAL
  stantio e (b) `syncItaAnnotationsLive` rimetta i valori. Senza questo test il ticket non si mergia.
- File mancante → no-op, nessun throw, parquet intatto.

## Fatto quando

1. Test verdi, `npm test` verde.
2. Su DuckDB: `SELECT ita, count(*) FROM movies GROUP BY ita` mostra i tre stati e coincide con
   `ita_annotations.meta.json` entro 60 s dal giro del timer.
3. Una query di preset con `onlyIta` restituisce solo titoli con `ita` non-`false`; con `strictIta` solo
   `true`. Verificare a mano su 5 titoli noti doppiato/non doppiato/ambiguo.

## Rischi e rollback

- **Rischio**: se `ita` non c'è nel parquet, `ALTER TABLE … DEFAULT false` la crea a `false` e il filtro
  restituisce **zero** risultati finché il live sync non gira. Mitigazione: live sync in `init()` **prima**
  di accettare query, e log esplicito quando la colonna è stata creata.
- **Rollback**: togliere il push di `F.onlyIta` (il resto è inerte); il live sync può restare, non cambia
  nulla per chi non lo usa.
