set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
echo "=== COVISION temporale + norm + budget ==="
py -u .scratch/distillazione-grafo/tipi.py covision
py -u .scratch/distillazione-grafo/tipi.py norm
py -u .scratch/distillazione-grafo/tipi.py budget --pota 100
D=services/graph/data/v19; mkdir -p $D
py -c "
import json
d={'COVISION':1.0,'RRFST':1.0,'KWSEM':0.7,'TRAMA':0.5,'DIR':1.0,'CAST':0.4,'PROD':0.3,'COLL':0.5,'LIST':1.0,'CREWPROP':0.35}
json.dump(d,open('$D/pesi.json','w'),indent=1); print(d)"
MIX_OUT=$D py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
  --gate-asimmetrico --pop-gap 2.0 --pop-slope 1.5 --gate-k 10 \
  --tipi COVISION,TRAMA,KWSEM,RRFST,CAST,DIR,PROD,COLL,LIST,CREWPROP
py -u .scratch/distillazione-grafo/chiudi.py $D/MIX-rrf-dc-dt-ga.npz \
  $D/bolle-eterogeneo-V19-p1.0-triangolo.npz --modo log
