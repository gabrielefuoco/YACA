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

### D. Il dump TMDB e la politica dei titoli

> [!NOTE]
> `scripts/sync_entities.js` **non esiste più**: la risoluzione degli ID di crew/cast/keyword è oggi fatta a runtime da `src/data/filters.js` e dal grafo gerarchico, non da un dizionario statico precompilato.

**I titoli arrivano da TMDB con una politica esplicita: italiano → inglese → originale** (ticket 14).

Il problema che l'ha resa necessaria: `tmdbDumpClient` interroga TMDB con `language: 'it-IT'` e **nessun fallback**. Quando la traduzione italiana non esiste, l'API non restituisce un campo vuoto — restituisce l'**originale**, che per un anime è la stringa giapponese. Quel valore finiva tal quale in `name` (serie) / `title` (film) nel parquet, e da lì nella card: misurato, **716 serie su 3.177** e **1.845 film su 4.351** con caratteri CJK nel titolo mostrato.

Come funziona oggi:

1. le richieste includono `translations` in `append_to_response`, quindi **non servono chiamate in più** per avere i titoli alternativi;
2. `resolveIngestTitle` sceglie: italiano se esiste, altrimenti inglese, altrimenti l'originale;
3. il record porta anche le colonne dedicate **`title_en`** (film) e **`name_en`** (serie), così la policy resta verificabile a valle;
4. `DuckDbProvider.resolveDisplayTitle` risolve il nome da mostrare **prima** di `_rawName`, quindi il formatter e i badge episodio vedono già il titolo giusto.

**Attenzione ai nomi dei campi, sono diversi fra film e serie**: i film usano `title`/`original_title`, le serie `name`/`original_name`. Una correzione che ne copre uno solo lascia l'altro rotto.

**Retrocompatibilità**: i parquet esistenti non hanno le colonne nuove. All'avvio `duckDbStore` esegue `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, quindi un parquet vecchio si carica senza errori e le colonne risultano `NULL`.

**I titoli già compromessi non si riparano da soli**: la policy agisce in **ingestione**, quindi vale per i titoli futuri. Il backfill dei visibili è `scripts/backfill-cjk-titles.js` (misurabile con `scripts/qa/measure-cjk-titles.js`): ~715 chiamate e ~3 minuti per i soli titoli che possono affiorare in vetrina.

---

## 3. Compatibilità con il VSM

Il **Vector Space Model (VSM)** e il motore bayesiano mantengono per il momento la vecchia architettura TMDB-like che emette "queries".
Per non frantumare un modello perfettamente funzionante, è stato introdotto il pattern **Adapter**: `src/utils/legacyTmdbAdapter.js`.

Questa utility funge da ponte:
1. Intercetta gli input TMDB passati da `AiDiscoveryProvider`.
2. Li traduce al volo nella sintassi DSL array di YACA.
3. Lo passa a `DuckDbProvider.js` offrendo gli enormi vantaggi prestazionali senza richiedere variazioni sull'intelligenza artificiale.
