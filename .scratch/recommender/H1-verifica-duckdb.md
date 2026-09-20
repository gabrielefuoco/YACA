# Report Verifica Ipotesi H1 — DuckDB & Scoring VSM

**Data:** 2026-09-20  
**Autore:** Executor (sessione di verifica autonoma)  
**Stato Docker:** Demone Docker non attivo (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`).  
**Causa sblocco Windows:** Il binario nativo DuckDB su Windows è perfettamente funzionante. Il fallimento precedente di `probe_shape.js` era causato esclusivamente da `TypeError: Do not know how to serialize a BigInt` lanciato da `JSON.stringify(rows)` sul risultato di `COUNT(*)`. Corretta la serializzazione del BigInt, tutti i probe e le query SQL sono stati eseguiti nativamente sull'host a zero impatto su `node_modules`.

---

## 1. Stato Docker Daemon
```text
Client: Version 28.5.1
docker run --rm hello-world
docker: error during connect: Head "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/_ping": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```
Come da vincolo, non è stato installato né forzato alcun demone sull'host.

---

## 2. Schema Reale di `movies.parquet` (DuckDB)
Query: `DESCRIBE movies` (3.500 righe, tutte con `keywords IS NOT NULL`).

Colonne presenti nel file parquet:
- **Metadati base:** `id` (BIGINT), `imdb_id`, `title`, `original_title`, `original_language`, `overview`, `release_date`, `runtime`
- **Metriche di rating e qualità:** `vote_average` (DOUBLE), **`vote_count`** (BIGINT), **`popularity`** (DOUBLE)
- **Metadati ricchi/tematici:** `genres` (VARCHAR JSON), **`keywords`** (VARCHAR JSON), **`cast`** (VARCHAR JSON), **`directors`** (VARCHAR JSON), `writers`
- **Altro:** `recommendations` (VARCHAR JSON), `watch_providers_it`, `collection_id`, `collection_name`, `adult`, ecc.

Nel parquet DuckDB reale sono presenti **tutti** i campi necessari (`keywords`, `cast`, `directors`, `vote_count`).

---

## 3. Discrepanza Chiave: `mapDuckDbRowToMeta` (`DuckDbProvider.js`)
Nel flusso dei cataloghi hero ("Scelti per Te" / "Gemme Nascoste"):
1. `buildFilteredCatalog` interroga DuckDB tramite `getDuckDbCatalogFromPreset(preset, 0, 1000)`.
2. I record estratti vengono mappati da `mapDuckDbRowToMeta(item)` in un oggetto contenente `rawTMDB`.
3. Ispezione dei campi di `rawTMDB` e `meta`:
   - `vote_count`: **ASSENTE** (`undefined`)
   - `keywords`: **ASSENTE** (`undefined`)
   - `credits` (`cast` / `directors`): **ASSENTE** (`undefined`)
4. `buildFilteredCatalog` (linea 264) passa `item.rawTMDB || item` a `ProfileScorer.calculateItemMatch`.

---

## 4. Effetto Matematico sullo Scoring VSM (`ProfileScorer.js`)
Quando `calculateItemMatch` valuta `item.rawTMDB`:
1. **Perdita Totale del Segnale Tematico/Topos:** `tmdbData.keywords` è vuoto $\rightarrow$ `vectorizeKeywords([])` genera un vettore nullo $\rightarrow$ l'affinità gerarchica con i topoi del DNA utente vale 0.
2. **Perdita Totale del Segnale Autoriale:** `tmdbData.credits` è vuoto $\rightarrow$ bonus registi e attori valgono 0.
3. **Collasso del Bayesian Weighted Rating:** Poiché `vote_count` è `undefined || 0`, la formula IMDb:
   $$WR = \frac{v}{v+m} \cdot R + \frac{m}{v+m} \cdot C$$
   diventa $WR = C = 6.5$. Il rating effettivo `vote_average` viene ignorato (film da 9.5 e da 2.0 ottengono lo stesso identico rating bayesiano di 3.25).
4. **Falso Indie Bonus (+25%):** La condizione `voteCount < 1000` è sempre vera. Qualsiasi film di successo (es. blockbuster con 30.000 voti) riceve il massimo boost indie possibile (+25%).
5. **Saturazione a 10.0 del Punteggio:** Qualsiasi candidato con affinità di genere alta satura a 10.0 per via dell'indie bonus ingiustificato, appiattendo l'intero pool e rendendo l'ordinamento identico all'ordine di estrazione SQL/popolarità.

---

## 5. Dati Numerici Sperimentali (su `movies.parquet`)

### Test A — `probe_scoring_effect.js` & `probe_scoring_effect2.js`
- Profilo con generi e keyword: con keyword = **9.624**, senza keyword = **8.813**, `rawTMDB` = **10.000**.
- Profilo solo-keyword: con keyword = **9.581**, senza keyword = **3.958**.
- Due film con rating 9.5 vs 2.0 (stesso genere): entrambi **3.250** (cecità alla qualità).

### Test B — Valutazione candidati reali da `movies.parquet` (`probe_h1_parquet_evidence.js`)
Profilo interessato a Sci-Fi con preferenza topos "time travel" / "space":

| Titolo | Voti Reali | Rating Reale | Keywords nel Parquet | Score con Light Meta (Attuale) | Score con Dati Parquet (Idratato) | Diff |
|---|---|---|---|---|---|---|
| **Ritorno al futuro** | 22.012 | 8.33 | 26 (ha 'time travel') | **10.000** | **9.660** | -0.340 |
| **Guerre stellari** | 22.519 | 8.21 | 19 (ha 'space') | **10.000** | **9.652** | -0.348 |
| **Matrix** | 28.213 | 8.25 | 14 | **10.000** | **8.926** | -1.074 |
| **Iron Man** | 28.349 | 7.66 | 11 | **10.000** | **8.467** | -1.533 |
| **The Prestige** | 17.753 | 8.21 | 30 | **10.000** | **8.437** | -1.563 |
| **Spider-Man** | 20.880 | 7.34 | 17 | **10.000** | **8.426** | -1.574 |
| **The Amazing Spider-Man** | 18.689 | 6.74 | 20 | **10.000** | **8.397** | -1.603 |
| **L'incredibile Hulk** | 12.824 | 6.25 | 15 | **10.000** | **8.339** | -1.661 |
| **Spider-Man 3** | 15.371 | 6.47 | 18 | **10.000** | **8.285** | -1.715 |

### Risultato sul Ranking:
- **Con Light Meta (attuale in prod):** Tutti i film hanno score **10.000**. Il ranking non distingue le keyword e posiziona *Spider-Man* e *Matrix* prima di *Ritorno al futuro* o *Guerre stellari*.
- **Con Dati Parquet Completi:** *Ritorno al futuro* (9.660) e *Guerre stellari* (9.652) svettano nettamente in cima grazie all'affinità con i topoi del DNA, mentre *Spider-Man 3* e *Hulk* scendono in fondo al pool.

---

## 6. Verdetto su Ipotesi H1
**CONFERMATA AL 100% CON EVIDENZA EMPIRICA E NUMERICA.**  
Il catalogo hero interroga DuckDB ed esclude programmaticamente `keywords`, `credits` e `vote_count` in `mapDuckDbRowToMeta`, provocando cecità tematica, azzeramento della ponderazione qualitativa bayesiana e saturazione artificiale degli score.

---

## 7. Limiti dell'Esperimento
1. **Dataset Parziale:** `.cache/tmdb/movies.parquet` contiene 3.500 film (~2.6 MB) rispetto agli 87.000 del catalogo completo di produzione.
2. **Assenza Parquet Serie TV:** `tv.parquet` non esiste in locale; la verifica su serie TV non è stata eseguibile sui dati reali, ma la struttura di `DuckDbProvider.js` e `catalogStrategies.js` è condivisa per `movie` e `series`.
