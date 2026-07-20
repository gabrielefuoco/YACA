# Architettura SQL-First e Motore Analitico DuckDB

Questo documento espone l'architettura SQL-First introdotta in **YACA**, la quale demolisce la dipendenza diretta dalle API remote di TMDB a favore di interrogazioni SQL native ultra-veloci (in memoria) sfruttando i parquet dump locali.

---

## 1. Il Paradigma SQL-First

Inizialmente, YACA definiva i propri cataloghi pre-impostati (*presets*) usando parametri API TMDB (es. `with_genres`, `sort_by`, `vote_count.gte`). Questi venivano convertiti on-the-fly tramite un traduttore legacy (`tmdbToSqlTranslator.js`).
Tuttavia, tale approccio impediva query complesse, specialmente con and/or annidati (es: *A OR B AND C OR D*).

L'architettura SQL-First risolve questo limite abbracciando nativamente un **Domain Specific Language (DSL)** funzionale basato su SQL.

---

## 2. Componenti Chiave

### A. `src/data/filters.js` (La DSL SQL)
Espone primitive costruttive (factory) sotto l'oggetto `F` e l'oggetto `S` (Sorting).
Ogni funzione restituisce un frammento SQL.

*Esempi:*
- `F.genre(28, 12)` -> Costruisce l'intersezione SQL su campi JSON per l'inclusione logica di genere in `OR`.
- `F.allGenres(28, 12)` -> Costruisce logica in `AND` (deve avere entrambi).
- `F.minVotes(100)` -> `vote_count >= 100`
- `F.releasedAfter('2023-01-01')` -> Filtra i timestamp.
- **Logica dell'Array**: Gli elementi nell'array `where` fornito da un preset sono uniti implicitamente da un `AND` al vertice della query.

### B. `src/db/queryBuilder.js`
È il generatore SQL. Prende un oggetto *preset* e lo compila in una robusta sintassi SQL DuckDB compatibile con i parquet (o con i file JSON estratti per fallback).
- Se presente il parametro `{ _fts: "termine" }`, concatena stringhe ed esegue una `BM25` search.
- Se presente il parametro `{ _similar: 1234 }`, effettua l'estrazione dai campi `recommendations` stoccati in pre-computazione nel database locale.

### C. `src/catalog/providers/DuckDbProvider.js`
Il provider che connette la logica astratta al database fisico di esecuzione. Esegue `queryBuilder.js`, incanala i dati grezzi estratti (spesso in ~10-15ms) e mappa le colonne lette nella sintassi unificata di risposta *Stremio Light Meta*, che arricchirà il frontend senza effettuare alcuna richiesta web.

### D. `scripts/sync_entities.js`
Rimuove la necessità di definire in modo verboso gli hash-map o i dizionari (es. ID -> Nome Regista). Scansiona i preset, estrae gli ID di crew/cast/keyword/generi, li risolve tramite chiamate in locale al DuckDB, e produce staticamente il dizionario `src/data/entities.json`, caricato all'avvio.

---

## 3. Compatibilità con il VSM

Il **Vector Space Model (VSM)** e il motore bayesiano mantengono per il momento la vecchia architettura TMDB-like che emette "queries".
Per non frantumare un modello perfettamente funzionante, è stato introdotto il pattern **Adapter**: `src/utils/legacyTmdbAdapter.js`.

Questa utility funge da ponte:
1. Intercetta gli input TMDB passati da `AiDiscoveryProvider`.
2. Li traduce al volo nella sintassi DSL array di YACA.
3. Lo passa a `DuckDbProvider.js` offrendo gli enormi vantaggi prestazionali senza richiedere variazioni sull'intelligenza artificiale.
