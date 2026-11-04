set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
export MIX_OUT=services/graph/data/v18kwlat
py -u .scratch/distillazione-grafo/tipi.py norm 2>&1 | grep KWLAT
py -u .scratch/distillazione-grafo/tipi.py budget --pota 100 2>&1 | grep KWLAT
py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
  --pop-gap 3.0 --pop-slope 1.5 \
  --tipi COVISION,TRAMA,KWSEM,RRFST,CAST,DIR,PROD,COLL,LIST,KWLAT 2>&1 | grep -E "pesi|scritto"
py -u .scratch/distillazione-grafo/chiudi.py services/graph/data/v18kwlat/MIX-rrf-dc-dt.npz \
  services/graph/data/v18kwlat/bolle-eterogeneo-V18kwlat-p1.0-triangolo.npz --alpha0 0.1 2>&1 | grep scritto
