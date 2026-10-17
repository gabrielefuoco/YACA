Status: resolved (prima metà: indice e compilatore)
Type: grilling

# 22 — Il modulo ricerca (e l'AI come modulo a parte)

## Perché

La ricerca oggi è **quattro cose in una**: il dispatch verso le fonti, la comprensione della richiesta (con l'AI
che normalizza), l'indice locale (DuckDB in RAM + FTS5) e la **fusione/ordinamento** dei candidati. La traccia
che nessuno le possiede per intero è una delle suite rosse di stanotte: `tests/searchTier2Merge.test.js`, che
testa **l'ordine fra i locali e il Tier 2** — un comportamento nato dentro il router e senza proprietario.

I fatti: `src/catalog/CatalogRouter.js` importa **sei provider** (Trakt, Hybrid/pool, AI Discovery, AiringState,
DuckDB, Watchlist); l'**AI è usata da sei file** (`api/catalog.js`, `api/configurazione.js`, `CatalogRouter.js`,
`providers/AiDiscoveryProvider.js`, `providers/AiQueryNormalizer.js`, `providers/DuckDbProvider.js`); il Tier 2
sono tre file (`catalog/tier2Enrich.js`, `catalog/tier2Search.js`, `db/tier2Index.js`).

## Deciso in grilling (17/10/2026)

- **La ricerca non contiene l'AI.** Possiede «da una richiesta a una lista ordinata di candidati»: il dispatch
  verso le fonti, la fusione locale/Tier 2, l'ordinamento.
- **L'AI è un modulo a parte**: piccolo, condiviso, e possiede il **meccanismo** (il client/il router verso il
  modello, il budget, i tempi) — **non i prompt**: ogni modulo tiene i suoi (la ricerca i prompt di ricerca, i
  cataloghi i loro). È la regola della libreria applicata ai modelli: *fornisce il meccanismo, non le decisioni*.
- Il collaudo che il modulo eredita è **`searchTier2Merge`**: l'ordine fra locali e Tier 2 è suo, e il test
  rosso è la sua prima verifica.
