# Da dove vengono i dati

Questa cartella dichiara **chi scarica cosa**. Non è documentazione decorativa: senza, la
manutenzione non sa quali file sono **prodotti del nostro lavoro** (e vanno in `graph/data/`) e quali
sono **dati scaricati** (e possono vivere in `.cache/`, che è una cache e si può cancellare).

## Gli input, e chi li produce

| input | dove | chi lo scarica | stato |
|---|---|---|---|
| **TMDB** (i parquet dei film e delle serie) | `.cache/tmdb/*.parquet` | il prodotto: `src/api/tmdb.js` li mette in cache; i parquet sono una sua esportazione | **da esplicitare** ✗ |
| **MovieLens** (ml-32m) | `.cache/movielens/ml-32m/` | dataset pubblico, da scaricare a mano (https://grouplens.org/datasets/movielens/) | dichiarato ✓ |
| **MovieLens pulito** | `.cache/movielens/ratings-puliti.parquet` | uno script della fase 1, in `.scratch/ml-collaborativo/` | **da portare qui** ✗ |
| **Trakt** (le co-visioni) | `.cache/trakt/` | i **7** script `fetch-trakt-*.js` — in questa cartella: `users` (le co-visioni), `followers`, `full`, `bulk`, `lists`, `movies`, `related` | **fatto** ✓ |
| **gli spazi Trakt e CF** | `.cache/movielens/spazi-trakt.npz`, `cf-spazio.npz`, `cf-studente.npz`, `spazio-pulito.npz`, `boot-B.npz` | gli script della fase 1, in `.scratch/ml-collaborativo/` | **da portare qui** ✗ |
| **i componenti della fase 1** | `.cache/movielens/nuovo-KW.npz`, `nuovo-CAST.npz`, `nuovo-DIR.npz`, `nuovo-TV.npz`, `nuovo-LIST.npz`, `nuovo-COLL.npz`, `nuovo-PROD.npz` | `componenti-nuovi.py`, `07-componenti.py` — fase 1 | **da portare qui** ✗ |

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
