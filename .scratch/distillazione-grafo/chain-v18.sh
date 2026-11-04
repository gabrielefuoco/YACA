set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
export MIX_OUT=services/graph/data/v18
echo "=== tipo COVISION (minsup 1) ==="
py -u .scratch/distillazione-grafo/tipi.py covision 2>&1 | tail -1
echo "=== norm ==="
py -u .scratch/distillazione-grafo/tipi.py norm 2>&1 | grep -E "COVISION"
echo "=== budget ==="
py -u .scratch/distillazione-grafo/tipi.py budget --pota 100 2>&1 | grep -E "COVISION"
echo "=== maestro ==="
py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
  --pop-gap 3.0 --pop-slope 1.5 --tipi COVISION,TRAMA,KWSEM,CAST,DIR,PROD,COLL,LIST 2>&1 | grep scritto
py -u .scratch/distillazione-grafo/chiudi.py services/graph/data/v18/MIX-rrf-dc-dt.npz \
  services/graph/data/v18/maestro.npz --alpha0 0.1 2>&1 | grep scritto
echo "=== studente (target = maestro) ==="
py -u .scratch/distillazione-grafo/train-studente.py --epoche 30 --out rrfstudent-v18.npz 2>&1 | grep -E "nodi addestrabili|ep 30/|scritto"
