set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
for T in 2.0 1.5 1.0; do
  D=services/graph/data/v18tau-$T; mkdir -p $D
  py - <<PY
import json
d=json.load(open('services/graph/data/v18/pesi.json')); d['COVISION']=1.0
json.dump(d,open('$D/pesi.json','w'),indent=1)
PY
  echo "=== tau $T ==="
  MIX_OUT=$D py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
    --pop-gap $T --pop-slope 1.5 \
    --tipi COVISION,TRAMA,KWSEM,RRFST,CAST,DIR,PROD,COLL,LIST 2>&1 | grep -E "gate|scritto"
  py -u .scratch/distillazione-grafo/chiudi.py $D/MIX-rrf-dc-dt.npz \
    $D/bolle-eterogeneo-TAU$T-p1.0-triangolo.npz --alpha0 0.1 2>&1 | grep scritto
done
