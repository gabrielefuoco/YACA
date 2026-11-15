Status: ready-for-agent
Type: research
Priorità: P0 (blocca 07, 10 e la taratura di 01/05/09)

# 00 — Verifiche preliminari prima di toccare il codice

**Riferimento**: risposta del revisore in [`../risposta-senior.md`](../risposta-senior.md) — sezioni **Q1 §1**, **Q3 §2**, **Q4 §2**, **Q7 §1**, **Q8 §2**. Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md` (verrà cancellato: la copia versionata in questa cartella è quella buona).

## Perché

Il revisore ha scritto patch assumendo API che **non ha potuto verificare** (aveva solo il digest) e ha
lasciato due punti dichiaratamente aperti. Prima di implementare va chiusa questa lista: sono dieci
minuti di lavoro che evitano di riscrivere i ticket dopo.

## Da verificare (e come)

1. **Soglie e baseline numeriche**, da misurare **prima** di toccare nulla:
   ```bash
   cat /data/tmdb/ita_annotations.meta.json | jq .counts          # quante annotazioni
   ls /data/erdb-cache | wc -l; du -sh /data/erdb-cache           # volume poster
   wc -l /data/tmdb/master_movies.jsonl /data/tmdb/master_tv.jsonl  # crescita attesa dal ticket 03
   node services/doppiaggi-source/cli.js --dry-run | tail -60     # distribuzione dei motivi di match
   ```
   Output in `ricerche/00-baseline.md`: è il termine di paragone di ogni "prima/dopo".
2. **`tmdbDumpClient` non ha `_buildMovieRow`/`_buildTvRow`** (verificato: non esistono). La patch Q3 li usa:
   vanno estratte da `fetchMovie`/`fetchTv` come funzioni pure e usate **anche** dai metodi esistenti.
   Nessun cambio di formato della riga.
3. **`duckDbStore` ha `this.con`, `this._exec`, `activeQueries`, `_zeroActiveQueriesWaiters`** (verificati).
   Manca `_lastItaMtimeMs`: va aggiunto nel costruttore.
4. **`tmdbDumpClient` non ha ancora un seam per i test**: il client è istanziato dentro il daemon. Va
   reso iniettabile (un parametro) altrimenti `dailySync` non è testabile senza chiamare TMDB.
5. **Rotta admin**: il middleware legge `x-admin-pass` (`src/api/middleware/adminAuth.js:9`), non
   `x-admin-token`. `src/api/admin.js` fa già `router.use(adminAuth)`.
6. **`posterFileName({erdbId, badge, version})`** (verificato, `src/posters/erdb/build.js:69`): la
   semplificazione del ticket 11 punto 3 è fattibile senza toccare la firma.
7. **`erdb-build` notturno** (ticket 08): trovare il comando esatto con cui è stato eseguito in passato
   (istanza ERDB, `ERDB_LOCAL_BASE`, out dir) e scriverlo in `ricerche/08-prefill.md`.

## Già risolti (non servono più verifiche)

- **Conditional GET**: non serve. Il ticket 01 usa TTL sull'mtime, niente ETag.
- **Build context di `yaca-anime-source`**: è `./services/anime-source` (isolato), ma l'immagine
  dell'app usa `COPY . .` e `.dockerignore` **non** esclude `services/anime-source/` → il ticket 07 può
  importare `mappingIndex.js` direttamente. Cautela: se un domani lo si aggiunge al `.dockerignore`,
  l'import fallisce **a runtime**.

## Fatto quando

C'è un `ricerche/00-baseline.md` con i quattro numeri di baseline e la conferma dei punti 2-7.

**Nessuna modifica al codice in questo ticket.**
