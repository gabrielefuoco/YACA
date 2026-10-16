# Cosa portare sul mate — tre livelli, e il più piccolo basta quasi sempre

**Il prodotto non ha bisogno di niente**: `src/data/bolle.json` (3,2 MB) è in git, quindi il mate serve il
grafo appena clona il repository, senza copiare un byte.

## Livello 1 — COLLOCARE I TITOLI NUOVI (e far girare il motore): 104 MB

È quello che serve ogni notte, e sta in una cartella:

| cosa | peso | perché |
|---|---|---|
| `graph/data/04-*` e `05-*` (spazi V1 e V3, vocaboli, idf, centroidi, impronte) | 38 M | il coseno con cui si sceglie la bolla macro e i vicini micro |
| `graph/data/bolle-eterogeneo-subvoti.npy` | 0,5 M | la partizione: quali bolle esistono |
| `graph/data/mappa-finale-6-2.npz` + `transizione-potata.npz` | 9,5 M | la mappa 6+2 e la transizione potata (per il motore, non per il collocatore) |
| `graph/data/metadati-canone.npz` + `titoli-canone.txt` | 1,9 M | voti, anni, episodi, generi e i 66.259 titoli |
| **`.cache/tmdb/movies.parquet` + `tv.parquet`** | **66 M** | **i TOKEN di un titolo nuovo**: le keyword, i generi, il cast. Il grafo dice DOVE sono le bolle, non COSA è un titolo nuovo |

**E le storie di Trakt NON servono**, che è il punto della domanda: `.cache/trakt/users/` (1,2 GB) serve
solo ai BANCHI — le misure che hanno deciso i parametri — non alla collocazione. Il collocatore legge i
parquet TMDB e i centroidi, e basta.

## Livello 2 — ricostruire il grafo da zero: +560 MB (666 MB di `graph/data/` in tutto)

Il resto di `graph/data/` è materiale di costruzione: l'embedding delle trame (`04-trama-qwen3b.npy`,
140 MB), i due triangoli (75 MB), la miscela (`eterogeneo-TRAMA.npz`, 9,4 MB) e le partizioni degli
esperimenti. Serve solo a `python -m graph.pipeline build` da zero — che è un lavoro da mezz'ora di
calcolo e 11 GB di picco, non una cosa che si fa sul mate per abitudine.

## Livello 3 — rilanciare i banchi: +1,2 GB

`.cache/trakt/users/` sono le storie pubbliche degli utenti Trakt, da cui si misurano α, i pesi, il
freddo, il taglio temporale. Servono a rifare le MISURE, non a far funzionare niente. Si copiano se e
quando si vuole rilanciare un banco sul server invece che sul portatile.

## I comandi

```bash
# LIVELLO 1 (104 MB) — dal repo alla chiavetta
mkdir -p /d/yaca/data /d/yaca/cache/tmdb
cp graph/data/{04-tfidf.npz,04-vocab.json,04-centroidi.npz,04-impronte.json} /d/yaca/data/
cp graph/data/{05-tfidf.npz,05-vocab.json,05-idf.npy,05-centroidi.npz,05-centroidi-meta.npz,05-impronte.json} /d/yaca/data/
cp graph/data/{bolle-eterogeneo-subvoti.npy,mappa-finale-6-2.npz,transizione-potata.npz} /d/yaca/data/
cp graph/data/{metadati-canone.npz,titoli-canone.txt,manifest-build.json} /d/yaca/data/
cp .cache/tmdb/{movies.parquet,tv.parquet} /d/yaca/cache/tmdb/
sync                       # e solo dopo si stacca la chiavetta

# LIVELLO 3, se serve:  cp -r .cache/trakt/users /d/yaca/cache/trakt/

# SUL MATE, dopo il clone
git clone https://github.com/gabrielefuoco/YACA.git && cd YACA
cp -r /mnt/chiavetta/yaca/data/. graph/data/ && cp -r /mnt/chiavetta/yaca/cache/tmdb/. .cache/tmdb/

# LE DUE VERIFICHE
python -m graph.pipeline stato     # dice quali artefatti ci sono e quali mancano
python -m graph.pipeline build     # deve dire «da rifare: 0 su 8»
python -c "from graph import motore as M; M.Motore(silenzioso=True); print('motore ok')"
```

Se `build` dice che qualcosa è da rifare, non è un errore: è il DAG che ha confrontato gli hash e ha
visto una differenza. Si guarda **cosa** dice, e da lì si decide.
