set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=. TIPI_OUT=services/graph/data/tipi2
export NORM_OUT=services/graph/data/tipi2-norm PESI_OUT=services/graph/data/tipi2-pesi
export MIX_OUT=services/graph/data/v18
mkdir -p services/graph/data/v18
py -u .scratch/distillazione-grafo/tipi.py norm 2>&1 | grep -E "LIST|KWSEM"
py -u .scratch/distillazione-grafo/tipi.py budget --pota 100 2>&1 | grep -E "LIST|KWSEM"
py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo \
  --pop-gap 3.0 --pop-slope 1.5 \
  --tipi COVISION,TRAMA,KWSEM,CAST,DIR,PROD,COLL,LIST 2>&1 | tail -4
