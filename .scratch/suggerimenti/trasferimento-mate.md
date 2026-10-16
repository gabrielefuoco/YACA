# Cosa portare sul mate, e quanto pesa

**Il prodotto non ha bisogno di niente**: `src/data/bolle.json` (3,2 MB) è in git, quindi il mate serve
il grafo appena clona il repository. Gli 8 GB qui sotto sono del **modulo** — servono a ricostruire e al
job notturno, non a rispondere agli utenti.

## Da copiare: ~2,0 GB

| percorso | peso | a cosa serve |
|---|---|---|
| `graph/data/` | 666 M | gli artefatti: partizione, triangolo, mappa, centroidi, metadati, transizione potata |
| `.cache/trakt/users/` | 1,2 G | le storie degli utenti: servono ai banchi (e in futuro al job notturno per le storie vere) |
| `.cache/tmdb/` | 66 M | i parquet TMDB: servono a collocare i titoli nuovi ogni notte |

Dentro `graph/data/` viaggia anche `manifest-build.json`: il DAG si ricostruisce la sua storia e dice
subito se qualcosa non torna.

## Da NON copiare: ~5,3 GB

| percorso | peso | perché no |
|---|---|---|
| `.cache/movielens/` | 4,4 G | il dataset grezzo (`ml-32m`, 32M di valutazioni): serve solo a ricostruire da zero, e si riscarica |
| `.cache/trakt/users-full/` e `users-backup-400/` | 870 M | copie parziali della stessa cosa: `users/` è quella viva |
| `graph/upstream/` | 160 K | sta in git |

## I comandi, pronti (bastano quando la chiavetta è collegata)

```bash
# 1. dal repo, verso la chiavetta (D: nell'esempio — si controlla con `ls /d/`)
mkdir -p /d/yaca && cp -r graph/data /d/yaca/data && mkdir -p /d/yaca/cache/tmdb /d/yaca/cache/trakt
cp -r .cache/tmdb/. /d/yaca/cache/tmdb/ && cp -r .cache/trakt/users /d/yaca/cache/trakt/users
sync                       # e solo dopo si stacca: senza questo la chiavetta può perdere la coda

# 2. sul mate (via SSH), dopo aver clonato il repo
git clone https://github.com/gabrielefuoco/YACA.git && cd YACA
cp -r /mnt/chiavetta/yaca/data/. graph/data/ && cp -r /mnt/chiavetta/yaca/cache/tmdb/. .cache/tmdb/
cp -r /mnt/chiavetta/yaca/cache/trakt/users .cache/trakt/

# 3. le due verifiche: gli artefatti ci sono, e il motore parte
python -m graph.pipeline stato          # 12 vivi · 7 esperimenti · 0 mancanti
python -m graph.pipeline build          # deve dire «da rifare: 0 su 8»
```

Se `build` dice che qualcosa è da rifare, non è un errore: è il DAG che ha confrontato gli hash e ha visto
una differenza. Si guarda **cosa** dice, e da lì si decide.
