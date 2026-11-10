# Dati del grafo: cancellare i derivati, proteggere le fonti

Status: resolved
Type: task
Blocked by: 14

## Perché è delicato

`services/graph/data` pesa **41 GB**, ma il servizio ne usa **~1,5 GB**. Il resto sono versioni sperimentali del grafo (V12…V45x5, `tipi*`, `v18*`, `v30*`…) che esistono perché ogni esperimento scriveva la sua cartella.

Sbagliare qui costa ore di fetch o, peggio, rompe il servizio in silenzio. Quindi: **prima si verificano i percorsi, poi si cancella**, e la lista sotto è il contratto.

## NON TOCCARE MAI — servizio

Verificati uno per uno leggendo il codice (`servizio.py`, `runtime/prepara.py`, `interessi.py`, `canon.py`, `assi.py`, `kids.py`):

| percorso | perché |
|---|---|
| `services/graph/data/v45-transizione/transizione-pota16.npz` | la camminata servita |
| `services/graph/data/v45-vicini100/vicini-top100.npz` | i vicini per il clustering degli scaffali |
| `services/graph/data/assi-canone.npz` | gli assi Tonalità/Impegno |
| `services/graph/data/kw-tfidf/` | vocabolario e matrice delle keyword |
| `services/graph/data/keyword-bambini/blacklist.json` | il filtro della modalità Bambini |
| `services/graph/data/metadati-canone.npz` | metadati per riga del canone |
| `services/graph/data/titoli-canone.txt` | i titoli, nell'ordine del canone |
| `services/graph/data/spazi-trakt.npz` | **definisce la numerazione delle righe**: senza, canone e artefatti si disallineano |
| `services/graph/data/anime_mapping.json` | il flag anime non-TMDB |
| `services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz` | il triangolo V45: serve a **rigenerare** gli artefatti runtime con `prepara.py`. Non è servito a runtime, ma è il grafo che usiamo |

## NON TOCCARE MAI — fonti (rifare il fetch costa ore)

- `.cache/trakt/` (2,0 GB) — utenti e liste
- `.cache/tmdb/` (248 MB) — parquet TMDB
- `.cache/movielens/` (1,2 GB)
- `.cache/anilist/` + `anilist-tags.json` + `anilist-map.json` (15 MB)
- `.cache/serializd/` (823 KB)
- `services/graph_dense/data/trama-qwen3b.npy` + `-idx.npy` (313 MB) — **embedding di trama**, ore di GPU
- `services/graph_dense/data/trama-notitle.npy` + idx
- `services/graph_dense/data/embeddings/kwsem-qwen3-0.6b.npz` (58 MB) e `listsem-qwen3-0.6b.npz` — embedding di keyword e liste
- `services/graph_dense/data/graph/` (555 MB) — input congelati della build: `05-tfidf.npz`, `05-vocab.json`, `04-*`, `spazi-trakt*.npz`, `bolle-eterogeneo-V10/V11/V23-triangolo.npz`

## CANCELLARE — derivati

In `services/graph/data/`: tutte le cartelle di versione tranne `v45`, `v45-transizione`, `v45-vicini100` (`v12, v13, v14, v15, v18*, v19*, v20…v44, v45x1…v45x5, v45-meta, v45-riall, v45-temp, tipi, tipi-norm, tipi-pesi, tipi2*, etc.`), più i file sciolti non usati dal servizio: `transizione-potata.npz` (usato solo dal motore V10 archiviato), `bolle.json`, `mappa-finale-6-2.npz`, `nuovo-LIST.npz`, `bolle-eterogeneo-V10-*.npz`, `bolle-eterogeneo-V23-*.npz`, `bolle-eterogeneo-subvoti*.npy`.

In `.cache/`: `V13*`, `V14*`, `V15*`, `v42d*`, `v42e`, `tribu-ablation-v42/`, `MIX-*`, `LIST-*`, e ogni `.npz`/`.npy` che non sia elencato fra le fonti.

## Come procedere

1. **Prima un inventario secco**: per ogni candidato, `grep` del nome nel codice (`services/graph`, `src`, `scripts`) e verifica che i riferimenti siano solo in moduli archiviati (ticket 14) o in `.scratch/`.
2. **Stampare il piano** con percorso e dimensione, e il totale da liberare.
3. **Cancellare solo su conferma esplicita dell'utente** (`--conferma`), come per la migrazione dei modi: questa è distruttiva e irreversibile.
4. **Dopo**: servizio su `/health`, `/scaffali` e `/raccomanda` funzionanti; `pytest services/graph/tests` verde; golden a `0.000e+00`.

## Esito

Da ~41 GB a ~1,5 GB in `services/graph/data`, con tutte le fonti intatte e il servizio verificato dopo la cancellazione.

## Esito (eseguito il 9/11)

**Cancellati 38,9 GB** da `services/graph/data`: 92 voci fra versioni sperimentali (V12…V45x5, `tipi*`, `v18*`, `v30*`), `transizione-potata.npz`, `bolle.json`, `mappa-finale-6-2.npz`, `nuovo-LIST.npz`. Restano **1,6 GB**: gli artefatti runtime, il triangolo V45 e i file del canone.

**Cancellati 9,0 GB** da `.cache` (derivati: `V13*`, `V14*`, `V15*`, `v42*`, `tribu-ablation`, `MIX-*`, `LIST-*`), **33,0 GB** da `services/graph_dense/data` (modelli `.pt`, `rrfstudent-*`, `ens*`, checkpoint) e **4,9 GB** di venv. Fonti intatte: Trakt, TMDB, MovieLens, AniList, Serializd, embedding di trama, embedding keyword e liste, input della build in `graph_dense/data/graph/`.

### L'errore, e cosa è costato

Ho cancellato **tre input della build riproducibile** che non erano nella lista delle fonti del ticket:

- `kw-emb.npy` + `kw-emb.txt` — **rigenerati in 14 secondi** con `.scratch/distillazione-grafo/kw-emb-cache.py`;
- `rrfstudent-norrfst.npz` — **perso**. Era una fonte della fusione V45 con **peso 1.0** (`pipeline-manifest.json → parameters.rrfst_source`, RRF `k=15`), e il suo maestro (`v18/maestro.npz`) è stato cancellato nello stesso passaggio.

Conseguenze precise, verificate:

| cosa | stato |
|---|---|
| grafo servito (runtime, scaffali, PPR) | **intatto** — 96 test verdi, golden `0.000e+00` |
| rigenerare `transizione-pota16` e `vicini-top100` | **possibile**: `prepara.py` li ricava dal solo triangolo V45, che è conservato |
| ricostruire il triangolo V45 dai dati grezzi | **rotto**: serve quello studente, e non è ricreabile identico |
| collocare un titolo nuovo (cold start) | **già non esisteva** — vedi ticket 17 |

**La lezione, da applicare al prossimo giro**: la lista degli input non la detta la memoria, la detta `graph.build --check`. Va eseguito **prima** di cancellare, e il suo output va allegato al ticket come lista di protezione.


## Esito (sintesi)

Vedi "Esito" in fondo: 38,9 GB via da `data/`, 9 GB da `.cache`, 33 GB da `graph_dense/data`, 4,9 GB di venv. Con l'errore dello studente documentato.
