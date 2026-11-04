#!/usr/bin/env bash
# build-v18.sh — LA CATENA COMPLETA: dal parquet TMDB al grafo V18 e allo studente.
#
# Ogni passo e' idempotente e ripartibile. I file sostituiti vengono salvati come `*.v1.bak`
# la prima volta, cosi' si torna indietro senza rifare niente.
#
#   bash .scratch/distillazione-grafo/build-v18.sh            # tutto
#   bash .scratch/distillazione-grafo/build-v18.sh tipi       # solo i tipi
#   bash .scratch/distillazione-grafo/build-v18.sh studente   # dal maestro in poi
#
# Gli ingredienti grezzi NON si scaricano qui: vedi V18.md §Ingredienti.
set -e
cd "$(dirname "$0")/../.."
export PYTHONPATH=.
export TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm
export PESI_OUT=services/graph/data/tipi2-pesi
export MIX_OUT=services/graph/data/v18
G=services/graph/data
D=services/graph_dense/data
FASE="${1:-tutto}"

# ---------------------------------------------------------------- 1. CANONE
if [ "$FASE" = "tutto" ] || [ "$FASE" = "canone" ]; then
  echo "=== 1. canone: 66.259 -> 76.497 (film >=50 voti, serie >=50, anime >=10) ==="
  py -u .scratch/distillazione-grafo/estendi-canone.py
  for f in spazi-trakt titoli-canone metadati-canone; do
    [ -f "$D/graph/$f.npz" ] && cp -n "$D/graph/$f.npz" "$D/graph/$f.npz.v1.bak" || true
    [ -f "$D/graph/$f.txt" ] && cp -n "$D/graph/$f.txt" "$D/graph/$f.txt.v1.bak" || true
  done
  cp "$D/graph/spazi-trakt-v2.npz" "$D/graph/spazi-trakt.npz"
  cp "$D/graph/titoli-canone-v2.txt" "$D/graph/titoli-canone.txt"
  cp "$D/graph/metadati-canone-v2.npz" "$D/graph/metadati-canone.npz"

  echo "=== 1b. TF-IDF V3 sul canone nuovo ==="
  py -u .scratch/distillazione-grafo/tfidf-v2.py
  for f in 05-tfidf.npz 05-vocab.json 05-idf.npy; do cp -n "$D/graph/$f" "$D/graph/$f.v1.bak" || true; done
  cp "$D/graph/05-tfidf-v2.npz" "$D/graph/05-tfidf.npz"
  cp "$D/graph/05-vocab-v2.json" "$D/graph/05-vocab.json"
  cp "$D/graph/05-idf-v2.npy" "$D/graph/05-idf.npy"

  echo "=== 1c. trame: embedding dei titoli nuovi (Qwen3, ricetta verificata a 0,9998) ==="
  py -u .scratch/distillazione-grafo/embed-trama2.py
fi

# ---------------------------------------------------------------- 2. TIPI
if [ "$FASE" = "tutto" ] || [ "$FASE" = "tipi" ]; then
  mkdir -p "$TIPI_OUT"
  echo "=== 2a. TRAMA (top-100 coseno sulle trame) ==="
  py -u .scratch/distillazione-grafo/tipi.py trama --k 100

  echo "=== 2b. KWSEM (grafo keyword PPMI+Qwen3, alpha 0,6, nessuna clusterizzazione) ==="
  py -u .scratch/distillazione-grafo/kw-sem.py --sem-alpha 0.6 --nome KWSEM

  echo "=== 2c. CAST DIR PROD COLL ==="
  for t in CAST DIR PROD COLL; do py -u .scratch/distillazione-grafo/tipi.py meta --tipo $t --k 100; done

  echo "=== 2d. COVISION (4 fonti, --semplice, minsup 1 = come l'artefatto V14) ==="
  py -u .scratch/distillazione-grafo/covision.py build --semplice --minsup 1 --topk 20
  cp "$D/covision-semplice.npz" "$D/covision.npz"
  py -u .scratch/distillazione-grafo/tipi.py covision

  echo "=== 2e. LIST (dalle liste Trakt gia' in cache) + registrazione nel manifest ==="
  LIST_MINSUP=2 py -u .scratch/distillazione-grafo/covision-list.py build --type
  # `covision-list.py` scrive il tipo in un percorso fisso e NON aggiorna il manifest:
  # senza questo passaggio `norm` non vede LIST e il mixer si ferma.
  py -u - <<'EOF'
import sys, time, numpy as np, scipy.sparse as sp
sys.path.insert(0, '.scratch/distillazione-grafo')
import tipi
from services.graph_dense import config as C, data as D
z = np.load(C.DATA / 'covision-list.npz'); n = len(z['indptr']) - 1
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(n, n))
tipi.T0 = time.time()
tipi.save('LIST', M, 'liste Trakt (autore = utente, unione delle sue liste): NPMI+ * log1p(Cw), minsup 2, top-20',
          {'autori': int(z['autori']) if 'autori' in z.files else 0})
EOF

  echo "=== 2f. normalizzazione e quota top-100 per riga ==="
  py -u .scratch/distillazione-grafo/tipi.py norm
  py -u .scratch/distillazione-grafo/tipi.py budget --pota 100
fi

# ---------------------------------------------------------------- 3. MAESTRO
if [ "$FASE" = "tutto" ] || [ "$FASE" = "maestro" ] || [ "$FASE" = "studente" ]; then
  mkdir -p "$MIX_OUT"
  echo "=== 3. maestro: 8 tipi di contenuto, pesi dichiarati (v18/pesi.json), chiusura 0,1 ==="
  py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
     --pop-gap 3.0 --pop-slope 1.5 --tipi COVISION,TRAMA,KWSEM,CAST,DIR,PROD,COLL,LIST
  py -u .scratch/distillazione-grafo/chiudi.py "$MIX_OUT/MIX-rrf-dc-dt.npz" "$MIX_OUT/maestro.npz" --alpha0 0.1
fi

# ---------------------------------------------------------------- 4. STUDENTE
if [ "$FASE" = "tutto" ] || [ "$FASE" = "studente" ]; then
  echo "=== 4a. blocchi fissi (trama 1024 + keyword JL 512) ==="
  py -u -m services.graph_dense.blocks

  echo "=== 4b. studente: target = riga del maestro, softmax piena, 30 epoche ==="
  py -u .scratch/distillazione-grafo/train-studente.py --maestro "$MIX_OUT/maestro.npz" \
     --epoche 30 --out rrfstudent-v18.npz

  echo "=== 4c. tipo RRFST dallo studente nuovo ==="
  RRFST_Z=rrfstudent-v18.npz py -u .scratch/distillazione-grafo/tipi.py rrfst --k 100
  py -u .scratch/distillazione-grafo/tipi.py norm
  py -u .scratch/distillazione-grafo/tipi.py budget --pota 100

  echo "=== 4d. V18: 9 tipi + chiusura ==="
  py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
     --pop-gap 3.0 --pop-slope 1.5 \
     --tipi COVISION,TRAMA,KWSEM,RRFST,CAST,DIR,PROD,COLL,LIST
  py -u .scratch/distillazione-grafo/chiudi.py "$MIX_OUT/MIX-rrf-dc-dt.npz" \
     "$MIX_OUT/bolle-eterogeneo-V18-p1.0-triangolo.npz" --alpha0 0.1
fi

echo
echo "fatto. artefatto: $MIX_OUT/bolle-eterogeneo-V18-p1.0-triangolo.npz"
echo "studente: $D/rrfstudent-v18.npz (+ .pt per l'inferenza)"
