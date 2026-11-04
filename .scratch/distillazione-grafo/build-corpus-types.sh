set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
echo "=== COVISION build ==="
py -u .scratch/distillazione-grafo/covision.py build --topk 20 --minsup 2 2>&1 | tail -4
echo "=== tipo COVISION ==="
py -u .scratch/distillazione-grafo/tipi.py covision 2>&1 | tail -2
echo "=== LIST ==="
LIST_MINSUP=2 py -u .scratch/distillazione-grafo/covision-list.py build --type 2>&1 | tail -4
