set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
mkdir -p services/graph/data/tipi2
echo "=== TRAMA ==="
py -u .scratch/distillazione-grafo/tipi.py trama --k 100 2>&1 | tail -3
echo "=== KWSEM (semantica, alpha 0.6) ==="
py -u .scratch/distillazione-grafo/kw-sem.py --sem-alpha 0.6 --nome KWSEM 2>&1 | grep -E "keyword|tag|combinato|KWSEM "
echo "=== META CAST DIR PROD COLL ==="
for t in CAST DIR PROD COLL; do py -u .scratch/distillazione-grafo/tipi.py meta --tipo $t --k 100 2>&1 | tail -1; done
