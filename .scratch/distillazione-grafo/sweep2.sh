set -e
cd /c/Users/gabri/APP/YACA
export PYTHONPATH=.
for t in KWSEM02 KWSEM KWSEM06; do
  echo "=== mixer $t ==="
  py -u .scratch/distillazione-grafo/mixer.py --modo rrf --rrf-k 15 --damp-coll --damp-titolo --pop-gap 3.0 --pop-slope 1.5 --tipi COVISION,TRAMA,$t,RRFST,CAST,DIR,PROD,COLL,LIST 2>&1 | grep scritto
  py -u .scratch/distillazione-grafo/chiudi.py services/graph/data/v12/MIX-rrf-dc-dt.npz .cache/v15-$t.npz --alpha0 0.1 2>&1 | grep scritto
done
echo "=== eval ==="
py -u .scratch/distillazione-grafo/eval-gold.py services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz .cache/v15-KWSEM02.npz .cache/v15-KWSEM.npz .cache/v15-KWSEM06.npz 2>&1 | tail -8
