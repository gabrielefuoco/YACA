set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
export MIX_OUT=services/graph/data/v18
echo "=== maestro (8 tipi, pesi dichiarati) ==="
py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
  --pop-gap 3.0 --pop-slope 1.5 --tipi COVISION,TRAMA,KWSEM,CAST,DIR,PROD,COLL,LIST 2>&1 | grep -E "pesi|scritto"
py -u .scratch/distillazione-grafo/chiudi.py services/graph/data/v18/MIX-rrf-dc-dt.npz \
  services/graph/data/v18/maestro.npz --alpha0 0.1 2>&1 | grep scritto
echo "=== studente ==="
py -u .scratch/distillazione-grafo/train-studente.py --maestro services/graph/data/v18/maestro.npz \
  --epoche 30 --out rrfstudent-v18.npz 2>&1 | grep -E "nodi addestrabili|ep 30/|salvato anche|scritto"
echo "=== tipo RRFST + grafo finale ==="
RRFST_Z=rrfstudent-v18.npz py -u .scratch/distillazione-grafo/tipi.py rrfst --k 100 2>&1 | tail -1
py -u .scratch/distillazione-grafo/tipi.py norm 2>&1 | grep RRFST
py -u .scratch/distillazione-grafo/tipi.py budget --pota 100 2>&1 | grep RRFST
py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
  --pop-gap 3.0 --pop-slope 1.5 --tipi COVISION,TRAMA,KWSEM,RRFST,CAST,DIR,PROD,COLL,LIST 2>&1 | grep -E "pesi|scritto"
py -u .scratch/distillazione-grafo/chiudi.py services/graph/data/v18/MIX-rrf-dc-dt.npz \
  services/graph/data/v18/bolle-eterogeneo-V18-p1.0-triangolo.npz --alpha0 0.1 2>&1 | grep scritto