- **Le sei fonti diventano un registro** (come `registry.js` per le righe hero): ognuna dichiara il suo contratto
  — chi è, che specie di fonte è, quando si applica, come si interroga — e **due consumatori** lo consultano: la
  **ricerca** (che possiede la fusione e l'ordinamento) e il **servire** (che possiede «un catalogo → una fonte»).
  Nessuno dei due possiede l'altro, e aggiungere una fonte è una voce nel registro invece di un import in più nel
  router. Il router fa **due mestieri** (serve un catalogo *e* alimenta la ricerca): è il motivo per cui la scelta
  non era «dentro o fuori», ma *chi possiede le fonti*.

## Tutte le domande decise (17/10/2026)

| domanda | decisione |
|---|---|
| l'AI | **fuori dalla ricerca**: è un modulo piccolo e condiviso che fornisce il **meccanismo**, non i prompt (ogni modulo tiene i suoi) |
| le sei fonti | diventano un **registro** col loro contratto, consultato da **due consumatori**: la ricerca (fusione e ordinamento) e il servire (catalogo → fonte) |
| l'indice | **un modulo con due clienti** (cataloghi e ricerca); `DuckDbProvider` non è l'indice, è un suo cliente |
| il query builder | diventa il **compilatore dell'indice**: filtri dichiarativi in, **query parametrizzata** out — e vive nell'indice, non in `src/db/` |
| la porta | **una**: `cerca({ q, tipo, contesto, cap })`, col `tipo` come parametro (e opzionale, per lasciare aperta la ricerca in linguaggio naturale) |
| il vuoto | **lista vuota + `motivi[]`, mai un errore** — la stessa forma del contratto del motore e la regola di Stremio (`STREMIO_INTERNALS.md:129`) |
| indice vs cache | **due moduli, confine *dato vs risposta***: l'indice possiede i file, la freschezza, la ricostruzione e il motore; la cache le risposte memorizzate. La cache non finale l'indice, l'indice non tiene mai una risposta |

---

## Le domande che restano (per il prossimo grilling / seconda metà)

1. **La porta**: `cerca({ q, tipo, contesto, cap }) → items`? E il `tipo` (titolo/genere/keyword/persona) è un
   parametro della ricerca o una **modalità** che cambia il percorso?
2. **`CatalogRouter`**: diventa l'interno del modulo ricerca, o resta il dispatcher e il modulo possiede solo la
   fusione? (La differenza è dove finisce la conoscenza dei sei provider.)
3. **L'AI dentro la ricerca** (quando serve): la ricerca chiama il modulo AI e gli passa **i suoi** prompt — o il
   modulo AI ha anche una «ricerca AI» che i cataloghi usano? (La prima è la lettura della decisione presa.)
4. **L'indice locale** (DuckDB + FTS5 + Tier 2): risolto per l'indice (prima metà del ticket).
5. **Il vuoto e il degrado**: ricerca senza risultati, indice non pronto, modello giù — cosa risponde la porta.

---

## Esito (Prima Metà: Modulo Indice e Compilatore Parametrizzato)

### 1. Il contratto dell'indice (`src/indice/index.js`)
L'indice è ora un modulo autonomo con **un solo contratto**:
*«dammi i titoli che soddisfano questi filtri, in quest'ordine»* (`indice.getTitles(filtersOrPreset, { skip, limit })` / `indice.query(...)`) oltre alla ricerca testuale (`indice.search(q)` e `indice.searchTier2(q)`).

- **Possiede il motore**: incapsula DuckDB (su file persistente `catalog.duckdb` come da ticket 19, preservando il boot a 1.6s e il risparmio RAM), l'indice SQLite FTS5 Tier 2 (`titles_fts5.db`), la verifica di freschezza (`isFresh()`), e la ricostruzione.
- **Interfaccia pulita**:
  - `query(filtersOrPreset, { skip, limit, type })`: compila ed esegue via parametri preparati DuckDB, restituendo le righe grezze dei titoli;
  - `getTitles(...)`: alias esplicito del contratto per i consumer;
  - `search(q, { type, limit, skip })`: ricerca testuale su DuckDB Tier 1 FTS BM25;
  - `searchTier2(q, { type, limit })`: ricerca sulla coda lunga da 1,45M titoli (SQLite FTS5);
  - `getById(id, type)`: lettura diretta parametrizzata `SELECT * FROM table WHERE id = ?`;
  - `resolveImdbIds` / `resolveTmdbToImdb`: risoluzione mapping ID su DuckDB.

### 2. I due clienti
- **Client 1 — Cataloghi (`src/catalog/providers/DuckDbProvider.js`)**:
  `DuckDbProvider` è stato sdoppiato e trasformato in un mero client dell'indice. Non costruisce più stringhe SQL né interroga direttamente tabelle: invoca `indice.getTitles(safePreset, { skip, limit })` e `indice.getById(tmdbId, type)`, trattenendo esclusivamente le responsabilità di serving (trasformazione delle righe grezze in Stremio Meta tramite `mapDuckDbRowToMeta`, `resolveDisplayTitle`).
  *Nota di confine*: `buildPresetFromFilters` rimane dove si trova dentro `DuckDbProvider.js` in attesa che il ticket 23 definisca il tipo del catalogo.
- **Client 2 — Ricerca**:
  Interroga `indice.search` per i candidati locali Tier 1 e `indice.searchTier2` per i candidati coda lunga Tier 2.

### 3. Il compilatore prima e dopo (`src/indice/compiler.js`)
- **Prima (`src/db/queryBuilder.js`)**:
  Costruiva query SQL mediante concatenazione di stringhe e funzione artigianale di escaping `escapeSqlString(value)`. I valori utente (`ftsClause`, termini di ricerca, ID simili, limit, skip) venivano interpolati direttamente nella stringa SQL:
  ```javascript
  // PRIMA: interpolazione diretta
  normalFilters.push(`fts_main_${table}.match_bm25(id, '${ftsClause}') IS NOT NULL`);
  normalFilters.push(`${searchableTitle} ILIKE '%${sqlTerm}%'`);
  return `SELECT * FROM ${table} WHERE ${where} ... LIMIT ${limit} OFFSET ${skip}`;
  ```
- **Dopo (`src/indice/compiler.js`)**:
  La funzione `escapeSqlString` è **completamente scomparsa** dal compilatore. `compileQuery(preset, skip, limit)` riceve filtri dichiarativi e produce `{ sql, params }`:
  ```javascript
  // DOPO: prepared statements nativi DuckDB
  normalFilters.push(`fts_main_${table}.match_bm25(id, ?) IS NOT NULL`);
  params.push(ftsClause);
  normalFilters.push(`${searchableTitle} ILIKE ?`);
  params.push(`%${term}%`);
  // LIMIT e OFFSET parametrizzati:
  const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ${exactTitle} ASC, ${score} DESC, id ASC LIMIT ? OFFSET ?`;
  return { sql, params: fullParams };
  ```
- **Prova che nessun valore utente è interpolato in SQL**:
  Con una query di test come `_fts: "d'azione"`:
  - `query.sql`: contiene solo placeholder posizionali `?` (`match_bm25(id, ?)`, `ILIKE ?`, `LIMIT ? OFFSET ?`);
  - `query.sql`: **non contiene** `"d'azione"` né `"d''azione"`;
  - `query.params`: trasporta i valori grezzi intatti (`["d'azione", "%d%", "%azione%", "d'azione", "d'azione", "d'azione", 10, 0]`);
  - DuckDB esegue via `con.all(sql, ...params)` senza errori Binder o di parsing.

### 4. Regression Net e Collaudo
- Nuova suite TDD dedicata: `tests/indice.test.js` (**11 test su 11 passati in 1.25 s**):
  - 5 test sul compilatore (assenza di `escapeSqlString`, parametri FTS, termini, similar e tie-breaker);
  - 6 test sul contratto dell'indice con fixture DuckDB in RAM isolata (ordinamento deterministico, boost esatto, FTS, getById, searchTier2, e DuckDbProvider come client).
- Esecuzione delle suite esistenti:
  - `tests/duckDbPresetsValidation.test.js`: **4/4 passati** (tutti i 162 preset compilati ed eseguiti con successo).
  - `tests/tier2Index.test.js`: **15/15 passati** (retrocompatibilità del facade `src/db/tier2Index.js`).
  - `tests/searchTier2Merge.test.js`: **24/24 passati**.
  - `tests/duckDbAndMatchmaker.test.js`: 22 passati, 1 fallimento pre-esistente per assenza del dump reale TMDB da 138MB (`Spider-Man: No Way Home`).

### 5. Cosa resta per la seconda metà del ticket (Modulo Ricerca)
- Il registro unificato delle sei fonti (`registry.js` per i provider).
- La logica di fusione locale/Tier 2 con ordinamento definitivo (da agganciare al tipo catalogo del ticket 23).
- L'esposizione della porta unica `cerca({ q, tipo, contesto, cap })` con risposta strutturata a lista vuota + `motivi[]` in caso di degrado o assenza di risultati.

