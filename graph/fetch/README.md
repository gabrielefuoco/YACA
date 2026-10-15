# Da dove vengono i dati

Questa cartella dichiara **chi scarica cosa**. Non è documentazione decorativa: senza, la
manutenzione non sa quali file sono **prodotti del nostro lavoro** (e vanno in `graph/data/`) e quali
sono **dati scaricati** (e possono vivere in `.cache/`, che è una cache e si può cancellare).

## Gli input, e chi li produce

| input | dove | chi lo scarica | stato |
|---|---|---|---|
| **TMDB** (i parquet dei film e delle serie) | `.cache/tmdb/*.parquet` | il prodotto: `src/api/tmdb.js` li mette in cache; i parquet sono una sua esportazione | **da esplicitare** ✗ |
| **MovieLens** (ml-32m) | `.cache/movielens/ml-32m/` | dataset pubblico, da scaricare a mano (https://grouplens.org/datasets/movielens/) | dichiarato ✓ |
| **MovieLens pulito** | `.cache/movielens/ratings-puliti.parquet` | **`upstream/00_ratings_puliti.py`** (15/10/2026). Il generatore era `.scratch/ml-collaborativo/ranker-pairwise.py`, righe 186-195, e il nome stava in una **variabile** (`CLEAN`): per questo `grep` per nome file non lo trovava. La ricetta è «tengo le coppie il cui movieId mappa su un titolo del canone» — **nessun filtro sui voti** — e `usecols` scartava `rating` e `timestamp` al momento della lettura, che è perché il file ha due colonne. Riproduce il file **esattamente** (31.652.632 righe · 200.948 utenti) e ora tiene anche le due colonne che l'originale buttava via | **fatto** ✓ |
| **Trakt** (le co-visioni) | `.cache/trakt/` | i **7** script `fetch-trakt-*.js` — in questa cartella: `users` (le co-visioni), `followers`, `full`, `bulk`, `lists`, `movies`, `related` | **fatto** ✓ |
| **spazi-trakt.npz** | `.cache/movielens/` | **`upstream/spazi-trakt.py`** | **fatto** ✓ |
| **cf-spazio.npz · cf-studente.npz** | `.cache/movielens/` | **`upstream/cf-edges.py`** (righe 62 e 86) | **fatto** ✓ |
| **spazio-pulito.npz** | `.cache/movielens/` | **`upstream/contaminazione.py`** (riga 74) | **fatto** ✓ |
| **boot-B.npz** | `.cache/movielens/` | **`upstream/boot-comp.py`** (riga 122, il nome arriva da argomento) | **fatto** ✓ |
| **nuovo-KW/CAST/DIR/TV/LIST/COLL/PROD.npz** | `.cache/movielens/` | **`upstream/componenti-nuovi.py`** | **fatto** ✓ |

## La regola per trovarli, imparata stasera

Cercare il **nome del file** nel sorgente non basta: **gli script costruiscono i nomi in variabili**
(`CACHE = ML / f"cf-spazio.npz"`, `np.savez_compressed(ML / nome, ...)`). Un grep del nome fallisce
su cinque su sei. La domanda giusta e': **cosa scrive questo script?** — e va letta la riga di
scrittura, non cercato il nome.

## La regola

**`graph/data/` è il risultato del nostro lavoro. `.cache/` è ciò che si può riscaricare.**

Il modulo distingue i due con `canon.A(nome)`: cerca in `graph/data/`, e solo se non trova ripiega su
`.cache/movielens/`. **Il ripiego serve alla migrazione, e va tolto quando la migrazione è finita** —
altrimenti si torna ad avere due posti dove guardare, che è esattamente il problema che `graph/data/`
risolve.

## Cosa resta da fare, e non è poco

Gli script della **fase 1** (in `.scratch/ml-collaborativo/`, **156 file**) producono sei input che il
modulo legge ancora. Sono elencati qui sopra, e vanno portati in questa cartella **con lo stesso
criterio**: dentro il modulo quello che si usa, nell'archivio quello che no. Finché restano lì, la
rigenerazione del grafo da zero non è possibile senza leggere 120 report — cioè è esattamente il
problema che questo giro di lavoro doveva risolvere, e l'ha risolto **a metà**.
