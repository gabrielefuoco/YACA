set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
for W in 0.5 1.5 2.0; do
  D=services/graph/data/v18kwlat-$W
  mkdir -p $D
  py - <<PY
import json
d=json.load(open('services/graph/data/v18/pesi.json')); d['KWLAT']=$W
json.dump(d,open('$D/pesi.json','w'),indent=1)
PY
  echo "=== KWLAT $W ==="
  MIX_OUT=$D py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
    --pop-gap 3.0 --pop-slope 1.5 \
    --tipi COVISION,TRAMA,KWSEM,RRFST,CAST,DIR,PROD,COLL,LIST,KWLAT 2>&1 | grep scritto
  py -u .scratch/distillazione-grafo/chiudi.py $D/MIX-rrf-dc-dt.npz \
    $D/bolle-eterogeneo-KWLAT$W-p1.0-triangolo.npz --alpha0 0.1 2>&1 | grep scritto
done
echo "=== BANCO ==="
py -u .scratch/distillazione-grafo/eval-gold.py .cache/v15-padded.npz \
  services/graph/data/v18/bolle-eterogeneo-V18-p1.0-triangolo.npz \
  services/graph/data/v18kwlat/bolle-eterogeneo-V18kwlat-p1.0-triangolo.npz \
  services/graph/data/v18kwlat-0.5/bolle-eterogeneo-KWLAT0.5-p1.0-triangolo.npz \
  services/graph/data/v18kwlat-1.5/bolle-eterogeneo-KWLAT1.5-p1.0-triangolo.npz \
  services/graph/data/v18kwlat-2.0/bolle-eterogeneo-KWLAT2.0-p1.0-triangolo.npz 2>&1 | tail -9
