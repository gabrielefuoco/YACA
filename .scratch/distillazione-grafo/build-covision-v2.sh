set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
echo "=== COVISION build (4 fonti) ==="
py -u .scratch/distillazione-grafo/covision.py build --topk 20 --minsup 2 2>&1 | tail -6
echo "=== tipo COVISION ==="
py -u .scratch/distillazione-grafo/tipi.py covision 2>&1 | tail -3
